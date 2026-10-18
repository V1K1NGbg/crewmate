import base64
import copy
import http.client
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch
import uuid

from common import (
    Commands,
    CommandError,
    Error,
    atomic_write,
    json_decode,
    locked,
    private_read,
)
from manager import Handler, Manager, Server, mutation
from metrics import Metrics, health
from wireguard import Configuration, digest, settings


def fake_key(number):
    return base64.b64encode(bytes([number]) * 32).decode("ascii")


SERVER_PRIVATE, SERVER_PUBLIC = fake_key(1), fake_key(2)
CLIENT_PRIVATE, CLIENT_PUBLIC, EXISTING_PUBLIC = fake_key(3), fake_key(4), fake_key(5)
VM = "16296e93-f5db-4f91-ac4a-d8372e79b120"
CONFIG = {
    "dataRoot": "/srv/crewmate",
    "healthChecks": [],
    "wireguard": {
        "network": "10.77.0.0/24",
        "serverAddress": "10.77.0.1/24",
        "endpoint": "vpn.example.test:51820",
        "allowedIPs": ["10.77.0.1/32"],
        "excludedNetworks": ["192.168.1.0/24", "172.16.0.0/12"],
    },
}
TEXT = (
    "# existing server\n[Interface]\nPrivateKey = "
    + SERVER_PRIVATE
    + "\nAddress = 10.77.0.1/24\nListenPort = 51820\n\n[Peer]\n"
    + "# crewmate-name: existing\nPublicKey = "
    + EXISTING_PUBLIC
    + "\nAllowedIPs = 10.77.0.2/32\n"
)


def request(action="add", **extra):
    return {"operationId": str(uuid.uuid4()), "action": action, **extra}


class FakeCommands:
    def __init__(self):
        self.calls = []
        self.peers = {EXISTING_PUBLIC: "10.77.0.2/32"}
        self.vm_state = "shut off"
        self.failure = None
        self.routes = [{"dst": "192.168.1.0/24", "dev": "eth0"}]
        self.addresses = [
            {"addr_info": [{"family": "inet", "local": "10.77.0.1", "prefixlen": 24}]}
        ]

    def run(self, tool, *args, input=None):
        self.calls.append((tool, args))  # Intentionally excludes private stdin.
        if self.failure:
            self.failure(tool, args)
        if tool == "nvidia-smi":
            raise CommandError("nvidia-smi is not installed")
        if tool == "ip":
            return json.dumps(self.addresses if "address" in args else self.routes)
        if tool == "wg":
            if args == ("genkey",):
                return CLIENT_PRIVATE + "\n"
            if args == ("pubkey",):
                return (
                    SERVER_PUBLIC if input.strip() == SERVER_PRIVATE else CLIENT_PUBLIC
                ) + "\n"
            if args[0] == "syncconf":
                # The real wg syntax does not include wg-quick's Address field.
                parsed = input.replace(
                    "[Interface]\n", "[Interface]\nAddress = 10.77.0.1/24\n"
                )
                conf = Configuration(parsed, CONFIG["wireguard"])
                self.peers = {p["publicKey"]: p["address"] for p in conf.peers}
                return ""
            if args == ("show", "wg0", "allowed-ips"):
                return "\n".join(k + "\t" + v for k, v in self.peers.items())
            if args == ("show", "wg0", "public-key"):
                return SERVER_PUBLIC
            if args == ("show", "wg0", "listen-port"):
                return "51820"
            if args == ("show", "wg0", "fwmark"):
                return "off"
            if args == ("show", "wg0", "latest-handshakes"):
                return "\n".join(k + "\t0" for k in self.peers)
            if args == ("show", "wg0", "transfer"):
                return "\n".join(k + "\t10\t20" for k in self.peers)
        if tool == "virsh":
            assert args[:2] == ("--connect", "qemu:///system")
            command = args[2]
            if command == "list":
                return VM + "\n"
            if command == "domstate":
                return self.vm_state
            if command == "dominfo":
                return (
                    "Name: example\nState: "
                    + self.vm_state
                    + "\nCPU(s): 2\nMax memory: 2097152 KiB\n"
                )
            if command == "start":
                self.vm_state = "running"
                return ""
            if command == "destroy":
                self.vm_state = "shut off"
                return ""
            if command == "shutdown":
                return ""
        raise AssertionError((tool, args))


class ManagerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.wg_path = self.root / "wg0.conf"
        atomic_write(self.wg_path, TEXT)
        self.commands = FakeCommands()
        self.manager = Manager(
            settings(copy.deepcopy(CONFIG)),
            self.root,
            self.wg_path,
            self.commands,
            require_root=False,
        )

    def tearDown(self):
        self.manager.ledger.db.close()
        self.temporary.cleanup()

    def restart(self):
        self.manager.ledger.db.close()
        self.manager = Manager(
            CONFIG, self.root, self.wg_path, self.commands, require_root=False
        )
        self.manager.recover()

    def test_add_preserves_keys_peers_and_secret_is_returned_once(self):
        body = request(name="phone")
        result = self.manager.mutate("/vpn", body)
        self.assertEqual(result["status"], "completed")
        self.assertIn(CLIENT_PRIVATE, result["configuration"])
        self.assertIn("Address = 10.77.0.3/32", result["configuration"])
        self.assertIn("AllowedIPs = 10.77.0.1/32", result["configuration"])
        self.assertTrue(self.wg_path.read_text().startswith(TEXT.rstrip()))
        self.assertEqual(self.wg_path.stat().st_mode & 0o777, 0o600)
        for file in self.root.iterdir():
            self.assertNotIn(CLIENT_PRIVATE.encode(), file.read_bytes())
        self.assertNotIn("configuration", self.manager.operation(body["operationId"]))
        self.restart()
        self.assertNotIn("configuration", self.manager.mutate("/vpn", body))
        self.assertEqual(sum(args == ("genkey",) for _, args in self.commands.calls), 1)
        self.assertEqual(len(self.manager.get("/vpn", {})["peers"]), 2)

    def test_unicode_peer_name_survives_configuration_roundtrip(self):
        result = self.manager.mutate("/vpn", request(name="Телефон 1"))
        self.assertEqual(result["status"], "completed")
        self.restart()
        self.assertIn(
            "Телефон 1",
            [peer["name"] for peer in self.manager.get("/vpn", {})["peers"]],
        )

    def test_duplicate_id_with_different_request_conflicts(self):
        body = request(name="phone")
        self.manager.mutate("/vpn", body)
        with self.assertRaises(Error) as error:
            self.manager.mutate("/vpn", dict(body, name="different"))
        self.assertEqual(error.exception.status, 409)

    def test_revoke_preserves_server_and_other_peer(self):
        self.manager.mutate("/vpn", request(name="phone"))
        result = self.manager.mutate(
            "/vpn", request("revoke", publicKey=CLIENT_PUBLIC, confirm=True)
        )
        self.assertEqual(result["status"], "completed")
        self.assertIn(SERVER_PRIVATE, self.wg_path.read_text())
        self.assertIn(EXISTING_PUBLIC, self.wg_path.read_text())
        self.assertNotIn(CLIENT_PUBLIC, self.wg_path.read_text())

    def test_invalid_requests_never_change_config(self):
        cases = [
            request(name="../etc/passwd"),
            request(name="x\nPrivateKey = bad"),
            request("delete", name="phone"),
            request(name="phone", path="/etc/passwd"),
            request("revoke", publicKey="invalid", confirm=True),
            request("revoke", publicKey=EXISTING_PUBLIC),
            request("revoke", publicKey=EXISTING_PUBLIC, confirm=1),
            request(name="phone", address="10.77.0.1"),
            request(name="phone", privateKey=CLIENT_PRIVATE),
            {"operationId": "../../x", "action": "add", "name": "phone"},
        ]
        for body in cases:
            with self.subTest(body=body), self.assertRaises(Error):
                self.manager.mutate("/vpn", body)
        self.assertEqual(self.wg_path.read_text(), TEXT)
        self.assertEqual(self.commands.calls, [])

    def test_invalid_existing_configs_are_preserved(self):
        invalid = [
            TEXT.replace("10.77.0.2/32", "0.0.0.0/0"),
            TEXT.replace("10.77.0.2/32", "10.77.0.1/32"),
            TEXT.replace("10.77.0.2/32", "10.77.0.255/32"),
            TEXT.replace("10.77.0.2/32", "10.88.0.2/32"),
            TEXT.replace("10.77.0.2/32", "fd00::2/128"),
            TEXT.replace(SERVER_PRIVATE, "not-a-key"),
            TEXT.replace("[Interface]", "[Interface]\nPostUp = touch /tmp/no"),
            TEXT.replace("[Interface]", "[Interface]\nSaveConfig = true"),
            TEXT
            + "\n[Peer]\nPublicKey = "
            + CLIENT_PUBLIC
            + "\nAllowedIPs = 10.77.0.2/32\n",
        ]
        for text in invalid:
            with self.subTest(text=text):
                atomic_write(self.wg_path, text)
                self.assertEqual(
                    self.manager.mutate("/vpn", request(name="phone"))["status"],
                    "failed",
                )
                self.assertEqual(self.wg_path.read_text(), text)

    def test_routes_overlap_rejected(self):
        self.commands.routes = [{"dst": "10.77.0.0/16", "dev": "br-docker"}]
        result = self.manager.mutate("/vpn", request(name="phone"))
        self.assertEqual(result["status"], "failed")
        self.assertIn("overlap", result["message"])
        self.assertEqual(self.wg_path.read_text(), TEXT)

    def test_runtime_address_must_match_config(self):
        self.commands.addresses[0]["addr_info"][0]["local"] = "10.77.0.9"
        result = self.manager.mutate("/vpn", request(name="phone"))
        self.assertEqual(result["status"], "failed")
        self.assertEqual(self.wg_path.read_text(), TEXT)

    def test_client_routes_must_be_local_server_addresses(self):
        self.manager.wg.config = dict(
            CONFIG["wireguard"], allowedIPs=["192.168.1.44/32"]
        )
        result = self.manager.mutate("/vpn", request(name="phone"))
        self.assertEqual(result["status"], "failed")
        self.assertIn("not assigned", result["message"])
        self.assertEqual(self.wg_path.read_text(), TEXT)

    def test_existing_preshared_key_and_endpoint_are_preserved(self):
        text = (
            TEXT
            + "PresharedKey = "
            + fake_key(6)
            + "\nEndpoint = 192.0.2.1:51820\nPersistentKeepalive = 25\n"
        )
        atomic_write(self.wg_path, text)
        self.assertEqual(
            self.manager.mutate("/vpn", request(name="phone"))["status"], "completed"
        )
        self.assertTrue(self.wg_path.read_text().startswith(text.rstrip()))

    def test_confirmed_vm_destroy(self):
        self.commands.vm_state = "running"
        self.assertEqual(
            self.manager.mutate("/vms", request("destroy", id=VM, confirm=True))[
                "status"
            ],
            "completed",
        )
        self.assertEqual(self.commands.vm_state, "shut off")

    def test_disk_sync_failure_leaves_original_and_no_temporary_file(self):
        with patch("common.os.fsync", side_effect=OSError("disk full")):
            result = self.manager.mutate("/vpn", request(name="phone"))
        self.assertEqual(result["status"], "failed")
        self.assertEqual(self.wg_path.read_text(), TEXT)
        self.assertFalse(list(self.root.glob(".crewmate-*")))

    def test_failure_after_rename_remains_uncertain_without_apply(self):
        real = os.replace

        def replace_then_fail(source, target):
            real(source, target)
            raise OSError("Simulate directory sync failure after rename")

        body = request(name="phone")
        with patch("common.os.replace", side_effect=replace_then_fail):
            result = self.manager.mutate("/vpn", body)
        self.assertEqual(result["status"], "uncertain")
        self.assertIn(CLIENT_PUBLIC, self.wg_path.read_text())
        self.assertNotIn("configuration", result)
        self.assertFalse(
            any(
                args[0] == "syncconf"
                for tool, args in self.commands.calls
                if tool == "wg"
            )
        )
        self.restart()
        self.assertEqual(
            self.manager.operation(body["operationId"])["status"], "uncertain"
        )

    def test_concurrent_file_change_is_preserved(self):
        before = self.manager.wg.read()
        after, _ = before.add(CLIENT_PUBLIC, "phone")
        atomic_write(self.wg_path, TEXT + "\n# another administrator's change\n")
        with self.assertRaises(Error):
            self.manager.wg.commit(before, after)
        self.assertTrue(
            self.wg_path.read_text().endswith("# another administrator's change\n")
        )

    def test_confirmed_force_stop_can_finish_hung_shutdown(self):
        self.commands.vm_state = "running"
        graceful = request("shutdown", id=VM)
        result = self.manager.mutate("/vms", graceful)
        self.assertEqual(result["status"], "pending")
        self.assertEqual(result["forceStopVM"], VM)
        force = request("destroy", id=VM, confirm=True)
        self.assertEqual(self.manager.mutate("/vms", force)["status"], "completed")
        self.assertEqual(
            self.manager.operation(graceful["operationId"])["status"], "completed"
        )

    def test_external_drift_is_not_overwritten(self):
        self.commands.peers[CLIENT_PUBLIC] = "10.77.0.3/32"
        self.assertEqual(
            self.manager.mutate("/vpn", request(name="phone"))["status"], "failed"
        )
        self.assertEqual(self.wg_path.read_text(), TEXT)

    def test_atomic_replace_failure_keeps_original(self):
        with patch("common.os.replace", side_effect=OSError("disk failure")):
            result = self.manager.mutate("/vpn", request(name="phone"))
        self.assertEqual(result["status"], "failed")
        self.assertEqual(self.wg_path.read_text(), TEXT)
        self.assertFalse(
            any(
                args[0] == "syncconf"
                for tool, args in self.commands.calls
                if tool == "wg"
            )
        )
        self.assertFalse(list(self.root.glob(".crewmate-*")))

    def test_sync_failure_retains_durable_intent_and_never_retries(self):
        def failure(tool, args):
            if tool == "wg" and args[0] == "syncconf":
                raise CommandError("wg exited with status 1", True)

        self.commands.failure = failure
        body = request(name="phone")
        result = self.manager.mutate("/vpn", body)
        self.assertEqual(result["status"], "uncertain")
        self.assertNotIn("configuration", result)
        self.assertIn(CLIENT_PUBLIC, self.wg_path.read_text())
        self.restart()
        self.assertEqual(self.manager.mutate("/vpn", body)["status"], "uncertain")
        self.assertEqual(
            sum(
                args[0] == "syncconf"
                for tool, args in self.commands.calls
                if tool == "wg"
            ),
            1,
        )
        with self.assertRaises(Error):
            self.manager.mutate("/vpn", request(name="second"))
        # Simulate the administrator applying the persisted config under the lock.
        self.commands.peers[CLIENT_PUBLIC] = "10.77.0.3/32"
        self.assertEqual(
            self.manager.operation(body["operationId"])["status"], "completed"
        )

    def test_crash_after_apply_reconciles_without_replay_or_key(self):
        body = request(name="phone")
        real = self.manager.reconcile
        with patch.object(self.manager, "reconcile", side_effect=SystemExit):
            with self.assertRaises(SystemExit):
                self.manager.mutate("/vpn", body)
        self.manager.reconcile = real
        self.restart()
        self.assertEqual(
            self.manager.operation(body["operationId"])["status"], "completed"
        )
        self.assertNotIn("configuration", self.manager.mutate("/vpn", body))
        self.assertEqual(
            sum(
                args[0] == "syncconf"
                for tool, args in self.commands.calls
                if tool == "wg"
            ),
            1,
        )

    def test_prepared_crash_is_not_executed_on_restart(self):
        body = request(name="phone")
        self.manager.ledger.create("/vpn", body)
        self.restart()
        self.assertEqual(
            self.manager.operation(body["operationId"])["status"], "failed"
        )
        self.assertEqual(self.commands.calls, [])

    def test_vm_listing_start_and_duplicate(self):
        machine = self.manager.get("/vms", {})["vms"][0]
        self.assertEqual((machine["cpus"], machine["memoryMiB"]), (2, 2048))
        body = request("start", id=VM)
        self.assertEqual(self.manager.mutate("/vms", body)["status"], "completed")
        self.restart()
        self.assertEqual(self.manager.mutate("/vms", body)["status"], "completed")
        self.assertEqual(
            sum(
                args[2] == "start"
                for tool, args in self.commands.calls
                if tool == "virsh"
            ),
            1,
        )

    def test_vm_shutdown_is_pending_until_observed_stopped(self):
        self.commands.vm_state = "running"
        body = request("shutdown", id=VM)
        self.assertEqual(self.manager.mutate("/vms", body)["status"], "pending")
        self.restart()
        self.assertEqual(
            self.manager.operation(body["operationId"])["status"], "pending"
        )
        self.commands.vm_state = "shut off"
        self.assertEqual(
            self.manager.operation(body["operationId"])["status"], "completed"
        )

    def test_vm_unknown_outcome_does_not_reissue(self):
        def failure(tool, args):
            if tool == "virsh" and args[2] == "start":
                raise CommandError("virsh timed out", True)

        self.commands.failure = failure
        body = request("start", id=VM)
        self.assertEqual(self.manager.mutate("/vms", body)["status"], "uncertain")
        self.restart()
        self.manager.mutate("/vms", body)
        self.assertEqual(
            sum(
                args[2] == "start"
                for tool, args in self.commands.calls
                if tool == "virsh"
            ),
            1,
        )
        self.commands.vm_state = "running"
        self.assertEqual(
            self.manager.operation(body["operationId"])["status"], "completed"
        )

    def test_vm_nonexistent_uuid_and_unconfirmed_destroy(self):
        self.assertEqual(
            self.manager.mutate("/vms", request("start", id=str(uuid.uuid4())))[
                "status"
            ],
            "failed",
        )
        for body in (
            request("destroy", id=VM),
            request("start", id="--all"),
            request("create", id=VM),
        ):
            with self.assertRaises(Error):
                self.manager.mutate("/vms", body)

    def test_missing_tool_is_clear_failure(self):
        def failure(tool, args):
            raise CommandError(tool + " is not installed")

        self.commands.failure = failure
        result = self.manager.mutate("/vms", request("start", id=VM))
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["message"], "virsh is not installed")


