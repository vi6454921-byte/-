import os
import sys
import subprocess
import webbrowser
import glob
import shutil
import platform
import logging
from datetime import datetime

logger = logging.getLogger("SredaActions")

IS_WIN = platform.system().lower().startswith("win")

# Optional Windows-only deps
try:
    import pyautogui  # type: ignore
    HAS_PYAUTOGUI = True
except Exception:
    HAS_PYAUTOGUI = False

try:
    import psutil  # type: ignore
except Exception:
    psutil = None

# Dictionary of app nicknames to their executables/commands on Windows
APP_MAP = {
    "хром": "chrome.exe",
    "chrome": "chrome.exe",
    "браузер": "chrome.exe",
    "edge": "msedge.exe",
    "блокнот": "notepad.exe",
    "notepad": "notepad.exe",
    "калькулятор": "calc.exe",
    "calculator": "calc.exe",
    "проводник": "explorer.exe",
    "explorer": "explorer.exe",
    "диспетчер": "taskmgr.exe",
    "диспетчер задач": "taskmgr.exe",
    "vs code": "code",
    "vscode": "code",
    "код": "code",
    "телеграм": "telegram.exe",
    "telegram": "telegram.exe",
    "телега": "telegram.exe",
    "discord": "discord.exe",
    "spotify": "spotify.exe",
    "steam": "steam.exe",
    "paint": "mspaint.exe",
    "пейнт": "mspaint.exe",
    "obs": "obs64.exe",
    "powershell": "powershell.exe",
    "cmd": "cmd.exe",
    "терминал": "wt.exe",
}


# ---------- App / URL / Shell ----------

def open_app(name: str) -> str:
    """Opens a local application by friendly name (Windows)."""
    name_lower = name.lower().strip()
    cmd = APP_MAP.get(name_lower, name_lower)

    try:
        if "telegram" in name_lower or "телеграм" in name_lower or "телега" in name_lower:
            user_profile = os.environ.get("USERPROFILE", "")
            app_data = os.environ.get("APPDATA", "")
            local_app_data = os.environ.get("LOCALAPPDATA", "")
            for path in [
                os.path.join(app_data, "Telegram Desktop", "Telegram.exe"),
                os.path.join(local_app_data, "Telegram Desktop", "Telegram.exe"),
                os.path.join(user_profile, "AppData", "Roaming", "Telegram Desktop", "Telegram.exe"),
            ]:
                if os.path.exists(path):
                    subprocess.Popen(f'"{path}"', shell=True)
                    return "Запускаю Telegram Desktop."
            try:
                os.startfile("tg://")
                return "Запускаю Telegram через протокол tg://."
            except Exception:
                pass

        if cmd == "code":
            subprocess.Popen("code", shell=True)
            return "Открываю VS Code."

        if IS_WIN:
            try:
                os.startfile(cmd)
                return f"Запускаю {name}."
            except Exception:
                subprocess.Popen(f"start {cmd}", shell=True)
                return f"Запускаю {name}."
        else:
            subprocess.Popen(cmd, shell=True)
            return f"Запускаю {name}."
    except Exception as e:
        return f"Не удалось запустить {name}: {e}"


def close_app(name: str) -> str:
    """Terminates a running application by name."""
    name_lower = name.lower().strip()
    target = APP_MAP.get(name_lower, name_lower)
    if not target.endswith(".exe"):
        target = target + ".exe"
    if psutil is None:
        return "psutil не установлен — закрытие приложений недоступно."
    killed = 0
    for proc in psutil.process_iter(['pid', 'name']):
        try:
            if proc.info['name'] and proc.info['name'].lower() == target.lower():
                proc.kill()
                killed += 1
        except Exception:
            continue
    if killed:
        return f"Закрыла {killed} процесс(ов) {target}."
    return f"Не нашла активных процессов {target}."


