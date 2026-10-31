# AEGIS v26 — проверка дублей голосового пакета: распознанный текст (Vosk), темп и УДАРЕНИЯ.
# Ударение проверяется по качеству гласных: в русском безударные «о/а» редуцируются ([ɐ]/[ə]),
# ударная «о» звучит полностью ([o]); безударные «е/я» — [ɪ], ударная «е» — [e]. Фонемы дубля
# распознаёт wav2vec2-xlsr-53-espeak-cv-ft (IPA), ожидание строится из текста с «+» перед ударной
# гласной (phr26.py), последовательности выравниваются (DP), затем для каждой гласной сравнивается
# ожидаемое и услышанное качество. serr — взвешенное число «ударений не туда» (0 — чисто).
#   python3 check26.py <gen_dir> <phr26.json> [голоса] [--keys k1,k2]  → <gen_dir>/check26.json (дописывает)
import sys, os, re, json, glob, difflib
import numpy as np, soundfile as sf
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
os.environ.setdefault('TTS', '/data/tts'); os.environ.setdefault('HF_HOME', os.path.join(os.environ['TTS'], 'hf'))

VOW = 'аеёиоуыэюя'
CLITIC = {'в', 'во', 'на', 'с', 'со', 'к', 'ко', 'у', 'о', 'об', 'за', 'не', 'ни', 'же', 'ли', 'бы', 'то', 'по', 'до',
          'из', 'от', 'без', 'под', 'над', 'при', 'про', 'для', 'и', 'а', 'но', 'да', 'как'}
# согласные: буква -> набор базовых символов IPA (без ʲ/ː)
CONS = {'б': 'b p', 'в': 'v f ʋ', 'г': 'ɡ g k ɣ v', 'д': 'd t', 'ж': 'ʐ ʒ ʂ ʃ', 'з': 'z s', 'й': 'j', 'к': 'k ɡ g',
        'л': 'l ɫ ʎ', 'м': 'm', 'н': 'n ɲ', 'п': 'p b', 'р': 'r ɾ', 'с': 's z ɕ', 'т': 't d', 'ф': 'f v', 'х': 'x h ç',
        'ц': 'ts t s', 'ч': 'tɕ tʃ ɕ ʃ', 'ш': 'ʂ ʃ', 'щ': 'ɕ ʃ ɕː', }
CONS = {k: set(v.split()) for k, v in CONS.items()}
# классы услышанных гласных
VC = {'O': set('o ɔ ɵ ø oː ɔː'.split()), 'A': set('a aː ɑ æ ä'.split()), 'R': set('ɐ ə ʌ ɜ ɘ'.split()),
      'E': set('e ɛ eː ɛː'.split()), 'I': set('i ɪ iː ᵻ ɨ ɯ y ʏ'.split()), 'U': set('u ʊ ʉ uː'.split())}
def vclass(tok):
    t = tok.replace('ʲ', '')
    for c, s in VC.items():
        if t in s: return c
    if t and t[0] in 'aeiouɐəɪɛɔʊɨɵæɑʌ': return 'V?'
    return None

def g2p(text):
    """текст с «+» -> список токенов: ('C', буква, слово) | ('V', буква, ударная(True/False/None), слово)"""
    t = text.lower().replace('-', '')
    out = []
    for w in re.findall(r"[а-яё+]+", t):
        word = w.replace('+', ''); nv = sum(ch in VOW for ch in word)
        marked = '+' in w
        if not marked and nv == 1: st_known = word not in CLITIC; st_pos = [i for i, ch in enumerate(word) if ch in VOW][0] if st_known else -1
        elif not marked and 'ё' in word: st_known = True; st_pos = word.index('ё')
        elif marked: st_known = True; st_pos = None
        else: st_known = False; st_pos = -1
        # позиция ударной в word (без '+')
        if marked:
            j = 0; st_pos = -1
            for ch in w:
                if ch == '+': st_pos = j; continue
                j += 1
        prev = ''
        for i, ch in enumerate(word):
            if ch in VOW:
                if ch in 'еёюя' and (i == 0 or prev in VOW or prev in 'ьъ'): out.append(('J', 'й', word))
                stressed = (i == st_pos) if st_known else None
                if ch == 'ё': stressed = True if st_known and i == st_pos else (None if not st_known else 'sec')
                out.append(('V', ch, stressed, word))
            elif ch in CONS:
                if ch == 'г' and re.search(r'(ого|его)$', word) and i == len(word) - 2: out.append(('C', 'в', word))
                else: out.append(('C', ch, word))
            prev = ch
    return out

