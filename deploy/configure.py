#!/usr/bin/env python3
"""Validate operator input; render secret config or explicitly create networks.

Standard library only. Never source .env as shell code, print secrets, or deploy.
"""

import argparse
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
NETWORKS = {
    "dashboard": ("DASHBOARD_SUBNET", True),
    "identity": ("IDENTITY_SUBNET", True),
    "admin": ("ADMIN_SUBNET", True),
    "photos-proxy": ("PHOTOS_PROXY_SUBNET", True),
    "ai": ("AI_SUBNET", True),
    "edge": ("EDGE_SUBNET", False),
    "photos-data": ("PHOTOS_DATA_SUBNET", True),
    "photos-egress": ("PHOTOS_EGRESS_SUBNET", False),
}


def read_env(path):
    result = {}
    for line in Path(path).read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        match = re.fullmatch(r"([A-Z][A-Z0-9_]*)=(.*)", line)
        if not match or match[1] in result:
            raise ValueError("Invalid or duplicate environment key (values withheld)")
        key, value = match.groups()
        if value.startswith("'") and value.endswith("'"):
            value = value[1:-1]
            if "'" in value:
                raise ValueError(f"Unsupported quoting: {key}")
        elif re.search(r"[\s$'\"`\\#]", value):
            raise ValueError(f"Use single quotes for literal values: {key}")
        result[key] = value
    return result


def validate_network(env):
    def required(key):
        if not env.get(key):
            raise ValueError(f"Required: {key}")
        return env[key]

    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,15}", required("LAN_INTERFACE")):
        raise ValueError("Invalid LAN_INTERFACE")
    ip = ipaddress.IPv4Address(required("LAN_IP"))
    lan = ipaddress.IPv4Network(required("LAN_CIDR"))
    wg = ipaddress.IPv4Network(required("WG_SUBNET"))
    if not 16 <= wg.prefixlen <= 29:
        raise ValueError(
            "WG_SUBNET must be /16 through /29 for host-manager compatibility"
        )
    if ip not in lan or ip in (lan.network_address, lan.broadcast_address):
        raise ValueError("LAN_IP must be a host in LAN_CIDR")
    networks = [lan, wg] + [
        ipaddress.IPv4Network(required(key)) for key, _ in NETWORKS.values()
    ]
    private = [
        ipaddress.IPv4Network(cidr)
        for cidr in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
    ]
    for index, network in enumerate(networks):
        if network.prefixlen > 29 or not any(network.subnet_of(p) for p in private):
            raise ValueError("Use RFC1918 IPv4 networks with at least eight addresses")
        if any(network.overlaps(other) for other in networks[index + 1 :]):
            raise ValueError("LAN, WireGuard and Docker subnets must not overlap")
    if not required("WG_PORT").isdigit() or not 1024 <= int(env["WG_PORT"]) <= 65535:
        raise ValueError("WG_PORT must be 1024..65535")


def validate(env, bootstrap=False):
    required = set(read_env(ROOT / ".env.example")) - {"CREWMATE_AI_KEY"}
    if bootstrap:
        required.remove("AUTH_OWNER_SUBJECT")
    missing = sorted(key for key in required if not env.get(key))
    if missing:
        raise ValueError("Required: " + ", ".join(missing))
    validate_network(env)
    domain_pattern = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+"
    domain = env["COOKIE_DOMAIN"]
    if not re.fullmatch(domain_pattern, domain):
        raise ValueError("COOKIE_DOMAIN must be a DNS domain, not an IP or URL")
    hosts = [
        env[key]
        for key in ("CREWMATE_HOST", "IDENTITY_HOST", "PORTAINER_HOST", "IMMICH_HOST")
    ]
    if len(set(hosts)) != 4 or any(
        not re.fullmatch(domain_pattern, h) or not h.endswith("." + domain)
        for h in hosts
    ):
        raise ValueError("Four distinct service hostnames must share COOKIE_DOMAIN")
    if env["TLS_MODE"] not in ("internal", "provided"):
        raise ValueError("TLS_MODE requires an explicit internal or provided choice")
    if not re.fullmatch(
        r"(?:sha256:[a-f0-9]{64}|[^\s]+@sha256:[a-f0-9]{64})", env["CREWMATE_IMAGE"]
    ):
        raise ValueError(
            "CREWMATE_IMAGE must be an immutable local image ID or registry digest"
        )
    if not re.fullmatch(r"[a-zA-Z0-9_.-]{1,64}", env["OWNER_USERNAME"]):
        raise ValueError("Invalid OWNER_USERNAME")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", env["OWNER_EMAIL"]):
        raise ValueError("Invalid OWNER_EMAIL")
    if not env["OWNER_PASSWORD_HASH"].startswith("$argon2id$"):
        raise ValueError("Generate OWNER_PASSWORD_HASH with Authelia argon2")
    ids = [
        env[k]
        for k in (
            "AUTH_OIDC_CLIENT_ID",
            "PORTAINER_OIDC_CLIENT_ID",
            "IMMICH_OIDC_CLIENT_ID",
        )
    ]
    if len(set(ids)) != 3 or any(
        not re.fullmatch(r"[A-Za-z0-9._~-]{1,100}", i) for i in ids
    ):
        raise ValueError("OIDC client IDs must be distinct RFC3986 unreserved values")
    for key in (
        "CREWMATE_OIDC_SECRET_HASH",
        "PORTAINER_OIDC_SECRET_HASH",
        "IMMICH_OIDC_SECRET_HASH",
    ):
        if not env[key].startswith("$pbkdf2-sha512$"):
            raise ValueError(f"Generate {key} with Authelia pbkdf2")
    for key in (
        "AUTH_SECRET",
        "AUTH_OIDC_CLIENT_SECRET",
        "AUTHELIA_SESSION_SECRET",
        "AUTHELIA_STORAGE_KEY",
        "AUTHELIA_OIDC_HMAC_SECRET",
        "DB_PASSWORD",
    ):
        if len(env[key]) < 32:
            raise ValueError(f"At least 32 random characters required: {key}")
    for key in (
        "CREWMATE_MEMORY",
        "IMMICH_MEMORY",
        "IMMICH_ML_MEMORY",
        "DB_MEMORY",
        "LLAMA_MEMORY",
    ):
        if not re.fullmatch(r"[1-9][0-9]*[mg]", env[key]):
            raise ValueError(f"Use an explicit positive m/g memory budget: {key}")
    for key in (
        "CREWMATE_CPUS",
        "IMMICH_CPUS",
        "IMMICH_ML_CPUS",
        "DB_CPUS",
        "LLAMA_CPUS",
    ):
        if not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", env[key]) or float(env[key]) <= 0:
            raise ValueError(f"Positive CPU budget required: {key}")
    for key in (
        "HOST_MANAGER_GID",
        "IMMICH_ML_THREADS",
        "LLAMA_CONTEXT",
        "LLAMA_THREADS",
    ):
        if not env[key].isdigit() or int(env[key]) <= 0:
            raise ValueError(f"Positive integer required: {key}")
    if not env["LLAMA_GPU_LAYERS"].isdigit():
        raise ValueError("LLAMA_GPU_LAYERS must be a nonnegative integer")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*\.gguf", env["MODEL_FILENAME"]):
        raise ValueError("MODEL_FILENAME must be a filename, not a path")


