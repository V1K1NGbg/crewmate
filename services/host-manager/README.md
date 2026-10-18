# Crewmate host manager

A Python 3.9+ standard-library service for an Ubuntu host. It listens **only** on
`/run/crewmate-host/manager.sock`. The Next.js backend is the trusted socket client;
it authenticates the local owner and checks browser-origin/CSRF boundaries.
Socket access grants the entire small management API. Never expose it through a
generic HTTP proxy, to the assistant, or to untrusted containers.

## Integration contract

Wire types are `packages/types/src/home.ts`:

| Request | Response |
| --- | --- |
| `GET /overview` | `HostOverview` |
| `GET /vms` | `{ "vms": VirtualMachine[] }` |
| `GET /vpn` | `VPNStatus` |
| `GET /operations?id=<canonical-uuid>` | `HomeOperation` |
| `POST /vms` | `HomeOperation`; existing UUID plus `start`, `shutdown`, or `destroy` |
| `POST /vpn` | `HomeOperation`; `add` with name, or `revoke` with public key |

POST requires `application/json`, one Content-Length, at most 8192 bytes, and a
fresh `operationId` UUID for a new deliberate action. Destroy and revoke require
  `confirm: true`. Extra fields, paths, addresses, executable names and arbitrary
actions are rejected. HTTP 200 means the operation is recorded, **not** that it
completed: inspect `status`. Boundary failures return non-2xx `{ "error": "…" }`.
There is no bearer credential or TCP listener on this local interface.

`completed` means the requested state was observed; it does not prove guest/app
readiness or external VPN connectivity. Graceful shutdown remains `pending` until
the guest stops. An acknowledged but hung graceful shutdown can be followed by a
new explicitly confirmed destroy. Otherwise unresolved operations block conflicting
mutations. `uncertain` means inspection/reconciliation is required, not retry.
Only an acknowledged pending graceful shutdown includes `forceStopVM` in its
response, allowing the UI to offer a separately confirmed stop for that UUID.

The client transport should allow at least 35 seconds, close abandoned requests,
and preserve operation IDs after disconnects. Commands each have an 8-second
deadline; this synchronous service handles one request at a time. Large or slow
inventories can exceed the client's deadline, and then the client must query its
operation ID. A duplicate request with identical ID/body returns its durable
outcome without rerunning the action; changed bodies with the same ID return 409.

Provisioning `configuration` is returned only in the **initial successful POST**.
GETs, duplicate POSTs, logs and the ledger never contain it. If that response is
lost, revoke the public peer and create a new one after reconciliation. No private
client-key recovery exists. Peer names persist as comments in `wg0.conf`.

## Files and ownership

| Host path | Owner/mode | Purpose |
| --- | --- | --- |
| `/opt/crewmate-host/{manager,common,metrics,wireguard}.py` | root, 0644 | Installed code |
| `/etc/crewmate-host/config.json` | root, 0600 | Operator settings |
| `/run/crewmate-host` | root:crewmate-host, 0750 | Runtime directory |
| `/run/crewmate-host/manager.sock` | root:crewmate-host, 0660 | Backend-only socket |
| `/var/lib/crewmate-host` | root, 0700 | Durable operations |
| `/var/lib/crewmate-host/operations.sqlite3` | root, 0600 | Secret-free idempotency ledger |
| `/var/lib/crewmate-host/manager.lock` | root, 0600 | Shared advisory writer lock |
| `/srv/crewmate/wireguard/wg_confs/wg0.conf` | root, 0600 | Existing server key and public peer configuration |

All storage parents must be root-owned, real directories, not group/world writable.
The service rejects symlinks and nonprivate config files. A separate daemon lock
prevents a second instance from unlinking a live socket. State and the writer lock
are outside `/run`: reboot does not forget operation identity or pending intent.

Compose remains authoritative for deployments. This service never reads the Docker
socket or changes containers, Compose definitions, firewall rules, VM definitions,
VM disks, or wg0's lifecycle. The connectivity container owns interface startup;
the host service uses host `wg` against that host-network interface.

## Operator configuration

Copy `config.example.json` outside the checkout and replace example values after
inspecting actual LAN, Docker and VM routes. The schema is strict:

- `dataRoot`: canonical absolute path, used only for disk-usage measurements.
- `wireguard.network`: nonconflicting IPv4 subnet, `/16` through `/30`.
- `wireguard.serverAddress`: host address **with the same network prefix** as
  `network`; must match the existing configuration and live wg0 address.
- `wireguard.endpoint`: operator-selected hostname/IPv4/bracketed IPv6 plus port.
  No endpoint discovery, public reachability or DNS readiness is inferred.
- `wireguard.allowedIPs`: one to eight explicit **server IPv4 `/32`** destinations.
  For the repository firewall/private-service deployment, use `LAN_IP/32`; the
  example tunnel `/32` is suitable only if the firewall and proxy also serve it.
  Each destination must be assigned to the host when provisioning. Broad LAN,
  default, loopback, multicast, link-local and nonlocal destinations are rejected.
