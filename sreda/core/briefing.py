from datetime import datetime
from core.system_info import get_system_snapshot
from core.weather import get_weather
from core.notes import list_reminders, list_notes
from core.memory import get_all_facts, get_notifications
from core.reports import get_real_reports
from core.patterns import get_patterns


def build_briefing(city: str = "") -> dict:
    """Aggregates a morning/dashboard briefing combining system, weather, agenda, reminders, patterns."""
    now = datetime.now()
    hour = now.hour
    if 5 <= hour < 12:
        greeting = "Доброе утро, Влад"
    elif 12 <= hour < 17:
        greeting = "Доброго дня, Влад"
    elif 17 <= hour < 23:
        greeting = "Добрый вечер, Влад"
    else:
        greeting = "Доброй ночи, Влад"

    snap = get_system_snapshot()

    weather_text = ""
    try:
        weather_text = get_weather(city)
    except Exception:
        pass

    reminders = list_reminders()[:5]
    notifications = get_notifications(unseen_only=True, limit=10)
    facts = get_all_facts()
    patterns = get_patterns()
    daily = get_real_reports("day")

    return {
        "greeting": greeting,
        "now": now.strftime("%H:%M, %d %B"),
        "weather": weather_text,
        "system": snap,
        "reminders": reminders,
        "notifications": notifications,
        "facts_count": len(facts),
        "patterns_count": len(patterns),
        "daily_summary": daily.get("summary", ""),
    }