def open_url(url: str) -> str:
    if not url:
        return "Не указана ссылка."
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        webbrowser.open(url)
        return f"Открываю: {url}"
    except Exception as e:
        return f"Не удалось открыть ссылку: {e}"


def run_command(cmd: str) -> str:
    """Runs a PowerShell command (Windows) or bash (other)."""
    if not cmd:
        return "Пустая команда."
    try:
        if IS_WIN:
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", cmd],
                capture_output=True, text=True, timeout=12
            )
        else:
            result = subprocess.run(
                ["bash", "-c", cmd],
                capture_output=True, text=True, timeout=12
            )
        out = (result.stdout or "").strip()
        err = (result.stderr or "").strip()
        parts = []
        if out:
            parts.append(f"Вывод:\n{out[:1200]}")
            if len(out) > 1200:
                parts.append("... [обрезано]")
        if err:
            parts.append(f"Ошибка:\n{err[:600]}")
        return "\n".join(parts) if parts else "Команда выполнена, вывода нет."
    except subprocess.TimeoutExpired:
        return "Команда не уложилась в таймаут 12 секунд."
    except Exception as e:
        return f"Не смогла выполнить: {e}"


# ---------- File system ----------

def list_files(path: str = "~") -> str:
    expanded = os.path.expandvars(os.path.expanduser(path))
    try:
        if not os.path.exists(expanded):
            return f"Путь '{path}' не существует."
        items = os.listdir(expanded)
        dirs, files = [], []
        for item in items[:60]:
            full = os.path.join(expanded, item)
            (dirs if os.path.isdir(full) else files).append(item)
        out = [f"Содержимое {path}:"]
        out += [f"📁 {d}" for d in dirs]
        out += [f"📄 {f}" for f in files]
        if len(items) > 60:
            out.append(f"... и ещё {len(items) - 60} элементов.")
        return "\n".join(out)
    except Exception as e:
        return f"Не удалось прочитать папку: {e}"


def search_files(query: str, path: str = "~") -> str:
    if not query:
        return "Запрос для поиска пустой."
    expanded = os.path.expandvars(os.path.expanduser(path))
    try:
        pattern = os.path.join(expanded, "**", f"*{query}*")
        matches = glob.glob(pattern, recursive=True)
        if not matches:
            return f"Не нашла файлов '{query}' в '{path}'."
        out = [f"Найдено {len(matches)} совпадений (показываю до 20):"]
        for m in matches[:20]:
            rel = os.path.relpath(m, expanded)
            prefix = "📁" if os.path.isdir(m) else "📄"
            out.append(f"{prefix} {rel}")
        if len(matches) > 20:
            out.append(f"... ещё {len(matches) - 20}.")
        return "\n".join(out)
    except Exception as e:
        return f"Ошибка поиска: {e}"


def read_file(path: str) -> str:
    from core.files import read_text_file
    return read_text_file(path)


def write_file(path: str, content: str, append: bool = False) -> str:
    from core.files import write_text_file
    return write_text_file(path, content, append)


def create_folder(path: str) -> str:
    from core.files import create_folder as _cf
    return _cf(path)


def delete_path(path: str) -> str:
    from core.files import delete_path as _dp
    return _dp(path)


def open_path(path: str) -> str:
    """Opens path in the OS file explorer."""
    p = os.path.expandvars(os.path.expanduser(path))
    try:
        if IS_WIN:
            os.startfile(p)
        else:
            subprocess.Popen(["xdg-open", p])
        return f"Открываю проводник на {path}."
    except Exception as e:
        return f"Не удалось открыть {path}: {e}"


# ---------- Media / volume / power ----------

def volume_control(action: str) -> str:
    if not HAS_PYAUTOGUI:
        return "pyautogui недоступен — не могу управлять звуком."
    action = (action or "").lower().strip()
    try:
        if action == "up":
            pyautogui.press("volumeup", presses=5)
            return "Громкость +."
        if action == "down":
            pyautogui.press("volumedown", presses=5)
            return "Громкость −."
        if action == "mute":
            pyautogui.press("volumemute")
            return "Mute."
        return "Неизвестное действие. up/down/mute."
    except Exception as e:
        return f"Не смогла изменить громкость: {e}"


