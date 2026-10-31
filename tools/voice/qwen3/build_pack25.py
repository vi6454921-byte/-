# AEGIS v25 — сборка assets/snd/voice_pack.js из клонов Qwen3-TTS (фразы — phr25.py).
# Вход: <CLONE>/<голос>/<ключ>_s<сид>.wav (24 кГц) + отчёты Vosk check/asr25_s<сид>_*.json.
# Для каждой фразы — дубль с лучшим совпадением распознанного текста (и нормальным темпом).
# Обработка обычной речи — как в v24: срез 85 Гц, EQ, компрессор 3:1, −17 дБFS, мягкий лимит.
# Шёпот (meta.whisper): whisper.py — речь без голосовых связок (шумовое возбуждение огибающей),
# затем тот же EQ без компрессии, −21 дБFS. MP3 24 кГц 40 кбит/с, моно.
import os, sys, json, glob, base64, subprocess
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from whisper import whisper
ROOT = os.environ.get('V25') or os.path.join(os.environ.get('TTS', '/data/tts'), 'v25')
CLONE = os.path.join(ROOT, 'clone'); CHECK = os.path.join(ROOT, 'check'); OUT = os.path.join(ROOT, 'pack_out')
DST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', '..', 'assets', 'snd', 'voice_pack.js')
PH = json.load(open(os.path.join(ROOT, 'phr25.json'), encoding='utf-8'))
PHR, META = PH['phr'], PH['meta']
VOICES = [('grom', 'Гром — низкий бас, командир'), ('hrip', 'Хрип — сиплый баритон, сержант'),
          ('sokol', 'Сокол — молодой тенор'), ('tihiy', 'Тихий — ровный баритон, связист')]
SR = 24000
CHAIN = ('highpass=f=85:p=2,equalizer=f=200:t=q:w=0.9:g=-1.5,equalizer=f=3000:t=q:w=1.1:g=2.5,'
         'equalizer=f=7500:t=q:w=1.2:g=-1.5,acompressor=threshold=0.1:ratio=3:attack=4:release=90:knee=4')
CHAIN_W = 'highpass=f=160:p=2,equalizer=f=3000:t=q:w=1.1:g=1.5,equalizer=f=8000:t=q:w=1.2:g=-3'
WH = set(META['whisper'])

def scores():
    S = {}
    for f in glob.glob(os.path.join(CHECK, 'asr25_s*_*.json')):
        seed = os.path.basename(f).split('_')[1][1:]
        for k, x in json.load(open(f, encoding='utf-8')).items():
            S.setdefault(k, {})[seed] = x
    return S

def ff(a, sr, chain):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-', '-af', chain, '-f', 'f32le', '-'],
                       input=a.astype(np.float32).tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)

def frames(a, w):
    n = len(a) // w
    return np.array([np.sqrt(np.mean(a[i * w:(i + 1) * w] ** 2) + 1e-12) for i in range(n)])