def tokens(ph):
    """строка фонем распознавателя -> список (сырой токен, тип 'V'/'C')"""
    res = []
    for tok in ph.split():
        if tok in ('ʲ', 'ː', 'ˈ', 'ˌ', '|'):
            if res and tok == 'ʲ': res[-1] = (res[-1][0] + 'ʲ', res[-1][1])
            continue
        res.append((tok, 'V' if vclass(tok) else 'C'))
    return res

def align(exp, got):
    n, m = len(exp), len(got)
    INS, DEL = 0.7, 0.7
    D = np.zeros((n + 1, m + 1)); B = np.zeros((n + 1, m + 1), dtype=np.int8)
    D[:, 0] = np.arange(n + 1) * DEL; D[0, :] = np.arange(m + 1) * INS
    def sub(e, g):
        gt, gk = g
        if e[0] == 'V': return 0.1 if gk == 'V' else 1.3
        if gk == 'V': return 1.3
        base = gt.replace('ʲ', '').replace('ː', '')
        if e[0] == 'J': return 0.0 if base == 'j' else 0.8
        return 0.0 if base in CONS.get(e[1], ()) else 0.55
    for i in range(1, n + 1):
        de = 0.2 if exp[i - 1][0] == 'J' else DEL
        for j in range(1, m + 1):
            c0 = D[i - 1, j - 1] + sub(exp[i - 1], got[j - 1]); c1 = D[i - 1, j] + de; c2 = D[i, j - 1] + INS
            if c0 <= c1 and c0 <= c2: D[i, j] = c0; B[i, j] = 0
            elif c1 <= c2: D[i, j] = c1; B[i, j] = 1
            else: D[i, j] = c2; B[i, j] = 2
    i, j, pairs = n, m, []
    while i > 0 or j > 0:
        b = B[i, j] if i > 0 and j > 0 else (1 if i > 0 else 2)
        if b == 0: pairs.append((i - 1, j - 1)); i -= 1; j -= 1
        elif b == 1: pairs.append((i - 1, None)); i -= 1
        else: pairs.append((None, j - 1)); j -= 1
    return pairs[::-1]

def stress_errors(text, ph):
    exp = g2p(text); got = tokens(ph); errs = []; tot = 0.0
    for ei, gj in align(exp, got):
        if ei is None or gj is None or exp[ei][0] != 'V': continue
        _, ch, st, word = exp[ei]; g = vclass(got[gj][0]); w = 0.0
        if st is None or st == 'sec' or g is None: continue
        if st is True:
            if ch in 'оё' and g in ('A', 'R'): w = 1.0
            elif ch in 'еэ' and g == 'I': w = 0.5
            elif ch in 'ая' and g == 'R' and got[gj][0].startswith('ə'): w = 0.4
        else:
            if ch == 'о' and g == 'O': w = 1.0
            elif ch == 'а' and g == 'O': w = 0.5
            elif ch in 'ея' and g == 'E' and word[-1:] != ch: w = 0.3
        if w: errs.append('%s:%s→%s' % (word, ch, got[gj][0])); tot += w
    return round(tot, 2), errs

