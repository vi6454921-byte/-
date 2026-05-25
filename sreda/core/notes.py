import sqlite3
import re
from datetime import datetime, timedelta
from config import DB_PATH


def _conn():
    return sqlite3.connect(DB_PATH)


# ---------- Notes ----------

def save_note(title: str, body: str, tags: str = "") -> int:
    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO notes (timestamp, title, body, tags) VALUES (?, ?, ?, ?)",
        (datetime.now().isoformat(), title.strip(), body.strip(), tags.strip())
    )
    note_id = cur.lastrowid
    conn.commit()
    conn.close()
    return note_id


def list_notes(limit: int = 50, query: str = "") -> list:
    conn = _conn()
    cur = conn.cursor()
    if query:
        like = f"%{query}%"
        cur.execute(
            "SELECT id, timestamp, title, body, tags FROM notes "
            "WHERE title LIKE ? OR body LIKE ? OR tags LIKE ? "
            "ORDER BY id DESC LIMIT ?",
            (like, like, like, limit)
        )
    else:
        cur.execute(
            "SELECT id, timestamp, title, body, tags FROM notes ORDER BY id DESC LIMIT ?",
            (limit,)
        )
    rows = cur.fetchall()
    conn.close()
    return [
        {"id": r[0], "timestamp": r[1], "title": r[2], "body": r[3], "tags": r[4]}
        for r in rows
    ]


def delete_note(note_id: int):
    conn = _conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM notes WHERE id=?", (note_id,))
    conn.commit()
    conn.close()


# ---------- Reminders ----------

REL_RE = re.compile(r"(?:через\s+)?(\d+)\s*(сек|секунд|мин|минут|час|часов|часа|день|дн|дня|нед|недел|месяц|месяцев)", re.I)


def parse_relative_time(text: str) -> datetime:
    """Parses things like 'через 5 минут', '2 часа', '3 дня' into a future datetime."""
    if not text:
        return None
    m = REL_RE.search(text.lower())
    if not m:
        return None
    n = int(m.group(1))
    unit = m.group(2)
    delta = timedelta()
    if unit.startswith("сек"):
        delta = timedelta(seconds=n)
    elif unit.startswith("мин"):
        delta = timedelta(minutes=n)
    elif unit.startswith("час"):
        delta = timedelta(hours=n)
    elif unit.startswith("ден") or unit.startswith("дн"):
        delta = timedelta(days=n)
    elif unit.startswith("нед"):
        delta = timedelta(weeks=n)
    elif unit.startswith("мес"):
        delta = timedelta(days=n * 30)
    return datetime.now() + delta


def add_reminder(text: str, fire_at_iso: str = "", relative: str = "") -> dict:
    """Creates a reminder. Either pass an ISO datetime string or a relative phrase."""
    if fire_at_iso:
        try:
            fire_at = datetime.fromisoformat(fire_at_iso)
        except Exception:
            fire_at = None
    else:
        fire_at = None

    if fire_at is None and relative:
        fire_at = parse_relative_time(relative)

    if fire_at is None:
        return {"status": "error", "message": "Не понял когда напомнить. Пример: 'через 30 минут' или ISO дата."}

    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO reminders (created_at, fire_at, text, status) VALUES (?, ?, ?, 'pending')",
        (datetime.now().isoformat(), fire_at.isoformat(), text.strip())
    )
    rid = cur.lastrowid
    conn.commit()
    conn.close()
    return {
        "status": "ok",
        "id": rid,
        "fire_at": fire_at.isoformat(),
        "human": fire_at.strftime("%d.%m %H:%M")
    }


def list_reminders(include_done: bool = False) -> list:
    conn = _conn()
    cur = conn.cursor()
    if include_done:
        cur.execute(
            "SELECT id, created_at, fire_at, text, status FROM reminders ORDER BY fire_at ASC"
        )
    else:
        cur.execute(
            "SELECT id, created_at, fire_at, text, status FROM reminders WHERE status='pending' ORDER BY fire_at ASC"
        )
    rows = cur.fetchall()
    conn.close()
    return [
        {"id": r[0], "created_at": r[1], "fire_at": r[2], "text": r[3], "status": r[4]}
        for r in rows
    ]


def delete_reminder(rid: int):
    conn = _conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM reminders WHERE id=?", (rid,))
    conn.commit()
    conn.close()


def mark_reminder_done(rid: int):
    conn = _conn()
    cur = conn.cursor()
    cur.execute("UPDATE reminders SET status='done' WHERE id=?", (rid,))
    conn.commit()
    conn.close()


def pending_due(now: datetime = None) -> list:
    """Returns reminders that should fire now or earlier."""
    now = now or datetime.now()
    conn = _conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, fire_at, text FROM reminders WHERE status='pending' AND fire_at <= ?",
        (now.isoformat(),)
    )
    rows = cur.fetchall()
    conn.close()
    return [{"id": r[0], "fire_at": r[1], "text": r[2]} for r in rows]
