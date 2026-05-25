import subprocess
import os
import logging
from datetime import datetime

logger = logging.getLogger("SredaPhone")

APP_PACKAGES = {
    "хром": "com.android.chrome",
    "chrome": "com.android.chrome",
    "браузер": "com.android.chrome",
    "ютуб": "com.google.android.youtube",
    "youtube": "com.google.android.youtube",
    "телеграм": "org.telegram.messenger",
    "telegram": "org.telegram.messenger",
    "вк": "com.vkontakte.android",
    "vk": "com.vkontakte.android",
    "настройки": "com.android.settings",
    "settings": "com.android.settings",
    "карты": "com.google.android.apps.maps",
    "maps": "com.google.android.apps.maps",
    "камера": "com.android.camera",
    "галерея": "com.miui.gallery",
    "музыка": "com.google.android.music",
    "spotify": "com.spotify.music",
}


def run_adb(args: list, timeout: int = 10) -> str:
    """Executes a local ADB command and returns output."""
    try:
        cmd = ["adb"] + args
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        out = (result.stdout or "").strip()
        err = (result.stderr or "").strip()
        if not out and err:
            return f"ERROR: {err}"
        return out
    except subprocess.TimeoutExpired:
        return "ERROR: ADB timed out."
    except FileNotFoundError:
        return "ERROR: adb не установлен. Скачай platform-tools и добавь в PATH."
    except Exception as e:
        return f"ERROR: ADB failed. {e}"


def connect_phone(ip: str) -> str:
    if not ip:
        return "Укажи IP телефона (например, 192.168.0.10)."
    if ":" not in ip:
        ip = f"{ip}:5555"
    res = run_adb(["connect", ip])
    if "connected" in res.lower():
        return f"Подключилась к телефону {ip}."
    return f"Не подключилось: {res}. Проверь, что отладка по WiFi включена."


def is_phone_connected() -> bool:
    devices = run_adb(["devices"])
    lines = devices.split("\n")[1:]
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if "\tdevice" in line or " device" in line:
            return True
    return False


def open_phone_app(app_name: str) -> str:
    if not is_phone_connected():
        return "Телефон не подключен. Сначала подключение через ADB Wireless."
    pkg = APP_PACKAGES.get(app_name.lower().strip())
    if not pkg:
        return f"Не знаю пакета для '{app_name}'. Доступно: {', '.join(sorted(set(APP_PACKAGES.keys())))}."
    res = run_adb(["shell", "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1"])
    if "error" in res.lower() or "no activities" in res.lower():
        return f"Не вышло открыть '{app_name}': {res}"
    return f"Открыла '{app_name}' на телефоне."


def phone_open_url(url: str) -> str:
    if not is_phone_connected():
        return "Телефон не подключен."
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    res = run_adb(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url])
    return f"Открыла URL на телефоне: {url}"


def capture_phone_screen(output_path: str = None) -> str:
    if not is_phone_connected():
        return "Телефон не подключен."
    if not output_path:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        output_path = os.path.join(base_dir, "static", "phone_screen.png")
    run_adb(["shell", "screencap", "-p", "/sdcard/screen.png"])
    run_adb(["pull", "/sdcard/screen.png", output_path])
    if os.path.exists(output_path):
        ts = int(datetime.now().timestamp())
        return f"Скриншот телефона готов. /static/phone_screen.png?t={ts}"
    return "Не удалось скачать скриншот."


def phone_tap(x: int, y: int) -> str:
    if not is_phone_connected():
        return "Телефон не подключен."
    run_adb(["shell", "input", "tap", str(x), str(y)])
    return f"Тап ({x},{y})."


def phone_swipe(x1: int, y1: int, x2: int, y2: int, duration_ms: int = 300) -> str:
    if not is_phone_connected():
        return "Телефон не подключен."
    run_adb(["shell", "input", "swipe", str(x1), str(y1), str(x2), str(y2), str(duration_ms)])
    return f"Свайп ({x1},{y1})→({x2},{y2})."


def phone_key(key: str) -> str:
    if not is_phone_connected():
        return "Телефон не подключен."
    codes = {
        "home": 3, "back": 4, "menu": 82, "power": 26,
        "volume_up": 24, "volume_down": 25, "mute": 164,
        "play_pause": 85, "next": 87, "prev": 88, "recent": 187,
        "enter": 66, "tab": 61, "escape": 111,
    }
    code = codes.get((key or "").lower().strip())
    if not code:
        return f"Неизвестная клавиша: {key}. Доступно: {', '.join(codes.keys())}."
    run_adb(["shell", "input", "keyevent", str(code)])
    return f"Клавиша {key.upper()}."


def phone_text(text: str) -> str:
    """Types text into the focused input on phone."""
    if not is_phone_connected():
        return "Телефон не подключен."
    escaped = text.replace(" ", "%s").replace("'", r"\'")
    run_adb(["shell", "input", "text", escaped])
    return "Напечатала текст на телефоне."


def phone_battery() -> str:
    if not is_phone_connected():
        return "Телефон не подключен."
    out = run_adb(["shell", "dumpsys", "battery"])
    info = {}
    for line in out.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            info[k.strip()] = v.strip()
    level = info.get("level", "?")
    status = info.get("status", "?")
    temp_raw = info.get("temperature", "0")
    try:
        temp = round(int(temp_raw) / 10, 1)
    except Exception:
        temp = "?"
    plugged = info.get("AC powered") == "true" or info.get("USB powered") == "true"
    status_map = {"2": "заряжается", "3": "разряжается", "4": "не заряжается", "5": "полная"}
    state = status_map.get(status, status)
    return f"Батарея телефона: {level}%, {state}, {temp}°C, {'подключён к зарядке' if plugged else 'без зарядки'}."


def phone_call(number: str) -> str:
    if not is_phone_connected():
        return "Телефон не подключен."
    if not number:
        return "Не указан номер."
    res = run_adb(["shell", "am", "start", "-a", "android.intent.action.CALL", "-d", f"tel:{number}"])
    return f"Звоню на {number} с телефона."


def phone_send_notification(title: str, body: str) -> str:
    """Sends a system notification visible on phone (via cmd notification)."""
    if not is_phone_connected():
        return "Телефон не подключен."
    safe_title = title.replace('"', "'")
    safe_body = body.replace('"', "'")
    res = run_adb([
        "shell", "cmd", "notification", "post",
        "-S", "bigtext",
        "-t", safe_title,
        "sreda", safe_body
    ])
    return f"Уведомление отправлено на телефон: {title}"
