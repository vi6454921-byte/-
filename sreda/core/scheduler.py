import time
import threading
import logging
from datetime import datetime
from core.notes import pending_due, mark_reminder_done
from core.memory import push_notification

logger = logging.getLogger("SredaScheduler")

# Callbacks set by app.py so that we can push WebSocket events
_notify_callbacks = []


def on_reminder(callback):
    """Register a callback fn(reminder_dict) called when a reminder fires."""
    _notify_callbacks.append(callback)


def _tick():
    try:
        due = pending_due()
        for r in due:
            logger.info(f"Reminder fired: {r['text']}")
            push_notification("Напоминание", r["text"])
            for cb in _notify_callbacks:
                try:
                    cb(r)
                except Exception as e:
                    logger.error(f"Reminder callback error: {e}")
            mark_reminder_done(r["id"])
    except Exception as e:
        logger.error(f"Scheduler tick failure: {e}")


def _loop():
    logger.info("Reminder scheduler started.")
    while True:
        _tick()
        time.sleep(20)


def start_scheduler():
    t = threading.Thread(target=_loop, daemon=True)
    t.start()