def set_volume_level(level: int) -> str:
    """Set master volume to absolute level (0-100), Windows only via PowerShell."""
    if not IS_WIN:
        return "Точная установка громкости поддерживается только на Windows."
    try:
        level = max(0, min(100, int(level)))
    except Exception:
        return "Уровень громкости должен быть числом 0-100."
    ps = (
        "$obj = New-Object -ComObject WScript.Shell;"
        "for ($i=0;$i -lt 50;$i++){ $obj.SendKeys([char]174) };"
        f"for ($i=0;$i -lt {int(level/2)};$i++){{ $obj.SendKeys([char]175) }}"
    )
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, timeout=8)
        return f"Установила громкость ≈ {level}%."
    except Exception as e:
        return f"Не смогла установить громкость: {e}"


def media_control(action: str) -> str:
    if not HAS_PYAUTOGUI:
        return "pyautogui недоступен — медиа-управление выключено."
    action = (action or "").lower().strip()
    try:
        if action in ("play", "pause", "playpause"):
            pyautogui.press("playpause")
            return "Play/Pause."
        if action == "next":
            pyautogui.press("nexttrack")
            return "Следующий трек."
        if action == "prev":
            pyautogui.press("prevtrack")
            return "Предыдущий трек."
        return "Неизвестное действие. play/pause/next/prev."
    except Exception as e:
        return f"Ошибка медиа: {e}"


def lock_pc() -> str:
    try:
        if IS_WIN:
            subprocess.run(["rundll32.exe", "user32.dll,LockWorkStation"])
        else:
            subprocess.run(["xdg-screensaver", "lock"])
        return "Заблокировала ПК."
    except Exception as e:
        return f"Не смогла заблокировать: {e}"


def shutdown_pc() -> str:
    try:
        cmd = ["shutdown", "/s", "/t", "60"] if IS_WIN else ["shutdown", "-h", "+1"]
        subprocess.Popen(cmd)
        return "ПК выключится через 60 секунд. Скажи 'отмени', чтобы остановить."
    except Exception as e:
        return f"Не смогла запланировать выключение: {e}"


def cancel_shutdown() -> str:
    try:
        cmd = ["shutdown", "/a"] if IS_WIN else ["shutdown", "-c"]
        subprocess.Popen(cmd)
        return "Выключение отменено."
    except Exception as e:
        return f"Не отменилось: {e}"


def restart_pc() -> str:
    try:
        if IS_WIN:
            subprocess.Popen(["shutdown", "/r", "/t", "30"])
            return "Перезагрузка через 30 секунд."
        subprocess.Popen(["reboot"])
        return "Перезагружаю."
    except Exception as e:
        return f"Не смогла перезагрузить: {e}"


def sleep_pc() -> str:
    try:
        if IS_WIN:
            subprocess.Popen(["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"])
            return "Усыпляю ПК."
        subprocess.Popen(["systemctl", "suspend"])
        return "Suspend."
    except Exception as e:
        return f"Не получилось усыпить: {e}"


# ---------- Clipboard / type / hotkey ----------

def clipboard_copy(text: str) -> str:
    """Copies text into the system clipboard."""
    try:
        if IS_WIN:
            p = subprocess.Popen("clip", stdin=subprocess.PIPE, shell=True)
            p.communicate(input=text.encode("utf-16-le"))
            return "Скопировала в буфер."
        if shutil.which("xclip"):
            p = subprocess.Popen(["xclip", "-selection", "clipboard"], stdin=subprocess.PIPE)
            p.communicate(input=text.encode("utf-8"))
            return "Скопировала в буфер."
        return "Буфер обмена недоступен на этой ОС."
    except Exception as e:
        return f"Не вышло скопировать: {e}"


