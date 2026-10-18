#!/usr/bin/env python3
"""Crewmate's local, allowlisted host API. No TCP listener or shell execution."""

from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
import json
import os
import resource
import socket
import socketserver
import sqlite3
import stat
import sys
from urllib.parse import parse_qs, urlsplit

from common import (
    CONFIG,
    SOCKET,
    STATE,
    WG_CONFIG,
    Commands,
    CommandError,
    Error,
    identifier,
    json_decode,
    key,
    locked,
    peer_name,
    private_read,
    trusted_directory,
)
from metrics import Metrics
from wireguard import WireGuard, digest, settings


def now():
    return datetime.now(timezone.utc).isoformat()


def mutation(path, body):
    if not isinstance(body, dict):
        raise Error("Expected a JSON object")
    identifier(body.get("operationId"))
    action = body.get("action")
    if path == "/vms" and action in ("start", "shutdown", "destroy"):
        required, optional = {"operationId", "id", "action"}, {"confirm"}
        identifier(body.get("id"))
    elif path == "/vpn" and action == "add":
        required, optional = {"operationId", "action", "name"}, set()
        peer_name(body.get("name"))
    elif path == "/vpn" and action == "revoke":
        required, optional = {"operationId", "action", "publicKey"}, {"confirm"}
        key(body.get("publicKey"))
    else:
        raise Error("Action is not allowlisted for this endpoint")
    if not required <= set(body) or set(body) - required - optional:
        raise Error("Missing or unsupported request field")
    if "confirm" in body and not isinstance(body["confirm"], bool):
        raise Error("confirm must be a boolean")
    if action in ("destroy", "revoke") and body.get("confirm") is not True:
        raise Error("Explicit confirmation is required")
    return body


class Ledger:
    def __init__(self, path):
        self.db = sqlite3.connect(str(path), timeout=3)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.execute("PRAGMA journal_mode=DELETE")
        self.db.execute("""CREATE TABLE IF NOT EXISTS operations (
            id TEXT PRIMARY KEY, path TEXT NOT NULL, request TEXT NOT NULL,
            status TEXT NOT NULL, message TEXT NOT NULL, phase TEXT NOT NULL,
            metadata TEXT NOT NULL, updated TEXT NOT NULL)""")
        self.db.commit()
        os.chmod(path, 0o600)

    def get(self, operation):
        row = self.db.execute(
            "SELECT * FROM operations WHERE id=?", (operation,)
        ).fetchone()
        return dict(row) if row else None

    def create(self, path, body):
        with self.db:
            self.db.execute(
                "INSERT INTO operations VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    body["operationId"],
                    path,
                    json.dumps(body, sort_keys=True),
                    "pending",
                    "Operation accepted",
                    "prepared",
                    "{}",
                    now(),
                ),
            )
        return self.get(body["operationId"])

    def update(self, row, status, message, phase=None, metadata=None):
        with self.db:
            self.db.execute(
                "UPDATE operations SET status=?, message=?, phase=?, metadata=?, updated=? WHERE id=?",
                (
                    status,
                    message,
                    phase or row["phase"],
                    json.dumps(metadata) if metadata is not None else row["metadata"],
                    now(),
                    row["id"],
                ),
            )
        return self.get(row["id"])

    def unsettled(self):
        return [
            dict(row)
            for row in self.db.execute(
                "SELECT * FROM operations WHERE status IN ('pending', 'uncertain')"
            )
        ]

    def failures(self):
        return [
            {
                "at": row["updated"],
                "operation": json.loads(row["request"])["action"],
                "message": row["message"],
            }
            for row in self.db.execute(
                "SELECT * FROM operations WHERE status IN ('failed', 'uncertain') ORDER BY updated DESC LIMIT 10"
            )
        ]


