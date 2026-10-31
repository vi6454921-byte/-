# 4) Проверка внятности: python3 check_clones.py [голоса через запятую] [сид] [ключи] (Vosk small-ru)
import sys, os, json, re, difflib, subprocess, importlib.util
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__)); TTS = os.environ.get('TTS', '/data/tts'); sys.path.insert(0, HERE)
from asr import rec
spec = importlib.util.spec_from_file_location('phr', os.path.join(HERE, 'phr.py')); P = importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
PHR = P.PHR
def norm(s):
    s = s.lower().replace('ё', 'е')
    s = re.sub(r'[^а-яa-z0-9 ]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()
voices = sys.argv[1].split(',') if len(sys.argv) > 1 else ['grom', 'hrip', 'sokol', 'tihiy']
seed = sys.argv[2] if len(sys.argv) > 2 else '1'
keys = sys.argv[3].split(',') if len(sys.argv) > 3 else list(PHR.keys())
res = {}
for v in voices:
    for k in keys:
        p = os.path.join(TTS, 'clone', v, f'{k}_s{seed}.wav')
        if not os.path.exists(p): continue
        a, sr = sf.read(p)
        if a.ndim > 1: a = a.mean(1)
        dur = len(a) / sr
        # активная речь: окна 20 мс выше -40 дБ от пика
        w = int(sr * 0.02); n = len(a) // w
        e = np.array([np.sqrt(np.mean(a[i*w:(i+1)*w]**2) + 1e-12) for i in range(n)])
        pk = e.max() if n else 1e-6
        act = np.where(e > pk * 0.01)[0]
        sp = ((act[-1] - act[0] + 1) * 0.02) if len(act) else 0
        txt = rec(p)
        exp = norm(PHR[k]); got = norm(txt)
        r = difflib.SequenceMatcher(None, exp, got).ratio()
        cps = len(exp) / max(sp, 0.1)
        res[f'{v}/{k}'] = dict(r=round(r, 3), got=got, exp=exp, dur=round(dur, 2), speech=round(sp, 2), cps=round(cps, 1), peak=round(float(np.abs(a).max()), 3))
        print(f'{v}/{k}: r={r:.2f} sp={sp:.2f}s cps={cps:.1f} | {got}', flush=True)
json.dump(res, open(os.path.join(TTS, 'check', f'asr_s{seed}_{"_".join(voices)}.json'), 'w'), ensure_ascii=False, indent=1)
bad = {k: x for k, x in res.items() if x['r'] < 0.72 or x['cps'] > 22 or x['cps'] < 7}
print('BAD', len(bad))
for k, x in sorted(bad.items()): print(' ', k, x['r'], x['cps'], '|', x['exp'], '→', x['got'])
