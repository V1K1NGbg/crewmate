"""Observed Linux metrics and explicitly enabled, fixed readiness checks."""

import csv
import io
import json
import math
import os
from pathlib import Path
import shutil
import socket
import urllib.error
import urllib.request

from common import Error

CHECKS = {
    "llama": ("http://127.0.0.1:8080/health", lambda body: body.get("status") == "ok"),
    "immich": (
        "http://127.0.0.1:2283/api/server/ping",
        lambda body: body.get("res") == "pong",
    ),
    "authelia": (
        "http://127.0.0.1:9091/api/health",
        lambda body: body.get("status") == "OK",
    ),
    "portainer": (
        "http://127.0.0.1:9000/api/status",
        lambda body: isinstance(body.get("Version"), str),
    ),
}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def health(name, enabled):
    if name not in enabled:
        return {
            "id": name,
            "status": "unknown",
            "detail": "Readiness check not configured",
        }
    url, validate = CHECKS[name]
    try:
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect()
        )
        with opener.open(url, timeout=2) as response:
            raw = response.read(16385)
            if response.status != 200 or len(raw) > 16384:
                raise ValueError()
            body = json.loads(raw)
            if not isinstance(body, dict) or not validate(body):
                raise ValueError()
        return {
            "id": name,
            "status": "ready",
            "detail": "Configured readiness endpoint responded successfully",
        }
    except (OSError, ValueError, RecursionError, urllib.error.URLError):
        return {
            "id": name,
            "status": "unavailable",
            "detail": "Configured readiness check failed",
        }


class Metrics:
    def __init__(self, config, commands, proc=Path("/proc"), sys=Path("/sys")):
        self.config = config
        self.commands = commands
        self.proc = proc
        self.sys = sys
        self.previous_cpu = None

    def overview(self, failures):
        try:
            uptime = float((self.proc / "uptime").read_text().split()[0])
            load = float((self.proc / "loadavg").read_text().split()[0])
            stat = (self.proc / "stat").read_text().splitlines()
            ticks = [int(x) for x in stat[0].split()[1:9]]
            total, idle = sum(ticks), ticks[3] + ticks[4]
            usage = None
            if self.previous_cpu:
                old_total, old_idle = self.previous_cpu
                if total > old_total and idle >= old_idle:
                    usage = round(
                        max(
                            0,
                            min(
                                100, 100 * (1 - (idle - old_idle) / (total - old_total))
                            ),
                        ),
                        2,
                    )
            self.previous_cpu = (total, idle)
            memory = dict(
                line.split(":", 1)
                for line in (self.proc / "meminfo").read_text().splitlines()
            )
            total_memory = int(memory["MemTotal"].split()[0]) * 1024
            available = int(memory["MemAvailable"].split()[0]) * 1024
            count = sum(line.startswith("cpu") and line[3:4].isdigit() for line in stat)
            if (
                count < 1
                or total_memory <= 0
                or not 0 <= available <= total_memory
                or not all(math.isfinite(x) and x >= 0 for x in (uptime, load))
            ):
                raise ValueError()
        except (OSError, ValueError, KeyError, IndexError):
            raise Error("Required Linux /proc metrics are unavailable", 503) from None
        services = [health(name, self.config["healthChecks"]) for name in CHECKS]
        services.append(
            {
                "id": "pcloud",
                "status": "unknown",
                "detail": "Synchronization/completion API has not been validated; a process is not proof of sync",
            }
        )
        services.append(
            {
                "id": "immich-indexing",
                "status": "unknown",
                "detail": "Indexing job status is not configured; endpoint readiness does not prove a library scan completed",
            }
        )
        storage = []
        for label, path in (("root", "/"), ("data", self.config["dataRoot"])):
            try:
                disk = shutil.disk_usage(path)
                storage.append(
                    {"label": label, "totalBytes": disk.total, "freeBytes": disk.free}
                )
            except OSError:
                services.append(
                    {
                        "id": "storage-" + label,
                        "status": "unavailable",
                        "detail": "Storage metrics unavailable",
                    }
                )
        temperatures = []
        for sensor in sorted((self.sys / "class/thermal").glob("thermal_zone*")):
            try:
                celsius = float((sensor / "temp").read_text().strip()) / 1000
                if not math.isfinite(celsius) or not -50 <= celsius <= 200:
                    continue
                temperatures.append(
                    {"label": (sensor / "type").read_text().strip(), "celsius": celsius}
                )
            except (OSError, ValueError):
                continue
        gpu = []
        try:
            text = self.commands.run(
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.used,temperature.gpu,utilization.gpu",
                "--format=csv,noheader,nounits",
            )
            for row in csv.reader(io.StringIO(text)):
                if len(row) != 5:
                    raise ValueError()
                values = [float(x.strip()) for x in row[1:]]
                if any(not math.isfinite(x) or x < 0 for x in values):
                    raise ValueError()
                gpu.append(
                    dict(
                        zip(
                            (
                                "name",
                                "memoryTotalMiB",
                                "memoryUsedMiB",
                                "temperatureCelsius",
                                "utilizationPercent",
                            ),
                            [row[0].strip(), *values],
                        )
                    )
                )
        except (Error, ValueError):
            gpu = []
            services.append(
                {
                    "id": "gpu-telemetry",
                    "status": "unknown",
                    "detail": "NVIDIA metrics unavailable",
                }
            )
        if not temperatures:
            services.append(
                {
                    "id": "temperature-telemetry",
                    "status": "unknown",
                    "detail": "Temperature sensors unavailable",
                }
            )
        return {
            "hostname": socket.gethostname(),
            "uptimeSeconds": uptime,
            "cpu": {"count": count, "load1": load, "usagePercent": usage},
            "memory": {"totalBytes": total_memory, "availableBytes": available},
            "storage": storage,
            "temperatures": temperatures,
            "gpu": gpu,
            "services": services,
            "recentFailures": failures,
        }
