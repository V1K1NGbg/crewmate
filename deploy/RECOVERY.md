# Recovery, state retention and reversible upgrades

**No backup drive, off-host target, retention period or restore test has yet been
selected/completed. Same-SSD copies do not survive SSD loss.** One laptop is not
high availability. Keep local console and LAN SSH key recovery independent of
Crewmate, Authelia and the VPN. Firmware/power/storage failure affects everything.

## Invariants

- Container replacement never replaces persistent data with an empty directory.
  Check filesystem/mount readiness and ownership before starting any writer.
- The pCloud client (once its gate is lifted) is the sole synchronization writer;
  Immich originals are read-only. Native two-way synchronization can propagate
  deletion/overwrite. There is **no historical original retention guarantee**.
- Immich albums/organization require its matching database. Originals alone do
  not reconstruct that state. Source paths and identities must remain stable.
- A mutable synchronized folder, a transient lock, or a running container is not
  an archive. Queued jobs use persistent Valkey AOF with `appendfsync always` to
  avoid an acknowledged-work loss window during restart, but restoring a queue
  inconsistent with its DB/files is not safe; review/reconcile jobs after restore.
- Preserve Authelia's DB, encryption key, signing key and owner subject together.
  Recreating a user/database can change `sub` and must fail the exact allowlist,
  not silently authorize a replacement identity.
- Host-manager operation IDs/outcomes are durable and retained, including failed
  or uncertain mutations. Include `/var/lib/crewmate-host` in recovery. Do not
  erase that ledger to make a retry appear new, or replay VM/peer operations
  blindly after an uncertain timeout.

## Backup set and consistency

Back up encrypted, access-controlled copies of `/etc/crewmate`,
`/etc/crewmate-host`, reviewed repository revision/lockfile/deployment definitions,
image IDs/digests, Authelia state, Caddy state, WireGuard config, Portainer data,
host-manager state, Immich PostgreSQL + derived data + corresponding originals,
and libvirt definitions/disks if those VMs matter. Record filesystem quotas,
group IDs, network/router decisions, selected trust roots, model checksums and
the encrypted private-key inventory. Downloadable model/cache data can be
excluded only if their reproducibility and downtime cost are accepted.

For a simple initial consistent recovery point, **stop the relevant writers**:
Immich server/ML and future pCloud process, then Valkey and PostgreSQL for a cold
filesystem snapshot/copy; stop Authelia/Portainer/host manager before copying their
SQLite/Bolt/other mutable state. Stop/quiesce VMs before copying their disks.
Do not live-copy PostgreSQL's directory or an open SQLite file and call it a
backup. The host manager socket itself is ephemeral and is not backed up.

For online PostgreSQL backup use the exact release's supported
[Immich backup/restore procedure](https://docs.immich.app/administration/backup-and-restore),
with consistent file capture and a verified restore test. Its built-in database
backups are not an independent original-photo backup and do not protect the only
SSD. Choose the independent backup storage/retention with the owner before
claiming backup coverage. No destructive backup cleanup schedule is provided.

## Stateful upgrade and rollback rehearsal

1. On disposable state, establish the current image+config+database/file baseline.
   Hash fixtures and record albums, users, owner sub, peer assignments and queued
   work. Verify complete cold or supported online backups can actually restore.
2. Stop old writers before starting a version with incompatible schema changes.
   Never run mixed-version writers against one database or pCloud state directory.
   Review vendor migration notes and irreversible steps before approving upgrade.
3. Update one project and verify health, new writes, credentials and mounts.
   Record every new write after the recovery point. Retain original immutable
   recovery-point data, not merely a compatibility field in the live database.
4. For rollback after new writes: stop the new writers, capture/quarantine their
   state and a change inventory first. Determine which new files/metadata/peer
   changes must be preserved or explicitly lost with owner approval. Do not merge
   database files or allow two incompatible versions to "catch up" concurrently.
5. Restore the **matching** prior image/config/database/files into an isolated
   environment, reconcile approved post-point changes using supported interfaces,
   verify, then switch over. An old image pointed at a migrated DB is not rollback.
6. Recheck OAuth links/subjects, gateway logout, HTTPS, source read-only status,
   peer revocations and pending/uncertain operations. An old WireGuard backup can
   reauthorize a revoked peer; reconcile revocations before raising the tunnel.
   Check that sync restarts will not propagate an unintended restored deletion.

Only after this rehearsal succeeds should a stateful upgrade be called reversible.

## Common recovery paths

**Crewmate down:** use the direct private Portainer/Immich origins, still protected
by Authelia. SSH/local console remains available; do not restart connectivity just
to fix a page. Check the immutable app image, socket group and certificate trust.

**Authelia/Caddy down:** use physical console/LAN SSH, not a new public bypass.
Restore identity/certificate state or validate/restart that service only. For a
deliberate emergency Portainer GUI recovery, create a protected local Compose
override publishing `127.0.0.1:9443:9443` for **Portainer only**, apply it with the
same project and base Compose file, and use the original local admin via an SSH
tunnel. This is a temporary root-authorized recovery exception, not normal phone
setup. Remove the override, recreate Portainer from base Compose, and verify
`ss`/Docker port mappings afterwards. Never use an all-interface bind.

**Immich OAuth broken:** at the local console use the supported CLI:

```sh
sudo docker compose --env-file /etc/crewmate/deployment.env -f deploy/photos/compose.yml \
  exec immich-server immich-admin enable-password-login
sudo docker compose --env-file /etc/crewmate/deployment.env -f deploy/photos/compose.yml \
  exec immich-server immich-admin reset-admin-password
```

These do not bypass the gateway. Restore the provider, or use a similarly
temporary loopback-only recovery override with a local admin. Re-link only the
verified owner account, restore SSO/password policy, invalidate old sessions as
supported and repeat direct-route/logout acceptance.

**VPN/firewall broken:** local console first. Stop WG before editing configs;
preserve the last good server key/config and revocations. Restore reviewed firewall
rules while Docker/WG are stopped. Verify both address families/DOCKER-USER, then
raise WG and probe from an external disposable peer. Do not distribute broader
client routes to compensate for a broken server service route.

**Disk full:** stop bulk photo/model/VM writers; inspect quotas/filesystem health.
Do not delete DB/WAL/AOF files, identity keys, host operation history, originals,
or volumes to "free space". Reclaim only reviewed disposable caches/logs and
restore reserve capacity before restarting. Report failures separately from an
empty library or healthy sync.

**Docker restart:** all container groups, including VPN, may drop. Prefer local
console/LAN recovery, inspect firewall hooks before restoring service, and confirm
autostart/readiness, socket directory permissions and complete mounted storage.
No service requires a logged-in desktop session.
