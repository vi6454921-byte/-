import sys, json, wave, subprocess, numpy as np
from vosk import Model, KaldiRecognizer, SetLogLevel
SetLogLevel(-1)
import os
M = Model(os.environ.get('VOSK_MODEL', os.path.join(os.environ.get('TTS', '/data/tts'), 'vosk-model-small-ru-0.22')))
def rec(path):
    pcm = subprocess.run(['ffmpeg','-v','error','-i',path,'-ar','16000','-ac','1','-f','s16le','-'],capture_output=True,check=True).stdout
    r = KaldiRecognizer(M, 16000); r.AcceptWaveform(pcm); return json.loads(r.FinalResult()).get('text','')
def pitch(path):
    import parselmouth
    snd = parselmouth.Sound(path); p = snd.to_pitch(time_step=0.01, pitch_floor=60, pitch_ceiling=500)
    f = p.selected_array['frequency']; f = f[f > 0]
    if len(f) == 0: return None
    return dict(f0med=round(float(np.median(f))), f0p10=round(float(np.percentile(f,10))), f0p90=round(float(np.percentile(f,90))), dur=round(snd.duration,2))
if __name__ == '__main__':
    for pth in sys.argv[1:]:
        print(pth.split('/')[-1], '|', rec(pth), '|', pitch(pth))

def vtl(path):
    import parselmouth
    from parselmouth.praat import call
    snd = parselmouth.Sound(path)
    if snd.sampling_frequency < 16000: snd = snd.resample(16000)
    p = snd.to_pitch(time_step=0.01, pitch_floor=60, pitch_ceiling=500)
    fm = snd.to_formant_burg(time_step=0.01, max_number_of_formants=5, maximum_formant=5000)
    F = [[], [], [], []]
    for i in range(p.get_number_of_frames()):
        t = p.get_time_from_frame_number(i + 1)
        if p.get_value_at_time(t) != p.get_value_at_time(t): continue  # nan = unvoiced
        vals = [fm.get_value_at_time(k + 1, t) for k in range(4)]
        if any(v != v for v in vals): continue
        for k in range(4): F[k].append(vals[k])
    if len(F[0]) < 10: return None
    med = [float(np.median(f)) for f in F]
    df = (med[3] - med[0]) / 3
    return dict(F=[round(x) for x in med], disp=round(df), vtl_cm=round(35000 / (2 * df), 1))
