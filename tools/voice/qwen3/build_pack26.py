# AEGIS v26 — сборка assets/snd/voice_pack.js из дублей Qwen3-TTS (фразы — phr26.py, дубли — gen26.sh).
# Для каждой фразы берётся лучший дубль по check26.score: совпадение распознанного текста (Vosk),
# ударения (качество гласных по распознанным фонемам), естественный темп; при равенстве — меньший сид.
# Обработка мягче, чем в v25 (там 3:1 и +2,5 дБ «рации» делали голос плоским и «цифровым»):
# срез 80 Гц, −1 дБ@250 Гц (бубнёж), +1,5 дБ@3 кГц, −1,5 дБ@7,5 кГц, компрессор 2:1, мягкий лимит;
# громкость речи −17 дБFS, реплики «на взводе» (meta.urgent) −15,5 дБFS, шёпот (whisper.py) −21 дБFS.
# Кодек — Opus 24 кГц ~32 кбит/с VBR (MP3 40 кбит/с v25 давал «звон» на шипящих и смазывал атаки).
#   python3 build_pack26.py [выход.js]     (V26=/data/tts/v26 по умолчанию)
import os, sys, json, glob, base64, subprocess
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from whisper import whisper
from check26 import score
ROOT = os.environ.get('V26') or os.path.join(os.environ.get('TTS', '/data/tts'), 'v26')
GEN = os.path.join(ROOT, 'gen'); OUT = os.path.join(ROOT, 'pack_out')
DST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', '..', 'assets', 'snd', 'voice_pack.js')
PH = json.load(open(os.path.join(ROOT, 'phr26.json'), encoding='utf-8'))
PHR, META = PH['phr'], PH['meta']
VOICES = [('grom', 'Гром — низкий бас, командир'), ('hrip', 'Хрип — сиплый баритон, сержант'),
          ('sokol', 'Сокол — молодой тенор'), ('tihiy', 'Тихий — ровный баритон, связист')]
SR = 24000; KBPS = os.environ.get('KBPS', '32k')
CHAIN = ('highpass=f=80:p=2,equalizer=f=250:t=q:w=1.0:g=-1,equalizer=f=3000:t=q:w=1.2:g=1.5,'
         'equalizer=f=7500:t=q:w=1.2:g=-1.5,acompressor=threshold=0.1:ratio=2:attack=6:release=120:knee=6')
CHAIN_W = 'highpass=f=160:p=2,equalizer=f=3000:t=q:w=1.1:g=1.5,equalizer=f=8000:t=q:w=1.2:g=-3'
WH, URG = set(META['whisper']), set(META['urgent'])

def ff(a, sr, chain):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-', '-af', chain, '-f', 'f32le', '-'],
                       input=a.astype(np.float32).tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)

def frames(a, w):
    n = len(a) // w
    return np.array([np.sqrt(np.mean(a[i * w:(i + 1) * w] ** 2) + 1e-12) for i in range(n)])

def process(src, dst, wh, urg):
    a, sr = sf.read(src)
    if a.ndim > 1: a = a.mean(1)
    if sr != SR: raise SystemExit('ожидается 24 кГц: ' + src)
    a = a - np.mean(a)
    w = int(sr * 0.01); e = frames(a, w); pk = e.max()
    act = np.where(e > pk * 0.025)[0]
    s0 = max(0, act[0] * w - int(0.04 * sr)); s1 = min(len(a), (act[-1] + 1) * w + int(0.12 * sr))
    a = a[s0:s1]
    a = np.concatenate([np.zeros(int(0.02 * sr)), a, np.zeros(int(0.06 * sr))])
    if wh:
        a = whisper(a, sr, seed=len(a)); a = ff(a, sr, CHAIN_W); target = -21
    else:
        a = ff(a, sr, CHAIN); target = -15.5 if urg else -17
    e = frames(a, w); pk = e.max(); sp = e[e > pk * 0.08]
    rms = np.sqrt(np.mean(sp ** 2)) if len(sp) else pk
    a = a * (10 ** (target / 20) / max(rms, 1e-6))
    m = np.abs(a); k = m > 0.72
    a[k] = np.sign(a[k]) * (0.72 + 0.2 * np.tanh((m[k] - 0.72) / 0.2))
    fi, fo = int(0.004 * sr), int(0.035 * sr)
    a[:fi] *= np.linspace(0, 1, fi); a[-fo:] *= np.linspace(1, 0, fo)
    tmp = dst[:-4] + '.wav'
    sf.write(tmp, a.astype(np.float32), sr, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-map_metadata', '-1', '-ac', '1', '-c:a', 'libopus', '-b:a', KBPS,
                    '-vbr', 'on', '-application', 'audio', '-frame_duration', '20', dst], check=True)
    os.remove(tmp)
    return round(len(a) / sr, 3)

