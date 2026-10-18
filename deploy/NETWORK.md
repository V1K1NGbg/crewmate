# Network boundary and host firewall

## Contract

- Caddy alone publishes TCP 443, bound to **LAN_IP**, never `0.0.0.0` or `::`.
  No public HTTP/HTTPS port-forward, UDP 443/HTTP3, Docker API, application/API,
  database, model, or Portainer agent listener is published.
- WireGuard runs in the host network namespace with NET_ADMIN (trusted host
  authority), no privileged mode or SYS_MODULE. The host preloads its module.
  A manually created `wg0.conf` is authoritative; LinuxServer `PEERS`/generation,
  CoreDNS and automatic internet-endpoint discovery are deliberately disabled.
- VPN client `AllowedIPs` is **LAN_IP/32 only**. Resolve all service names to that
  address while remote. No home-LAN CIDR, router DNS route, default route, direct
  container IP, VM route or other peer route is authorized. Name resolution is
  a separate pending choice; the VPN does not magically supply private DNS.
- Server peers each have one assigned tunnel `/32`; no subnet routes. No custom
  WireGuard PostUp/PostDown forwarding/NAT rules or `SaveConfig`.
- IPv4 application access only in this initial configuration. IPv6 can carry the
  encrypted WireGuard endpoint if ISP/router/client support it. **All decrypted
  IPv6 arriving on wg0 is dropped**, including host and forwarding paths. There
  is no application IPv6 listener/publication and no inner IPv6 peer allocation.

### Host-manager service route

The host-manager configuration and generated client profile must use **LAN_IP/32**
as the sole service route to match the proxy's LAN-only bind. The included manager
accepts explicit host-assigned `/32` service routes and verifies them against live
host addresses; set its `wireguard.allowedIPs` to `["<LAN_IP>/32"]`. Its illustrative
tunnel-only example is not the deployment configuration. The network tests cover
this shared contract. Do not allow the whole LAN or publish 443 on all interfaces.
`/srv/crewmate/wireguard/wg_confs/wg0.conf` and host-manager
`serverAddress` still describe the **tunnel** address, not the service LAN address.

## Peers and networks

`configure.py networks` creates eight reviewed, nonoverlapping IPv4 bridges.
Existing networks with different settings cause an error, never deletion.
Reserve these subnets outside the selected LAN, WG and libvirt routes. The helper
checks configured subnets; the operator must also inspect actual host routes.

| Network | Peers | Internet egress |
|---|---|---|
| dashboard | Caddy, Crewmate | no |
| identity | Caddy, Authelia | no |
| admin | Caddy, Portainer | no |
| photos-proxy | Caddy, Immich server | no |
| ai | Crewmate, llama.cpp | no |
| edge | Caddy only | yes |
| photos-data | Immich server, CPU ML, Valkey, PostgreSQL | no |
| photos-egress | Immich server and ML | yes, for configured models/features |

The OIDC hostname is a **Caddy alias** on dashboard/admin/photos-proxy. Backends
reach the public issuer URL over verified TLS without hairpin NAT or direct
Authelia access. Do not attach unrelated containers to these networks; Docker
network membership and host root remain trusted boundaries. Native application
APIs are not public reverse-proxy exceptions. Portainer's root-level Docker
control is intentionally a more privileged trust domain than Crewmate.

## Supported firewall path

Docker's **iptables backend only**, with matching IPv4/IPv6 alternatives. Ubuntu's
`iptables v… (nf_tables)` compatibility layer is supported; Docker's **native
nftables backend** is a different thing and is rejected. Do not set
`iptables=false`, rely only on UFW, or apply an nft ruleset alongside these
unreviewed rules. The validator requires explicit backend settings, rejects
active `docker-bridges` native nft tables, and the systemd dependency prevents
Docker startup when the firewall setup fails. The nft binary is required for
backend inspection. Changing backend requires stopping Docker from local recovery;
editing daemon.json while it runs does not change the active backend.

`firewall.py` builds dedicated INPUT and FORWARD chains in **both** families,
also attached at the front of DOCKER-USER. It does not flush other rules or tables.
IPv4 Caddy permission checks the conntrack **original destination LAN_IP:443**
after Docker DNAT; a direct destination such as `container-ip:443` does not match.
WG checks precede established-flow acceptance, so an unrelated established flow
cannot become a routing bypass. WG-to-WG, WG-to-LAN, WG-to-VM, WG-to-Docker and
internet-exit traffic fall through to explicit drops. Host WG input allows only
LAN_IP TCP 22/443. Physical ingress allows LAN SSH/HTTPS and the WG UDP endpoint;
DHCP, essential ICMP/IPv6 neighbor discovery and outbound connection replies are
handled separately. Other host input is dropped. LAN-to-container direct access
is also blocked. IPv6 has no app allowance. Unknown physical ingress interfaces
also fall through to DROP. Only Docker (`docker0`, `br+`) and libvirt (`virbr+`)
bridge ingress returns to their downstream forwarding policy; other bridge names
need an explicit review.