def process(src, mp3, wh):
    a, sr = sf.read(src)
    if a.ndim > 1: a = a.mean(1)
    if sr != SR: raise SystemExit('ожидается 24 кГц: ' + src)
    a = a - np.mean(a)
    w = int(sr * 0.01); e = frames(a, w); pk = e.max()
    act = np.where(e > pk * 0.025)[0]
    s0 = max(0, act[0] * w - int(0.04 * sr)); s1 = min(len(a), (act[-1] + 1) * w + int(0.10 * sr))
    a = a[s0:s1]
    a = np.concatenate([np.zeros(int(0.02 * sr)), a, np.zeros(int(0.05 * sr))])
    if wh:
        a = whisper(a, sr, seed=len(a))
        a = ff(a, sr, CHAIN_W); target = -21
    else:
        a = ff(a, sr, CHAIN); target = -17
    e = frames(a, w); pk = e.max(); sp = e[e > pk * 0.08]
    rms = np.sqrt(np.mean(sp ** 2)) if len(sp) else pk
    a = a * (10 ** (target / 20) / max(rms, 1e-6))
    m = np.abs(a); k = m > 0.7
    a[k] = np.sign(a[k]) * (0.7 + 0.2 * np.tanh((m[k] - 0.7) / 0.2))
    fi, fo = int(0.004 * sr), int(0.03 * sr)
    a[:fi] *= np.linspace(0, 1, fi); a[-fo:] *= np.linspace(1, 0, fo)
    tmp = mp3[:-4] + '.wav'
    sf.write(tmp, a.astype(np.float32), sr, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-ar', str(SR), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '40k', mp3], check=True)
    os.remove(tmp)
    return round(len(a) / sr, 3)

def main():
    S = scores(); durs = {}; report = []
    for vid, desc in VOICES:
        os.makedirs(os.path.join(OUT, vid), exist_ok=True); durs[vid] = {}
        for key in PHR[vid]:
            takes = sorted(glob.glob(os.path.join(CLONE, vid, key + '_s*.wav')))
            if not takes: raise SystemExit('нет дубля: %s/%s' % (vid, key))
            sc = S.get(vid + '/' + key, {})
            def rank(t):
                seed = t.rsplit('_s', 1)[1][:-4]; x = sc.get(seed)
                if not x: return (0, -int(seed))
                return (x['r'] + (0.2 if 6 <= x['cps'] <= 22 else 0), -int(seed))
            best = max(takes, key=rank); seed = best.rsplit('_s', 1)[1][:-4]
            durs[vid][key] = process(best, os.path.join(OUT, vid, key + '.mp3'), key in WH)
            x = sc.get(seed) or {}
            report.append((vid, key, seed, x.get('r'), x.get('got')))
        print(vid, 'ok', len(durs[vid]), flush=True)
    with open(os.path.join(OUT, 'report.tsv'), 'w', encoding='utf-8') as f:
        for r in report: f.write('\t'.join(str(v) for v in r) + '\n')
    ids = [v for v, _ in VOICES]
    out = ['/* AEGIS v25 — голоса бойцов (js/polygon/31c_voice.js): доклады, переговоры по рации, разговоры',
           '   вполголоса и шёпот рядом с бойцами. Синтез офлайн: Qwen3-TTS (Apache-2.0) через C-движок qwen3-tts (MIT),',
           '   четыре клонированных голоса: ' + '; '.join(d for _, d in VOICES) + '.',
           '   Фразы — tools/voice/qwen3/phr25.py: направление относительно слушателя («слева, метров сто»),',
           '   без азимутов и жаргона «двухсотый/трёхсотый». Шёпот — whisper.py (речь без голосовых связок).',
           '   Обработка ffmpeg без сдвига высоты; MP3 24 кГц 40 кбит/с. Формат: V.d["<голос>/<ключ>"] = MP3 base64,',
           '   V.tv[голос][ключ] — текст (субтитры), V.u — длительность, V.meta — сцены. */',
           '(function (V) {',
           'V.ver = 25;',
           'V.sr = %d;' % SR,
           'V.voices = %s;' % json.dumps(ids),
           'V.tv = %s;' % json.dumps({v: PHR[v] for v in ids}, ensure_ascii=False, separators=(',', ':')),
           'V.u = %s;' % json.dumps(durs, separators=(',', ':')),
           'V.meta = %s;' % json.dumps(META, ensure_ascii=False, separators=(',', ':')),
           'V.d = {};']
    n = size = 0
    for vid in ids:
        for key in sorted(PHR[vid]):
            b = open(os.path.join(OUT, vid, key + '.mp3'), 'rb').read(); size += len(b); n += 1
            out.append('V.d["%s/%s"]="%s";' % (vid, key, base64.b64encode(b).decode()))
    out.append('})(self.__VOICE_DATA = self.__VOICE_DATA || {});')
    open(DST, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    print('clips', n, 'mp3 bytes', size, '->', DST, os.path.getsize(DST))

if __name__ == '__main__':
    main()
