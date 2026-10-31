#!/usr/bin/env python3
"""Encode completed, real-rendered JPEG chapters. No generated in-between frames."""
from pathlib import Path
import json,subprocess,time,sys
root=Path(__file__).resolve().parents[2]
frames=Path(sys.argv[1] if len(sys.argv)>1 else '/data/animation-v11-frames')
encoded=frames/'encoded';encoded.mkdir(exist_ok=True)
done=set()
while True:
 try: m=json.loads((frames/'manifest.json').read_text())
 except (FileNotFoundError,json.JSONDecodeError):time.sleep(5);continue
 for ch in m['chapters']:
  i=ch['index'];out=encoded/f'{i:02}.mp4'
  if i in done:continue
  folder=Path(ch['folder']);N=ch['frames']
  assert all((folder/f'{j:05}.jpg').is_file()for j in range(N)),f'missing frames {i}'
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','24','-i',str(folder/'%05d.jpg'),'-frames:v',str(N),'-c:v','libx264','-preset','veryfast','-threads','2','-crf','20','-pix_fmt','yuv420p',str(out)],check=True)
  done.add(i);print('encoded',i,flush=True)
 if len(done)==35:break
 time.sleep(5)
assert len(m['chapters'])==35 and not m['errors']
concat=encoded/'concat.txt';concat.write_text(''.join("file '"+str(encoded/f'{i:02}.mp4')+"'\n"for i in range(1,36)))
meta=';FFMETADATA1\ntitle=AEGIS — обзор анимаций v11\ncomment=Game-rendered study; 60 Hz simulation, 24 fps video. CMU-derived and procedural states are identified on screen.\n'
lines=['# Обзор анимаций v11 — главы','', 'Реальный игровой рендер в нейтральной тестовой сцене. Симуляция 60 Гц, видеоряд 24 кадра/с, без интерполяции кадров. 3D-кадр 640×360, композиция с читаемыми подписями 960×540. Без звука.','', '| Начало | Сцена |','| --- | --- |']
ms=0
for ch in m['chapters']:
 dur=round(ch['frames']/24*1000);title=ch['title'].replace('=','\\=').replace(';','\\;').replace('#','\\#')
 meta+=f'[CHAPTER]\nTIMEBASE=1/1000\nSTART={ms}\nEND={ms+dur}\ntitle={title}\n'
 lines.append(f"| {ms//60000:02}:{(ms//1000)%60:02} | {ch['title']} |")
 ch['startSeconds']=ms/1000;ms+=dur
metadata=encoded/'chapters.ffmeta';metadata.write_text(meta)
out=root/'docs/AEGIS_ANIMATIONS_V11.mp4'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),'-i',str(metadata),'-map_metadata','1','-map_chapters','1','-c','copy','-movflags','+faststart',str(out)],check=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-show_chapters','-of','json',str(out)]))
v=next(x for x in probe['streams']if x['codec_type']=='video')
assert int(v['nb_read_frames'])==sum(c['frames']for c in m['chapters'])
assert v['width']==960 and v['height']==540 and len(probe['chapters'])==35
(root/'docs/ANIMATION_VIDEO_CHAPTERS_V11.md').write_text('\n'.join(lines)+'\n')
m['pass']=True;m['durationSeconds']=ms/1000;m['renderWidth']=640;m['renderHeight']=360;m['note']='Actual simulation at 60 Hz; rendered at 640x360; caption composite 960x540; 24 fps; no in-between synthesis; silent.'
for ch in m['chapters']:ch.pop('folder',None)
(root/'docs/ANIMATION_VIDEO_CAPTURE_V11.json').write_text(json.dumps(m,indent=2,ensure_ascii=False)+'\n')
(root/'docs/ANIMATION_VIDEO_PROBE_V11.json').write_text(json.dumps(probe,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'pass':True,'frames':v['nb_read_frames'],'duration':ms/1000,'bytes':out.stat().st_size}),flush=True)
