# Release evidence and update policy

Verified against upstream releases and anonymous registry manifests **2026-10-16**.
Pins are available artifacts, not a claim of a tested combined installation.
Compose contains the immutable registry index digests; do not substitute `latest`.

| Component | Selected artifact | Evidence |
|---|---|---|
| Node | 24.22.0 bookworm-slim (supported Node 24 LTS) | [Official Dockerfile](https://github.com/nodejs/docker-node/blob/main/24/bookworm-slim/Dockerfile), [support schedule](https://github.com/nodejs/Release#release-schedule) |
| Caddy | 2.11.7 alpine | [Release](https://github.com/caddyserver/caddy/releases/tag/v2.11.7) |
| Authelia | 4.39.28 | [Release](https://github.com/authelia/authelia/releases/tag/v4.39.28) |
| Portainer CE | 2.45.2 | [Release](https://github.com/portainer/portainer/releases/tag/2.45.2) |
| WireGuard | LinuxServer 1.0.20260223-r0-ls126 | [Release](https://github.com/linuxserver/docker-wireguard/releases/tag/1.0.20260223-r0-ls126), [container instructions](https://docs.linuxserver.io/images/docker-wireguard/) |
| Immich server / CPU ML | v3.3.3 | [Release](https://github.com/immich-app/immich/releases/tag/v3.3.3), [exact supported Compose source](https://github.com/immich-app/immich/blob/v3.3.3/docker/docker-compose.yml) |
| Immich PostgreSQL | 14-vectorchord0.4.3-pgvectors0.2.0 | Digest copied from that exact release Compose, not generic PostgreSQL |
| Immich Valkey | 9 | Digest copied from that exact release Compose |
| llama.cpp CUDA 12 server | server-cuda-b11669 | [v0.7.0 release](https://github.com/ggml-org/llama.cpp/releases/tag/v0.7.0), [release's nightly mapping](https://github.com/ggml-org/llama.cpp/releases/download/v0.7.0/nightly-tag.txt), [CUDA Dockerfile](https://github.com/ggml-org/llama.cpp/blob/b11669/.devops/cuda.Dockerfile) |
| pCloud console client | **Not deployed** | [Inspected commit 980d2ca](https://github.com/pCloud/console-client/tree/980d2cadf670f1b14642c7dbe015f95bd2306175); unsupported folder-sync setup remains blocked |

The llama.cpp `server-cuda-v0.7.0` tag does **not** exist. Its release points to
`b11669`; the verified image revision is `620d2225cc436ab0b001e3200e590e3b286ef9ab`.
Upstream says GPU images are built, not GPU-runtime-tested by CI. Test the actual
laptop driver, CUDA compatibility, VRAM and thermals before selecting budgets.

Immich adaptations: no published backend port; separate private proxy/data/egress
networks; read-only originals; host-persistent cache/database/derived data; bounded
logs and resources; synchronous Valkey AOF persistence for queued jobs. Default upstream image
health checks remain enabled. These changes require live acceptance testing.

## Updating

1. Read vendor release notes and the **matching release's** Compose/Dockerfile.
   Check supported OS/driver versions and security advisories. Re-resolve tags
   with `docker buildx imagetools inspect IMAGE:EXACT_VERSION`; record digest and
   source revision here. Updating a tag alone is ineffective with a fixed digest.
2. Back up compatible data and configuration first; see [recovery](RECOVERY.md).
   Rehearse migrations/restoration with a disposable copy, not the only library.
3. Update related Immich images/dependencies together according to upstream.
   Keep unrelated projects stopped/unchanged only as needed; do not run a global
   redeployment for a photo update.
4. Run offline tests, `compose config --quiet`, vendor config validation, security
   scans, and the relevant live acceptance matrix. Review the diff manually.
5. Build Crewmate once, retain its immutable image ID/digest and lockfile revision.
   Deploy that artifact. Do not rebuild it separately for rollback.
6. Restore a compatible data recovery point when reversing a schema migration.
   Downgrading only an image is not a safe database rollback.

No automatic image updater or unattended database migration is installed.
