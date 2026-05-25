import sqlite3
import os
from datetime import datetime
from config import DB_PATH


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_db():
    """Initializes SQLite database and creates tables if they don't exist."""
    conn = _conn()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL
    )""")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        timestamp TEXT NOT NULL
    )""")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS action_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        action_name TEXT NOT NULL,
        details TEXT NOT NULL,
        status TEXT NOT NULL
    )""")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        app TEXT NOT NULL,
        title TEXT NOT NULL,
        duration INTEGER DEFAULT 0
    )""")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS learned_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_type TEXT NOT NULL,
        description TEXT NOT NULL,
        confidence REAL NOT NULL,
        active INTEGER DEFAULT 0,
        timestamp TEXT NOT NULL
    )""")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        tags TEXT DEFAULT ''
    )""")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        fire_at TEXT NOT NULL,
        text TEXT NOT NULL,
        status TEXT DEFAULT 'pending'
    )""")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        seen INTEGER DEFAULT 0
    )""")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS daily_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        summary TEXT NOT NULL,
        timestamp TEXT NOT NULL
    )""")

    conn.commit()
    conn.close()


def add_message(role: str, content: str):
    conn = _conn()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO conversations (timestamp, role, content) VALUES (?, ?, ?)",
        (datetime.now().isoformat(), role, content)
    )
    conn.commit()
    conn.close()


def get_recent_messages(limit: int = 20) -> list:
    conn = _conn()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT role, content FROM conversations ORDER BY id DESC LIMIT ?",
        (limit,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [{"role": r[0], "content": r[1]} for r in reversed(rows)]


def save_fact(key: str, value: str):
    conn = _conn()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO facts (key, value, timestamp) VALUES (?, ?, ?)",
        (key, value, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()


def get_all_facts() -> dict:
    conn = _conn()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM facts ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    return {r[0]: r[1] for r in rows}


def delete_fact(key: str):
    conn = _conn()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM facts WHERE key = ?", (key,))
    conn.commit()
    conn.close()


def log_action(action_name: str, details: str, status: str):
    conn = _conn()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO action_log (timestamp, action_name, details, status) VALUES (?, ?, ?, ?)",
        (datetime.now().isoformat(), action_name, details, status)
    )
    conn.commit()
    conn.close()


def get_action_logs(limit: int = 50) -> list:
    conn = _conn()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT timestamp, action_name, details, status FROM action_log ORDER BY id DESC LIMIT ?",
        (limit,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {"timestamp": r[0], "action_name": r[1], "details": r[2], "status": r[3]}
        for r in rows
    ]


def push_notification(title: str, body: str):
    conn = _conn()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO notifications (timestamp, title, body, seen) VALUES (?, ?, ?, 0)",
        (datetime.now().isoformat(), title, body)
    )
    conn.commit()
    conn.close()


def get_notifications(unseen_only: bool = False, limit: int = 30) -> list:
    conn = _conn()
    cursor = conn.cursor()
    if unseen_only:
        cursor.execute(
            "SELECT id, timestamp, title, body, seen FROM notifications WHERE seen=0 ORDER BY id DESC LIMIT ?",
            (limit,)
        )
    else:
        cursor.execute(
            "SELECT id, timestamp, title, body, seen FROM notifications ORDER BY id DESC LIMIT ?",
            (limit,)
        )
    rows = cursor.fetchall()
    conn.close()
    return [
        {"id": r[0], "timestamp": r[1], "title": r[2], "body": r[3], "seen": bool(r[4])}
        for r in rows
    ]


def mark_notifications_seen():
    conn = _conn()
    cursor = conn.cursor()
    cursor.execute("UPDATE notifications SET seen=1 WHERE seen=0")
    conn.commit()
    conn.close()


def save_daily_summary(date_str: str, summary: str):
    conn = _conn()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO daily_summary (date, summary, timestamp) VALUES (?, ?, ?)",
        (date_str, summary, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()


def get_daily_summary(date_str: str) -> str:
    conn = _conn()
    cursor = conn.cursor()
    cursor.execute("SELECT summary FROM daily_summary WHERE date=?", (date_str,))
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else ""


# Initialize DB on load
init_db()
