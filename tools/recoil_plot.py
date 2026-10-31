import json, sys
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
R = json.load(open(sys.argv[1])); out = sys.argv[2]
fig, ax = plt.subplots(4, 2, figsize=(14, 16))
cols = {30: '#d62728', 60: '#2ca02c', 144: '#1f77b4'}
def runs(**kw): return [r for r in R['runs'] if all(r[k] == v for k, v in kw.items())]
for i, g in enumerate(['ak74', 'm416']):
    a = ax[0][i]
    for r in runs(gun=g, mode='single'):
        t = [p[0] * 1000 - 50 for p in r['d']]; a.plot(t, [p[1] * 57.3 for p in r['d']], color=cols[r['fps']], label='%d FPS подброс°' % r['fps'], drawstyle='steps-post' if r['fps'] == 30 else 'default')
        a.plot(t, [p[2] * 1000 / 10 for p in r['d']], color=cols[r['fps']], ls='--', alpha=.6)
    a.axvspan(15, 25, color='orange', alpha=.12); a.axvspan(40, 60, color='red', alpha=.10); a.axhline(0, color='k', lw=.5)
    a.set_title('%s: одиночный (сплошная — подброс, °; пунктир — отход, см)' % g); a.set_xlabel('мс после выстрела'); a.legend(fontsize=8); a.set_xlim(-10, 500)
for i, g in enumerate(['ak74', 'm416']):
    a = ax[1][i]
    for r in runs(gun=g, mode='auto10', st='stand'):
        a.plot([p[0] for p in r['d']], [p[1] * 57.3 for p in r['d']], color=cols[r['fps']], label='%d FPS' % r['fps'])
    a.set_title('%s: очередь 10 выстрелов, подброс° (30/60/144 FPS)' % g); a.set_xlabel('с'); a.legend(fontsize=8)
for i, g in enumerate(['ak74', 'akm']):
    a = ax[2][i]
    for r in R['runs']:
        if r['gun'] == g and r['mode'] == 'auto10' and r['fps'] == 144 and r['st'] != 'stand':
            a.plot([p[0] for p in r['d']], [p[1] * 57.3 for p in r['d']], label=r['st'])
    a.set_title('%s: очередь, стойки (подброс°)' % g); a.set_xlabel('с'); a.legend(fontsize=8)
a = ax[3][0]
for h in R.get('heat', []):
    if h['gun'] == 'ak74': a.plot([p[0] for p in h['d']], [p[1] for p in h['d']], label='АК-74 · ' + h['wx'])
a.axhline(320, color='r', ls=':', lw=.8); a.text(2, 325, 'cook-off 320°C', fontsize=8, color='r')
a.set_title('Нагрев ствола: 300 выстрелов (10×30), затем остывание'); a.set_xlabel('с'); a.set_ylabel('°C'); a.legend(fontsize=8)
a = ax[3][1]
for f in R.get('fatigue', []):
    a.plot([p[0] for p in f['d']], [p[1] * 1000 for p in f['d']], label='усталость %.1f' % f['fat'], lw=.8)
a.set_title('Тремор ствола (мрад) при разной усталости'); a.set_xlabel('с'); a.legend(fontsize=8)
plt.tight_layout(); plt.savefig(out, dpi=80)
