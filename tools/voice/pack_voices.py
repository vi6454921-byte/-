# собирает assets/snd/voice_pack.js из out/<voice>/*.mp3 (см. build_voices.py)
import json, base64, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
dst = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'voice_pack.js')
meta = json.load(open(os.path.join(HERE, 'out', 'meta.json')))
ids = [v['id'] for v in meta['voices']]
out = ['/* AEGIS v23 — голоса бойцов: доклады по рации и окрики (js/polygon/31c_voice.js).',
       '   Синтез офлайн: Piper TTS (github.com/rhasspy/piper), голоса ru_RU ' + ', '.join(ids) + ' (medium);',
       '   обработка ffmpeg: высота ниже с сохранением формант (rubberband), EQ, компрессор; MP3 16 кГц 32 кбит/с.',
       '   Пересборка: tools/voice/build_voices.py + pack_voices.py. Формат: V.d["<голос>/<ключ>"] = MP3 в base64. */',
       '(function (V) {',
       'V.sr = %d;' % meta['sr'],
       'V.voices = %s;' % json.dumps(ids),
       'V.t = %s;' % json.dumps(meta['phr'], ensure_ascii=False, separators=(',', ':')),
       'V.u = %s;' % json.dumps({v['id']: v['durs'] for v in meta['voices']}, separators=(',', ':')),
       'V.d = V.d || {};']
n = 0; size = 0
for vid in ids:
    for key in sorted(meta['phr']):
        p = os.path.join(HERE, 'out', vid, key + '.mp3')
        b = open(p, 'rb').read(); size += len(b); n += 1
        out.append('V.d["%s/%s"]="%s";' % (vid, key, base64.b64encode(b).decode()))
out.append('})(self.__VOICE_DATA = self.__VOICE_DATA || {});')
open(dst, 'w').write('\n'.join(out) + '\n')
print('clips', n, 'mp3 bytes', size, '->', dst, os.path.getsize(dst))