def norm(s):
    s = s.lower().replace('ё', 'е'); s = re.sub(r'[^а-яa-z0-9 ]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

_PM = None
def phonemes(path):
    global _PM
    import torch
    if _PM is None:
        from transformers import Wav2Vec2ForCTC, AutoFeatureExtractor
        from huggingface_hub import hf_hub_download
        MID = 'facebook/wav2vec2-xlsr-53-espeak-cv-ft'; torch.set_num_threads(2)
        voc = json.load(open(hf_hub_download(MID, 'vocab.json')))
        _PM = (AutoFeatureExtractor.from_pretrained(MID), Wav2Vec2ForCTC.from_pretrained(MID).eval(), {v: k for k, v in voc.items()})
    fe, model, inv = _PM
    a, sr = sf.read(path)
    if a.ndim > 1: a = a.mean(1)
    if sr != 16000:
        from scipy.signal import resample_poly
        a = resample_poly(a, 16000, sr)
    x = fe(a, sampling_rate=16000, return_tensors='pt').input_values
    with torch.no_grad(): ids = model(x).logits[0].argmax(-1).tolist()
    out, prev = [], -1
    for i in ids:
        if i != prev and inv.get(i) not in ('<pad>', '<s>', '</s>', '<unk>'): out.append(inv[i])
        prev = i
    return ' '.join(out)

def speech_span(a, sr):
    w = int(sr * 0.02); n = len(a) // w
    if not n: return 0.0
    e = np.array([np.sqrt(np.mean(a[i * w:(i + 1) * w] ** 2) + 1e-12) for i in range(n)])
    act = np.where(e > e.max() * 0.01)[0]
    return float((act[-1] - act[0] + 1) * 0.02) if len(act) else 0.0

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    keys = None
    if '--keys' in sys.argv: keys = set(sys.argv[sys.argv.index('--keys') + 1].split(',')); args = [a for a in args if a not in keys and a != ','.join(sorted(keys))]
    gd, pj = args[0], args[1]
    PH = json.load(open(pj, encoding='utf-8')); ACC, PHR = PH['acc'], PH['phr']
    voices = args[2].split(',') if len(args) > 2 else list(PHR)
    from asr import rec
    outp = os.path.join(gd, 'check26.json')
    R = json.load(open(outp, encoding='utf-8')) if os.path.exists(outp) else {}
    n = 0
    for v in voices:
        for f in sorted(glob.glob(os.path.join(gd, v, '*_s*.wav'))):
            k, seed = os.path.basename(f)[:-4].rsplit('_s', 1)
            if k not in PHR[v] or (keys and k not in keys): continue
            rid = '%s/%s' % (v, k); mt = round(os.path.getmtime(f))
            if R.get(rid, {}).get(seed, {}).get('mt') == mt: continue
            a, sr = sf.read(f)
            if a.ndim > 1: a = a.mean(1)
            sp = speech_span(a, sr); exp = norm(PHR[v][k]); got = norm(rec(f))
            r = difflib.SequenceMatcher(None, exp, got).ratio()
            ph = phonemes(f); se, errs = stress_errors(ACC[v][k], ph)
            R.setdefault(rid, {})[seed] = dict(r=round(r, 3), got=got, cps=round(len(exp) / max(sp, 0.1), 1), sp=round(sp, 2),
                                               dur=round(len(a) / sr, 2), serr=se, errs=errs, ph=ph, mt=mt)
            n += 1
            if n % 25 == 0:
                json.dump(R, open(outp, 'w', encoding='utf-8'), ensure_ascii=False); print('checked', n, flush=True)
    json.dump(R, open(outp, 'w', encoding='utf-8'), ensure_ascii=False)
    print('checked', n, '->', outp, flush=True)

def score(x):
    """оценка дубля для отбора: текст, ударения, темп"""
    if not x: return -9
    s = x['r'] - 0.22 * x['serr']
    if not 6 <= x['cps'] <= 22: s -= 0.25
    return s
def bad(x):
    return (not x) or x['r'] < 0.75 or x['serr'] >= 0.9 or not 6 <= x['cps'] <= 22

if __name__ == '__main__':
    main()
