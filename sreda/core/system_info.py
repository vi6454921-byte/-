import psutil
import platform
import socket
import time
from datetime import datetime


def _bytes_to_gb(b: int) -> float:
    return round(b / (1024 ** 3), 2)


def get_system_snapshot() -> dict:
    """Returns a compact dict with current CPU/RAM/Disk/Network stats."""
    try:
        cpu = psutil.cpu_percent(interval=0.2)
    except Exception:
        cpu = 0.0

    try:
        vm = psutil.virtual_memory()
        ram_total = _bytes_to_gb(vm.total)
        ram_used = _bytes_to_gb(vm.used)
        ram_percent = vm.percent
    except Exception:
        ram_total = ram_used = ram_percent = 0

    try:
        disk = psutil.disk_usage("/")
        disk_total = _bytes_to_gb(disk.total)
        disk_used = _bytes_to_gb(disk.used)
        disk_percent = disk.percent
    except Exception:
        disk_total = disk_used = disk_percent = 0

    try:
        boot = psutil.boot_time()
        uptime_seconds = int(time.time() - boot)
    except Exception:
        uptime_seconds = 0

    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
    except Exception:
        hostname = "host"
        local_ip = "127.0.0.1"

    try:
        battery = psutil.sensors_battery()
        if battery:
            battery_state = {
                "percent": int(battery.percent),
                "plugged": bool(battery.power_plugged)
            }
        else:
            battery_state = None
    except Exception:
        battery_state = None

    return {
        "time": datetime.now().strftime("%H:%M"),
        "date": datetime.now().strftime("%d %b, %A"),
        "cpu_percent": cpu,
        "ram_used_gb": ram_used,
        "ram_total_gb": ram_total,
        "ram_percent": ram_percent,
        "disk_used_gb": disk_used,
        "disk_total_gb": disk_total,
        "disk_percent": disk_percent,
        "uptime_seconds": uptime_seconds,
        "hostname": hostname,
        "local_ip": local_ip,
        "platform": platform.system(),
        "release": platform.release(),
        "battery": battery_state,
    }


def get_system_info_text() -> str:
    """Returns a human-readable system info summary for the assistant."""
    s = get_system_snapshot()
    parts = [
        f"ПК {s['hostname']} ({s['platform']} {s['release']})",
        f"CPU: {s['cpu_percent']}% занят.",
        f"RAM: {s['ram_used_gb']}/{s['ram_total_gb']} ГБ ({s['ram_percent']}%).",
        f"Диск: {s['disk_used_gb']}/{s['disk_total_gb']} ГБ ({s['disk_percent']}%).",
        f"Локальный IP: {s['local_ip']}.",
    ]
    if s["battery"]:
        parts.append(
            f"Батарея: {s['battery']['percent']}%"
            + (" (заряжается)" if s["battery"]["plugged"] else " (от батареи)")
        )
    return " ".join(parts)


def get_top_processes(limit: int = 8) -> list:
    """Returns top processes by RAM usage."""
    processes = []
    for proc in psutil.process_iter(['pid', 'name', 'memory_info']):
        try:
            info = proc.info
            mem_mb = round(info['memory_info'].rss / (1024 ** 2), 1)
            processes.append({"pid": info['pid'], "name": info['name'], "ram_mb": mem_mb})
        except Exception:
            continue
    processes.sort(key=lambda p: p["ram_mb"], reverse=True)
    return processes[:limit]