class VMs:
    def __init__(self, commands):
        self.commands = commands

    def run(self, *args):
        return self.commands.run("virsh", "--connect", "qemu:///system", *args)

    def ids(self):
        values = self.run("list", "--all", "--uuid").split()
        if len(values) > 128 or len(set(values)) != len(values):
            raise Error("Unsupported VM inventory size or duplicate UUID", 503)
        return [identifier(value) for value in values]

    def state(self, machine):
        if machine not in self.ids():
            raise Error("VM UUID does not exist", 404)
        return self.run("domstate", machine).strip()

    def listing(self):
        result = []
        for machine in self.ids():
            info = dict(
                line.split(":", 1)
                for line in self.run("dominfo", machine).splitlines()
                if ":" in line
            )
            try:
                cpus = int(info["CPU(s)"].strip())
                memory = info["Max memory"].split()
                if (
                    cpus < 1
                    or len(memory) != 2
                    or memory[1] != "KiB"
                    or int(memory[0]) < 0
                ):
                    raise ValueError()
                result.append(
                    {
                        "id": machine,
                        "name": info["Name"].strip(),
                        "state": info["State"].strip(),
                        "cpus": cpus,
                        "memoryMiB": int(memory[0]) / 1024,
                    }
                )
            except (KeyError, ValueError):
                raise Error("Unsupported libvirt inventory response", 503) from None
        return {"vms": result}


