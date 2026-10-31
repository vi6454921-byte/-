# AEGIS v25 — шёпот из обычной речи (без нейросети): шёпот — это та же речь без колебаний
# голосовых связок. Источник — турбулентный шум в гортани, фильтр — тот же речевой тракт.
# Поэтому: STFT -> огибающая спектра кадра (кепстральное сглаживание убирает гармоники основного
# тона, остаются форманты) -> возбуждаем огибающую белым шумом со случайной фазой -> ISTFT.
# Плюс то, что отличает шёпот на слух: меньше низа (<300 Гц почти нет), чуть больше 2–5 кГц,
# форманты у шёпота выше на ~3–5 % (короче эффективный тракт), тише и с придыханием на атаках.
import numpy as np

def stft(a, n, h):
    w = np.hanning(n)
    pad = np.concatenate([np.zeros(n), a, np.zeros(n)])
    m = 1 + (len(pad) - n) // h
    F = np.stack([np.fft.rfft(pad[i * h:i * h + n] * w) for i in range(m)])
    return F, w, len(pad)

def istft(F, w, n, h, L):
    out = np.zeros(L); norm = np.zeros(L)
    for i, f in enumerate(F):
        x = np.fft.irfft(f, n) * w
        out[i * h:i * h + n] += x; norm[i * h:i * h + n] += w * w
    out /= np.maximum(norm, 1e-6)
    return out[n:-n]

def envelope(mag, lifter):
    lg = np.log(np.maximum(mag, 1e-7))
    c = np.fft.irfft(lg, axis=1)
    c[:, lifter:-lifter] = 0.0
    return np.exp(np.fft.rfft(c, axis=1).real[:, :mag.shape[1]])

def whisper(a, sr, seed=1, shift=1.04):
    n, h = 1024, 256
    F, w, L = stft(a, n, h)
    mag = np.abs(F)
    env = envelope(mag, 34)
    # форманты чуть выше: растягиваем огибающую по частоте
    k = np.arange(env.shape[1])
    src = np.clip(k / shift, 0, env.shape[1] - 1)
    env = np.stack([np.interp(src, k, e) for e in env])
    f = k * sr / n
    tilt = np.clip((f - 180) / 320, 0, 1) ** 1.5                     # низа почти нет
    tilt *= 1 + 0.6 * np.exp(-((f - 3500) / 1600) ** 2)              # «шипящий» верх речи
    tilt *= np.where(f > 7500, np.exp(-(f - 7500) / 2500), 1)
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal(F.shape) + 1j * rng.standard_normal(F.shape)
    noise /= np.sqrt(2)
    # шумные согласные (с, ш, ф, х) уже шум — оставляем их как есть: доля «шумности» кадра
    flat = np.exp(np.mean(np.log(np.maximum(mag, 1e-7)), axis=1)) / np.maximum(np.mean(mag, axis=1), 1e-9)
    keep = np.clip((flat - 0.25) / 0.3, 0, 1)[:, None]
    G = env * tilt * noise
    Y = keep * F * tilt + (1 - keep) * G
    y = istft(Y, w, n, h, L)
    return y[:len(a)]

if __name__ == '__main__':
    import sys, soundfile as sf
    a, sr = sf.read(sys.argv[1])
    if a.ndim > 1: a = a.mean(1)
    y = whisper(a, sr)
    y *= 0.25 / max(1e-6, np.max(np.abs(y)))
    sf.write(sys.argv[2], y.astype(np.float32), sr)
    print('ok', len(y) / sr)