def clipboard_paste() -> str:
    """Returns content of system clipboard."""
    try:
        if IS_WIN:
            r = subprocess.run(
                ["powershell", "-NoProfile", "-Command", "Get-Clipboard"],
                capture_output=True, text=True, timeout=5
            )
            return (r.stdout or "").strip() or "Буфер пуст."
        if shutil.which("xclip"):
            r = subprocess.run(["xclip", "-selection", "clipboard", "-o"], capture_output=True, text=True)
            return (r.stdout or "").strip() or "Буфер пуст."
        return "Буфер обмена недоступен."
    except Exception as e:
        return f"Не смогла прочитать буфер: {e}"


def type_text(text: str) -> str:
    if not HAS_PYAUTOGUI:
        return "pyautogui недоступен — печатать не могу."
    try:
        pyautogui.typewrite(text, interval=0.01)
        return "Напечатала текст."
    except Exception as e:
        return f"Ошибка ввода: {e}"


def press_keys(keys: str) -> str:
    """Press a hotkey combination, e.g. 'ctrl+c', 'win+d'."""
    if not HAS_PYAUTOGUI:
        return "pyautogui недоступен."
    try:
        parts = [k.strip().lower() for k in keys.replace(" ", "").split("+")]
        pyautogui.hotkey(*parts)
        return f"Нажала: {keys}."
    except Exception as e:
        return f"Не смогла нажать клавиши: {e}"


# ---------- Screenshot ----------

def take_screenshot() -> str:
    """Saves a PC screenshot to static/pc_screen.png and returns the URL."""
    if not HAS_PYAUTOGUI:
        return "pyautogui недоступен — скриншот не сделать."
    try:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        out_dir = os.path.join(base_dir, "static")
        os.makedirs(out_dir, exist_ok=True)
        ts_name = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_path = os.path.join(out_dir, "pc_screen.png")
        archive_path = os.path.join(out_dir, f"pc_screen_{ts_name}.png")
        img = pyautogui.screenshot()
        img.save(out_path)
        try:
            img.save(archive_path)
        except Exception:
            pass
        if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
            return "Скриншот сохранить не удалось (файл нулевого размера)."
        ts = int(datetime.now().timestamp())
        return f"Скриншот ПК готов и сохранён в {out_path}. /static/pc_screen.png?t={ts}"
    except Exception as e:
        return f"Не смогла сделать скриншот: {e}"


# ---------- System info ----------

def system_info() -> str:
    from core.system_info import get_system_info_text
    return get_system_info_text()


# ---------- Notes / reminders ----------

def save_note(title: str, body: str, tags: str = "") -> str:
    from core.notes import save_note as _sn
    nid = _sn(title, body, tags)
    return f"Заметка #{nid} сохранена."


def list_notes(query: str = "") -> str:
    from core.notes import list_notes as _ln
    notes = _ln(50, query)
    if not notes:
        return "Заметок пока нет."
    lines = []
    for n in notes[:10]:
        ts = n["timestamp"][:16].replace("T", " ")
        lines.append(f"• #{n['id']} [{ts}] {n['title']} — {n['body'][:80]}")
    if len(notes) > 10:
        lines.append(f"... ещё {len(notes) - 10}.")
    return "\n".join(lines)


def remind(text: str, relative: str = "", fire_at: str = "") -> str:
    from core.notes import add_reminder
    r = add_reminder(text, fire_at_iso=fire_at, relative=relative)
    if r["status"] != "ok":
        return r["message"]
    return f"Запомнила, напомню {r['human']}: {text}"


def list_reminders_action() -> str:
    from core.notes import list_reminders
    items = list_reminders()
    if not items:
        return "Активных напоминаний нет."
    lines = []
    for r in items[:10]:
        when = r["fire_at"][:16].replace("T", " ")
        lines.append(f"• #{r['id']} {when} — {r['text']}")
    return "\n".join(lines)