class Manager:
    def __init__(
        self, config, state=STATE, wg_path=WG_CONFIG, commands=None, require_root=True
    ):
        self.commands = commands or Commands()
        self.lock_path = state / "manager.lock"
        self.ledger = Ledger(state / "operations.sqlite3")
        self.wg = WireGuard(config["wireguard"], self.commands, wg_path, require_root)
        self.vms = VMs(self.commands)
        self.metrics = Metrics(config, self.commands)

    @staticmethod
    def public(row):
        response = {
            "operationId": row["id"],
            "status": row["status"],
            "message": row["message"],
        }
        body = json.loads(row["request"])
        if (
            row["path"] == "/vms"
            and row["status"] == "pending"
            and row["phase"] == "acknowledged"
            and body["action"] == "shutdown"
        ):
            response["forceStopVM"] = body["id"]
        return response

    def reconcile(self, row):
        if row["status"] not in ("pending", "uncertain"):
            return row
        body = json.loads(row["request"])
        metadata = json.loads(row["metadata"])
        if row["phase"] == "prepared":
            return self.ledger.update(
                row,
                "failed",
                "Interrupted before any change; review before submitting a new operation ID",
            )
        try:
            if row["path"] == "/vms":
                state = self.vms.state(body["id"])
                target = "running" if body["action"] == "start" else "shut off"
                if state == target:
                    return self.ledger.update(
                        row, "completed", "Requested VM state observed"
                    )
                if row["phase"] == "acknowledged" and body["action"] == "shutdown":
                    return self.ledger.update(
                        row,
                        "pending",
                        "Shutdown requested; waiting for the guest to stop",
                    )
            else:
                config = self.wg.read()
                actual = digest(config.text)
                if actual == metadata.get("afterHash") and self.wg.matches(config):
                    return self.ledger.update(
                        row,
                        "completed",
                        "Persisted and live peer configuration agree; client keys are never replayed",
                    )
                if (
                    actual == metadata.get("beforeHash")
                    and row["phase"] == "config-commit"
                ):
                    return self.ledger.update(
                        row,
                        "failed",
                        "Configuration was not committed; no runtime change was attempted",
                    )
        except Error:
            pass
        return self.ledger.update(
            row,
            "uncertain",
            metadata.get("error", "Outcome unconfirmed")
            + "; inspect host state and reconcile before another mutation",
        )

    def recover(self):
        with locked(self.lock_path):
            for row in self.ledger.unsettled():
                self.reconcile(row)

    def operation(self, operation):
        identifier(operation)
        with locked(self.lock_path):
            row = self.ledger.get(operation)
            if not row:
                raise Error("Unknown operation ID", 404)
            return self.public(self.reconcile(row))

    def mutate(self, path, body):
        body = mutation(path, body)
        with locked(self.lock_path):
            existing = self.ledger.get(body["operationId"])
            if existing:
                if existing["path"] != path or json.loads(existing["request"]) != body:
                    raise Error(
                        "Operation ID already belongs to a different request", 409
                    )
                return self.public(self.reconcile(existing))
            for row in self.ledger.unsettled():
                previous = json.loads(row["request"])
                if row["path"] == path and (
                    path == "/vpn" or previous["id"] == body["id"]
                ):
                    unsettled = self.reconcile(row)
                    # A hung graceful shutdown can be deliberately force-stopped.
                    force_after_shutdown = (
                        path == "/vms"
                        and body["action"] == "destroy"
                        and previous["action"] == "shutdown"
                        and unsettled["status"] == "pending"
                        and unsettled["phase"] == "acknowledged"
                    )
                    if (
                        unsettled["status"] in ("pending", "uncertain")
                        and not force_after_shutdown
                    ):
                        raise Error(
                            "An earlier operation for this resource still needs reconciliation",
                            409,
                        )
            row = self.ledger.create(path, body)
            try:
                if path == "/vms":
                    return self.change_vm(row, body)
                return self.change_vpn(row, body)
            except (Error, OSError) as error:
                current = self.ledger.get(row["id"])
                if current["phase"] == "prepared":
                    # The specific error is safe only when it comes from our own boundary.
                    message = (
                        str(error)
                        if isinstance(error, Error)
                        else "Local storage failed before the change"
                    )
                    current = self.ledger.update(current, "failed", message)
                else:
                    metadata = json.loads(current["metadata"])
                    metadata["error"] = (
                        str(error)
                        if isinstance(error, Error)
                        else "Local storage failed during the change"
                    )
                    current = self.ledger.update(
                        current, "uncertain", metadata["error"], metadata=metadata
                    )
                    current = self.reconcile(current)
                return self.public(current)

    def change_vm(self, row, body):
        state = self.vms.state(body["id"])
        target = "running" if body["action"] == "start" else "shut off"
        if state == target:
            return self.public(
                self.ledger.update(
                    row, "completed", "VM already has the requested state"
                )
            )
        row = self.ledger.update(row, "pending", "Issuing VM command", phase="issued")
        try:
            self.vms.run(body["action"], body["id"])
        except CommandError as error:
            if not error.started:
                return self.public(self.ledger.update(row, "failed", str(error)))
            row = self.ledger.update(
                row, "uncertain", str(error), metadata={"error": str(error)}
            )
            return self.public(self.reconcile(row))
        row = self.ledger.update(
            row, "pending", "Command acknowledged", phase="acknowledged"
        )
        return self.public(self.reconcile(row))

    def change_vpn(self, row, body):
        before = self.wg.read()
        self.wg.check_routes()
        if not self.wg.matches(before):
            raise Error(
                "Persisted and live WireGuard config differ; reconcile them before editing",
                409,
            )
        client = None
        if body["action"] == "add":
            private = key(self.commands.run("wg", "genkey").strip())
            public = key(
                self.commands.run("wg", "pubkey", input=private + "\n").strip()
            )
            after, address = before.add(public, body["name"])
            server_public = key(
                self.commands.run(
                    "wg", "pubkey", input=before.interface["PrivateKey"] + "\n"
                ).strip()
            )
            client = self.wg.client(private, server_public, address)
        else:
            public = body["publicKey"]
            after = before.revoke(public)
        metadata = {
            "beforeHash": digest(before.text),
            "afterHash": digest(after.text),
            "publicKey": public,
        }
        row = self.ledger.update(
            row,
            "pending",
            "Committing peer configuration",
            phase="config-commit",
            metadata=metadata,
        )
        self.wg.commit(before, after)
        row = self.ledger.update(
            row, "pending", "Applying persisted peer configuration", phase="issued"
        )
        self.wg.apply(after)
        row = self.reconcile(row)
        response = self.public(row)
        if client and row["status"] == "completed":
            response["configuration"] = client
        return response

    def get(self, path, query):
        if path == "/operations" and set(query) == {"id"} and len(query["id"]) == 1:
            return self.operation(query["id"][0])
        if query:
            raise Error("Unsupported query parameters")
        if path == "/overview":
            return self.metrics.overview(self.ledger.failures())
        if path == "/vms":
            return self.vms.listing()
        if path == "/vpn":
            with locked(self.lock_path):
                return self.wg.status()
        raise Error("Unknown endpoint", 404)


