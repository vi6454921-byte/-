# AEGIS v24 — сборка assets/snd/voice_pack.js из клонов Qwen3-TTS (см. README.md рядом).
# Вход: <CLONE>/<голос>/<ключ>_s<сид>.wav (24 кГц) + отчёты распознавания check/asr_s<сид>_*.json
# (check_clones.py). Для каждой фразы берётся дубль с лучшим совпадением распознанного текста,
# обработка: обрезка тишины, срез 85 Гц, −1,5 дБ на 200 Гц (гул), +2,5 дБ на 3 кГц (разборчивость
# в рации), −1,5 дБ на 7,5 кГц (шипящие), компрессор 3:1, громкость речи −17 дБFS, мягкий лимит,
# MP3 24 кГц 40 кбит/с. Высоту/темп НЕ трогаем (без rubberband) — тембр остаётся живым.
import os, sys, json, glob, base64, subprocess, importlib.util
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__))
CLONE = os.environ.get('QWEN_CLONE_DIR', '/data/tts/clone')
CHECK = os.environ.get('QWEN_CHECK_DIR', '/data/tts/check')
OUT = os.environ.get('QWEN_OUT_DIR', '/data/tts/pack_out')
DST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', '..', 'assets', 'snd', 'voice_pack.js')
VOICES = [('grom', 'Гром — низкий бас, командир, ~170 Гц'), ('hrip', 'Хрип — сиплый баритон, сержант, ~200 Гц'),
          ('sokol', 'Сокол — молодой тенор, ~260 Гц'), ('tihiy', 'Тихий — ровный баритон, связист, ~175 Гц')]
spec = importlib.util.spec_from_file_location('phr', os.path.join(HERE, 'phr.py')); P = importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
PHR = P.PHR
SR = 24000
CHAIN = ('highpass=f=85:p=2,equalizer=f=200:t=q:w=0.9:g=-1.5,equalizer=f=3000:t=q:w=1.1:g=2.5,'
         'equalizer=f=7500:t=q:w=1.2:g=-1.5,acompressor=threshold=0.1:ratio=3:attack=4:release=90:knee=4')

def scores():
    S = {}
    for f in glob.glob(os.path.join(CHECK, 'asr_s*_*.json')):
        seed = os.path.basename(f).split('_')[1][1:]
        for k, x in json.load(open(f)).items():
            S.setdefault(k, {})[seed] = x
    return S

def ff(a, sr, chain):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-', '-af', chain, '-f', 'f32le', '-'],
                       input=a.astype(np.float32).tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)

def frames(a, w):
    n = len(a) // w
    return np.array([np.sqrt(np.mean(a[i * w:(i + 1) * w] ** 2) + 1e-12) for i in range(n)])

def process(src, mp3):
    a, sr = sf.read(src)
    if a.ndim > 1: a = a.mean(1)
    if sr != SR: raise SystemExit('ожидается 24 кГц: ' + src)
    a = a - np.mean(a)
    w = int(sr * 0.01); e = frames(a, w); pk = e.max()
    act = np.where(e > pk * 0.025)[0]
    s0 = max(0, act[0] * w - int(0.04 * sr)); s1 = min(len(a), (act[-1] + 1) * w + int(0.10 * sr))
    a = a[s0:s1]
    a = np.concatenate([np.zeros(int(0.02 * sr)), a, np.zeros(int(0.05 * sr))])     # хвосты для фильтров
    a = ff(a, sr, CHAIN)
    e = frames(a, w); pk = e.max(); sp = e[e > pk * 0.08]
    rms = np.sqrt(np.mean(sp ** 2)) if len(sp) else pk
    a = a * (10 ** (-17 / 20) / max(rms, 1e-6))
    m = np.abs(a); k = m > 0.7
    a[k] = np.sign(a[k]) * (0.7 + 0.2 * np.tanh((m[k] - 0.7) / 0.2))
    fi, fo = int(0.004 * sr), int(0.03 * sr)
    a[:fi] *= np.linspace(0, 1, fi); a[-fo:] *= np.linspace(1, 0, fo)
    tmp = mp3[:-4] + '.wav'
    sf.write(tmp, a.astype(np.float32), sr, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-ar', str(SR), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '40k', mp3], check=True)
    return round(len(a) / sr, 3)

def main():
    S = scores(); meta = {'sr': SR, 'phr': PHR, 'voices': []}; report = []
    for vid, desc in VOICES:
        os.makedirs(os.path.join(OUT, vid), exist_ok=True)
        durs = {}
        for key in PHR:
            takes = sorted(glob.glob(os.path.join(CLONE, vid, key + '_s*.wav')))
            if not takes: raise SystemExit('нет дубля: %s/%s' % (vid, key))
            sc = S.get(vid + '/' + key, {})
            def rank(t):
                seed = t.rsplit('_s', 1)[1][:-4]; x = sc.get(seed)
                if not x: return (0, -int(seed))
                ok = 7 <= x['cps'] <= 22
                return (x['r'] + (0.2 if ok else 0), -int(seed))
            best = max(takes, key=rank)
            seed = best.rsplit('_s', 1)[1][:-4]
            durs[key] = process(best, os.path.join(OUT, vid, key + '.mp3'))
            x = sc.get(seed) or {}
            report.append((vid, key, seed, x.get('r'), x.get('got')))
        meta['voices'].append({'id': vid, 'desc': desc, 'durs': durs})
        print(vid, 'ok', len(durs), flush=True)
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, 'report.tsv'), 'w') as f:
        for r in report: f.write('\t'.join(str(v) for v in r) + '\n')
    ids = [v['id'] for v in meta['voices']]
    out = ['/* AEGIS v24 — голоса бойцов: доклады по рации и окрики (js/polygon/31c_voice.js).',
           '   Синтез офлайн: Qwen3-TTS (Qwen/Alibaba, модели Apache-2.0) через C-движок qwen3-tts (MIT):',
           '   четыре голоса созданы описанием (VoiceDesign 1.7B) и клонированы базовой моделью 0.6B по 88 кадрам образца.',
           '   ' + '; '.join(v['desc'] for v in meta['voices']) + '.',
           '   Обработка ffmpeg без сдвига высоты: срез 85 Гц, EQ, компрессор 3:1, −17 дБFS; MP3 24 кГц 40 кбит/с.',
           '   Пересборка: tools/voice/qwen3 (README.md). Формат: V.d["<голос>/<ключ>"] = MP3 в base64. */',
           '(function (V) {',
           'V.sr = %d;' % SR,
           'V.voices = %s;' % json.dumps(ids),
           'V.t = %s;' % json.dumps(PHR, ensure_ascii=False, separators=(',', ':')),
           'V.u = %s;' % json.dumps({v['id']: v['durs'] for v in meta['voices']}, separators=(',', ':')),
           'V.d = V.d || {};']
    n = size = 0
    for vid in ids:
        for key in sorted(PHR):
            b = open(os.path.join(OUT, vid, key + '.mp3'), 'rb').read(); size += len(b); n += 1
            out.append('V.d["%s/%s"]="%s";' % (vid, key, base64.b64encode(b).decode()))
    out.append('})(self.__VOICE_DATA = self.__VOICE_DATA || {});')
    open(DST, 'w').write('\n'.join(out) + '\n')
    print('clips', n, 'mp3 bytes', size, '->', DST, os.path.getsize(DST))

if __name__ == '__main__':
    main()
