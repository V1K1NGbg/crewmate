"""A deliberately narrow wg0 editor; never creates or saves client private keys."""

import hashlib
import ipaddress
from pathlib import Path
import re

from common import (
    Error,
    WG_CONFIG,
    atomic_write,
    json_decode,
    key,
    peer_name,
    private_read,
)


HEALTH_IDS = {"llama", "immich", "authelia", "portainer"}


def endpoint(value):
    if not isinstance(value, str) or len(value) > 260:
        raise Error("Invalid WireGuard endpoint")
    match = re.fullmatch(
        r"(\[[0-9a-fA-F:]+\]|[A-Za-z0-9][A-Za-z0-9.-]*):([0-9]{1,5})", value
    )
    if not match or not 1 <= int(match[2]) <= 65535:
        raise Error("Invalid WireGuard endpoint")
    host = match[1]
    try:
        if host.startswith("["):
            ipaddress.IPv6Address(host[1:-1])
        elif re.fullmatch(r"[0-9.]+", host):
            ipaddress.IPv4Address(host)
        elif any(
            not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", part)
            for part in host.split(".")
        ):
            raise ValueError()
    except ValueError:
        raise Error("Invalid WireGuard endpoint") from None
    return value


def settings(raw):
    required = {"dataRoot", "wireguard", "healthChecks"}
    if not isinstance(raw, dict) or set(raw) != required:
        raise Error("Config requires dataRoot, wireguard and healthChecks")
    data = raw["dataRoot"]
    if (
        not isinstance(data, str)
        or not data.startswith("/")
        or "\x00" in data
        or any(part in {".", ".."} for part in data.split("/"))
        or str(Path(data)) != data
        or len(data) > 1024
    ):
        raise Error("dataRoot must be an absolute canonical path")
    checks = raw["healthChecks"]
    if (
        not isinstance(checks, list)
        or any(not isinstance(x, str) or x not in HEALTH_IDS for x in checks)
        or len(checks) != len(set(checks))
    ):
        raise Error("Unknown or duplicate health check")
    wg = raw["wireguard"]
    if not isinstance(wg, dict) or set(wg) != {
        "network",
        "serverAddress",
        "endpoint",
        "allowedIPs",
        "excludedNetworks",
    }:
        raise Error("Invalid WireGuard settings")
    try:
        network = ipaddress.IPv4Network(wg["network"], strict=True)
        address = ipaddress.IPv4Interface(wg["serverAddress"])
        if (
            not 16 <= network.prefixlen <= 30
            or address.network != network
            or address.ip not in network
            or address.ip in (network.network_address, network.broadcast_address)
        ):
            raise ValueError()
        excluded = wg["excludedNetworks"]
        if not isinstance(excluded, list) or len(excluded) > 128:
            raise ValueError()
        for item in excluded:
            if network.overlaps(ipaddress.IPv4Network(item, strict=True)):
                raise ValueError()
    except (ValueError, TypeError):
        raise Error(
            "Invalid or overlapping IPv4 WireGuard network/address/excludedNetworks"
        ) from None
    allowed = wg["allowedIPs"]
    try:
        if (
            not isinstance(allowed, list)
            or not 1 <= len(allowed) <= 8
            or len(set(allowed)) != len(allowed)
        ):
            raise ValueError()
        for item in allowed:
            host = ipaddress.IPv4Network(item, strict=True)
            if (
                host.prefixlen != 32
                or host.network_address.is_unspecified
                or host.network_address.is_multicast
                or host.network_address.is_loopback
                or host.network_address.is_link_local
            ):
                raise ValueError()
    except (TypeError, ValueError):
        raise Error(
            "allowedIPs must contain only explicit server IPv4 /32 addresses"
        ) from None
    endpoint(wg["endpoint"])
    return raw


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class Configuration:
    INTERFACE = {"PrivateKey", "ListenPort", "FwMark", "Address", "MTU"}
    PEER = {
        "PublicKey",
        "PresharedKey",
        "AllowedIPs",
        "Endpoint",
        "PersistentKeepalive",
    }

    def __init__(self, text, config):
        self.text = text
        self.config = config
        self.sections = []
        self.peers = []
        current = None
        starts = []
        lines = text.splitlines(keepends=True)
        for index, raw in enumerate(lines):
            line = raw.split("#", 1)[0].strip()
            if not line:
                continue
            if line in {"[Interface]", "[Peer]"}:
                current = {"kind": line, "fields": {}, "start": index}
                self.sections.append(current)
                starts.append(index)
            elif current and "=" in line:
                field, value = [part.strip() for part in line.split("=", 1)]
                allowed = (
                    self.INTERFACE if current["kind"] == "[Interface]" else self.PEER
                )
                if field not in allowed or field in current["fields"] or not value:
                    raise Error(
                        "Unsupported, repeated or empty WireGuard field; existing config was not changed",
                        503,
                    )
                current["fields"][field] = value
            else:
                raise Error("Invalid WireGuard configuration", 503)
        if (
            not self.sections
            or self.sections[0]["kind"] != "[Interface]"
            or sum(s["kind"] == "[Interface]" for s in self.sections) != 1
            or len(self.sections) > 513
        ):
            raise Error("Expected one WireGuard interface and at most 512 peers", 503)
        for index, section in enumerate(self.sections):
            section["end"] = (
                starts[index + 1] if index + 1 < len(starts) else len(lines)
            )
            section["raw"] = "".join(lines[section["start"] : section["end"]])
        self.lines = lines
        self.interface = self.sections[0]["fields"]
        try:
            key(self.interface.get("PrivateKey"))
            if ipaddress.IPv4Interface(
                self.interface.get("Address")
            ) != ipaddress.IPv4Interface(config["serverAddress"]):
                raise ValueError()
            if not 1 <= int(self.interface.get("ListenPort", "0")) <= 65535:
                raise ValueError()
            if (
                "MTU" in self.interface
                and not 576 <= int(self.interface["MTU"]) <= 9000
            ):
                raise ValueError()
            mark = self.interface.get("FwMark", "0")
            if (
                mark != "off"
                and not 0
                <= int(mark, 16 if mark.startswith("0x") else 10)
                <= 0xFFFFFFFF
            ):
                raise ValueError()
            keys, addresses = set(), set()
            network = ipaddress.IPv4Network(config["network"])
            server = ipaddress.IPv4Interface(config["serverAddress"]).ip
            for section in self.sections[1:]:
                fields = section["fields"]
                public = key(fields.get("PublicKey"))
                address = ipaddress.IPv4Network(fields.get("AllowedIPs"), strict=True)
                if (
                    address.prefixlen != 32
                    or address.network_address not in network
                    or address.network_address
                    in (network.network_address, network.broadcast_address)
                    or address.network_address == server
                    or public in keys
                    or str(address) in addresses
                ):
                    raise ValueError()
                if "PresharedKey" in fields:
                    key(fields["PresharedKey"])
                if "Endpoint" in fields:
                    endpoint(fields["Endpoint"])
                keepalive = fields.get("PersistentKeepalive", "0")
                if keepalive != "off" and not 0 <= int(keepalive) <= 65535:
                    raise ValueError()
                names = re.findall(
                    r"^# crewmate-name: (.+)$", section["raw"], re.MULTILINE
                )
                name = peer_name(names[0]) if names else public[:12]
                if len(names) > 1:
                    raise ValueError()
                self.peers.append(
                    {"publicKey": public, "address": str(address), "name": name}
                )
                keys.add(public)
                addresses.add(str(address))
        except (ValueError, TypeError, Error):
            raise Error(
                "Invalid WireGuard key, address, port or peer; existing config was not changed",
                503,
            ) from None

    def stripped(self):
        return (
            "\n\n".join(
                section["kind"]
                + "\n"
                + "\n".join(
                    name + " = " + value
                    for name, value in section["fields"].items()
                    if name not in {"Address", "MTU"}
                )
                for section in self.sections
            )
            + "\n"
        )

    def add(self, public, name):
        if len(self.peers) >= 512 or any(peer["name"] == name for peer in self.peers):
            raise Error("Peer limit reached or name already exists", 409)
        used = {
            ipaddress.ip_network(peer["address"]).network_address for peer in self.peers
        }
        used.add(ipaddress.ip_interface(self.config["serverAddress"]).ip)
        available = next(
            (
                address
                for address in ipaddress.ip_network(self.config["network"]).hosts()
                if address not in used
            ),
            None,
        )
        if available is None:
            raise Error("No available peer addresses", 409)
        text = self.text.rstrip() + "\n\n[Peer]\n# crewmate-name: " + peer_name(name)
        text += (
            "\nPublicKey = "
            + key(public)
            + "\nAllowedIPs = "
            + str(available)
            + "/32\n"
        )
        return Configuration(text, self.config), str(available) + "/32"

    def revoke(self, public):
        for section in self.sections[1:]:
            if section["fields"]["PublicKey"] == public:
                text = "".join(
                    self.lines[: section["start"]] + self.lines[section["end"] :]
                )
                return Configuration(text, self.config)
        raise Error("Peer does not exist", 404)


