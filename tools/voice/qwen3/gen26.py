# AEGIS v26 — задания на озвучку для gen26.sh.
#   python3 gen26.py <проход> <каталог v26>  → печатает строки «голос x-vector файл_заданий»
# Проход 1: сид 1 для всех фраз. Проход N>1: фразы, у которых лучший дубль не прошёл проверку
# (check26.bad: текст не распознан, ударение не туда, неестественный темп) — ещё один сид (N).
# Реплики «на взводе» (meta.urgent) озвучиваются x-vector'ом голоса, сдвинутым к тревоге (URG).
import sys, os, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from check26 import bad, score
# сдвиг x-vector к «злости/напряжению» (presets/emovoice/dir_ang.bin, 0.12·|x|): F0 +4…5 полутонов, спектр ярче — крик, но голос узнаваем
URG = {'grom': 'grom_ang12', 'hrip': 'hrip_ang12', 'sokol': 'sokol_ang12', 'tihiy': 'tihiy_ang12'}
def main():
    p, root = int(sys.argv[1]), sys.argv[2]
    PH = json.load(open(os.path.join(root, 'phr26.json'), encoding='utf-8'))
    PHR, TTS, URGK = PH['phr'], PH['tts'], set(PH['meta']['urgent'])
    ck = os.path.join(root, 'gen', 'check26.json')
    C = json.load(open(ck, encoding='utf-8')) if os.path.exists(ck) else {}
    for v in PHR:
        for mode in ('n', 'u'):
            jobs = []
            for k in PHR[v]:
                if (k in URGK) != (mode == 'u'): continue
                out = os.path.join(root, 'gen', v, '%s_s%d.wav' % (k, p))
                if os.path.exists(out): continue
                if p > 1:
                    takes = C.get('%s/%s' % (v, k), {})
                    if len(takes) < p - 1: continue          # предыдущий проход ещё не проверен
                    best = max(takes.values(), key=score) if takes else None
                    if not bad(best): continue
                jobs.append({'out': out, 'text': TTS[v].get(k, PHR[v][k]), 'seed': p})
            if jobs:
                jf = os.path.join(root, 'gen', 'jobs_%s_%s_p%d.json' % (v, mode, p))
                json.dump(jobs, open(jf, 'w', encoding='utf-8'), ensure_ascii=False)
                print(v, URG[v] if mode == 'u' else v, jf, len(jobs))
if __name__ == '__main__':
    main()