Forwarding remains available for approved Docker/libvirt operation; setting
global forwarding off is not the substitute for these per-path restrictions.
Router port-forward only the chosen WG UDP port; turn off unintended UPnP
mappings. UFW alone does not protect Docker-published services.

## Installation and boot ordering (root/local-console operation)

Do not run while the only recovery path is the VPN being changed. Record/save
current IPv4/IPv6 firewall rules and Docker daemon config to protected recovery
storage first. Review other host firewall managers and reconcile them deliberately.
Stop existing WG containers before changing backend or rules. Do not start any
container automatically before the initial firewall is in place.

1. Review and merge `host/docker-daemon.fragment.json` into the existing
   `/etc/docker/daemon.json` (never overwrite an existing file blindly). Validate
   with `dockerd --validate --config-file /etc/docker/daemon.json`. Disable
    live-restore (required by the validator) so failed daemon startup
   cannot leave previously exposed containers running.
2. From `/opt/crewmate`, install the unit/drop-in:

   ```sh
   sudo install -m 0644 deploy/host/crewmate-firewall.service /etc/systemd/system/
   sudo install -d -m 0755 /etc/systemd/system/docker.service.d
   sudo install -m 0644 deploy/host/docker-crewmate.conf /etc/systemd/system/docker.service.d/crewmate.conf
   sudo systemctl daemon-reload
   # Inspect both offline outputs BEFORE applying:
   sudo python3 -B deploy/firewall.py show --env /etc/crewmate/deployment.env
   sudo python3 -B deploy/firewall.py show --env /etc/crewmate/deployment.env --ipv6
   sudo systemctl enable --now crewmate-firewall.service
   # Review success, then start/restart Docker at the local console.
   sudo systemctl enable --now docker.service
   ```

   First installation must be on a stopped Docker engine (package installers can
   auto-start it; stop it deliberately first). The unit tests both rule sets before
   applying either; root/backend/parse errors fail without pretending protection.
   IPv4+IPv6 installation is not cross-family transactional: if a runtime failure
   happens mid-apply, keep Docker/WG stopped and repair at the console.
3. Confirm `systemctl show docker -p Requires -p After`, `iptables -S INPUT`,
   `iptables -S FORWARD`, `iptables -S DOCKER-USER`, and the three IPv6 equivalents.
   The Crewmate jumps must precede permissive rules; repeat after Docker restart.
   An existing earlier ACCEPT installed by another manager is not safe. Review
   `iptables-save`, `ip6tables-save`, `nft list ruleset` and `ss -lntup` locally.
4. Keep firewall rules installed when stopping its unit; there is deliberately
   no ExecStop to open the host. For recovery, restore the saved matching rules
   only at the console while containers/WG are stopped, then revalidate before
   restarting. Never solve lockout by opening Docker or all forwarded traffic.

## Mandatory adversarial tests on the actual host

Temporarily edit a **disposable client's** routes to attempt more than advertised;
server enforcement, not the normal client profile, must reject it. Test IPv4 and
IPv6 and record packet counters/captures with no keys or payload secrets.

| Probe from VPN client | Expected |
|---|---|
| Correct private hostname to LAN_IP:443 | HTTPS and owner-gated service |
| LAN_IP:22 with recovery key | SSH allowed |
| Another TCP/UDP host port | denied, including Docker API and direct app ports |
| Other LAN host / router management / router DNS | denied |
| Direct Docker IP:2283/9000/9091/8080/5432/443 | denied, even with added client routes |
| libvirt bridge and guest addresses | denied |
| Another WG peer, both families | denied |
| Public IP/default-route internet exit | denied |
| Host or forwarded inner IPv6 | denied |
| Forged forwarded-auth headers / stale downstream JWT | no gateway bypass |
| Peer revoked during use | no new access; verify backend/stream outcomes separately |

Test the same app/backend ports from LAN and from a truly external network.
Only approved LAN HTTPS/SSH and the WG public UDP endpoint may be reachable.
Repeat after Docker restart, WG recreation, firewall reload, VM start and host
reboot. Test new and established flows, not just a port scan. Kernel/firewall
behavior has **not** been executed on this macOS development machine.

## ISP and endpoint constraints

Inspect router WAN addressing against ISP information. CGNAT without reachable
inbound IPv6 blocks direct VPN ingress. IPv6 requires compatible remote clients
and router firewall policy. A changing public endpoint needs manual client
updates or ISP-provided stable addressing. There is no silent DDNS, relay,
coordinator, tunnel service or router-DNS replacement in this deployment.

References: [Docker packet filtering](https://docs.docker.com/engine/network/packet-filtering-firewalls/),
[Docker iptables/DOCKER-USER](https://docs.docker.com/engine/network/firewall-iptables/),
[Docker native nftables differences](https://docs.docker.com/engine/network/firewall-nftables/),
[WireGuard quick start](https://www.wireguard.com/quickstart/).
