# AEGIS v26: клиент сервера qwen_tts — python3 client26.py <порт> <jobs.json>; jobs: [{out,text,seed,[temperature],[emotion]}]
import json, sys, time, os, urllib.request
port, jobs = int(sys.argv[1]), json.load(open(sys.argv[2], encoding='utf-8'))
for j in jobs:
    out = j['out']
    if os.path.exists(out): continue
    body = {'text': j['text'], 'language': 'Russian', 'seed': j.get('seed', 1), 'max_new_tokens': 24 + int(1.6 * len(j['text']))}
    for k in ('temperature', 'top_k', 'top_p', 'rep_penalty', 'emotion', 'rate'):
        if k in j: body[k] = j[k]
    req = urllib.request.Request('http://127.0.0.1:%d/v1/tts' % port, data=json.dumps(body, ensure_ascii=False).encode(), headers={'Content-Type': 'application/json'})
    t = time.time()
    try: data = urllib.request.urlopen(req, timeout=600).read()
    except Exception as e: print(os.path.basename(out), 'ERR', e, flush=True); continue
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out + '.tmp', 'wb').write(data); os.replace(out + '.tmp', out)
    print(os.path.basename(out), round(time.time() - t, 1), flush=True)
