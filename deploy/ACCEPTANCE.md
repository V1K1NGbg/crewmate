# Stage status and acceptance record

Recorded **2026-10-16**. This repository work does not retroactively mark the
home-server design as deployed. Every live-service/real-host/remote/data test below is
**NOT RUN** unless a dated evidence record replaces that status.

## Stage status

| Design stage | Actual state |
|---|---|
| 1. Inspect checkout and auth/AI boundaries | Completed against baseline `27c6ad2c685d07627b1605540e1d8a511c486b7d`; Google-only login and browser-direct AI traced and extended |
| 2. Private names/HTTPS and unified login | **BLOCKED:** user has not selected naming/trust; client configs supplied, SSO not proven |
| 3. Hardware/Ubuntu/NVIDIA selection | **PENDING:** no laptop/driver/SSD/thermal inspection |
| 4. Host/storage/firewall/recovery | Assets and instructions supplied; **NOT APPLIED** |
| 5. WireGuard server-only VPN | Compose/firewall supplied; LAN service `/32` host-manager contract regression-tested; **NOT DEPLOYED** |
| 6. Portainer/ownership | CE pinned, repository Compose authoritative; **NOT DEPLOYED** |
| 7. pCloud + Immich | Immich pinned supported stack adapted; **pCloud BLOCKED**, no sync service fabricated |
| 8. LLM resources | Official CUDA image pinned, one slot; model/budgets/calibration **PENDING** |
| 9. Crewmate management | Six pages, local owner authentication, backend AI, host API and durable mutation handling implemented; fixture browser checks pass; real integrations **NOT VERIFIED** |
| 10. Reliability/security/recovery | Offline checks only; live acceptance **NOT RUN** |

## Checks actually available in this checkout

- `npm run check:all`: lint, strict typecheck, 97 Node tests and Next.js production
  build passed. Three existing productivity-page navigation patterns produce
  warnings under the updated lint rules; no lint errors.
- `npm run test:host`: 33 Python tests passed for Unix-socket boundaries, config
  preservation, single-writer locking, crash/restart reconciliation, one-time keys,
  and VM outcomes. No real libvirt/WireGuard command was executed.
- Chromium fixture smoke checks against the final **standalone production server**
  passed at desktop and 390px phone widths: owner isolation, Google-deferred
  session, GET/POST/null session handling, CSRF rejection, AI forwarding, six pages,
  keyboard dialog cancellation, QR provisioning without stored private keys,
  read-only managed settings, failed-read recovery, and standard/custom logout
  redirects with cookie deletion. Pending shutdown survives refresh and permits a
  separately confirmed force stop; saved preferences survive reload without a
  hydration error. Rendered screenshots were inspected. These use synthetic
  sessions and services, not real Authelia/Portainer/Immich SSO or a physical phone.
- A separate standalone legacy-Google fixture passed GET/POST bearer-credential
  sanitization, cookie renewal and the existing application-local logout redirect.
  No real Google login or API call was made. Deliberately missing CSRF tokens in
  the local fixture produce the expected Auth.js errors and are rejected.
- `npm audit --omit=dev`: zero production vulnerabilities after updating Next.js,
  sharp and affected compatible transitive dependencies. Development-only audit
  findings remain outside this runtime update.

- `npm run test:deployment`: 16 Python tests passed, validating required values,
  env parsing, JSON escaping, owner policy/callbacks/methods, frame policy, pinned
  vendor images, Docker workspace manifests, firewall rule ordering, atomic
  non-overwriting configuration bundles, and **real Docker Compose parsing** of
  all five projects using disposable values.
- Compose effective-config assertions: only Caddy publishes LAN-bound TCP 443;
  no app Docker socket; private peer groups; source/model mounts read-only;
  no pCloud stand-in; CPU Immich ML; one LLM generation slot; missing persistent
  bind sources are not silently created; the job queue uses durable AOF writes.
- `git diff --no-ext-diff --no-textconv --check`: passed.
- Actual development tools: Python 3.9.6, Docker CLI 29.8.0, Compose v5.5.1.
  Docker daemon connection fails, so no image build/run, vendor runtime validation,
  healthcheck, NVIDIA or Linux firewall test has been performed here.
- Image tags/digests and version-sensitive client/CLI behavior were checked against
  official live sources listed in `RELEASES.md`, `IDENTITY.md`, `PCLOUD-GATE.md`.

Offline tests and fixture browser checks are regression checks on implementation,
not live packet-path, provider SSO, hardware or data-recovery acceptance.

## Live acceptance matrix (all NOT RUN)

| Area | Required proof / failure condition |
|---|---|
| LAN HTTPS | All selected hostnames resolve on phone+desktop; trusted chain; no bypass/HTTP fallback |
| Owner login | One identity login; Crewmate exact `sub`; Portainer/Immich already-linked owner opens without another password |
| Owner isolation | Unlisted IdP user denied by gateway and OIDC; auto provisioning off; forged proxy headers denied |
| Direct routes | Without gateway cookie, valid downstream cookie/token still denied at every UI/API path |
| Logout | Local signout + completed Authelia `/logout`; direct URLs/back button/refresh/cache/token replay blocked appropriately |
| Long-lived sessions | Active console/log/WebSocket/media/AI streams observed across logout; immediate invalidation **not guaranteed** and remains a strict-requirement blocker |
| Browser secret handling | Inspect cookies/storage/URLs/logs; no client secret/password/key exposure; document unavoidable vendor browser-session-token behavior |
| Iframes | Desktop/phone login redirects, expiry, cookie policies, CSP and narrow viewport; top-level recovery when IdP interaction required |
| Backend isolation | All app/database/ML/model ports hidden on LAN/WAN; only Caddy LAN HTTPS and authorized SSH; public WG UDP only |
| VPN reachability | Real external network, router/ISP IPv4/IPv6 inspected; no relay/DDNS silently introduced |
| VPN enforcement | With malicious extra routes: LAN devices/router/peers/Docker/VM/exit denied in both families; see NETWORK.md |
| WG management | Persisted peers survive restart, invalid config rejected without damage, revoke works, client private key not retained/logged |
| pCloud setup | Supported official current headless sync method established; otherwise **do not deploy real sync** |
| Sync semantics | Complete disposable create/update/delete/rename/conflict/offline/interruption/expired-credentials/disk-full matrix |
| Photo immutability | In-container original/sidecar write fails; hashes unchanged after indexing and organization edits |
| Photo readiness | Missing source not treated as empty success; partial files not indexed; completed local files usable offline |
| Photo persistence | Replacement retains state/organization/credentials; matching DB+file restore verified |
| Native VM actions | Existing VM IDs list/start/graceful shutdown/confirmed force stop; no arbitrary shell/path/definition mutation |
| LLM | Actual GPU utilization; remote-browser stream/cancel; measured context/VRAM/temperature; OOM/error recovery |
| Mixed load | VPN/auth remain responsive during photo CPU jobs, LLM load and allowed VM concurrency |
| Boot and isolation | No interactive login; manager socket recreated with correct group; firewall before Docker; stopping Crewmate leaves independent work running |
| Hardware | Lid-closed sustained load, battery/power recovery, SSD capacity reserve, thermal throttling measured |
| Upgrade/rollback | Disposable stateful upgrade + compatible data restore, with post-backup new writes and revocations reconciled |
| Emergency recovery | Local console/LAN SSH works with proxy/IdP/dashboard down; temporary loopback overrides removed and ports rechecked |

No Google integration, n8n, Pi-hole, cloud relay, marketplace, VM creation wizard,
or new DNS/certificate-service subscription is part of this implementation.