class Handler(BaseHTTPRequestHandler):
    server_version = "CrewmateHost/1"
    sys_version = ""

    def setup(self):
        self.request.settimeout(10)
        super().setup()

    def log_message(self, *args):
        # Never log URLs, bodies, identifiers, configurations or command output.
        pass

    def respond(self, status, body):
        raw = json.dumps(body, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(raw)
        self.close_connection = True

    def route(self):
        if len(self.path) > 256:
            raise Error("Request target too long", 414)
        url = urlsplit(self.path)
        if url.scheme or url.netloc or url.fragment or "%" in url.path:
            raise Error("Invalid request target")
        if self.command == "GET":
            return self.server.manager.get(
                url.path, parse_qs(url.query, keep_blank_values=True, max_num_fields=4)
            )
        if url.path not in ("/vms", "/vpn") or url.query:
            raise Error("Unknown mutation endpoint", 404)
        lengths = self.headers.get_all("Content-Length", [])
        if (
            self.headers.get("Transfer-Encoding")
            or len(lengths) != 1
            or not lengths[0].isdigit()
        ):
            raise Error(
                "A single Content-Length is required; transfer encoding is unsupported"
            )
        size = int(lengths[0])
        if not 1 <= size <= 8192:
            raise Error("JSON body must be 1–8192 bytes", 413)
        if self.headers.get_content_type() != "application/json":
            raise Error("Content-Type must be application/json", 415)
        raw = self.rfile.read(size)
        if len(raw) != size:
            raise Error("Incomplete request body")
        return self.server.manager.mutate(url.path, json_decode(raw))

    def handle_request(self):
        try:
            self.respond(200, self.route())
        except Error as error:
            self.respond(error.status, {"error": str(error)})
        except (ValueError, UnicodeError):
            self.respond(400, {"error": "Malformed request"})
        except (OSError, sqlite3.Error):
            # A disconnected client must query its operation ID, never assume failure.
            try:
                self.respond(
                    503,
                    {
                        "error": "Local I/O failure; query the operation ID before another mutation"
                    },
                )
            except OSError:
                pass

    do_GET = handle_request
    do_POST = handle_request


class Server(socketserver.UnixStreamServer):
    # One writer/request at a time; the flock also covers cooperating processes.
    request_queue_size = 16

    def handle_error(self, request, client_address):
        print("Host API request failed; no request data logged", file=sys.stderr)


def main():
    if os.getuid() != 0:
        raise Error("Run using the supplied root-owned systemd service", 503)
    os.umask(0o077)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    trusted_directory(CONFIG.parent)
    trusted_directory(STATE, private=True)
    trusted_directory(SOCKET.parent)
    trusted_directory(WG_CONFIG.parent)
    config = settings(json_decode(private_read(CONFIG)))
    with locked(SOCKET.parent / "daemon.lock", timeout=0):
        if SOCKET.exists() or SOCKET.is_symlink():
            info = SOCKET.lstat()
            if not stat.S_ISSOCK(info.st_mode) or info.st_uid != 0:
                raise Error("Refusing to replace an unexpected socket path", 503)
            SOCKET.unlink()
        manager = Manager(config)
        manager.recover()
        with Server(str(SOCKET), Handler) as server:
            os.chmod(SOCKET, 0o660)
            server.manager = manager
            server.serve_forever()


if __name__ == "__main__":
    try:
        main()
    except Error as error:
        print("Host manager startup failed: " + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, sqlite3.Error):
        print(
            "Host manager startup failed; verify protected configuration, directories and dependencies",
            file=sys.stderr,
        )
        sys.exit(1)
