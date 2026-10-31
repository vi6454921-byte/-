# AEGIS v23 · сборка голосового пакета: Piper TTS (офлайн, ru_RU denis/dmitri/ruslan, лицензия моделей — см. README)
# -> обработка ffmpeg (rubberband с сохранением формант, EQ, компрессор) -> MP3 -> assets/snd/voice_pack.js
import io, os, sys, json, wave, base64, subprocess, time
import numpy as np
from piper import PiperVoice, SynthesisConfig

HERE = os.path.dirname(os.path.abspath(__file__))  # модели .onnx/.json и vosk-model-small-ru-0.22 кладутся сюда
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
SR = 16000
NCAND = 3
# голоса: id модели, сдвиг высоты (формант не трогаем), темп речи Piper
VOICES = [
    dict(id='ruslan', pitch=0.93, ls=0.86, ns=0.55),
    dict(id='denis', pitch=0.84, ls=0.84, ns=0.6, n=5),
    dict(id='dmitri', pitch=0.82, ls=0.84, ns=0.6, n=5),
]
WIND = ['север', 'северо-восток', 'восток', 'юго-восток', 'юг', 'юго-запад', 'запад', 'северо-запад']
TENS = {0: '', 10: 'десять', 20: 'двадцать', 30: 'тридцать', 40: 'сорок', 50: 'пятьдесят', 60: 'шестьдесят',
        70: 'семьдесят', 80: 'восемьдесят', 90: 'девяносто'}
HUND = {0: '', 100: 'сто', 200: 'двести', 300: 'триста'}

def words(n):
    if n == 0: return 'ноль'
    h, t = (n // 100) * 100, n % 100
    return ' '.join(x for x in (HUND[h], TENS[t]) if x)

def cap(s): return s[:1].upper() + s[1:]

PHR = {}
PHR['op0'] = 'Вижу противника!'
PHR['op1'] = 'Контакт!'
PHR['op2'] = 'Противник!'
for az in range(0, 360, 10):
    PHR['az%d' % az] = cap(words(az)) + ' градусов, ' + WIND[round(az / 45) % 8] + '!'
for d in (30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250, 300):
    PHR['d%d' % d] = 'Метров ' + words(d) + '!'
for i, w in enumerate(WIND):
    PHR['close%d' % i] = 'Противник рядом, ' + w + '!'
FIX = {
    'confirm': ['Вижу! Веду огонь!', 'Вижу его, работаю!', 'Подтверждаю! Огонь!'],
    'grenade': ['Граната!', 'Осколочная пошла!', 'Граната, ложись!'],
    'flash': ['Светошумовая!', 'Слепящая пошла!'],
    'smoke': ['Ставлю дым!', 'Дым!', 'Прикрываю дымом!'],
    'reload': ['Перезаряжаюсь!', 'Меняю магазин!', 'Перезарядка!'],
    'suppressed': ['Прижали! Прикройте!', 'Плотно бьют, прикрой!'],
    'mandown': ['Двухсотый!', 'Потеряли бойца!', 'Минус один у нас!'],
    'kill': ['Готов!', 'Есть один!', 'Минус!'],
    'flankR': ['Обхожу справа!'],
    'flankL': ['Обхожу слева!'],
    'flank': ['Прикройте, иду в обход!'],
    'onflank': ['На фланге!', 'Я сбоку, работаю!'],
    # медик / тактика (js/polygon/30b_tactics.js)
    'aid': ['Иду к раненому!'],
    'drag': ['Оттаскиваю в укрытие!'],
    'done': ['Кровотечение остановлено!'],
    'near': ['Ложись! Обстрел!'],
}
for k, arr in FIX.items():
    for i, t in enumerate(arr): PHR['%s%d' % (k, i)] = t

def synth(voice, text, cfg):
    bio = io.BytesIO()
    with wave.open(bio, 'wb') as wf:
        voice.synthesize_wav(text, wf, syn_config=cfg)
    bio.seek(0)
    with wave.open(bio, 'rb') as wf:
        sr = wf.getframerate(); x = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)
    return sr, x

def ff(x, sr, af):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-f', 's16le', '-ar', str(sr), '-ac', '1', '-i', '-', '-af', af,
                        '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-'], input=x.tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).copy()

