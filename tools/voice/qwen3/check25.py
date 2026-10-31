# python3 check25.py <голоса> <сид> [ключи] — Vosk-распознавание + темп; пишет check/asr25_s<сид>_<голоса>.json
import sys, os, json, re, difflib
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
os.environ.setdefault('TTS', '/data/tts')
# рабочий каталог v25: $V25 (по умолчанию $TTS/v25)
H = os.environ.get('V25') or os.path.join(os.environ['TTS'], 'v25')
from asr import rec
P = json.load(open(os.path.join(H, 'phr25.json'), encoding='utf-8'))['phr']
def norm(s):
    s = s.lower().replace('ё', 'е'); s = re.sub(r'[^а-яa-z0-9 ]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()
voices = sys.argv[1].split(',') if len(sys.argv) > 1 else ['grom', 'hrip', 'sokol', 'tihiy']
seed = sys.argv[2] if len(sys.argv) > 2 else '1'
os.makedirs(os.path.join(H, 'check'), exist_ok=True)
res = {}
for v in voices:
    keys = sys.argv[3].split(',') if len(sys.argv) > 3 and sys.argv[3] else list(P[v])
    for k in keys:
        p = os.path.join(H, 'clone', v, f'{k}_s{seed}.wav')
        if not os.path.exists(p): continue
        a, sr = sf.read(p)
        if a.ndim > 1: a = a.mean(1)
        w = int(sr * 0.02); n = len(a) // w
        e = np.array([np.sqrt(np.mean(a[i*w:(i+1)*w]**2) + 1e-12) for i in range(n)]) if n else np.zeros(1)
        pk = e.max() if n else 1e-6
        act = np.where(e > pk * 0.01)[0]
        sp = ((act[-1] - act[0] + 1) * 0.02) if len(act) else 0
        got = norm(rec(p)); exp = norm(P[v][k])
        r = difflib.SequenceMatcher(None, exp, got).ratio(); cps = len(exp) / max(sp, 0.1)
        res[f'{v}/{k}'] = dict(r=round(r, 3), got=got, exp=exp, dur=round(len(a)/sr, 2), speech=round(sp, 2), cps=round(cps, 1))
        print(f'{v}/{k}: r={r:.2f} sp={sp:.2f}s cps={cps:.1f} | {got}', flush=True)
json.dump(res, open(os.path.join(H, 'check', f'asr25_s{seed}_{"_".join(voices)}.json'), 'w'), ensure_ascii=False, indent=1)
bad = {k: x for k, x in res.items() if x['r'] < 0.72 or x['cps'] > 22 or x['cps'] < 6}
print('BAD', len(bad))
for k, x in sorted(bad.items()): print(' ', k, x['r'], x['cps'], '|', x['exp'], '→', x['got'])
