# Install Crewmate on the Alienware x15 R2

Written 2026-10-19 for a fresh, single-owner Ubuntu Server installation.

Install in stages: **Ubuntu → Docker → private login/dashboard → VPN/containers
→ AI → photos**. The repository is prepared, but official pCloud synchronization
is still blocked, and HTTPS/DNS must be selected before starting the dashboard.
See [the acceptance record](ACCEPTANCE.md) for completed checks and remaining
live-device validation.

## 1. Install Ubuntu Server

If Ubuntu is already installed, skip this step.

1. Download **Ubuntu Server 24.04 LTS, AMD64** from
   [Ubuntu](https://ubuntu.com/download/server). It is a supported starting point;
   the laptop's NVIDIA driver still needs verification.
2. Write the ISO to a USB stick using a USB imaging tool.
3. Connect the laptop to Ethernet if possible.
4. Boot the laptop from the USB.
5. During installation:
   - Create your administrator account.
   - Enable **OpenSSH Server** and configure an SSH key for remote administration.
   - Enable virtualization in firmware if disabled.
   - Choose the disk layout carefully: **using the whole disk erases its contents**.
   - Reserve operating-system/database capacity separately from bulk photos,
     models, and VM disks, using the storage guidance in [README.md](README.md).
6. Reboot and remove the USB.

Keep the lid open during initial setup and temperature testing.

## 2. Update Ubuntu and install host tools

On the Alienware:

```bash
sudo apt update
sudo apt upgrade
sudo apt install \
  ca-certificates curl gnupg git rsync python3 openssl \
  wireguard-tools iproute2 iptables nftables \
  qemu-kvm libvirt-daemon-system libvirt-clients \
  smartmontools lm-sensors
```

Inspect the machine:

```bash
free -h
lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINTS
ip -br address
ip route
lspci -nnk
sudo virt-host-validate
sudo virsh -c qemu:///system list --all
```

Record:

- RAM and SSD capacity.
- Ethernet interface name.
- LAN address and subnet.
- NVIDIA GPU detected.

In your router, create a **DHCP reservation** so the server keeps the same LAN
address. Confirm SSH works from your computer before proceeding.

## 3. Copy the current Crewmate implementation

Copy the checkout containing the home-server implementation. This includes local
work that may not have been published to the remote Git repository.

Replace `SERVER_USER` and `SERVER_IP` below with the Ubuntu username and reserved
LAN address. Adjust the source checkout path if yours differs.

On your Mac:

```bash
rsync -av \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.git \
  --exclude=.serena \
  --include='.env.example' \
  --exclude='.env*' \
  /Users/victor/test/crewmate/ \
  SERVER_USER@SERVER_IP:~/crewmate/
```

On the Alienware, for a fresh installation:

```bash
sudo mkdir -p /opt/crewmate
sudo cp -a ~/crewmate/. /opt/crewmate/
sudo chown -R root:root /opt/crewmate
cd /opt/crewmate
```

Use `/opt/crewmate` as the working directory for subsequent deployment commands.
For an existing installation, follow [RECOVERY.md](RECOVERY.md) before replacing
code or configuration.

## 4. Install Docker Engine and Compose

Follow Docker's official
[Ubuntu apt-repository instructions](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository).

Install **Docker Engine**, including its Buildx and Compose plugins.

Check:

```bash
sudo docker version
sudo docker compose version
```

This deployment requires:

- Docker Engine **29 or newer**.
- Compose **2.33.1 or newer**.
- Docker's **iptables backend**.

Before installing the repository firewall, stop Docker and its activation socket:

```bash
sudo systemctl stop docker.service docker.socket
```

Start application containers only after the firewall installation succeeds.

## 5. Choose names and HTTPS, then create configuration

You need four service names:

| Service | Example only |
| --- | --- |
| Dashboard | `crew.home.arpa` |
| Login | `identity.home.arpa` |
| Containers | `containers.home.arpa` |
| Photos | `photos.home.arpa` |

All must resolve to the server's LAN IP.

For a setup without a domain subscription, **Caddy's private CA is a possible
choice**. It requires installing its public root certificate on your computers
and phone. Select `TLS_MODE=internal` only after choosing this approach. The
`provided` alternative and certificate requirements are described in
[README.md](README.md#3-explicit-httpsnaming-selection).

**DNS must also work over VPN.** The current VPN deliberately cannot reach the
router's DNS server, so local router records alone do not finish remote access.
Choose a name-resolution arrangement compatible with [NETWORK.md](NETWORK.md).

Create the protected configuration:

```bash
sudo install -d -m 0700 /etc/crewmate
sudo install -m 0600 deploy/.env.example \
  /etc/crewmate/deployment.env
sudoedit /etc/crewmate/deployment.env
```

Fill in the network settings first:

- Actual LAN interface, IP, and subnet.
- A nonoverlapping WireGuard subnet and selected UDP port.
- Eight nonoverlapping Docker subnets, checked against LAN, VPN, and VM routes.

Later, complete service names, TLS choice, credentials, image ID, and resource
budgets. The template's blanks are intentional; example addresses are not safe
defaults. Do not `source` this file into a shell.

## 6. Prepare storage, host management, and firewall

### Storage

Create the persistent directories listed in
[README.md](README.md#2-storage-and-secret-preparation).

The main locations are:

- `/etc/crewmate` — configuration and secrets.
- `/srv/crewmate` — application data, models, and originals.
- `/var/lib/crewmate-host` — recorded management operations.

Set ownership for each service as documented. Preserve these directories during
container upgrades. Back up matching application databases, configuration, and
keys; replacing an image does not undo a database migration or subsequent writes.
Native synchronized originals are mutable, not a historical backup. Follow
[RECOVERY.md](RECOVERY.md) for upgrades and restores.

### WireGuard configuration

Prepare:

```text
/srv/crewmate/wireguard/wg_confs/wg0.conf
```

Use [connectivity/wg0.conf.example](connectivity/wg0.conf.example), replacing its
placeholders with the tunnel address, UDP port, and a newly generated server
private key. Keep it root-owned with mode `0600`. Load the host WireGuard module
and configure it to load at boot as described in [README.md](README.md).

### Host manager

Follow the installation block in the
[host-manager guide](../services/host-manager/README.md#install-on-the-host-not-performed-by-this-change).

In its configuration:

- Use your actual tunnel subnet and address.
- Set `allowedIPs` to **the server LAN IP followed by `/32`**.
- Set the intended VPN endpoint.
- List known LAN, Docker, and VM networks in `excludedNetworks`.
- Keep `healthChecks` empty initially.
- Record the `crewmate-host` group's numeric GID in `HOST_MANAGER_GID`.

Also install the runtime drop-in described in
[README.md](README.md#5-host-security-boot-and-service-startup-operator-action-not-run-here).

### Firewall

At the laptop's local console, follow
[NETWORK.md — Installation and boot ordering](NETWORK.md#installation-and-boot-ordering-rootlocal-console-operation).

This installs the firewall and makes Docker start after it. Merge the supplied
Docker configuration fragment into any existing `daemon.json`, preserving
existing settings. Keep the local console available while applying network rules.

Only start Docker once the firewall installation succeeds.

## 7. Build Crewmate and configure owner login

Build the image:

```bash
sudo docker build --tag crewmate:reviewed-build .
sudo docker image inspect crewmate:reviewed-build \
  --format '{{.Id}}'
```

Put the returned `sha256:…` value into `CREWMATE_IMAGE`.

Docker builds Node and the application inside the image; a separate host Node
installation is not needed for this build.

Follow [IDENTITY.md](IDENTITY.md#configure-identity-secrets) to generate:

- Your owner password hash.
- Three separate application client secrets and their hashes.
- Authentication/encryption secrets.
- The OIDC signing key.

Complete the remaining environment fields, including measured CPU/RAM budgets
and the intended model settings. Initially leave only `AUTH_OWNER_SUBJECT`
unset, plus the optional AI key if unused. Keep secrets out of Git and logs.

Validate and render:

```bash
sudo python3 -B deploy/configure.py check \
  --env /etc/crewmate/deployment.env --bootstrap

sudo python3 -B deploy/configure.py render \
  --env /etc/crewmate/deployment.env --bootstrap

sudo python3 -B deploy/configure.py networks \
  --env /etc/crewmate/deployment.env --bootstrap
```

Rendering refuses to overwrite an existing bundle. For configuration changes,
use the candidate-bundle procedure in [README.md](README.md).

Run the Compose, Authelia, and Caddy validation commands in
[README.md](README.md#4-build-and-validate-without-deploying) before starting
services. Their required networks, bind sources, and certificate files must exist.

## 8. Start login first, then the dashboard

Start Authelia and Caddy:

```bash
sudo docker compose \
  --env-file /etc/crewmate/deployment.env \
  -f deploy/access/compose.yml \
  up -d authelia caddy
```

Then:

1. Finish certificate trust on your computer and phone. For a Caddy private CA,
   export only the public root certificate as described in [README.md](README.md).
2. Prepare `/etc/crewmate/certificates/trust.pem` for backend applications.
3. Generate/export the owner's OIDC identifier using the commands in
   [IDENTITY.md](IDENTITY.md#configure-identity-secrets).
4. Put that identifier into `AUTH_OWNER_SUBJECT`; it is not the username or email.
5. Run full validation:

```bash
sudo python3 -B deploy/configure.py check \
  --env /etc/crewmate/deployment.env
```

Start Crewmate:

```bash
sudo docker compose \
  --env-file /etc/crewmate/deployment.env \
  -f deploy/access/compose.yml \
  up -d crewmate
```

Open your chosen dashboard HTTPS address and sign in.

## 9. Add the remaining services

### Portainer

```bash
sudo docker compose \
  --env-file /etc/crewmate/deployment.env \
  -f deploy/admin/compose.yml up -d
```

Complete its initial administrator setup and OAuth configuration using
[IDENTITY.md](IDENTITY.md#portainer-ce). Repository Compose files remain the
deployment source of truth; Portainer supplies runtime administration.

### WireGuard

```bash
sudo docker compose \
  --env-file /etc/crewmate/deployment.env \
  -f deploy/connectivity/compose.yml up -d
```

Create a peer from Crewmate's VPN page. Save its one-time configuration or QR code
before leaving the page. For external access, forward **only the selected
WireGuard UDP port** on the router, after checking ISP reachability. Test the
server-only restrictions in [NETWORK.md](NETWORK.md) from another network.

### AI

1. Install the Ubuntu-supported NVIDIA driver and verify `nvidia-smi`.
2. Install
   [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html).
3. Configure its Docker runtime, preserving the firewall settings. Restarting
   Docker interrupts running services, including WireGuard; use local access.
4. Put a verified GGUF model in `/srv/crewmate/models`.
5. Choose model, context, and resource settings based on actual VRAM.
6. Start the AI stack:

```bash
sudo docker compose \
  --env-file /etc/crewmate/deployment.env \
  -f deploy/ai/compose.yml up -d
```

Verify GPU use, browser generation/cancellation, temperatures, and responsiveness
under load.

### Photos

Immich can be tested with disposable files. The real pCloud library must wait
until the supported native synchronization setup is resolved. Follow
[photos/PCLOUD-GATE.md](photos/PCLOUD-GATE.md); no pCloud runtime is supplied yet.

After preparing disposable originals and the photo stack's persistent storage,
the test stack can be started with:

```bash
sudo docker compose \
  --env-file /etc/crewmate/deployment.env \
  -f deploy/photos/compose.yml up -d
```

Complete Immich owner/OAuth setup and add the read-only external library using
[IDENTITY.md](IDENTITY.md#immich). Leave automatic scans disabled until the pCloud
partial-transfer behavior is verified.

## 10. Verify reboot and recovery

Use [ACCEPTANCE.md](ACCEPTANCE.md) to check:

- Services return after reboot without a desktop login.
- Phone and desktop login work.
- Logout blocks new protected requests; test existing streams separately.
- VPN reaches the server but not other LAN devices, peers, or arbitrary containers.
- Dashboard downtime leaves independent services running.
- Application data and configuration can be restored together.

Before tailoring device-specific values, record whether Ubuntu is installed, the
actual RAM/storage, router model, and chosen naming/certificate approach.

This installation has not yet been tested on the Alienware. Live SSO, firewall
behavior, GPU operation, recovery, and pCloud remain validation steps.
