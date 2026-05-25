import os
import logging
import uuid
from datetime import datetime
from werkzeug.utils import secure_filename
from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit

from config import SERVER_HOST, SERVER_PORT, USER_NAME, ASSISTANT_NAME
from core.memory import (
    add_message, get_recent_messages, get_action_logs,
    get_all_facts, delete_fact, save_fact,
    get_notifications, mark_notifications_seen, push_notification,
)
from core.brain import process_message
from core.patterns import get_patterns, toggle_pattern
from core.self_dev import (
    list_modules as self_list_modules,
    read_own_module,
    get_pending_patch,
    apply_pending_patch,
    discard_pending_patch,
    list_history as self_list_history,
)

try:
    from core.monitor import start_monitoring
except Exception as mon_err:
    _mon_err_msg = str(mon_err)
    def start_monitoring():
        logging.warning(f"Monitoring disabled (Windows/pywin32 not available): {_mon_err_msg}")

from core.system_info import get_system_snapshot, get_top_processes
from core.notes import (
    save_note as notes_save, list_notes as notes_list, delete_note,
    add_reminder, list_reminders, delete_reminder,
)
from core.briefing import build_briefing
from core.scheduler import start_scheduler, on_reminder

logger = logging.getLogger("SredaApp")

app = Flask(__name__)
app.config['SECRET_KEY'] = 'sreda-secret-key-12345!'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")


# ───────────── UI ─────────────

@app.route('/')
def index():
    return render_template('index.html', user_name=USER_NAME, assistant_name=ASSISTANT_NAME)


# ───────────── REST API ─────────────

@app.route('/api/logs')
def api_logs():
    return jsonify(get_action_logs(limit=80))


@app.route('/api/facts', methods=['GET'])
def api_facts():
    facts = get_all_facts()
    return jsonify([{"key": k, "value": v} for k, v in facts.items()])


@app.route('/api/facts/save', methods=['POST'])
def api_facts_save():
    d = request.json or {}
    if d.get("key") and d.get("value"):
        save_fact(d["key"], d["value"])
        return jsonify({"status": "success"})
    return jsonify({"status": "error", "message": "key/value missing"}), 400


@app.route('/api/facts/delete', methods=['POST'])
def api_facts_delete():
    d = request.json or {}
    if d.get("key"):
        delete_fact(d["key"])
        return jsonify({"status": "success"})
    return jsonify({"status": "error", "message": "key missing"}), 400


@app.route('/api/patterns', methods=['GET'])
def api_patterns():
    return jsonify(get_patterns())


@app.route('/api/patterns/toggle', methods=['POST'])
def api_patterns_toggle():
    d = request.json or {}
    if d.get("id") is not None:
        toggle_pattern(d["id"], d.get("active", 0))
        return jsonify({"status": "success"})
    return jsonify({"status": "error"}), 400


@app.route('/api/reports/<period>')
def api_reports(period):
    from core.reports import get_real_reports
    try:
        return jsonify(get_real_reports(period))
    except Exception as e:
        return jsonify({"title": "Ошибка", "apps": {}, "sites": {}, "summary": f"Ошибка: {e}"})


@app.route('/api/system')
def api_system():
    snap = get_system_snapshot()
    snap["top_processes"] = get_top_processes(6)
    return jsonify(snap)


@app.route('/api/notes', methods=['GET'])
def api_notes_list():
    q = request.args.get("q", "")
    return jsonify(notes_list(50, q))


@app.route('/api/notes', methods=['POST'])
def api_notes_create():
    d = request.json or {}
    if not d.get("title") and not d.get("body"):
        return jsonify({"status": "error", "message": "title or body required"}), 400
    nid = notes_save(d.get("title", "Заметка"), d.get("body", ""), d.get("tags", ""))
    return jsonify({"status": "ok", "id": nid})


@app.route('/api/notes/<int:nid>', methods=['DELETE'])
def api_notes_delete(nid):
    delete_note(nid)
    return jsonify({"status": "ok"})


@app.route('/api/reminders', methods=['GET'])
def api_reminders_list():
    show_all = request.args.get("all") == "1"
    return jsonify(list_reminders(include_done=show_all))


@app.route('/api/reminders', methods=['POST'])
def api_reminders_create():
    d = request.json or {}
    r = add_reminder(
        text=d.get("text", ""),
        fire_at_iso=d.get("fire_at", ""),
        relative=d.get("relative", "")
    )
    return jsonify(r)


@app.route('/api/reminders/<int:rid>', methods=['DELETE'])
def api_reminders_delete(rid):
    delete_reminder(rid)
    return jsonify({"status": "ok"})


@app.route('/api/notifications')
def api_notifications():
    unseen = request.args.get("unseen") == "1"
    return jsonify(get_notifications(unseen_only=unseen, limit=30))


@app.route('/api/notifications/seen', methods=['POST'])
def api_notifications_seen():
    mark_notifications_seen()
    return jsonify({"status": "ok"})


@app.route('/api/briefing')
def api_briefing():
    city = request.args.get("city", "")
    return jsonify(build_briefing(city))