- `wireguard.excludedNetworks`: known LAN, Docker and VM IPv4 subnets. Overlaps are
  rejected; live host routes are checked as well. This cannot discover networks
  not present in the routing table; inventory them explicitly here.
- `healthChecks`: subset of `llama`, `immich`, `authelia`, `portainer`; default `[]`.

Existing configs are validated before every mutation. Supported interface fields:
`Address`, `PrivateKey`, `ListenPort`, optional `MTU` and `FwMark`. Supported peer
fields: `PublicKey`, one `AllowedIPs` tunnel `/32`, optional existing `PresharedKey`,
`Endpoint`, `PersistentKeepalive`. Existing server keys, preshared keys and unrelated
peers are retained; no new client private key is written. Existing names without
Crewmate comments display a public-key prefix. Maximum 512 peers and 1 MiB config.

Unsupported fields (including `SaveConfig`, wg-quick command hooks, `DNS`, `Table`,
multiple Address/AllowedIPs lines), IPv6 tunnel configuration, duplicate keys,
duplicate/overlapping addresses and broad peer routes fail closed. Adopt an
existing incompatible configuration manually with a backup and local recovery;
the service does not silently convert it. New peer addresses are allocated only
by the server and use one unused host `/32` from the configured tunnel network.

**There must be one configuration writer.** Do not set the connectivity image's
`PEERS`/server-generation options or enable SaveConfig. Container initialization,
upgrades and host-admin scripts must not regenerate this file. Mount the
`wg_confs` directory read-only inside the connectivity container once its startup
behavior has been verified; the host manager's host path remains writable. All
other deliberate writers must take `manager.lock`, including `wg syncconf` and
restore procedures. An advisory lock cannot constrain an uncooperative root
process/container; runtime/config drift is detected and refused, and a final hash
check prevents overwriting changes observed before replacement. Mount the directory,
not the single file, so atomic rename remains visible in the container.

Client AllowedIPs are **not** access control. Host firewall enforcement must deny
VPN forwarding to LAN devices, peers, Docker/VM destinations and the internet,
including IPv6 bypass. Apply and test the repository firewall before enabling VPN.

## Install on the host (not performed by this change)

Prerequisites: Ubuntu/Linux, Python 3.9+, `wireguard-tools`, `iproute2`,
`libvirt-clients`, functioning system libvirt, and existing wg0 configuration from
the connectivity deployment. `nvidia-smi` is optional. No pip packages are needed.

From the checkout, after reviewing example settings and the existing server config:

```sh
sudo groupadd --system crewmate-host
sudo install -d -o root -g root -m 0755 /opt/crewmate-host
sudo install -o root -g root -m 0644 services/host-manager/manager.py services/host-manager/common.py services/host-manager/metrics.py services/host-manager/wireguard.py /opt/crewmate-host/
sudo install -d -o root -g root -m 0700 /etc/crewmate-host
sudo install -o root -g root -m 0600 services/host-manager/config.example.json /etc/crewmate-host/config.json
sudoedit /etc/crewmate-host/config.json
sudo install -o root -g root -m 0644 services/host-manager/crewmate-host-manager.service /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/crewmate-host-manager.service
sudo systemctl daemon-reload
sudo systemctl enable --now crewmate-host-manager.service
getent group crewmate-host
```

Skip group creation if it already exists; do not overwrite an installed config
during an upgrade. Set Compose `HOST_MANAGER_GID` to this group's numeric GID,
add it as the Crewmate container's supplementary group, and bind-mount the runtime
directory read-only at `/run/crewmate-host`. Directory write access is unnecessary
to connect to the socket. Only the backend container gets that mount/group.

The unit restarts after failure, limits resources, disables core dumps, makes the
filesystem read-only except the explicit runtime/state/WireGuard locations, denies
Docker socket access, and bounds capabilities to `CAP_NET_ADMIN`. No
`PrivateNetwork` is used: it must reach host wg0. GPU device access is retained for
optional NVIDIA telemetry. Verify the installed distro's unit directives, tool
paths, libvirt permissions and NVIDIA driver under this sandbox before enabling
production management. Dashboard failure does not stop libvirt or WireGuard.

## Durable outcomes, failures and recovery

The SQLite ledger uses FULL synchronous transactions and keeps IDs indefinitely;
there is no expiry or automatic pruning. Back it up with WireGuard configuration.
Never delete it to clear a pending operation: doing so permits old IDs to execute
again. No schema migration is currently needed (initial schema).

Writers hold one `flock` across planning, ledger commits, config replacement, apply
and observation. WireGuard writes use a same-directory 0600 temporary file,
file fsync, atomic rename and directory fsync. The ledger records secret-free
before/after hashes and the affected public key **before** changing the config.
The generated private client key remains only in process memory and the one-time
response. Only the server's existing private key is passed to `wg syncconf`, through
stdin rather than argv or a new persistent secret file.

