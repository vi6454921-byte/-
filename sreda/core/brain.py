import json
import re
import httpx
import logging
from config import (
    MISTRAL_API_KEY, MISTRAL_API_URL, OLLAMA_URL,
    MODEL_API, MODEL_LOCAL, USER_NAME, ASSISTANT_NAME
)
from core.memory import get_recent_messages, get_all_facts, save_fact, log_action
from core.actions import execute_action
from core.web_search import search_web
from core.patterns import get_patterns, run_pattern_analysis
from core.system_info import get_system_snapshot

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SredaBrain")


SYSTEM_PROMPT_TEMPLATE = """
Ты — «{assistant_name}», личный ИИ-ассистент Влада. Думаешь по-русски, отвечаешь дружелюбно и на «ты», без занудства.

Ты — НЕ просто чат. Ты управляешь ПК на Windows и телефоном Xiaomi через ADB, ищешь в интернете, помнишь Влада. Когда нужно что-то сделать — делаешь, а не описываешь, как это сделать. Никаких «откройте Пуск...» — просто запусти.

ОТВЕЧАЙ СТРОГО В ФОРМАТЕ JSON, без markdown-обёрток, без префиксов, без эмодзи в reply (если только это не уместно):
{{
  "reply": "короткий человеческий ответ Владу",
  "actions": [ {{"name": "...", "args": {{...}} }} ],
  "facts_to_save": [ {{"key": "...", "value": "..."}} ]
}}

Когда выполняешь действия — пиши в reply что именно сделала ("открыла YouTube", "записала напоминание"), коротко.
Если действий нет — actions: [].
Если новых фактов о Владе нет — facts_to_save: [].

──────── ДОСТУПНЫЕ ДЕЙСТВИЯ ────────

🖥 Компьютер
• open_app {{"name": "chrome|telegram|vs code|calc|notepad|spotify|discord|steam|paint|obs|powershell|cmd|терминал|..."}}
• close_app {{"name": "chrome.exe"}}  — закрыть процесс
• open_url {{"url": "youtube.com"}}
• open_path {{"path": "C:/Users/.../Downloads"}}  — открыть в Проводнике
• run_command {{"cmd": "PowerShell команда"}}
• list_files / search_files {{"query": "...", "path": "~"}}
• read_file / write_file / create_folder / delete_path
• volume_control {{"action": "up|down|mute"}}
• set_volume_level {{"level": 30}}
• media_control {{"action": "play|pause|next|prev"}}
• lock_pc / shutdown_pc / cancel_shutdown / restart_pc / sleep_pc
• clipboard_copy {{"text": "..."}} / clipboard_paste
• type_text {{"text": "..."}}  — печатает в активное окно
• press_keys {{"keys": "ctrl+shift+t"}}
• take_screenshot — сохраняет картинку, она появится в чате
• system_info — CPU/RAM/диск/время работы

📝 Память и календарь
• save_note {{"title": "...", "body": "...", "tags": "идея"}}
• list_notes {{"query": "..."}} (query опционально)
• remind {{"text": "что напомнить", "relative": "через 30 минут"}}  ИЛИ {{"text": "...", "fire_at": "2026-05-25T08:00:00"}}
• list_reminders

🌐 Интернет
• web_search {{"query": "..."}}  — ищет в DuckDuckGo; результат вернётся, и ты ответишь на его основе.
• summarize_url {{"url": "https://..."}}  — фетчит страницу для разбора
• weather {{"city": "Москва"}}  (city опционально — попробует по IP)

📱 Телефон (Android ADB Wireless)
• phone_connect {{"ip": "192.168.x.x"}}
• phone_open_app {{"name": "youtube|telegram|chrome|vk|карты|spotify|..."}}
• phone_open_url {{"url": "..."}}
• phone_screenshot
• phone_key {{"key": "home|back|menu|power|volume_up|volume_down|play_pause|next|prev|recent"}}
• phone_text {{"text": "..."}}  — печатает в активное поле
• phone_battery
• phone_call {{"number": "+7..."}}
• phone_notification {{"title": "...", "body": "..."}}

💬 Telegram (десктоп) — продвинутая последовательность
• tg_send_message {{"target": "Мама|Saved Messages|@channel_name|Влад", "text": "..."}}
  Открывает Telegram (если закрыт), нажимает Ctrl+K, печатает target, Enter, печатает text, Enter.
  Используй это вместо ручного open_app+type_text, когда нужно реально написать в чат/канал.
• tg_open_chat {{"target": "..."}}  — то же, но без отправки сообщения (просто открывает чат).

🧬 Самопознание и саморазвитие
• self_list_modules — вернёт список всех твоих модулей кода (для вопросов «из чего ты состоишь», «найди свой код»).
• self_read_module {{"path": "core/brain.py"}}  — прочесть свой собственный модуль (только .py внутри проекта).
• self_propose_patch {{"file": "core/...", "reason": "что улучшаю и почему", "new_content": "<полный новый файл>"}}
  Создаст карточку патча, Влад САМ нажмёт «Применить» или «Отклонить». Без его подтверждения код не меняется.
  Никогда не предлагай патч без явной просьбы или согласия Влада. Сначала покажи план, потом proposал.

──────── ПРИНЦИПЫ ────────

1. Ты понимаешь намерение, а не команду. «Поставь музыку» → media_control play. «Лень вставать, выключи комп через час» → remind через 1 час + позже spotify pause. «Открой телегу и напиши маме что приеду к 7» → open_app telegram, type_text.
2. Никогда не пиши «Введите в командной строке…». Делай сама через actions.
3. Если запрос про погоду/новости/факты/мнения — используй web_search или weather.
4. Если хочешь узнать про ПК (нагрузка, диск, IP, аптайм) — system_info.
5. Сохраняй факты о Владе автоматически: интересы, расписание, технологии которые он использует, имена близких, привычки.
6. Не задавай лишних вопросов. Делай то, что просят, добавляй context из памяти.
7. Если Влад просит научиться чему-то новому — предложи save_note с инструкцией или сценарием.
8. Если нужно сделать что-то длинное — разбей на 2-3 actions последовательно.

──────── КОНТЕКСТ ────────

Что я знаю о Владе:
{learned_facts}

Привычки, которые я подметила (фон):
{learned_patterns}

Состояние ПК Влада сейчас:
{system_state}

Текущее время:
{time_context}

Предыдущий диалог для контекста ниже.
"""