# ───────────── Image upload ─────────────

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}


@app.route('/api/upload', methods=['POST'])
def api_upload():
    if 'image' not in request.files:
        return jsonify({"status": "error", "message": "no file"}), 400
    f = request.files['image']
    if not f or not f.filename:
        return jsonify({"status": "error", "message": "empty file"}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXT:
        return jsonify({"status": "error", "message": f"unsupported type {ext}"}), 400
    safe = secure_filename(f.filename) or f"image{ext}"
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique = f"{ts}_{uuid.uuid4().hex[:8]}_{safe}"
    out_path = os.path.join(UPLOAD_DIR, unique)
    try:
        f.save(out_path)
    except Exception as e:
        return jsonify({"status": "error", "message": f"save failed: {e}"}), 500
    url = f"/static/uploads/{unique}"
    return jsonify({"status": "ok", "url": url, "filename": unique})


# ───────────── Self-dev ─────────────

@app.route('/api/self/modules')
def api_self_modules():
    try:
        mods = self_list_modules()
        return jsonify({"status": "ok", "modules": mods})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e), "modules": []}), 500


@app.route('/api/self/module')
def api_self_module():
    path = request.args.get("path", "")
    try:
        src = read_own_module(path)
        return jsonify({"status": "ok", "path": path, "source": src})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route('/api/self/history')
def api_self_history():
    return jsonify(self_list_history(limit=50))


# ───────────── WebSocket ─────────────

@socketio.on('user_message')
def handle_user_message(data):
    data = data or {}
    text = (data.get('message') or '').strip()
    image_url = (data.get('image_url') or '').strip()
    if not text and not image_url:
        return
    log_text = text or f"[картинка] {image_url}"
    add_message("user", log_text)
    emit('msg_status', {'status': 'typing'})
    try:
        prompt = text
        if image_url:
            prompt = (text + "\n\n" if text else "") + f"(Влад приложил картинку: {image_url}. Учти, что глазами я её увидеть не могу, но он может ссылаться на неё.)"
        result = process_message(prompt or "Опиши вложение.")
        reply = result.get("reply", "")
        actions = result.get("actions_taken", [])
        engine = result.get("engine", "Mistral")
        patch = result.get("patch")
        add_message("assistant", reply)
        payload = {
            'reply': reply,
            'actions': actions,
            'engine': engine,
        }
        if patch:
            payload['patch'] = patch
        emit('assistant_message', payload)
    except Exception as e:
        logger.error(f"Brain failure: {e}")
        emit('assistant_message', {
            'reply': f"Сбой в моём мозгу: {e}",
            'actions': [],
            'engine': 'Error',
        })


@socketio.on('patch_decision')
def handle_patch_decision(data):
    d = data or {}
    pid_raw = d.get("id")
    action = (d.get("action") or "").lower().strip()
    try:
        pid = int(pid_raw)
    except (TypeError, ValueError):
        emit('patch_resolved', {"status": "error", "message": "id некорректен."})
        return
    if action == "apply":
        res = apply_pending_patch(pid)
        if res.get("status") == "ok":
            msg = f"Применила изменение в {res.get('file')}. Резервная копия — {res.get('backup')}. Перезапусти меня (или перезагрузи модуль), чтобы новый код заработал."
            add_message("assistant", msg)
            emit('patch_resolved', {"status": "ok", "id": pid, "message": msg})
        else:
            emit('patch_resolved', {"status": "error", "id": pid, "message": res.get("message", "Не получилось.")})
    elif action == "discard":
        res = discard_pending_patch(pid)
        msg = "Хорошо, отменила предложение."
        add_message("assistant", msg)
        emit('patch_resolved', {"status": res.get("status", "ok"), "id": pid, "message": msg})
    else:
        emit('patch_resolved', {"status": "error", "message": f"неизвестное действие {action}"})


@socketio.on('connect')
def handle_connect():
    history = get_recent_messages(limit=20)
    emit('chat_history', history)


def _broadcast_reminder(reminder):
    """Pushed when a reminder fires (called by scheduler)."""
    try:
        socketio.emit('reminder_fired', {
            "id": reminder["id"],
            "text": reminder["text"],
            "fire_at": reminder["fire_at"],
        })
    except Exception as e:
        logger.error(f"Reminder broadcast failed: {e}")


# ───────────── Run ─────────────

if __name__ == '__main__':
    print("=" * 56)
    print(f"  «{ASSISTANT_NAME}» в эфире, {USER_NAME}!")
    print(f"  ПК:        http://localhost:{SERVER_PORT}")
    print(f"  Телефон:   http://<IP_твоего_ПК>:{SERVER_PORT}")
    print("=" * 56)

    try:
        start_monitoring()
    except Exception as e:
        print(f"Мониторинг не стартовал: {e}")

    try:
        on_reminder(_broadcast_reminder)
        start_scheduler()
    except Exception as e:
        print(f"Планировщик не стартовал: {e}")

    socketio.run(app, host=SERVER_HOST, port=SERVER_PORT, debug=False, allow_unsafe_werkzeug=True)