| Interruption/failure | Recovery behavior |
| --- | --- |
| Invalid input/preflight, command never started | `failed`; no config change |
| Crash before side-effect phase | `failed` on reconciliation; never execute it later |
| Atomic write fails before replacement | Original config retained; `failed` |
| Crash/IO error after rename, or syncconf fails/times out | Desired config retained; `uncertain` unless observed applied |
| Crash after live application but before reply | Observe disk hash and live peer routes/key/port/mark; complete without replay/key |
| VM command times out/nonzero after launch | Observe existing UUID's state; otherwise `uncertain`; never reissue |
| Graceful shutdown accepted but guest running | `pending`; poll, inspect guest, or deliberately confirm force stop |

Startup, duplicate requests, and operation GETs reconcile by **reading**, never by
reapplying commands. Live comparison intentionally does not retrieve private or
preshared keys; it checks public server identity, listener, mark and all peer
routes. Existing preshared keys are preserved from the authoritative file. A root
operator changing them live without the shared lock is outside the writer model.

For an uncertain WireGuard operation, inspect public peer state and config
permissions locally. If the current persisted configuration is the desired state,
an administrator may explicitly validate and apply it under the same lock:

```sh
sudo env PYTHONPATH=/opt/crewmate-host python3 -B - <<'PY'
from common import CONFIG, STATE, Commands, json_decode, locked, private_read
from wireguard import WireGuard, settings
config = settings(json_decode(private_read(CONFIG)))
with locked(STATE / 'manager.lock'):
    wg = WireGuard(config['wireguard'], Commands())
    desired = wg.read()
    wg.check_routes()
    wg.apply(desired)
    if not wg.matches(desired):
        raise SystemExit('Applied state still differs; inspect locally')
PY
```

Then GET the original operation ID. If its original after-hash still matches, it
completes; a lost client key still requires revocation/new provisioning. If a
conflicting external edit means the original intended outcome can no longer be
observed, keep the operation uncertain until a local administrator has inspected
both states. To deliberately abandon such an operation: stop the manager, take a
consistent backup, confirm no outstanding host command can still complete, hold
`manager.lock`, then update **only that operation's** ledger status to `failed`
with a truthful operator-resolution message/timestamp in one SQLite transaction.
Preserve its ID, request, phase, hashes and public key. Restart and use a new ID
for any subsequently authorized action. This is an offline recovery procedure,
not an automatic retry or an HTTP action.

Restore/rollback must retain newly written config and ledger together. Restoring
an older config can resurrect revoked peers; restoring an older ledger can forget
executed operations. Stop writers, preserve the current pair, restore a consistent
pair, inspect subsequent peer revocations/VM changes, and reconcile the actual
live state before reopening the socket. Code rollback alone must not replace data.

## Metrics and service truth

CPU count/load/usage, memory and uptime come from `/proc`. CPU usage is `null`
until two samples exist; required missing `/proc` metrics produce 503. Disk usage
is measured only for `/` and configured `dataRoot`. Missing disks are omitted and
reported unavailable; neither disk arrays nor GPU values are fabricated. Thermal
zones are read from sysfs; unavailable temperatures/GPU are empty arrays with an
unknown telemetry entry. NVIDIA values come from optional `nvidia-smi`. VM disk
allocation is omitted because this version does not query a reliable value.

Optional checks are fixed read-only URLs, without redirects, proxy environment,
arbitrary URLs, shell commands or mutable request parameters:

| ID | Fixed URL / validated result |
| --- | --- |
| llama | `http://127.0.0.1:8080/health`, `status: ok` |
| immich | `http://127.0.0.1:2283/api/server/ping`, `res: pong` |
| authelia | `http://127.0.0.1:9091/api/health`, `status: OK` |
| portainer | `http://127.0.0.1:9000/api/status`, version string |

The repository Compose stacks keep these ports internal, so defaults deliberately
remain **unknown**. Enable a check only if its fixed host-loopback endpoint has
been intentionally made available and validated for the selected application
version; never publish it on a public/LAN interface just for this check. An LLM
configured to require an API key may also need a supported separate health path;
this service does not read service credentials. pCloud sync always remains
**unknown** until a supported completion/error interface is validated. A successful
check reports endpoint readiness, not successful synchronization, indexing, login,
GPU inference, or external VPN access.

## Verification and limits

Run from the repository root:

```sh
python3 -B -m unittest discover -s services/host-manager -p 'test_*.py' -v
```

Tests use temporary files, fake host commands, a real local Unix HTTP test socket,
and a separate process for lock exclusion. They cover invalid actions/identifiers/
paths/keys/routes, original config preservation, atomic failure before/after rename,
concurrent drift, nonzero commands, missing tools, restart idempotency, uncertain
outcomes, one-time secret delivery, graceful/forced VM stop, and unavailable metrics.

No service installation, credentials, real VM/WireGuard changes, systemd boot,
Linux hardware/thermal/GPU measurements, service readiness endpoints or firewall
acceptance tests were performed on the macOS development host. Before production,
exercise those paths with disposable VMs/peers, including SIGKILL during each write
phase, disk full, power loss, server-only reachability and recovery after upgrades.

References for the argv and config formats:
[wg(8)](https://git.zx2c4.com/wireguard-tools/about/src/man/wg.8),
[virsh](https://www.libvirt.org/manpages/virsh.html).
