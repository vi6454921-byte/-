import httpx


def get_weather(city: str = "") -> str:
    """Fetches a short weather report from wttr.in (no API key needed)."""
    city = (city or "").strip()
    url = f"https://wttr.in/{city}?format=3&lang=ru" if city else "https://wttr.in/?format=3&lang=ru"
    try:
        r = httpx.get(url, timeout=8.0, headers={"User-Agent": "curl/8"})
        if r.status_code == 200 and r.text.strip():
            return r.text.strip()
        return f"Не получилось узнать погоду (код {r.status_code})."
    except Exception as e:
        return f"Погодный сервис недоступен: {e}"


def get_weather_detailed(city: str = "") -> str:
    """Returns multi-line detailed forecast."""
    city = (city or "").strip()
    url = f"https://wttr.in/{city}?lang=ru&T&n&0" if city else "https://wttr.in/?lang=ru&T&n&0"
    try:
        r = httpx.get(url, timeout=10.0, headers={"User-Agent": "curl/8"})
        if r.status_code == 200 and r.text.strip():
            text = r.text
            return text[:1500]
        return f"Не получилось узнать прогноз (код {r.status_code})."
    except Exception as e:
        return f"Прогноз погоды недоступен: {e}"
