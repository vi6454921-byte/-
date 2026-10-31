# AEGIS v26: референс голоса из клипов v25 (extract_v25.py → old/) — ~30 с обычной речи (без шёпота),
# разные типы реплик; из него xvec26.sh считает x-vector. Запуск из каталога с old/: TTS=/путь python3 mkref26.py
import json, numpy as np, soundfile as sf, random, sys, os
TTS = os.environ.get('TTS', '/data/tts')
T = json.load(open('old/texts.json', encoding='utf-8'))
WH = set(T['meta']['whisper'])
SR = 24000
for v in ['grom', 'hrip', 'sokol', 'tihiy']:
    keys = [k for k in T['tv'][v] if k not in WH]
    random.Random(26).shuffle(keys)
    # приоритет: рация и разговоры (длинные, ровные), затем доклады
    keys.sort(key=lambda k: 0 if k[0] in 'rg' else 1 if k.startswith('ct') else 2)
    out, texts, dur = [], [], 0.0
    for k in keys:
        a, sr = sf.read('old/%s/%s.wav' % (v, k))
        if a.ndim > 1: a = a.mean(1)
        if len(a) / sr < 1.2: continue
        out += [a, np.zeros(int(0.3 * SR))]; texts.append(T['tv'][v][k]); dur += len(a) / sr + 0.3
        if dur > 31: break
    y = np.concatenate(out); y = y / max(1e-6, np.abs(y).max()) * 0.8
    sf.write(TTS + '/refs/%s_ref.wav' % v, y.astype(np.float32), SR, subtype='PCM_16')
    open(TTS + '/refs/%s_ref.txt' % v, 'w', encoding='utf-8').write(' '.join(texts))
    print(v, round(dur, 1), 's', len(texts), 'clips')
