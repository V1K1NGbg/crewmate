# Private home-server deployment

**Repository assets, not a deployed system.** No host installation, firewall
application, GPU calibration, VPN reachability, browser SSO or restore has been
performed. Authelia and repository-managed Compose are selected; naming/trusted
HTTPS remain **pending an explicit user decision**. Official pCloud native folder
sync is **blocked** by its currently unsupported setup interface.

Start with the [step-by-step installation guide](INSTALL.md),
[acceptance/status](ACCEPTANCE.md), [network policy](NETWORK.md),
[identity setup](IDENTITY.md), [pCloud gate](photos/PCLOUD-GATE.md),
[recovery](RECOVERY.md), and [verified artifact pins](RELEASES.md).

## Ownership and lifecycle

Five independent Compose projects: `connectivity`, `access`, `admin`, `photos`,
`ai`. Run commands from the checkout root, installed at `/opt/crewmate` on the
host. No project depends on the dashboard's availability. Access to an app needs
the proxy/identity provider, but its background work does not. Restarting the
Docker daemon still interrupts **all** projects, including WireGuard.

The Git-managed Compose files are authoritative. Portainer is for runtime state,
logs and deliberate predefined-service operations, not editing/redeploying these
externally created stacks. Do not import duplicate stacks into Portainer, create
UI-only overrides, delete volumes, or use an auto-updater. Emergency changes must
be reconciled into reviewed repository configuration before the next deployment.
Docker access gives Portainer host-administrator authority; Crewmate never gets
the Docker socket.

## 1. Hardware and operating-system preflight (on the actual laptop)

Select a supported Ubuntu Server LTS **after** checking Dell/NVIDIA support for
this hardware; no OS image or driver version has been approved by repository
tests. Ubuntu 24.04 LTS is a candidate, not a performed installation.

Record `lscpu`, `free -h`, `lsblk -f`, `df -h`, `lspci -nnk`, `ip -br address`,
`ip route`, `ip -6 route`, `sudo smartctl -a DEVICE`, firmware version, and
`nvidia-smi` (driver, GPU, actual VRAM). Check VT-x/VT-d, `/dev/kvm`,
`virt-host-validate`, `virsh -c qemu:///system list --all`, wired adapter support,
SSD health/capacity, swap and existing LAN/Docker/VM subnet conflicts.

