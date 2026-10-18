"""Offline regression checks. No Docker daemon, root, credentials, or network needed."""

import copy
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import sys

from configure import ROOT, NETWORKS, identity_config, read_env, render_bundle, validate
from firewall import apply, check_backend, rules


def fixture():
    # These values are TEST DATA, never production defaults or a size recommendation.
    env = {key: "x" * 40 for key in read_env(ROOT / ".env.example")}
    env.update(
        {
            "CREWMATE_IMAGE": "sha256:" + "a" * 64,
            "CREWMATE_HOST": "crew.home.test",
            "IDENTITY_HOST": "id.home.test",
            "PORTAINER_HOST": "containers.home.test",
            "IMMICH_HOST": "photos.home.test",
            "COOKIE_DOMAIN": "home.test",
            "TLS_MODE": "provided",
            "LAN_INTERFACE": "enp1s0",
            "LAN_IP": "192.168.50.10",
            "LAN_CIDR": "192.168.50.0/24",
            "WG_SUBNET": "10.77.0.0/24",
            "WG_PORT": "51820",
            "HOST_MANAGER_GID": "900",
            "OWNER_USERNAME": "owner",
            "OWNER_EMAIL": "owner@home.test",
            "OWNER_PASSWORD_HASH": "$argon2id$TEST_ONLY",
            "AUTH_OIDC_CLIENT_ID": "crewmate-test",
            "PORTAINER_OIDC_CLIENT_ID": "portainer-test",
            "IMMICH_OIDC_CLIENT_ID": "immich-test",
            "MODEL_FILENAME": "test-model.gguf",
            "AUTH_OWNER_SUBJECT": "00000000-0000-4000-8000-000000000001",
            "IMMICH_ML_THREADS": "1",
            "LLAMA_CONTEXT": "1024",
            "LLAMA_GPU_LAYERS": "1",
            "LLAMA_THREADS": "1",
            "CREWMATE_AI_KEY": "",
        }
    )
    for index, (key, _) in enumerate(NETWORKS.values()):
        env[key] = f"172.28.{index}.0/29"
    for key in env:
        if key.endswith("_MEMORY"):
            env[key] = "512m"
        if key.endswith("_CPUS"):
            env[key] = "1"
        if key.endswith("_OIDC_SECRET_HASH"):
            env[key] = "$pbkdf2-sha512$TEST_ONLY"
    return env