def identity_config(env, pem):
    template = json.loads((ROOT / "access/configuration.template.json").read_text())
    values = dict(env, OIDC_PRIVATE_KEY=pem)

    def replace(value):
        if isinstance(value, str):
            return re.sub(r"@([A-Z][A-Z0-9_]*)@", lambda m: values[m[1]], value)
        if isinstance(value, list):
            return [replace(item) for item in value]
        if isinstance(value, dict):
            return {key: replace(item) for key, item in value.items()}
        return value

    users = {
        "users": {
            env["OWNER_USERNAME"]: {
                "displayname": env["OWNER_USERNAME"],
                "password": env["OWNER_PASSWORD_HASH"],
                "email": env["OWNER_EMAIL"],
                "groups": ["owner"],
            }
        }
    }
    return replace(template), users


def create_networks(env):
    for name, (key, internal) in NETWORKS.items():
        full_name = "crewmate-" + name
        existing = subprocess.run(
            ["docker", "network", "inspect", full_name], capture_output=True, text=True
        )
        if existing.returncode == 0:
            network = json.loads(existing.stdout)[0]
            if (
                network["Driver"] != "bridge"
                or network["Internal"] != internal
                or network.get("EnableIPv6")
                or network["IPAM"]["Config"]
                != [
                    {
                        "Subnet": env[key],
                        "Gateway": str(
                            ipaddress.IPv4Network(env[key]).network_address + 1
                        ),
                    }
                ]
            ):
                raise ValueError(
                    f"Existing network differs; inspect manually: {full_name}"
                )
            continue
        command = [
            "docker",
            "network",
            "create",
            "--driver",
            "bridge",
            "--subnet",
            env[key],
        ]
        if internal:
            command.append("--internal")
        subprocess.run(command + [full_name], check=True, stdout=subprocess.DEVNULL)


def render_bundle(env, pem, output):
    """Publish a complete new bundle; never overwrite an installed identity config."""
    if output.is_symlink() or (output.exists() and any(output.iterdir())):
        raise ValueError(
            "Output is already configured; render a new candidate directory and preserve the current recovery bundle"
        )
    config, users = identity_config(env, pem)
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=".crewmate-render-", dir=output.parent
    ) as temporary:
        staging = Path(temporary) / "bundle"
        staging.mkdir(mode=0o700)
        tls = (
            "tls internal\n"
            if env["TLS_MODE"] == "internal"
            else "tls /certificates/fullchain.pem /certificates/privkey.pem\n"
        )
        contents = {
            "configuration.yml": json.dumps(config, indent=2) + "\n",
            "users.yml": json.dumps(users, indent=2) + "\n",
            "tls.caddy": tls,
        }
        for name, content in contents.items():
            with (staging / name).open("x", encoding="utf-8") as stream:
                os.fchmod(stream.fileno(), 0o600)
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
        directory = os.open(staging, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        # rename fails if a concurrent writer has populated the destination.
        os.rename(staging, output)
        directory = os.open(output.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check", "render", "networks"))
    parser.add_argument("--env", required=True, type=Path)
    parser.add_argument(
        "--bootstrap",
        action="store_true",
        help="allow absent owner sub BEFORE Crewmate starts",
    )
    parser.add_argument("--output", type=Path, default=Path("/etc/crewmate/rendered"))
    parser.add_argument("--oidc-key", type=Path, default=Path("/etc/crewmate/oidc.pem"))
    args = parser.parse_args()
    try:
        env = read_env(args.env)
        validate(env, args.bootstrap)
        if args.action == "render":
            pem = args.oidc_key.read_text()
            if not pem.startswith("-----BEGIN PRIVATE KEY-----"):
                raise ValueError(
                    "OIDC key must be a PEM PKCS8 private key; validate RSA 2048+ with openssl"
                )
            os.umask(0o077)
            render_bundle(env, pem, args.output)
        elif args.action == "networks":
            create_networks(env)
        print(
            "Configuration validated"
            + (" (identity bootstrap only)" if args.bootstrap else "")
        )
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Configuration blocked: {error}\n")


if __name__ == "__main__":
    main()
