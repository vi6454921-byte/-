#!/bin/bash
# AEGIS v26: x-vector'ы голосов из референсов ~30 с ($TTS/refs/<v>_ref.wav — mkref26.py из клипов v25,
# extract_v25.py) и «напряжённый» вариант: сдвиг к вектору злости из пресетов qwen3-tts (12 % нормы,
# норма сохраняется) — тон выше на 4–5 полутонов, спектр ярче, голос узнаваем. Готовые — refs26/.
TTS=${TTS:-/data/tts}
cd $TTS/qwen3-tts || exit 1
for v in grom hrip sokol tihiy; do
  ./qwen_tts -d qwen3-tts-0.6b-base --ref-audio $TTS/refs/${v}_ref.wav --xvector-only --save-voice $TTS/refs/$v.bin \
    -l Russian --int8 -j 2 --seed 1 --text "Проверка." -o /tmp/xv_$v.wav > /tmp/xv_$v.log 2>&1
done
python3 - "$TTS" <<'PY'
import numpy as np, sys
T = sys.argv[1]
d = np.fromfile(T + '/qwen3-tts/presets/emovoice/dir_ang.bin', dtype=np.float32)
for v in ['grom', 'hrip', 'sokol', 'tihiy']:
    x = np.fromfile('%s/refs/%s.bin' % (T, v), dtype=np.float32); n0 = np.linalg.norm(x)
    y = x + 0.12 * n0 * d; y *= n0 / np.linalg.norm(y)
    y.astype(np.float32).tofile('%s/refs/%s_ang12.bin' % (T, v))
    print(v, 'ok')
PY
