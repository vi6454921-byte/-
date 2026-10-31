# распаковать клипы v25 из voice_pack.js -> old/<voice>/<key>.wav (24 кГц) + texts.json
import re, json, base64, subprocess, os, sys
src = sys.argv[1] if len(sys.argv) > 1 else 'voice_pack_v25.js'   # пакет v25 (MP3)
txt = open(src, encoding='utf-8').read()
tv = json.loads(re.search(r'^V\.tv = (\{.*\});$', txt, re.M).group(1))
meta = json.loads(re.search(r'^V\.meta = (\{.*\});$', txt, re.M).group(1))
json.dump({'tv': tv, 'meta': meta}, open('old/texts.json', 'w'), ensure_ascii=False)
n = 0
for m in re.finditer(r'^V\.d\["([a-z]+)/([A-Za-z0-9_]+)"\]="([^"]+)";$', txt, re.M):
    v, k, b = m.group(1), m.group(2), m.group(3)
    od = 'old/' + v; os.makedirs(od, exist_ok=True)
    out = '%s/%s.wav' % (od, k)
    if os.path.exists(out): n += 1; continue
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'mp3', '-i', '-', '-ar', '24000', '-ac', '1', out], input=base64.b64decode(b), check=True)
    n += 1
print(n, 'clips')