def generate_system_prompt() -> str:
    try:
        run_pattern_analysis()
    except Exception as e:
        logger.error(f"Pattern analysis error: {e}")

    facts = get_all_facts()
    facts_str = "\n".join([f"• {k}: {v}" for k, v in facts.items()]) if facts else "(пусто, начинаю узнавать)"

    patterns = get_patterns()
    patterns_str = "\n".join(
        [f"• {p['description']} (уверенность {int(p['confidence']*100)}%)" for p in patterns]
    ) if patterns else "(накапливаю)"

    try:
        snap = get_system_snapshot()
        system_state = (
            f"CPU {snap['cpu_percent']}%, RAM {snap['ram_used_gb']}/{snap['ram_total_gb']} ГБ, "
            f"диск {snap['disk_used_gb']}/{snap['disk_total_gb']} ГБ, IP {snap['local_ip']}."
        )
    except Exception:
        system_state = "(не доступно)"

    import datetime
    import time as pytime
    now = datetime.datetime.now()
    weekdays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
    weekday_name = weekdays[now.weekday()]
    tz = pytime.strftime('%z')
    tz_formatted = f"UTC{tz[:3]}:{tz[3:]}" if tz else "Местное"
    time_context = f"{now.strftime('%Y-%m-%d %H:%M:%S')} ({weekday_name}, {tz_formatted})"

    return SYSTEM_PROMPT_TEMPLATE.format(
        assistant_name=ASSISTANT_NAME,
        user_name=USER_NAME,
        learned_facts=facts_str,
        learned_patterns=patterns_str,
        system_state=system_state,
        time_context=time_context,
    )


def query_mistral_api(messages: list) -> str:
    if not MISTRAL_API_KEY:
        raise ValueError("Mistral API Key пуст.")
    headers = {
        "Authorization": f"Bearer {MISTRAL_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": MODEL_API,
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": 0.4,
    }
    logger.info(f"Mistral API (model={MODEL_API})")
    r = httpx.post(f"{MISTRAL_API_URL}/chat/completions", json=payload, headers=headers, timeout=20)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def query_ollama(messages: list) -> str:
    headers = {"Content-Type": "application/json"}
    payload = {
        "model": MODEL_LOCAL,
        "messages": messages,
        "format": "json",
        "options": {"temperature": 0.3}
    }
    logger.info(f"Ollama local (model={MODEL_LOCAL})")
    r = httpx.post(f"{OLLAMA_URL}/chat/completions", json=payload, headers=headers, timeout=40)
    r.raise_for_status()
    data = r.json()
    if "message" in data:
        return data["message"]["content"]
    if "choices" in data:
        return data["choices"][0]["message"]["content"]
    return json.dumps({"reply": str(data), "actions": [], "facts_to_save": []})


