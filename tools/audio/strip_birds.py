#!/usr/bin/env python3
"""AEGIS v21: вырезает птичьи трели из фоновых петель assets/snd/amb_pack.js.

Метод — спектральный гейт по скользящей медиане (как шумоподавители
«median spectral clamp»): ветер и шелест — стационарный широкополосный шум,
трель — короткий узкий тональный выброс над этим фоном. Для каждой полосы
выше ~1,2 кГц амплитуда ограничивается k × медианой за ±2 с, коэффициент
усиления сглаживается по времени и частоте (без «музыкального шума»),
фаза сохраняется. Обработка идёт по циклу из трёх копий петли — стык
остаётся бесшовным. Затем мягкий ФНЧ 7 кГц.

Запуск: python3 tools/audio/strip_birds.py <in.mp3> <out.wav> [ls] [le]
"""
import sys, subprocess, numpy as np

def decode(path, sr=48000):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(sr), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).T.copy()

def stft(x, n=2048, h=512):
    w = np.hanning(n).astype(np.float32)
    frames = 1 + (len(x) - n) // h
    idx = np.arange(n)[None, :] + h * np.arange(frames)[:, None]
    return np.fft.rfft(x[idx] * w, axis=1), w

def istft(X, w, length, n=2048, h=512):
    fr = np.fft.irfft(X, n=n, axis=1) * w
    y = np.zeros(length + n, np.float32); ws = np.zeros(length + n, np.float32)
    for i in range(fr.shape[0]):
        y[i * h:i * h + n] += fr[i]; ws[i * h:i * h + n] += w * w
    ws[ws < 1e-6] = 1
    return (y / ws)[:length]

def running_median(M, win, q=30):
    # нижний процентиль (q) по времени для каждого бина (кольцевой), шаг 8 кадров + интерполяция
    T = M.shape[0]; step = 8; half = win // 2
    centers = np.arange(0, T, step)
    out = np.empty((len(centers), M.shape[1]), np.float32)
    for j, c in enumerate(centers):
        ii = np.arange(c - half, c + half) % T
        out[j] = np.percentile(M[ii], q, axis=0)
    t = np.arange(T)
    res = np.empty_like(M)
    for b in range(M.shape[1]):
        res[:, b] = np.interp(t, centers, out[:, b])
    return res

def smooth(G, kt=5, kf=3, op='mean'):
    from numpy.lib.stride_tricks import sliding_window_view as sw
    P = np.pad(G, ((kt // 2, kt // 2), (kf // 2, kf // 2)), mode='edge')
    V = sw(P, (kt, kf))
    return V.min(axis=(-1, -2)) if op == 'min' else V.mean(axis=(-1, -2))

def process(ch, sr, ls, le, k=1.1, f0=1100.0, f1=1700.0, n=2048, h=512):
    a, b = int(ls * sr), int(le * sr)
    loop = ch[a:b]; L = len(loop)
    x = np.concatenate([loop, loop, loop])
    X, w = stft(x, n, h)
    M = np.abs(X).astype(np.float32)
    B = running_median(M, int(8.0 * sr / h), 30)
    G = np.minimum(1.0, k * B / np.maximum(M, 1e-9))
    G = smooth(G, 9, 7, 'min')      # «эрозия»: подавление захватывает края трели
    f = np.fft.rfftfreq(n, 1 / sr)
    ramp = np.clip((f - f0) / (f1 - f0), 0, 1)[None, :]
    G = 1 - ramp * (1 - G)
    G = smooth(G, 7, 5)
    G = np.minimum(G, smooth(G, 3, 3))
    y = istft(X * G, w, len(x), n, h)
    return y[L:2 * L]

def main():
    src, dst = sys.argv[1], sys.argv[2]
    ls = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
    le = float(sys.argv[4]) if len(sys.argv) > 4 else 40.5
    sr = 48000
    x = decode(src, sr)
    loops = np.stack([process(x[c], sr, ls, le) for c in range(2)])
    pre, post = int(ls * sr), x.shape[1] - int(le * sr)
    full = np.concatenate([loops[:, -pre:], loops, loops[:, :post]], axis=1)
    full = np.clip(full, -1, 1).T.astype(np.float32)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(sr), '-i', '-', '-af', 'lowpass=f=7000:p=2', dst], input=full.tobytes(), check=True)

if __name__ == '__main__':
    main()