# ---------- Web / summarize ----------

def summarize_url(url: str) -> str:
    """Fetch a URL and return plain text snippet (LLM will summarize)."""
    import httpx
    import re
    if not url:
        return "Не указана ссылка."
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        r = httpx.get(url, timeout=12, headers={"User-Agent": "Mozilla/5.0"})
        text = r.text
        text = re.sub(r"<script.*?</script>", " ", text, flags=re.S | re.I)
        text = re.sub(r"<style.*?</style>", " ", text, flags=re.S | re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return f"Сырое содержимое страницы (первые 3500 знаков):\n{text[:3500]}"
    except Exception as e:
        return f"Не смогла загрузить страницу: {e}"


def weather(city: str = "") -> str:
    from core.weather import get_weather
    return get_weather(city)


# ---------- Self-dev (introspect own code) ----------

def self_list_modules_action() -> str:
    from core.self_dev import list_modules
    mods = list_modules()
    if not mods:
        return "Не удалось прочитать собственный код."
    lines = [f"У меня {len(mods)} модулей кода:"]
    for m in mods[:40]:
        lines.append(f"• {m['path']} — {m['description']} ({m['lines']} стр.)")
    if len(mods) > 40:
        lines.append(f"... и ещё {len(mods) - 40}.")
    return "\n".join(lines)


def self_read_module_action(path: str) -> str:
    from core.self_dev import read_own_module
    try:
        src = read_own_module(path)
    except Exception as e:
        return f"Не смогла прочитать {path}: {e}"
    snippet = src if len(src) <= 4000 else src[:4000] + "\n... [обрезано, всего {} символов]".format(len(src))
    return f"Содержимое {path}:\n{snippet}"


# ---------- Telegram (desktop) higher-level commands ----------

def _tg_focus_telegram() -> bool:
    """Best-effort: launch Telegram and bring it forward. Returns True if pyautogui is available."""
    open_app("telegram")
    if not HAS_PYAUTOGUI:
        return False
    import time as _t
    _t.sleep(1.6)
    return True


def tg_open_chat(target: str) -> str:
    if not target:
        return "Не указан чат/канал. Пример: tg_open_chat target=\"Мама\"."
    if not _tg_focus_telegram():
        return "Запустила Telegram, но pyautogui недоступен — открыть нужный чат автоматически не могу."
    try:
        pyautogui.hotkey("ctrl", "k")
        import time as _t
        _t.sleep(0.35)
        pyautogui.typewrite(target, interval=0.02)
        _t.sleep(0.6)
        pyautogui.press("enter")
        return f"Открыла чат «{target}» в Telegram."
    except Exception as e:
        return f"Не вышло открыть «{target}» в Telegram: {e}"


def tg_send_message(target: str, text: str) -> str:
    if not target or not text:
        return "Нужны и target (кому/куда), и text (что написать)."
    if not _tg_focus_telegram():
        return "Telegram запущен, но pyautogui не доступен — печатать сама не могу."
    try:
        import time as _t
        pyautogui.hotkey("ctrl", "k")
        _t.sleep(0.4)
        pyautogui.typewrite(target, interval=0.02)
        _t.sleep(0.6)
        pyautogui.press("enter")
        _t.sleep(0.5)
        pyautogui.typewrite(text, interval=0.012)
        _t.sleep(0.15)
        pyautogui.press("enter")
        return f"Написала в «{target}»: {text[:120]}"
    except Exception as e:
        return f"Не отправилось в «{target}»: {e}"


# ---------- Dispatch ----------

def execute_action(action_name: str, **kwargs) -> str:
    fn_map = {
        # PC apps and shell
        "open_app": lambda: open_app(kwargs.get("name", "")),
        "close_app": lambda: close_app(kwargs.get("name", "")),
        "open_url": lambda: open_url(kwargs.get("url", "")),
        "run_command": lambda: run_command(kwargs.get("cmd", "")),
        # files
        "list_files": lambda: list_files(kwargs.get("path", "~")),
        "search_files": lambda: search_files(kwargs.get("query", ""), kwargs.get("path", "~")),
        "read_file": lambda: read_file(kwargs.get("path", "")),
        "write_file": lambda: write_file(kwargs.get("path", ""), kwargs.get("content", ""), bool(kwargs.get("append", False))),
        "create_folder": lambda: create_folder(kwargs.get("path", "")),
        "delete_path": lambda: delete_path(kwargs.get("path", "")),
        "open_path": lambda: open_path(kwargs.get("path", "")),
        # media + power
        "volume_control": lambda: volume_control(kwargs.get("action", "")),
        "set_volume_level": lambda: set_volume_level(kwargs.get("level", 50)),
        "media_control": lambda: media_control(kwargs.get("action", "")),
        "lock_pc": lambda: lock_pc(),
        "shutdown_pc": lambda: shutdown_pc(),
        "cancel_shutdown": lambda: cancel_shutdown(),
        "restart_pc": lambda: restart_pc(),
        "sleep_pc": lambda: sleep_pc(),
        # clipboard / type / hotkey
        "clipboard_copy": lambda: clipboard_copy(kwargs.get("text", "")),
        "clipboard_paste": lambda: clipboard_paste(),
        "type_text": lambda: type_text(kwargs.get("text", "")),
        "press_keys": lambda: press_keys(kwargs.get("keys", "")),
        # screenshot + info
        "take_screenshot": lambda: take_screenshot(),
        "system_info": lambda: system_info(),
        # notes & reminders
        "save_note": lambda: save_note(kwargs.get("title", "Заметка"), kwargs.get("body", ""), kwargs.get("tags", "")),
        "list_notes": lambda: list_notes(kwargs.get("query", "")),
        "remind": lambda: remind(kwargs.get("text", ""), kwargs.get("relative", ""), kwargs.get("fire_at", "")),
        "list_reminders": lambda: list_reminders_action(),
        # web / extras
        "summarize_url": lambda: summarize_url(kwargs.get("url", "")),
        "weather": lambda: weather(kwargs.get("city", "")),
        # self-dev
        "self_list_modules": lambda: self_list_modules_action(),
        "self_read_module": lambda: self_read_module_action(kwargs.get("path", "")),
        # Telegram desktop higher-level
        "tg_open_chat": lambda: tg_open_chat(kwargs.get("target", "")),
        "tg_send_message": lambda: tg_send_message(kwargs.get("target", ""), kwargs.get("text", "")),
    }

    # Phone
    if action_name == "phone_connect":
        from core.phone import connect_phone
        return connect_phone(kwargs.get("ip", ""))
    if action_name == "phone_open_app":
        from core.phone import open_phone_app
        return open_phone_app(kwargs.get("name", ""))
    if action_name == "phone_open_url":
        from core.phone import phone_open_url
        return phone_open_url(kwargs.get("url", ""))
    if action_name == "phone_screenshot":
        from core.phone import capture_phone_screen
        return capture_phone_screen()
    if action_name == "phone_key":
        from core.phone import phone_key
        return phone_key(kwargs.get("key", ""))
    if action_name == "phone_text":
        from core.phone import phone_text
        return phone_text(kwargs.get("text", ""))
    if action_name == "phone_battery":
        from core.phone import phone_battery
        return phone_battery()
    if action_name == "phone_call":
        from core.phone import phone_call
        return phone_call(kwargs.get("number", ""))
    if action_name == "phone_notification":
        from core.phone import phone_send_notification
        return phone_send_notification(kwargs.get("title", "Среда"), kwargs.get("body", ""))

    fn = fn_map.get(action_name)
    if fn is None:
        return f"Неизвестное действие: {action_name}"
    return fn()