class BoundaryTests(unittest.TestCase):
    def test_settings_paths_addresses_and_allowlists(self):
        cases = [
            ("dataRoot", "../../etc"),
            ("dataRoot", "/srv/../etc"),
            ("healthChecks", ["arbitrary"]),
        ]
        for field, value in cases:
            config = copy.deepcopy(CONFIG)
            config[field] = value
            with self.assertRaises(Error):
                settings(config)
        for field, value in [
            ("serverAddress", "10.78.0.1/24"),
            ("network", "0.0.0.0/0"),
            ("serverAddress", "10.77.0.0/24"),
            ("allowedIPs", ["0.0.0.0/0"]),
            ("excludedNetworks", ["10.77.0.0/16"]),
            ("endpoint", "host:51820\nPostUp=x"),
            ("endpoint", "999.999.999.999:51820"),
        ]:
            config = copy.deepcopy(CONFIG)
            config["wireguard"][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(Error):
                settings(config)

    def test_json_duplicates_and_nonfinite(self):
        for raw in ('{"a":1,"a":2}', '{"a": NaN}', '{"a": Infinity}', "[["):
            with self.assertRaises(Error):
                json_decode(raw)

    def test_command_errors_never_leak_output(self):
        with patch("common.shutil.which", return_value="/usr/bin/wg"):
            with patch(
                "common.subprocess.run",
                return_value=subprocess.CompletedProcess(
                    [], 1, CLIENT_PRIVATE, CLIENT_PRIVATE
                ),
            ):
                with self.assertRaises(CommandError) as error:
                    Commands().run("wg", "pubkey", input=CLIENT_PRIVATE)
                self.assertNotIn(CLIENT_PRIVATE, str(error.exception))
                self.assertTrue(error.exception.started)
            with patch(
                "common.subprocess.run", side_effect=subprocess.TimeoutExpired("wg", 8)
            ):
                with self.assertRaises(CommandError) as error:
                    Commands().run("wg", "show", "wg0", "allowed-ips")
                self.assertTrue(error.exception.started)
        with (
            patch("common.shutil.which", return_value=None),
            self.assertRaises(CommandError) as error,
        ):
            Commands().run("wg", "genkey")
        self.assertFalse(error.exception.started)
        with self.assertRaises(Error):
            Commands().run("/bin/sh", "-c", "true")

    def test_private_read_rejects_symlink_and_public_file(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "config"
            atomic_write(path, "protected")
            link = Path(folder) / "link"
            link.symlink_to(path)
            with self.assertRaises(Error):
                private_read(link, require_root=False)
            path.chmod(0o644)
            with self.assertRaises(Error):
                private_read(path, require_root=False)

    def test_flock_excludes_other_process(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "lock"
            with locked(path):
                result = subprocess.run(
                    [
                        os.sys.executable,
                        "-c",
                        "import fcntl,sys; f=open(sys.argv[1], 'a'); fcntl.flock(f, fcntl.LOCK_EX|fcntl.LOCK_NB)",
                        str(path),
                    ],
                    capture_output=True,
                    timeout=5,
                )
                self.assertNotEqual(result.returncode, 0)
            with locked(path, timeout=0):
                pass

    def test_real_unix_http_boundary(self):
        # Short socket path also works under macOS's 104-byte AF_UNIX limit.
        with tempfile.TemporaryDirectory() as folder:
            path = str(Path(folder) / "s")
            with Server(path, Handler) as server:

                class Stub:
                    def get(self, path, query):
                        if path != "/vms" or query:
                            raise Error("Unknown endpoint", 404)
                        return {"vms": []}

                    def mutate(self, path, body):
                        mutation(path, body)
                        return {
                            "operationId": body["operationId"],
                            "status": "completed",
                            "message": "test",
                        }

                server.manager = Stub()
                thread = threading.Thread(target=server.serve_forever)
                thread.start()
                try:
                    cases = [
                        (b"GET /vms HTTP/1.0\r\n\r\n", 200),
                        (b"GET /../../etc/passwd HTTP/1.0\r\n\r\n", 404),
                        (b"POST /vpn HTTP/1.0\r\nContent-Length: 9000\r\n\r\n", 413),
                        (
                            b"POST /vpn HTTP/1.0\r\nTransfer-Encoding: chunked\r\n\r\n",
                            400,
                        ),
                        (
                            b"POST /vpn HTTP/1.0\r\nContent-Length: 2\r\nContent-Type: text/plain\r\n\r\n{}",
                            415,
                        ),
                    ]
                    for raw, expected in cases:
                        with (
                            self.subTest(raw=raw),
                            socket.socket(socket.AF_UNIX) as client,
                        ):
                            client.settimeout(3)
                            client.connect(path)
                            client.sendall(raw)
                            response = http.client.HTTPResponse(client)
                            response.begin()
                            self.assertEqual(response.status, expected)
                            self.assertEqual(
                                response.getheader("Cache-Control"), "no-store"
                            )
                            json.loads(response.read())
                finally:
                    server.shutdown()
                    thread.join(timeout=3)

    def test_metrics_unavailable_are_not_zeroed(self):
        with tempfile.TemporaryDirectory() as folder:
            proc = Path(folder)
            (proc / "uptime").write_text("100.0 80.0")
            (proc / "loadavg").write_text("0.25 0.3 0.5 1/20 33")
            (proc / "stat").write_text("cpu 100 0 100 100 0 0 0 0\ncpu0 100\n")
            (proc / "meminfo").write_text("MemTotal: 2048 kB\nMemAvailable: 1024 kB\n")
            config = dict(CONFIG, dataRoot=folder)
            metrics = Metrics(config, FakeCommands(), proc=proc, sys=proc)
            result = metrics.overview([])
            self.assertIsNone(result["cpu"]["usagePercent"])
            self.assertEqual(result["gpu"], [])
            self.assertEqual(result["temperatures"], [])
            self.assertEqual(
                next(s for s in result["services"] if s["id"] == "pcloud")["status"],
                "unknown",
            )
            (proc / "stat").write_text("cpu 150 0 150 200 0 0 0 0\ncpu0 150\n")
            self.assertEqual(metrics.overview([])["cpu"]["usagePercent"], 50)
            (proc / "meminfo").unlink()
            with self.assertRaises(Error):
                metrics.overview([])

    def test_unconfigured_services_are_unknown(self):
        self.assertEqual(health("llama", [])["status"], "unknown")


if __name__ == "__main__":
    unittest.main()