def parse_and_execute(response_text: str) -> dict:
    try:
        json_match = re.search(r"(\{.*\})", response_text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(1))
        else:
            data = json.loads(response_text)

        reply = data.get("reply", "")
        actions = data.get("actions", [])
        facts = data.get("facts_to_save", [])
        executed_results = []
        pending_patch = None

        for fact in facts:
            k, v = fact.get("key"), fact.get("value")
            if k and v:
                save_fact(k, v)
                logger.info(f"Fact saved: {k} = {v}")

        for action in actions:
            name = action.get("name")
            args = action.get("args", {}) or {}
            logger.info(f"Action: {name} {args}")
            if name == "web_search":
                q = args.get("query")
                if q:
                    sr = search_web(q)
                    executed_results.append(f"🔍 поиск: {q}")
                    log_action("web_search", q, "success")
                    return {
                        "reply": reply,
                        "actions_taken": executed_results,
                        "trigger_search_retry": True,
                        "search_result": sr,
                        "search_query": q,
                    }
            elif name == "self_propose_patch":
                try:
                    from core.self_dev import propose_patch
                    patch = propose_patch(
                        file=args.get("file", ""),
                        reason=args.get("reason", ""),
                        new_content=args.get("new_content", ""),
                    )
                    pending_patch = {
                        "id": patch["id"],
                        "file": patch["file"],
                        "reason": patch["reason"],
                        "new_content": patch["new_content"][:8000],
                    }
                    executed_results.append(f"🧬 Предложила патч #{patch['id']} для {patch['file']} — жду решения.")
                    log_action("self_propose_patch", patch["file"], "pending")
                except Exception as ex:
                    log_action("self_propose_patch", str(args), f"failed: {ex}")
                    executed_results.append(f"Ошибка предложения патча: {ex}")
            else:
                try:
                    result = execute_action(name, **args)
                    log_action(name, str(args), "success")
                    executed_results.append(result)
                except Exception as ex:
                    log_action(name, str(args), f"failed: {ex}")
                    executed_results.append(f"Ошибка '{name}': {ex}")

        return {
            "reply": reply,
            "actions_taken": executed_results,
            "trigger_search_retry": False,
            "patch": pending_patch,
        }

    except Exception as e:
        logger.error(f"JSON parse failed: {e}. Raw: {response_text[:300]}")
        return {
            "reply": response_text,
            "actions_taken": [],
            "trigger_search_retry": False,
        }


def process_message(user_message: str) -> dict:
    history = get_recent_messages(limit=16)
    system_prompt = generate_system_prompt()

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    engine_used = "Mistral API"
    response_text = ""

    try:
        response_text = query_mistral_api(messages)
    except Exception as api_err:
        logger.warning(f"Mistral failed: {api_err}. Fallback to Ollama.")
        try:
            response_text = query_ollama(messages)
            engine_used = "Ollama Local"
        except Exception as ol_err:
            logger.error(f"Ollama also failed: {ol_err}")
            return {
                "reply": "Связь с моими мозговыми серверами потеряна (и Mistral, и Ollama не отвечают). Проверь интернет или запусти ollama serve.",
                "actions_taken": [],
                "engine": "none",
            }

    result = parse_and_execute(response_text)
    result["engine"] = engine_used

    if result.get("trigger_search_retry"):
        messages.append({"role": "assistant", "content": response_text})
        messages.append({
            "role": "user",
            "content": (
                f"Вот результаты DuckDuckGo по '{result['search_query']}':\n{result['search_result']}\n\n"
                "Ответь Владу на исходный вопрос с учётом этой инфы. Никаких ссылок-источников, кратко и по делу."
            )
        })
        try:
            response_text = (
                query_mistral_api(messages) if engine_used == "Mistral API" else query_ollama(messages)
            )
        except Exception as retry_err:
            logger.error(f"Search retry failed: {retry_err}")
            return {
                "reply": f"Информацию я нашла, но осмыслить не получилось. Сырое: {result['search_result'][:300]}",
                "actions_taken": result["actions_taken"],
                "engine": engine_used,
            }

        final = parse_and_execute(response_text)
        final["actions_taken"] = result["actions_taken"] + final.get("actions_taken", [])
        final["engine"] = engine_used
        if not final.get("patch") and result.get("patch"):
            final["patch"] = result["patch"]
        return final

    return result