def trim(y):
    a = np.abs(y); pk = a.max() + 1e-9
    # огибающая 5 мс
    k = max(1, int(SR * 0.005)); env = np.convolve(a, np.ones(k) / k, mode='same')
    on = np.where(env > pk * 0.02)[0]
    if not len(on): return y
    i0 = max(0, on[0] - int(SR * 0.012)); i1 = min(len(y), on[-1] + int(SR * 0.07))
    y = y[i0:i1].copy()
    f = int(SR * 0.006); y[:f] *= np.linspace(0, 1, f); y[-int(SR * 0.04):] *= np.linspace(1, 0, int(SR * 0.04))
    return y

def norm(y, rms_db=-15.5, peak_db=-1.0):
    a = np.abs(y); k = int(SR * 0.02)
    env = np.sqrt(np.convolve(y * y, np.ones(k) / k, mode='same'))
    act = env[env > env.max() * 0.1]
    rms = np.sqrt(np.mean(act ** 2)) if len(act) else 1e-3
    g = 10 ** (rms_db / 20) / max(rms, 1e-6)
    pk = a.max() * g; lim = 10 ** (peak_db / 20)
    y = y * g
    if pk > lim:  # мягкое ограничение пиков
        y = np.tanh(y / lim * 0.9) * lim / np.tanh(0.9)
    return y

def mp3(y, path):
    pcm = (np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame',
                    '-b:a', '32k', path], input=pcm, check=True)

from vosk import Model, KaldiRecognizer, SetLogLevel
SetLogLevel(-1)
ASR = Model(os.path.join(HERE, 'vosk-model-small-ru-0.22'))
import re
def toks(t): return re.sub(r'[^а-яё ]', ' ', t.lower().replace('-', ' ').replace('ё', 'е')).split()
def wer(r, h):
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = d[j]; d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1])); prev = cur
    return d[len(h)] / max(1, len(r))
def asr(y):
    z = np.zeros(int(SR * 0.3), dtype=np.float32); y = np.concatenate([z, y, z])  # тишина вокруг, как в игре
    rec = KaldiRecognizer(ASR, SR); rec.AcceptWaveform((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    return json.loads(rec.FinalResult()).get('text', '')

def main(only=None):
    meta = {'sr': SR, 'voices': [], 'keys': sorted(PHR)}
    mp = os.path.join(OUT, 'meta.json')
    if only and os.path.exists(mp):  # пересборка одного голоса: остальные из прошлой сборки
        old = json.load(open(mp)); meta['voices'] = [v for v in old.get('voices', []) if v['id'] != only]
    for V in VOICES:
        if only and V['id'] != only: continue
        t0 = time.time()
        voice = PiperVoice.load(os.path.join(HERE, 'ru_RU-%s-medium.onnx' % V['id']))
        cfg = SynthesisConfig(length_scale=V['ls'], noise_scale=V['ns'], noise_w_scale=0.7)
        af = ('rubberband=pitch=%.3f:formant=preserved:pitchq=quality,highpass=f=75,lowpass=f=9800,'
              'equalizer=f=135:t=q:w=0.9:g=2.5,equalizer=f=420:t=q:w=1.2:g=-2,equalizer=f=2900:t=q:w=1.1:g=3.5,'
              'acompressor=threshold=0.08:ratio=4:attack=3:release=70:makeup=2.5:knee=4') % V['pitch']
        vd = os.path.join(OUT, V['id']); os.makedirs(vd, exist_ok=True)
        durs = {}; asrlog = []
        for key, text in PHR.items():
            cands = []
            for n in range(V.get('n', NCAND)):
                sr, x = synth(voice, text, cfg)
                pad = np.zeros(int(sr * 0.15), dtype=np.int16)
                y = norm(trim(ff(np.concatenate([pad, x, pad]), sr, af)))
                h = asr(y); cands.append((wer(toks(text), toks(h)), len(y), y, h))
            md = sorted(c[1] for c in cands)[len(cands) // 2]
            cands.sort(key=lambda c: (c[0], abs(c[1] - md)))
            e, _, y, h = cands[0]
            asrlog.append((key, round(e, 2), text, h))
            durs[key] = round(len(y) / SR, 3)
            mp3(y, os.path.join(vd, key + '.mp3'))
            wavp = os.path.join(vd, key + '.wav')
            with wave.open(wavp, 'wb') as wf:
                wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(SR)
                wf.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
        meta['voices'].append({'id': V['id'], 'durs': durs, 'asr': asrlog})
        meta['voices'].sort(key=lambda v: [x['id'] for x in VOICES].index(v['id']))
        print(V['id'], len(PHR), 'clips', round(time.time() - t0, 1), 's', flush=True)
    with open(os.path.join(OUT, 'meta.json'), 'w') as f: json.dump({'phr': PHR, **meta}, f, ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else None)
