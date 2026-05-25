"""
Self-development module: lets Sreda introspect her own source, propose patches,
and (with user approval) rewrite her own files.

Safety model:
  • All paths are resolved inside SREDA_ROOT and refused if they try to escape.
  • Only .py files are touchable.
  • Every applied patch makes a timestamped backup in /data/self_backups/.
  • Patches must be explicitly approved by the user before being applied.
"""

import os
import sqlite3
import shutil
import logging
import ast
from pathlib import Path
from datetime import datetime
from config import DB_PATH

logger = logging.getLogger("SredaSelfDev")

SREDA_ROOT = Path(__file__).resolve().parent.parent
BACKUP_DIR = SREDA_ROOT / "data" / "self_backups"
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_SUFFIXES = {".py"}
SKIP_DIRS = {"__pycache__", ".git", "data", "static"}


# ─────────────── DB ───────────────

def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def _init_tables():
    conn = _conn()
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS self_patches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        file TEXT NOT NULL,
        reason TEXT NOT NULL,
        old_content TEXT NOT NULL,
        new_content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        applied_at TEXT,
        backup_path TEXT
    )""")
    conn.commit()
    conn.close()


_init_tables()


# ─────────────── Path safety ───────────────

def _safe_path(relative: str) -> Path:
    """Resolves a relative path inside SREDA_ROOT or raises."""
    if not relative:
        raise ValueError("Пустой путь.")
    rel = relative.strip().lstrip("/").lstrip("\\")
    candidate = (SREDA_ROOT / rel).resolve()
    try:
        candidate.relative_to(SREDA_ROOT)
    except ValueError:
        raise ValueError(f"Путь вне корня проекта: {relative}")
    return candidate


# ─────────────── Inventory ───────────────

_MODULE_DESCRIPTIONS = {
    "app.py": "Flask + SocketIO точка входа, REST + websocket.",
    "config.py": "Все конфиги: ключи, имена, порты, путь к БД.",
    "core/brain.py": "Мозг: общение с Mistral/Ollama, разбор JSON, диспетч действий.",
    "core/actions.py": "Все команды для ПК: открыть приложение, файлы, медиа, скриншот.",
    "core/phone.py": "Управление Android через ADB.",
    "core/memory.py": "SQLite: история, факты, журнал действий, уведомления.",
    "core/notes.py": "Заметки и напоминания.",
    "core/scheduler.py": "Планировщик: следит за временем напоминаний.",
    "core/patterns.py": "Анализ привычек — обнаружение паттернов поведения.",
    "core/monitor.py": "Фоновый монитор активного окна (Windows).",
    "core/system_info.py": "Снимок ПК: CPU, RAM, диск, аптайм.",
    "core/web_search.py": "Поиск в DuckDuckGo.",
    "core/weather.py": "Погода по городу или IP.",
    "core/briefing.py": "Утренний/вечерний брифинг.",
    "core/files.py": "Чтение/запись/удаление файлов.",
    "core/reports.py": "Отчёты по активности за день/неделю.",
    "core/self_dev.py": "Самоанализ и саморазвитие — этот модуль.",
}


def _describe_module(rel_path: str, src: str) -> str:
    """Returns a short human description from the module docstring or our hardcoded map."""
    if rel_path in _MODULE_DESCRIPTIONS:
        return _MODULE_DESCRIPTIONS[rel_path]
    try:
        tree = ast.parse(src)
        doc = ast.get_docstring(tree)
        if doc:
            return doc.strip().splitlines()[0][:200]
    except Exception:
        pass
    return "—"


def list_modules() -> list:
    """Returns metadata for every .py file under SREDA_ROOT."""
    results = []
    for root, dirs, files in os.walk(SREDA_ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fname in files:
            if Path(fname).suffix not in ALLOWED_SUFFIXES:
                continue
            full = Path(root) / fname
            rel = str(full.relative_to(SREDA_ROOT)).replace("\\", "/")
            try:
                src = full.read_text(encoding="utf-8", errors="replace")
                lines = src.count("\n") + 1
                size = full.stat().st_size
                desc = _describe_module(rel, src)
            except Exception as e:
                lines, size, desc = 0, 0, f"(ошибка чтения: {e})"
            results.append({
                "path": rel,
                "description": desc,
                "lines": lines,
                "size": size,
            })
    results.sort(key=lambda r: r["path"])
    return results


def read_own_module(relative_path: str) -> str:
    """Returns the full source code of the requested file. Sandboxed to SREDA_ROOT."""
    p = _safe_path(relative_path)
    if not p.exists():
        raise FileNotFoundError(f"Файл не найден: {relative_path}")
    if p.suffix not in ALLOWED_SUFFIXES:
        raise ValueError("Можно читать только .py файлы.")
    return p.read_text(encoding="utf-8", errors="replace")


# ─────────────── Patches ───────────────

def propose_patch(file: str, reason: str, new_content: str) -> dict:
    """Records a pending patch. Returns metadata for UI preview."""
    p = _safe_path(file)
    if p.suffix not in ALLOWED_SUFFIXES:
        raise ValueError("Патчить можно только .py файлы.")
    if not new_content or not new_content.strip():
        raise ValueError("Новый код пустой.")

    # Syntax-check the proposal before storing — refuse broken Python upfront.
    try:
        ast.parse(new_content)
    except SyntaxError as se:
        raise ValueError(f"Синтаксическая ошибка в новом коде: {se}")

    old_content = p.read_text(encoding="utf-8", errors="replace") if p.exists() else ""

    conn = _conn()
    c = conn.cursor()
    c.execute(
        """INSERT INTO self_patches
           (created_at, file, reason, old_content, new_content, status)
           VALUES (?, ?, ?, ?, ?, 'pending')""",
        (datetime.now().isoformat(), str(p.relative_to(SREDA_ROOT)).replace("\\", "/"),
         reason or "(без причины)", old_content, new_content)
    )
    pid = c.lastrowid
    conn.commit()
    conn.close()

    return {
        "id": pid,
        "file": str(p.relative_to(SREDA_ROOT)).replace("\\", "/"),
        "reason": reason,
        "old_content": old_content,
        "new_content": new_content,
        "status": "pending",
    }


def get_pending_patch(patch_id: int) -> dict:
    conn = _conn()
    c = conn.cursor()
    c.execute(
        "SELECT id, created_at, file, reason, old_content, new_content, status FROM self_patches WHERE id=?",
        (patch_id,)
    )
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row[0],
        "created_at": row[1],
        "file": row[2],
        "reason": row[3],
        "old_content": row[4],
        "new_content": row[5],
        "status": row[6],
    }


def list_pending_patches() -> list:
    conn = _conn()
    c = conn.cursor()
    c.execute(
        "SELECT id, created_at, file, reason, status FROM self_patches WHERE status='pending' ORDER BY id DESC"
    )
    rows = c.fetchall()
    conn.close()
    return [{"id": r[0], "created_at": r[1], "file": r[2], "reason": r[3], "status": r[4]} for r in rows]


def list_history(limit: int = 30) -> list:
    conn = _conn()
    c = conn.cursor()
    c.execute(
        "SELECT id, created_at, file, reason, status, applied_at FROM self_patches ORDER BY id DESC LIMIT ?",
        (limit,)
    )
    rows = c.fetchall()
    conn.close()
    return [
        {"id": r[0], "created_at": r[1], "file": r[2], "reason": r[3], "status": r[4], "applied_at": r[5]}
        for r in rows
    ]


def apply_pending_patch(patch_id: int) -> dict:
    patch = get_pending_patch(patch_id)
    if not patch:
        return {"status": "error", "message": "Патч не найден."}
    if patch["status"] != "pending":
        return {"status": "error", "message": f"Патч уже {patch['status']}."}

    target = _safe_path(patch["file"])
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"{target.name}.{ts}.bak"

    try:
        if target.exists():
            shutil.copy2(target, backup_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(patch["new_content"], encoding="utf-8")
    except Exception as e:
        return {"status": "error", "message": f"Запись провалилась: {e}"}

    conn = _conn()
    c = conn.cursor()
    c.execute(
        "UPDATE self_patches SET status='applied', applied_at=?, backup_path=? WHERE id=?",
        (datetime.now().isoformat(), str(backup_path), patch_id)
    )
    conn.commit()
    conn.close()

    return {"status": "ok", "id": patch_id, "file": patch["file"], "backup": str(backup_path)}


def discard_pending_patch(patch_id: int) -> dict:
    patch = get_pending_patch(patch_id)
    if not patch:
        return {"status": "error", "message": "Патч не найден."}

    conn = _conn()
    c = conn.cursor()
    c.execute(
        "UPDATE self_patches SET status='discarded', applied_at=? WHERE id=?",
        (datetime.now().isoformat(), patch_id)
    )
    conn.commit()
    conn.close()
    return {"status": "ok", "id": patch_id}


def revert_patch(patch_id: int) -> dict:
    """Restores a previously applied patch from its backup."""
    conn = _conn()
    c = conn.cursor()
    c.execute(
        "SELECT file, backup_path, status FROM self_patches WHERE id=?",
        (patch_id,)
    )
    row = c.fetchone()
    conn.close()
    if not row:
        return {"status": "error", "message": "Патч не найден."}
    file, backup_path, status = row
    if status != "applied":
        return {"status": "error", "message": f"Патч не был применён (статус: {status})."}
    if not backup_path or not Path(backup_path).exists():
        return {"status": "error", "message": "Резервная копия не найдена."}

    target = _safe_path(file)
    try:
        shutil.copy2(backup_path, target)
    except Exception as e:
        return {"status": "error", "message": f"Откат провалился: {e}"}

    conn = _conn()
    c = conn.cursor()
    c.execute(
        "UPDATE self_patches SET status='reverted', applied_at=? WHERE id=?",
        (datetime.now().isoformat(), patch_id)
    )
    conn.commit()
    conn.close()
    return {"status": "ok", "id": patch_id, "file": file}
