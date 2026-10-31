# убирает голос(а) из готового пакета без пересборки звука:
#   python3 strip_voice.py ruslan                       → ../../assets/snd/voice_pack.js на месте
#   python3 strip_voice.py ruslan src.js dst.js
# Нужно, например, для коммерческого выпуска: голос ruslan — CC BY-NC-SA 4.0 (см. README).
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
drop = set(sys.argv[1].split(',')) if len(sys.argv) > 1 else {'ruslan'}
src = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', '..', 'assets', 'snd', 'voice_pack.js')
dst = sys.argv[3] if len(sys.argv) > 3 else src
out, kept = [], None
for line in open(src, encoding='utf-8').read().split('\n'):
    m = re.match(r'^V\.d\["([^/"]+)/', line)
    if m and m.group(1) in drop:
        continue
    if line.startswith('V.voices = '):
        ids = json.loads(line[len('V.voices = '):].rstrip(';'))
        kept = [v for v in ids if v not in drop]
        if not kept:
            sys.exit('в пакете не останется ни одного голоса')
        line = 'V.voices = %s;' % json.dumps(kept)
    elif line.startswith('V.u = '):
        u = json.loads(line[len('V.u = '):].rstrip(';'))
        line = 'V.u = %s;' % json.dumps({k: v for k, v in u.items() if k not in drop}, separators=(',', ':'))
    elif line.startswith('   Синтез офлайн:') and kept:
        line = re.sub(r'голоса ru_RU [^(]+\(', 'голоса ru_RU ' + ', '.join(kept) + ' (', line)
    out.append(line)
open(dst, 'w', encoding='utf-8').write('\n'.join(out))
print('voices', kept, '->', dst, os.path.getsize(dst))