class WireGuard:
    def __init__(self, config, commands, path=WG_CONFIG, require_root=True):
        self.config = config
        self.commands = commands
        self.path = path
        self.require_root = require_root

    def read(self):
        return Configuration(private_read(self.path, self.require_root), self.config)

    def live(self):
        result = {}
        for line in self.commands.run("wg", "show", "wg0", "allowed-ips").splitlines():
            values = line.split()
            if len(values) < 2:
                raise Error("Invalid WireGuard runtime response", 503)
            public = key(values[0])
            if public in result:
                raise Error("Duplicate runtime peer", 503)
            result[public] = ",".join(values[1:]).replace(",,", ",")
        return result

    def matches(self, config):
        expected = {peer["publicKey"]: peer["address"] for peer in config.peers}
        public = self.commands.run(
            "wg", "pubkey", input=config.interface["PrivateKey"] + "\n"
        ).strip()
        if key(public) != key(
            self.commands.run("wg", "show", "wg0", "public-key").strip()
        ):
            return False
        if (
            self.commands.run("wg", "show", "wg0", "listen-port").strip()
            != config.interface["ListenPort"]
        ):
            return False
        if public in expected:
            raise Error("The server public key cannot also be a peer", 503)

        def mark(value):
            return (
                0
                if value == "off"
                else int(value, 16 if value.startswith("0x") else 10)
            )

        try:
            if mark(self.commands.run("wg", "show", "wg0", "fwmark").strip()) != mark(
                config.interface.get("FwMark", "0")
            ):
                return False
        except ValueError:
            raise Error("Invalid WireGuard runtime firewall mark", 503) from None
        return self.live() == expected

    def check_routes(self):
        interfaces = json_decode(
            self.commands.run("ip", "-j", "-4", "address", "show", "dev", "wg0")
        )
        wanted = ipaddress.ip_interface(self.config["serverAddress"])
        try:
            addresses = [
                ipaddress.ip_interface(
                    str(address["local"]) + "/" + str(address["prefixlen"])
                )
                for interface in interfaces
                for address in interface["addr_info"]
                if address["family"] == "inet"
            ]
        except (ValueError, TypeError, KeyError):
            raise Error("Cannot validate wg0's configured host address", 503) from None
        if addresses != [wanted]:
            raise Error(
                "wg0 must have exactly the configured server IPv4 address/network", 409
            )
        interfaces = json_decode(self.commands.run("ip", "-j", "-4", "address", "show"))
        try:
            local = {
                str(ipaddress.IPv4Address(address["local"])) + "/32"
                for interface in interfaces
                for address in interface["addr_info"]
                if address["family"] == "inet"
            }
        except (ValueError, TypeError, KeyError):
            raise Error("Cannot validate server-only client routes", 503) from None
        if not set(self.config["allowedIPs"]) <= local:
            raise Error(
                "Client allowedIPs contain an address not assigned to this server", 409
            )
        routes = json_decode(
            self.commands.run("ip", "-j", "-4", "route", "show", "table", "all")
        )
        if not isinstance(routes, list):
            raise Error("Cannot validate host routes", 503)
        network = ipaddress.ip_network(self.config["network"])
        for route in routes:
            if not isinstance(route, dict):
                raise Error("Cannot validate host routes", 503)
            destination = route.get("dst", "default")
            if destination == "default" or route.get("dev") == "wg0":
                continue
            try:
                conflict = network.overlaps(
                    ipaddress.IPv4Network(destination, strict=False)
                )
            except (ValueError, TypeError):
                raise Error("Cannot validate host routes", 503) from None
            if conflict:
                raise Error(
                    "WireGuard network overlaps another host/LAN/container/VM route",
                    409,
                )

    def status(self):
        config = self.read()
        if not self.matches(config):
            raise Error(
                "WireGuard runtime differs from persisted config; administrator reconciliation required",
                503,
            )
        handshakes, transfers = {}, {}
        try:
            for line in self.commands.run(
                "wg", "show", "wg0", "latest-handshakes"
            ).splitlines():
                public, seconds = line.split()
                handshakes[key(public)] = int(seconds)
            for line in self.commands.run("wg", "show", "wg0", "transfer").splitlines():
                public, received, sent = line.split()
                transfers[key(public)] = (int(received), int(sent))
            peers = [
                dict(
                    peer,
                    lastHandshake=handshakes[peer["publicKey"]],
                    receivedBytes=transfers[peer["publicKey"]][0],
                    sentBytes=transfers[peer["publicKey"]][1],
                )
                for peer in config.peers
            ]
            if any(
                min(p["lastHandshake"], p["receivedBytes"], p["sentBytes"]) < 0
                for p in peers
            ):
                raise ValueError()
        except (ValueError, KeyError):
            raise Error(
                "Incomplete WireGuard telemetry; refresh to retry the read", 503
            ) from None
        return {"interface": "wg0", "peers": peers}

    def commit(self, before, after):
        if digest(self.read().text) != digest(before.text):
            raise Error("WireGuard config changed concurrently; not overwritten", 409)
        atomic_write(self.path, after.text)

    def apply(self, config):
        self.commands.run(
            "wg", "syncconf", "wg0", "/dev/stdin", input=config.stripped()
        )

    def client(self, private, public, address):
        return (
            "[Interface]\nPrivateKey = "
            + private
            + "\nAddress = "
            + address
            + "\n\n[Peer]\nPublicKey = "
            + public
            + "\nEndpoint = "
            + self.config["endpoint"]
            + "\nAllowedIPs = "
            + ", ".join(self.config["allowedIPs"])
            + "\nPersistentKeepalive = 25\n"
        )