Install Docker Engine/Compose using the [official Ubuntu guide](https://docs.docker.com/engine/install/ubuntu/),
and NVIDIA Container Toolkit using its [official guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html).
Record installed package versions and apt origin; do not copy an unverified driver
number or CUDA image from an old tutorial. Require Compose supporting
`gw_priority` (2.33.1+) and Engine supporting explicit `firewall-backend` (29+).
Check `docker version`, `docker compose version`, and `docker info`. The supported
firewall path here is Docker **iptables**, including Ubuntu's iptables-nft shim,
not Docker's native nftables backend. Read `NETWORK.md` before starting Docker.

Install host Python 3, `wireguard-tools`, `iptables`, `nftables` (inspection only),
libvirt/KVM and hardware diagnostic packages from the selected Ubuntu release.
Load the host WireGuard module (`sudo modprobe wireguard`) and persist that module
in `/etc/modules-load.d/crewmate.conf`. The container does not load kernel modules.
Do not enable libvirt GPU passthrough; the host LLM needs that GPU.

Only after open-lid sustained-load testing, adequate ventilation and battery
inspection, choose logind lid behavior (`HandleLidSwitch=ignore`,
`HandleLidSwitchExternalPower=ignore`) and verify it after reboot. Check firmware
AC-power recovery, charging/battery-care options and thermal throttling. No
lid-closed or power-loss result is claimed. Reserve host/auth/VPN resources before
allocating photo/AI/VM budgets; 16 GB and 32 GB machines require different budgets.

## 2. Storage and secret preparation

Use protected configuration in `/etc/crewmate` and persistent state in
`/srv/crewmate`; do not put either in Git or a container writable layer.

| Path | Owner/writer and retention |
|---|---|
| `/etc/crewmate/deployment.env`, `oidc.pem`, `rendered/` | root only; secrets/hashes; back up encrypted |
| `/etc/crewmate/certificates/` | root; `trust.pem` is a public trust bundle; server private key stays here |
| `/srv/crewmate/authelia/` | Authelia; encrypted DB plus stable opaque user subjects |
| `/srv/crewmate/caddy/{data,config}/` | Caddy; CA/cert/account state; back up private material |
| `/srv/crewmate/wireguard/wg_confs/wg0.conf` | root host manager; server key and public peer assignments |
| `/srv/crewmate/portainer/` | Portainer; local environment/authentication data |
| `/srv/crewmate/pcloud/{state,originals}/` | future official pCloud writer only; real use remains gated |
| `/srv/crewmate/immich/{postgres,data,redis,model-cache}/` | respective services; DB and derived data separate from originals |
| `/srv/crewmate/models/` | operator writes; llama.cpp reads only |
| `/var/lib/crewmate-host/`, `/etc/crewmate-host/` | host manager; durable operation outcomes/config; root only |
| `/var/lib/libvirt/images/` | libvirt VM disks; reserve/quota separately |

Choose partitions/LVM/filesystem quotas to keep bulk originals/models/VM disks
from filling the host, identity and database areas. Set capacity warnings and
log rotation. No free-space threshold or backup destination is guessed here.
Set service data ownership to the pinned image's runtime UID after inspection;
do not make a database directory world-writable. The model must be readable by
UID 1000. Source original files need readable/traversable permissions, never an
Immich write ACL. Use local SSD-backed PostgreSQL storage, not a network mount.

```sh
sudo install -d -m 0700 /etc/crewmate /etc/crewmate/rendered
sudo install -m 0600 deploy/.env.example /etc/crewmate/deployment.env
# Edit that file locally; every blank is intentional. Never `source` it.
# Create the persistent paths above with reviewed owners and storage quotas.
```

## 3. Explicit HTTPS/naming selection

`TLS_MODE` is deliberately empty. All four sibling service hostnames must resolve
to the **host LAN IPv4** on LAN and VPN, never the browser's localhost. The common
cookie domain must contain only trusted services. No DNS product is selected.

- **Private CA (`internal`)**: no registered domain/certificate service required;
  Caddy owns a private CA. Install its public root on every phone/desktop and in
  backend trust bundles. This is **not** zero-client-setup HTTPS. Names still need
  resolution through an explicitly chosen existing-router or client arrangement.
- **Provided trusted certificates (`provided`)**: operator supplies `fullchain.pem`
  and `privkey.pem` covering all four selected names. Public trust normally needs
  control of a registered domain and an approved issuance/renewal mechanism;
  that external dependency has **not** been authorized. A DNS-01 approach can
  keep apps private, but no DNS provider/plugin/domain is configured here.

`provided` also supports an explicitly selected operator-managed private CA.
The script never defaults to one mode, invokes public ACME, opens port 80, or
installs a client trust root. `trust.pem` must contain the trust roots required by
the selected HTTPS mode (include normal public roots for Portainer's Go client).
Do not set insecure TLS flags. No server private key is mounted into a backend.
For `internal`, bootstrap Caddy/Authelia first, export the **public** root from
`/srv/crewmate/caddy/data/caddy/pki/authorities/local/root.crt`, form `trust.pem`,
and enroll clients before starting downstream apps. Never export `root.key`.

## 4. Build and validate, without deploying

```sh
npm run check:all
docker build --tag crewmate:reviewed-build .
docker image inspect crewmate:reviewed-build --format '{{.Id}}'
# Put that immutable sha256 ID in CREWMATE_IMAGE; retain it for rollback.
python3 -B -m unittest discover -s deploy -p 'test_*.py' -v
sudo python3 -B deploy/configure.py check --env /etc/crewmate/deployment.env --bootstrap
sudo python3 -B deploy/configure.py render --env /etc/crewmate/deployment.env --bootstrap
```

Supply the real RSA PKCS8 signing key at `/etc/crewmate/oidc.pem` first; see
`IDENTITY.md`. The helper serializes JSON (valid YAML), avoiding unsafe secret
substitution. The strict env parser supports single-line raw or single-quoted
literal values; use quotes for `$`-containing hashes. Do not log rendered Compose
or identity config: it contains secrets. Check mounts/certificates exist and file
permissions before runtime. `configure check` is static input validation, not a
claim of working certificates, supported pCloud sync, or production readiness.
Rendering publishes a complete new directory and refuses to overwrite an existing
bundle. For changes, render with `--output /etc/crewmate/rendered-candidate`, validate
that candidate using matching temporary Compose bind overrides, stop the affected
access services, preserve the old bundle, and install/recreate from the new one.
Do not replace signing keys or user subjects without the recovery procedure.

```sh
for stack in connectivity access admin photos ai; do
  sudo docker compose --env-file /etc/crewmate/deployment.env \
    -f "deploy/$stack/compose.yml" config --quiet || break
done
sudo docker compose --env-file /etc/crewmate/deployment.env \
  -f deploy/access/compose.yml run --rm --no-deps authelia \
  authelia validate-config --config /config/configuration.yml
sudo docker compose --env-file /etc/crewmate/deployment.env \
  -f deploy/access/compose.yml run --rm --no-deps caddy \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

The last two require a running Docker daemon and the pre-created networks and
files, but publish no application ports. Do not proceed after a failed check.

## 5. Host security, boot and service startup (operator action, NOT run here)

Keep a physical console and a tested LAN SSH key session. Install the separate
`services/host-manager` according to its instructions, then install
`host/host-manager-runtime.conf` at
`/etc/systemd/system/crewmate-host-manager.service.d/runtime.conf`. It preserves
the socket directory inode across service restarts. Set `HOST_MANAGER_GID` to
the numeric `getent group crewmate-host` GID. The directory is root:crewmate-host
0750 and socket 0660; Crewmate UID 1000 gets only that supplementary group.
Never use 0666, a TCP listener, or a Docker-socket mount as a workaround.

Install the firewall unit and Docker drop-in from `NETWORK.md` **before enabling
container auto-restarts**, and review host manager route compatibility there.
After storage, subnet selection, config validation and firewall installation:

```sh
sudo python3 -B deploy/configure.py networks --env /etc/crewmate/deployment.env --bootstrap
# Create the filled root-owned wg0.conf from connectivity/wg0.conf.example.
sudo docker compose --env-file /etc/crewmate/deployment.env -f deploy/connectivity/compose.yml up -d
sudo docker compose --env-file /etc/crewmate/deployment.env -f deploy/access/compose.yml up -d authelia caddy
# Finish identity bootstrap/subject allowlist and TLS trust per IDENTITY.md.
sudo python3 -B deploy/configure.py check --env /etc/crewmate/deployment.env
sudo docker compose --env-file /etc/crewmate/deployment.env -f deploy/access/compose.yml up -d crewmate
sudo docker compose --env-file /etc/crewmate/deployment.env -f deploy/admin/compose.yml up -d
# ONLY with disposable originals until PCLOUD-GATE.md is satisfied:
sudo docker compose --env-file /etc/crewmate/deployment.env -f deploy/photos/compose.yml up -d
# ONLY after GPU/model verification and resource budgeting:
sudo docker compose --env-file /etc/crewmate/deployment.env -f deploy/ai/compose.yml up -d
```

`restart: unless-stopped` restarts created containers on boot without desktop
login; it does not create a missing deployment or undo an explicit stop. Enable
Docker, the firewall unit, libvirt and the host manager with systemd, then reboot
and verify readiness and ordering. Boot is an acceptance test, not inferred from
`up -d`. There is intentionally no all-in-one script that starts unfinished stacks.

## 6. Runtime validation and observability

Use each project's `docker compose … ps`, bounded `logs --tail 100`,
`journalctl -u crewmate-host-manager -u crewmate-firewall`, `docker stats`,
`nvidia-smi`, disk/quota and thermal checks. Never paste logs containing auth
codes, private keys or session tokens. Caddy access logs are not enabled; app
logs still require a sensitive-data review. A running container is not ready:
Authelia/Immich use image health checks, Crewmate its Dockerfile HTTP check,
WireGuard verifies the interface (not external reachability), and llama checks
`/health` after model load. Portainer/Caddy readiness needs actual HTTPS probes.

Register only fixed, local supported health checks with the host manager. Report
pCloud sync as unavailable/unvalidated, separately from Immich readiness; a
missing state directory must not appear as a successfully empty remote library.
Immich maps/model downloads may require outbound internet; map provider/offline
behavior is not selected. Do not promise fully offline search/maps before testing.

AI: choose a licensed GGUF model after measuring VRAM; verify its checksum before
placing it in `/srv/crewmate/models`. One slot (`--parallel 1`), one GPU and a
read-only model directory are configured. Context/GPU layers/CPU/RAM budgets have
no fake defaults. Check remote-browser streaming, cancellation, OOM recovery,
sustained temperatures and VPN/login responsiveness under photo/VM load. No
throughput or model-size claim is made by this repository.