class ConfigurationTests(unittest.TestCase):
    def test_fixture_is_valid(self):
        validate(fixture())

    def test_production_template_does_not_select_unresolved_values(self):
        with self.assertRaises(ValueError):
            validate(read_env(ROOT / ".env.example"))

    def test_rejects_unsafe_or_unresolved_settings(self):
        for key, value in (
            ("TLS_MODE", ""),
            ("TLS_MODE", "auto"),
            ("CREWMATE_IMAGE", "crewmate:latest"),
            ("CREWMATE_HOST", "evil.test"),
            ("CREWMATE_HOST", "a.home.test\nrespond secret"),
            ("IDENTITY_HOST", "crew.home.test"),
            ("LAN_IP", "0.0.0.0"),
            ("LAN_INTERFACE", "eth0;echo"),
            ("WG_SUBNET", "192.168.50.0/24"),
            ("AI_SUBNET", "172.28.0.0/29"),
            ("PHOTOS_PROXY_SUBNET", "2001:db8::/64"),
            ("AUTH_OWNER_SUBJECT", ""),
            ("HOST_MANAGER_GID", "0"),
            ("MODEL_FILENAME", "../../secrets.gguf"),
            ("DB_PASSWORD", "password"),
        ):
            with self.subTest(key=key, value=value):
                env = fixture()
                env[key] = value
                with self.assertRaises(ValueError):
                    validate(env)

    def test_bootstrap_only_relaxes_owner_subject(self):
        env = fixture()
        env["AUTH_OWNER_SUBJECT"] = ""
        validate(env, bootstrap=True)
        env["TLS_MODE"] = ""
        with self.assertRaises(ValueError):
            validate(env, bootstrap=True)

    def test_env_is_not_shell_and_hashes_are_literal(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "env"
            path.write_text("HASH='$pbkdf2-sha512$literal'\nEMPTY=\n")
            self.assertEqual(
                read_env(path), {"HASH": "$pbkdf2-sha512$literal", "EMPTY": ""}
            )
            for text in (
                "KEY=$(echo owned)",
                "KEY=x\nKEY=y",
                "export KEY=x",
                "KEY=hello world",
            ):
                path.write_text(text)
                with self.assertRaises(ValueError):
                    read_env(path)

    def test_oidc_owner_callbacks_and_auth_methods(self):
        config, users = identity_config(fixture(), "TEST_KEY\nNOT_A_REAL_KEY")
        self.assertEqual(list(users["users"]), ["owner"])
        self.assertEqual(config["access_control"]["default_policy"], "deny")
        oidc = config["identity_providers"]["oidc"]
        self.assertEqual(
            oidc["authorization_policies"]["owner"]["default_policy"], "deny"
        )
        crew, portainer, immich = oidc["clients"]
        self.assertEqual(
            crew["redirect_uris"], ["https://crew.home.test/api/auth/callback/local"]
        )
        self.assertEqual(portainer["redirect_uris"], ["https://containers.home.test"])
        self.assertEqual(
            immich["redirect_uris"],
            [
                "https://photos.home.test/auth/login",
                "https://photos.home.test/user-settings",
            ],
        )
        self.assertEqual(
            [c["token_endpoint_auth_method"] for c in oidc["clients"]],
            ["client_secret_basic", "client_secret_post", "client_secret_basic"],
        )
        self.assertTrue(
            all(c["authorization_policy"] == "owner" for c in oidc["clients"])
        )
        self.assertNotRegex(json.dumps(config), r"@[A-Z_]+@")

    def test_json_encoding_preserves_key_material_without_injection(self):
        pem = 'KEY\n"injected": "no"\n'
        config, _ = identity_config(fixture(), pem)
        decoded = json.loads(json.dumps(config))
        self.assertEqual(decoded["identity_providers"]["oidc"]["jwks"][0]["key"], pem)
        self.assertNotIn("injected", decoded)

    def test_render_never_replaces_installed_identity_or_publishes_partial_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "rendered"
            render_bundle(fixture(), "TEST_KEY", output)
            original = (output / "configuration.yml").read_bytes()
            self.assertEqual(
                (output / "configuration.yml").stat().st_mode & 0o777, 0o600
            )
            with self.assertRaises(ValueError):
                render_bundle(fixture(), "CHANGED_KEY", output)
            self.assertEqual((output / "configuration.yml").read_bytes(), original)
            candidate = Path(directory) / "candidate"
            with (
                patch("configure.os.fsync", side_effect=OSError("disk full")),
                self.assertRaises(OSError),
            ):
                render_bundle(fixture(), "CHANGED_KEY", candidate)
            self.assertFalse(candidate.exists())
            self.assertEqual(list(Path(directory).iterdir()), [output])


class SecurityTests(unittest.TestCase):
    def test_backend_checks_reject_native_nftables_live_restore_and_inspection_failure(
        self,
    ):
        safe = {
            "firewall-backend": "iptables",
            "iptables": True,
            "ip6tables": True,
            "live-restore": False,
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "daemon.json"
            for changed in (
                {"firewall-backend": "nftables"},
                {"iptables": False},
                {"ip6tables": False},
                {"live-restore": True},
            ):
                path.write_text(json.dumps(dict(safe, **changed)))
                with (
                    self.subTest(changed=changed),
                    self.assertRaises(ValueError),
                    patch("firewall.subprocess.check_output") as command,
                ):
                    check_backend(path)
                command.assert_not_called()
            path.write_text(json.dumps(safe))
            versions = ["iptables v1.8 (nf_tables)", "ip6tables v1.8 (nf_tables)"]
            with patch(
                "firewall.subprocess.check_output",
                side_effect=versions + [json.dumps({"nftables": []})],
            ):
                check_backend(path)
            with (
                patch(
                    "firewall.subprocess.check_output",
                    side_effect=versions
                    + [
                        json.dumps(
                            {
                                "nftables": [
                                    {
                                        "table": {
                                            "family": "ip",
                                            "name": "docker-bridges",
                                        }
                                    }
                                ]
                            }
                        )
                    ],
                ),
                self.assertRaises(ValueError),
            ):
                check_backend(path)
            with (
                patch(
                    "firewall.subprocess.check_output",
                    side_effect=versions + [subprocess.CalledProcessError(1, "nft")],
                ),
                self.assertRaises(subprocess.CalledProcessError),
            ):
                check_backend(path)

    def test_guard_is_inserted_before_an_existing_accept_without_removing_protection(
        self,
    ):
        def listing(command, **_):
            chain = command[-1]
            target = "CREWMATE_INPUT" if chain == "INPUT" else "CREWMATE_FORWARD"
            return f"-A {chain} -j ACCEPT\n-A {chain} -j {target}\n"

        with (
            patch("firewall.os.geteuid", return_value=0),
            patch("firewall.check_backend"),
            patch("firewall.subprocess.check_output", side_effect=listing),
            patch(
                "firewall.subprocess.run",
                return_value=subprocess.CompletedProcess([], 0),
            ) as command,
        ):
            apply(fixture(), "test-daemon.json")
        commands = [call.args[0] for call in command.call_args_list]
        insertions = [args for args in commands if "-I" in args]
        self.assertEqual(len(insertions), 6)
        self.assertTrue(all(args[4] == "1" for args in insertions))
        self.assertFalse(any("-D" in args for args in commands))
        self.assertTrue(all("--test" in args for args in commands[:2]))

    def test_current_first_guards_are_not_duplicated(self):
        def listing(command, **_):
            chain = command[-1]
            target = "CREWMATE_INPUT" if chain == "INPUT" else "CREWMATE_FORWARD"
            return f"-A {chain} -j {target}\n-A {chain} -j ACCEPT\n"

        with (
            patch("firewall.os.geteuid", return_value=0),
            patch("firewall.check_backend"),
            patch("firewall.subprocess.check_output", side_effect=listing),
            patch(
                "firewall.subprocess.run",
                return_value=subprocess.CompletedProcess([], 0),
            ) as command,
        ):
            apply(fixture(), "test-daemon.json")
        self.assertFalse(any("-I" in call.args[0] for call in command.call_args_list))

    def test_host_manager_provisions_only_the_lan_service_host_route(self):
        sys.path.insert(0, str(ROOT.parent / "services/host-manager"))
        try:
            from wireguard import WireGuard, settings
            from common import Error

            env = fixture()
            config = settings(
                {
                    "dataRoot": "/srv/crewmate",
                    "healthChecks": [],
                    "wireguard": {
                        "network": env["WG_SUBNET"],
                        "serverAddress": "10.77.0.1/24",
                        "endpoint": "vpn.example.test:51820",
                        "allowedIPs": [env["LAN_IP"] + "/32"],
                        "excludedNetworks": [env["LAN_CIDR"]]
                        + [env[key] for key, _ in NETWORKS.values()],
                    },
                }
            )
            client = WireGuard(config["wireguard"], None).client(
                "fixture-private", "fixture-public", "10.77.0.2/32"
            )
            self.assertIn("AllowedIPs = 192.168.50.10/32\n", client)
            config["wireguard"]["allowedIPs"] = [env["LAN_CIDR"]]
            with self.assertRaises(Error):
                settings(config)
        finally:
            sys.path.pop(0)

    def test_firewall_tunnel_rules_precede_established_rules(self):
        for v6 in (False, True):
            text = rules(fixture(), v6)
            self.assertLess(
                text.index("-A CREWMATE_INPUT -i wg0 -j DROP"),
                text.index("-A CREWMATE_INPUT -m conntrack"),
            )
            self.assertIn("-A CREWMATE_FORWARD -i wg0 -j DROP", text)
            self.assertIn("-A CREWMATE_FORWARD -o wg0 -j DROP", text)
            self.assertIn("-A CREWMATE_INPUT -j DROP", text)
            self.assertNotIn("MASQUERADE", text)
            self.assertIn("-A CREWMATE_FORWARD -j DROP\nCOMMIT", text)
            if v6:
                self.assertNotRegex(text, r"-i wg0 .*ACCEPT")
                self.assertNotIn("--dport 443", text)
            else:
                self.assertIn("--ctorigdst 192.168.50.10 --ctorigdstport 443", text)
                self.assertIn("-i wg0 -s 10.77.0.0/24 -d 192.168.50.10/32", text)

    def test_exact_frame_origin_and_every_app_gateway(self):
        text = (ROOT / "access/Caddyfile").read_text()
        self.assertEqual(text.count("import owner_gate"), 3)
        self.assertEqual(text.count("frame-ancestors https://{$CREWMATE_HOST}"), 2)
        self.assertNotIn("frame-ancestors *", text)
        self.assertNotIn("unsafe-eval", text)
        self.assertIn("script-src 'self' https://js.hsforms.net", text)
        self.assertIn("object-src 'none'", text)

    def test_all_vendor_images_are_digest_pinned(self):
        for path in ROOT.glob("*/compose.yml"):
            for image in re.findall(r"^\s+image: (.+)$", path.read_text(), re.M):
                if not image.startswith("${CREWMATE_IMAGE"):
                    self.assertRegex(image, r"@sha256:[a-f0-9]{64}$")
        dockerfile = (ROOT.parent / "Dockerfile").read_text()
        self.assertIn("USER node", dockerfile)
        self.assertIn("WORKDIR /app/apps/web", dockerfile)
        for package in (ROOT.parent / "packages").glob("*/package.json"):
            self.assertIn(str(package.relative_to(ROOT.parent)), dockerfile)

    @unittest.skipUnless(shutil.which("docker"), "Docker CLI unavailable")
    def test_real_compose_parser_and_effective_security(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "env"
            path.write_text(
                "\n".join(f"{key}='{value}'" for key, value in fixture().items())
            )
            configs = {}
            for group in ("connectivity", "access", "admin", "photos", "ai"):
                output = subprocess.check_output(
                    [
                        "docker",
                        "compose",
                        "--env-file",
                        str(path),
                        "-f",
                        str(ROOT / group / "compose.yml"),
                        "config",
                        "--format",
                        "json",
                    ],
                    text=True,
                    stderr=subprocess.PIPE,
                    timeout=20,
                )
                configs[group] = json.loads(output)
            published = [
                (name, s["ports"])
                for c in configs.values()
                for name, s in c["services"].items()
                if s.get("ports")
            ]
            self.assertEqual([p[0] for p in published], ["caddy"])
            for config in configs.values():
                for service in config["services"].values():
                    for volume in service.get("volumes", []):
                        if volume.get("source", "").startswith(
                            ("/srv/crewmate/", "/etc/crewmate/")
                        ):
                            self.assertFalse(
                                volume["bind"]["create_host_path"], volume["source"]
                            )
            self.assertEqual(published[0][1][0]["host_ip"], "192.168.50.10")
            self.assertEqual(str(published[0][1][0]["published"]), "443")
            crew = configs["access"]["services"]["crewmate"]
            self.assertNotIn("depends_on", crew)
            self.assertNotIn("docker.sock", json.dumps(crew))
            self.assertIn("900", crew["group_add"])
            originals = next(
                v
                for v in configs["photos"]["services"]["immich-server"]["volumes"]
                if v["target"] == "/external/pcloud"
            )
            self.assertTrue(originals["read_only"])
            self.assertFalse(originals["bind"]["create_host_path"])
            self.assertNotIn(
                "devices", configs["photos"]["services"]["immich-machine-learning"]
            )
            self.assertNotIn("pcloud", configs["photos"]["services"])
            queue = configs["photos"]["services"]["redis"]["command"]
            self.assertEqual(queue[queue.index("--appendfsync") + 1], "always")
            ai = configs["ai"]["services"]["llama"]
            self.assertEqual(ai["command"][ai["command"].index("--parallel") + 1], "1")
            self.assertTrue(ai["volumes"][0]["read_only"])
            self.assertEqual(
                configs["connectivity"]["services"]["wireguard"]["network_mode"], "host"
            )
            for group in ("connectivity", "admin", "photos", "ai"):
                self.assertNotIn(
                    "crewmate", json.dumps(configs[group].get("depends_on", {}))
                )


if __name__ == "__main__":
    unittest.main()
