# Клиент сервера qwen_tts: python3 clone.py <голос> <порт> <сид> [ключи] → $TTS/clone/<голос>/<ключ>_s<сид>.wav
import json, sys, time, os, urllib.request, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__)); TTS = os.environ.get('TTS', '/data/tts')
spec = importlib.util.spec_from_file_location('phr', os.path.join(HERE, 'phr.py')); P = importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
PHR = P.PHR
voice, port, seed = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
keys = sys.argv[4].split(',') if len(sys.argv) > 4 and sys.argv[4] else list(PHR)
od = os.path.join(TTS, 'clone', voice); os.makedirs(od, exist_ok=True)
for k in keys:
    out = '%s/%s_s%d.wav' % (od, k, seed)
    if os.path.exists(out): continue
    text = PHR[k]
    body = {'text': text, 'language': 'Russian', 'seed': seed, 'max_new_tokens': 24 + int(1.5 * len(text))}
    req = urllib.request.Request('http://127.0.0.1:%d/v1/tts' % port, data=json.dumps(body, ensure_ascii=False).encode(),
                                 headers={'Content-Type': 'application/json'})
    t = time.time()
    try: data = urllib.request.urlopen(req, timeout=600).read()
    except Exception as e: print(k, 'ERR', e, flush=True); continue
    open(out + '.tmp', 'wb').write(data); os.replace(out + '.tmp', out)
    print(k, round(time.time() - t, 1), len(data), flush=True)
