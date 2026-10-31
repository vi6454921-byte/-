import sys, os, json, wave, re
from vosk import Model, KaldiRecognizer, SetLogLevel
SetLogLevel(-1)
HERE = os.path.dirname(os.path.abspath(__file__))
model = Model(os.path.join(HERE, 'vosk-model-small-ru-0.22'))
meta = json.load(open(os.path.join(HERE, 'out', 'meta.json')))
PHR = meta['phr']
def norm(s): return re.sub(r'[^а-яё ]', ' ', s.lower().replace('-', ' ').replace('ё', 'е')).split()
def wer(ref, hyp):
    r, h = ref, hyp
    d = [[0] * (len(h) + 1) for _ in range(len(r) + 1)]
    for i in range(len(r) + 1): d[i][0] = i
    for j in range(len(h) + 1): d[0][j] = j
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] != h[j - 1]))
    return d[len(r)][len(h)] / max(1, len(r))
vids = sys.argv[1:] or [v['id'] for v in meta['voices']]
for vid in vids:
    bad = []; tot = 0
    for key, text in PHR.items():
        p = os.path.join(HERE, 'out', vid, key + '.wav')
        if not os.path.exists(p): continue
        wf = wave.open(p, 'rb'); rec = KaldiRecognizer(model, wf.getframerate())
        while True:
            b = wf.readframes(4000)
            if not b: break
            rec.AcceptWaveform(b)
        hyp = json.loads(rec.FinalResult()).get('text', '')
        e = wer(norm(text), norm(hyp)); tot += e
        if e > 0: bad.append((key, round(e, 2), text, hyp))
    print('==', vid, 'mean WER', round(tot / len(PHR), 3), 'imperfect', len(bad))
    for b in bad: print('  ', b)