def main():
    C = json.load(open(os.path.join(GEN, 'check26.json'), encoding='utf-8'))
    durs = {}; report = []
    for vid, desc in VOICES:
        os.makedirs(os.path.join(OUT, vid), exist_ok=True); durs[vid] = {}
        for key in PHR[vid]:
            takes = sorted(glob.glob(os.path.join(GEN, vid, key + '_s*.wav')))
            if not takes: raise SystemExit('нет дубля: %s/%s' % (vid, key))
            sc = C.get(vid + '/' + key, {})
            def rank(t):
                seed = t.rsplit('_s', 1)[1][:-4]
                return (score(sc.get(seed)), -int(seed))
            best = max(takes, key=rank); seed = best.rsplit('_s', 1)[1][:-4]
            durs[vid][key] = process(best, os.path.join(OUT, vid, key + '.ogg'), key in WH, key in URG)
            x = sc.get(seed) or {}
            report.append((vid, key, seed, len(takes), x.get('r'), x.get('serr'), x.get('cps'), ' '.join(x.get('errs') or []), x.get('got')))
        print(vid, 'ok', len(durs[vid]), flush=True)
    with open(os.path.join(OUT, 'report.tsv'), 'w', encoding='utf-8') as f:
        f.write('voice\tkey\tseed\ttakes\tr\tserr\tcps\tstress\tasr\n')
        for r in report: f.write('\t'.join(str(v) for v in r) + '\n')
    ids = [v for v, _ in VOICES]
    out = ['/* AEGIS v26 — голоса бойцов (js/polygon/31c_voice.js): доклады, радиообмен по правилам («Второй, я Первый.',
           '   Приём.» — «Второй на приёме.» — … — «Принял. Конец связи.»), армейский обиход («двухсотый», «трёхсотый»,',
           '   «минус», «плюс», «БК»), разговоры вполголоса и шёпот. Синтез офлайн: Qwen3-TTS (Apache-2.0), C-движок',
           '   qwen3-tts (MIT), четыре голоса: ' + '; '.join(d for _, d in VOICES) + '.',
           '   Реплики «на взводе» (V.meta.urgent) — дублем с x-vector, сдвинутым к крику. Каждая фраза — лучший из',
           '   2–4 дублей по распознаванию текста и проверке ударений (tools/voice/qwen3/check26.py).',
           '   Формат: V.d["<голос>/<ключ>"] = Ogg Opus base64 (V.fmt), V.tv[голос][ключ] — субтитр, V.u — длительность, с,',
           '   V.meta — сцены (dialog, radio, whisper, urgent). */',
           '(function (V) {',
           'V.ver = 26;',
           "V.fmt = 'opus';",
           'V.sr = %d;' % SR,
           'V.voices = %s;' % json.dumps(ids),
           'V.tv = %s;' % json.dumps({v: PHR[v] for v in ids}, ensure_ascii=False, separators=(',', ':')),
           'V.u = %s;' % json.dumps(durs, separators=(',', ':')),
           'V.meta = %s;' % json.dumps(META, ensure_ascii=False, separators=(',', ':')),
           'V.d = {};']
    n = size = 0
    for vid in ids:
        for key in sorted(PHR[vid]):
            b = open(os.path.join(OUT, vid, key + '.ogg'), 'rb').read(); size += len(b); n += 1
            out.append('V.d["%s/%s"]="%s";' % (vid, key, base64.b64encode(b).decode()))
    out.append('})(self.__VOICE_DATA = self.__VOICE_DATA || {});')
    open(DST, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    print('clips', n, 'opus bytes', size, '->', DST, os.path.getsize(DST))

if __name__ == '__main__':
    main()
