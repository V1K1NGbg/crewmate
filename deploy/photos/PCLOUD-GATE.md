# Official pCloud folder-sync gate: BLOCKED

**No pCloud runtime is supplied or started. Do not connect the real library.**
Immich can be tested independently with disposable files in the read-only source.
This gate is not satisfied by creating an empty source directory or starting a
FUSE drive. No rclone, rsync mirror, unofficial fork, or custom transfer engine is
substituted for the requested official native folder synchronization.

## What was actually researched (2026-10-16)

Official repository commit:
[`980d2cadf670f1b14642c7dbe015f95bd2306175`](https://github.com/pCloud/console-client/tree/980d2cadf670f1b14642c7dbe015f95bd2306175).

- [README](https://github.com/pCloud/console-client/blob/980d2cadf670f1b14642c7dbe015f95bd2306175/README.md)
  documents `pcloudcc -u … -p -s`, foreground/daemon drive mounting, Crypto,
  finalize and quit. It explicitly says there is no pending-transfer command.
- [CLI source](https://github.com/pCloud/console-client/blob/980d2cadf670f1b14642c7dbe015f95bd2306175/pCloudCC/main.cpp)
  has no folder-sync setup flag.
- [Command dispatcher](https://github.com/pCloud/console-client/blob/980d2cadf670f1b14642c7dbe015f95bd2306175/pCloudCC/control_tools.cpp)
  defines `LISTSYNC`, `ADDSYNC`, `STOPSYNC` enum values, but the actual dispatcher
  accepts only Crypto/finalize/quit. An enum is not a working CLI.
- [Issue 23](https://github.com/pCloud/console-client/issues/23) contains old
  community database-editing workarounds, including reported failures. These are
  neither current supported setup nor permission to alter the state database.
- The repository has no GitHub release selected for deployment. The README's
  old prebuilt packages explicitly lack EU-server support. Do not install them
  on an untested Ubuntu host or claim current compatibility.

## Evidence required to lift the gate

Obtain upstream-supported instructions for the exact official build to create,
list and remove a native synchronization pair targeting an ordinary local
directory; establish account-region support and a safe credential setup method.
Record source commit/package checksum, build dependencies and library/security
review, actual `--help`, setup commands, foreground service behavior, shutdown
behavior and completion/partial-file representation. Do **not** invent flags,
copy another client's database, or call internal library functions as a new API.

Then package only that official client, with **one writer** for its state and
`/srv/crewmate/pcloud/originals`, persistent protected state under
`/srv/crewmate/pcloud/state`, no published ports, and no dependency on Crewmate.
Any required FUSE/capability/device grant needs a focused review. A cache-backed
drive alone does not meet durable offline-originals requirements.

## Disposable acceptance record (every result currently NOT RUN)

Use a new throwaway remote folder and a separately quota-limited local directory.
Keep originals/hashes of the test fixtures outside the synchronization pair.
Never test deletion/conflicts against personal originals.

| Test | Required observation / acceptance |
|---|---|
| Create locally and remotely | Record files, bytes/hashes and sync status on both sides |
| Update locally and remotely | Record overwrite/version behavior; no invented retention guarantee |
| Delete locally and remotely | Record whether deletion propagates; local sync is not a backup |
| Rename/move both sides | Record identity/path behavior and Immich album/metadata consequences |
| Concurrent edits / filename conflict | Record winner, conflict copy and status; no silent success |
| Interrupt a large download / process restart | Identify partial paths, atomic rename behavior and whether a safe indexing signal exists |
| Offline / reconnect | Completed local ordinary files readable; missing source never treated as an empty successful library |
| Expired/revoked credentials | Explicit sync error, no empty-source scan or credential logging |
| Disk full on disposable quota | Transfer fails visibly; complete files uncorrupted; host/DB reserve remains available |
| Container replacement / reboot | Same state and pair restored, no duplicate writer or repeated enrollment |
| Immich scan and album/metadata/sidecar edits | Bind mount rejects writes; before/after original hashes identical |
| Restore with matching Immich database | Albums, identities and organization restored with the correct paths/files |

Until partial-download behavior is proven, leave Immich scheduled scans and the
external-library watcher **disabled**. Use manual scans of a completed disposable
batch only. A fixed delay or absence of error logs is not a completion API.
If later adding automatic scan coordination, persist the pending intent before
acknowledging it; expiring locks must never erase durable work. Do not implement
such a scheduler until a reliable upstream completion mechanism is known.

Native synchronization can write back changes/deletions. Immich's read-only bind
mount prevents **Immich**, not a host operator or the pCloud writer, from modifying
originals. No historical-original retention or independent backup is promised.
