# клиент сервера qwen_tts: python3 clone25.py <голос> <порт> <сид> [ключи]
import json, sys, time, os, urllib.request
H = os.path.dirname(os.path.abspath(__file__))
# рабочий каталог v25: $V25 (по умолчанию $TTS/v25); phr25.json — из phr25.py
ROOT = os.environ.get('V25') or os.path.join(os.environ.get('TTS', '/data/tts'), 'v25')
P = json.load(open(os.path.join(ROOT, 'phr25.json'), encoding='utf-8'))['phr']
voice, port, seed = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
keys = sys.argv[4].split(',') if len(sys.argv) > 4 and sys.argv[4] else list(P[voice])
od = os.path.join(ROOT, 'clone', voice); os.makedirs(od, exist_ok=True)
for k in keys:
    out = '%s/%s_s%d.wav' % (od, k, seed)
    if os.path.exists(out): continue
    text = P[voice][k]
    body = {'text': text, 'language': 'Russian', 'seed': seed, 'max_new_tokens': 24 + int(1.5 * len(text))}
    req = urllib.request.Request('http://127.0.0.1:%d/v1/tts' % port, data=json.dumps(body, ensure_ascii=False).encode(), headers={'Content-Type': 'application/json'})
    t = time.time()
    try: data = urllib.request.urlopen(req, timeout=600).read()
    except Exception as e: print(k, 'ERR', e, flush=True); continue
    open(out + '.tmp', 'wb').write(data); os.replace(out + '.tmp', out)
    print(k, round(time.time() - t, 1), len(data), flush=True)
