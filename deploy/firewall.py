#!/usr/bin/env python3
"""Server-only WireGuard policy for Docker's iptables backend (including iptables-nft).

Use 'show' for offline inspection. 'apply' is a root, host-console operation.
Never flush Docker, libvirt or unrelated tables. Unsupported backends block boot.
"""

import argparse
import json
import os
from pathlib import Path
import subprocess
from configure import read_env, validate_network


def rules(env, ipv6=False):
    validate_network(env)
    interface, address, subnet = env["LAN_INTERFACE"], env["LAN_IP"], env["LAN_CIDR"]
    incoming = ["-i lo -j ACCEPT"]
    forwarded = []
    if not ipv6:
        # These rules PRECEDE established acceptance. No old flow grants VPN transit.
        incoming += [
            f"-i wg0 -s {env['WG_SUBNET']} -d {address}/32 -p tcp -m multiport --dports 22,443 -j ACCEPT"
        ]
        for source_interface, source_subnet in (
            ("wg0", env["WG_SUBNET"]),
            (interface, subnet),
        ):
            forwarded += [
                f"-i {source_interface} -s {source_subnet} -p tcp --dport 443 -m conntrack --ctdir ORIGINAL --ctorigdst {address} --ctorigdstport 443 -j ACCEPT"
            ]
        forwarded += [
            f"-o wg0 -p tcp -m conntrack --ctdir REPLY --ctstate ESTABLISHED --ctorigdst {address} --ctorigdstport 443 -j ACCEPT"
        ]
    incoming += ["-i wg0 -j DROP"]
    forwarded += ["-i wg0 -j DROP", "-o wg0 -j DROP"]
    # Only a WireGuard UDP endpoint may accept internet-originated NEW input.
    incoming += [f"-i {interface} -p udp --dport {env['WG_PORT']} -j ACCEPT"]
    incoming += ["-m conntrack --ctdir REPLY --ctstate ESTABLISHED,RELATED -j ACCEPT"]
    if ipv6:
        incoming += [
            f"-i {interface} -s fe80::/10 -p udp --sport 547 --dport 546 -j ACCEPT"
        ]
        incoming += [
            f"-i {interface} -p ipv6-icmp --icmpv6-type {kind} -j ACCEPT"
            for kind in (1, 2, 3, 4)
        ]
        incoming += [
            f"-i {interface} -p ipv6-icmp --icmpv6-type {kind} -m hl --hl-eq 255 -j ACCEPT"
            for kind in (133, 134, 135, 136)
        ]
    else:
        incoming += [
            f"-i {interface} -s {subnet} -p udp --sport 67 --dport 68 -j ACCEPT"
        ]
        incoming += [
            f"-i {interface} -s {subnet} -d {address}/32 -p tcp -m multiport --dports 22,443 -j ACCEPT"
        ]
        incoming += [f"-i {interface} -s {subnet} -p icmp -j ACCEPT"]
    incoming += ["-j DROP"]
    # Outbound Docker/VM replies are allowed; unsolicited physical ingress is not.
    forwarded += [
        f"-i {interface} -m conntrack --ctdir REPLY --ctstate ESTABLISHED,RELATED -j RETURN"
    ]
    forwarded += [f"-i {interface} -j DROP"]
    # Only known Docker/libvirt bridge ingress may reach their downstream rules.
    # An unexpected second physical interface must not bypass the private boundary.
    forwarded += [f"-i {bridge} -j RETURN" for bridge in ("docker0", "br+", "virbr+")]
    forwarded += ["-j DROP"]
    lines = [
        "*filter",
        ":CREWMATE_INPUT - [0:0]",
        ":CREWMATE_FORWARD - [0:0]",
        "-F CREWMATE_INPUT",
        "-F CREWMATE_FORWARD",
    ]
    lines += ["-A CREWMATE_INPUT " + rule for rule in incoming]
    lines += ["-A CREWMATE_FORWARD " + rule for rule in forwarded]
    return "\n".join(lines + ["COMMIT", ""])


def check_backend(path):
    config = json.loads(Path(path).read_text())
    if not isinstance(config, dict):
        raise ValueError("Docker configuration must be a JSON object")
    if (
        config.get("firewall-backend") != "iptables"
        or config.get("iptables") is not True
        or config.get("ip6tables") is not True
        or config.get("live-restore") is not False
    ):
        raise ValueError(
            "Docker daemon.json must explicitly enable iptables backend, iptables and ip6tables, and disable live-restore"
        )
    versions = [
        subprocess.check_output([tool, "--version"], text=True, timeout=15).strip()
        for tool in ("iptables", "ip6tables")
    ]
    if ("nf_tables" in versions[0]) != ("nf_tables" in versions[1]):
        raise ValueError("Mixed iptables/ip6tables alternatives are unsupported")
    # A configuration file alone does not establish the currently running backend.
    tables = json.loads(
        subprocess.check_output(
            ["nft", "--json", "list", "tables"], text=True, timeout=15
        )
    )
    if not isinstance(tables, dict) or not isinstance(tables.get("nftables"), list):
        raise ValueError("Cannot inspect active nftables tables")
    for entry in tables["nftables"]:
        if not isinstance(entry, dict):
            raise ValueError("Cannot inspect active nftables tables")
        table = entry.get("table", {})
        if (
            table.get("family") in ("ip", "ip6")
            and table.get("name") == "docker-bridges"
        ):
            raise ValueError(
                "Active Docker native nftables backend is unsupported; stop Docker before changing backend"
            )


def apply(env, daemon_config):
    if os.geteuid() != 0:
        raise ValueError("Apply requires root at a recovery console")
    check_backend(daemon_config)
    # Check both complete tables BEFORE modifying either family.
    for ipv6 in (False, True):
        restore = "ip6tables-restore" if ipv6 else "iptables-restore"
        subprocess.run(
            [restore, "--test", "--noflush"],
            input=rules(env, ipv6),
            text=True,
            check=True,
            timeout=30,
        )
    for ipv6 in (False, True):
        tool = "ip6tables" if ipv6 else "iptables"
        subprocess.run(
            [tool + "-restore", "--noflush"],
            input=rules(env, ipv6),
            text=True,
            check=True,
            timeout=30,
        )
        exists = subprocess.run(
            [tool, "-w", "-S", "DOCKER-USER"], capture_output=True, timeout=15
        )
        if exists.returncode:
            subprocess.run([tool, "-w", "-N", "DOCKER-USER"], check=True, timeout=15)
        for chain, target in (
            ("INPUT", "CREWMATE_INPUT"),
            ("FORWARD", "CREWMATE_FORWARD"),
            ("DOCKER-USER", "CREWMATE_FORWARD"),
        ):
            listing = subprocess.check_output(
                [tool, "-w", "-S", chain], text=True, timeout=15
            )
            first = next(
                (
                    line
                    for line in listing.splitlines()
                    if line.startswith(f"-A {chain} ")
                ),
                None,
            )
            if first != f"-A {chain} -j {target}":
                # Insert before permissive rules without creating an unguarded gap.
                subprocess.run(
                    [tool, "-w", "-I", chain, "1", "-j", target], check=True, timeout=15
                )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("show", "apply"))
    parser.add_argument("--env", required=True)
    parser.add_argument("--ipv6", action="store_true")
    parser.add_argument("--daemon-config", default="/etc/docker/daemon.json")
    args = parser.parse_args()
    try:
        env = read_env(args.env)
        if args.action == "show":
            print(rules(env, args.ipv6), end="")
        else:
            apply(env, args.daemon_config)
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        parser.exit(1, f"Firewall blocked: {error}\n")


if __name__ == "__main__":
    main()
