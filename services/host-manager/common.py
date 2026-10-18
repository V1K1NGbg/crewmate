"""Small, secret-safe boundaries shared by the host manager (Python 3.9+)."""

import base64
import binascii
import contextlib
import fcntl
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import time
import uuid
import unicodedata

CONFIG = Path("/etc/crewmate-host/config.json")
STATE = Path("/var/lib/crewmate-host")
SOCKET = Path("/run/crewmate-host/manager.sock")
WG_CONFIG = Path("/srv/crewmate/wireguard/wg_confs/wg0.conf")
MAX_CONFIG = 1024 * 1024


class Error(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class CommandError(Error):
    def __init__(self, message, started=False):
        super().__init__(message, 503)
        self.started = started


def identifier(value):
    if not isinstance(value, str):
        raise Error("A canonical UUID is required")
    try:
        parsed = uuid.UUID(value)
    except ValueError:
        raise Error("A canonical UUID is required") from None
    if str(parsed) != value or parsed.int == 0:
        raise Error("A canonical nonzero UUID is required")
    return value


def key(value):
    try:
        decoded = base64.b64decode(value, validate=True)
        valid = (
            len(decoded) == 32
            and any(decoded)
            and base64.b64encode(decoded).decode("ascii") == value
        )
    except (TypeError, ValueError, binascii.Error):
        valid = False
    if not valid:
        raise Error("Invalid WireGuard key")
    return value


def peer_name(value):
    if (
        not isinstance(value, str)
        or not 1 <= len(value) <= 64
        or value != value.strip()
        or any(
            unicodedata.category(char)[0] not in "LN" and char not in " ._-"
            for char in value
        )
    ):
        raise Error(
            "Peer name must be 1–64 letters, digits, spaces, dots, underscores or hyphens"
        )
    return value


def json_decode(raw):
    def pairs(items):
        result = {}
        for name, value in items:
            if name in result:
                raise Error("Duplicate JSON field")
            result[name] = value
        return result

    def constant(_):
        raise Error("Nonfinite JSON numbers are not supported")

    try:
        return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)
    except (ValueError, UnicodeError, RecursionError):
        raise Error("Invalid JSON") from None


def trusted_directory(path, private=False):
    """All production parents are root-owned and not writable by another user."""
    path = Path(path)
    for parent in (path, *path.parents):
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise Error(
                "Storage directories must be root-owned, nonsymlink and not group/world writable",
                503,
            )
    if private and path.stat().st_mode & 0o077:
        raise Error("Private storage directory must have mode 0700", 503)


def private_read(path, require_root=True):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            if (
                not stat.S_ISREG(info.st_mode)
                or info.st_mode & 0o077
                or (require_root and info.st_uid != 0)
                or info.st_nlink != 1
            ):
                raise Error(
                    "Configuration must be a private, root-owned regular file (0600)",
                    503,
                )
            raw = stream.read(MAX_CONFIG + 1)
            if len(raw) > MAX_CONFIG:
                raise Error("Configuration is too large", 503)
            return raw.decode("utf-8")
    except (OSError, UnicodeError):
        raise Error("Cannot read protected configuration", 503) from None


def atomic_write(path, text):
    """Same-filesystem replacement, with file and directory durability."""
    fd, temporary = tempfile.mkstemp(prefix=".crewmate-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


@contextlib.contextmanager
def locked(path, timeout=3):
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        until = time.monotonic() + timeout
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= until:
                    raise Error(
                        "Another host operation is in progress; query the operation ID",
                        409,
                    )
                time.sleep(0.05)
        yield
    finally:
        os.close(fd)


class Commands:
    TOOLS = {"virsh", "wg", "ip", "nvidia-smi"}

    def run(self, tool, *args, input=None):
        if tool not in self.TOOLS:
            raise Error("Executable is not allowlisted", 400)
        executable = shutil.which(tool, path="/usr/sbin:/usr/bin:/sbin:/bin")
        if executable is None:
            raise CommandError(tool + " is not installed")
        try:
            result = subprocess.run(
                [executable, *args],
                input=input,
                text=True,
                capture_output=True,
                timeout=8,
                check=False,
                shell=False,
                env={
                    "PATH": "/usr/sbin:/usr/bin:/sbin:/bin",
                    "LC_ALL": "C",
                    "WG_ENDPOINT_RESOLUTION_RETRIES": "0",
                },
            )
        except subprocess.TimeoutExpired:
            raise CommandError(
                tool + " timed out; the outcome must be reconciled", True
            ) from None
        except OSError:
            raise CommandError(tool + " could not be executed") from None
        # Never include stdout/stderr: WireGuard errors can contain private material.
        if result.returncode:
            raise CommandError(
                tool + " exited with status " + str(result.returncode), True
            )
        if len(result.stdout) > MAX_CONFIG:
            raise CommandError(tool + " returned too much data", True)
        return result.stdout
