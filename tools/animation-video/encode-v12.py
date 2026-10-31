#!/usr/bin/env python3
from pathlib import Path
import json,subprocess
root=Path(__file__).resolve().parents[2];base=Path('/data/animation-v12-frames');m=json.loads((base/'manifest.json').read_text());outdir=base/'encoded';outdir.mkdir(exist_ok=True)
paths=[];meta=';FFMETADATA1\ntitle=AEGIS — mocap actions v12\n';frame=0
for c in sorted(m['chapters'],key=lambda c:c['index']):
 p=outdir/f"{c['index']:02}.mp4";paths.append(p)
 subprocess.run(['ffmpeg','-v','error','-y','-framerate','24','-i',str(Path(c['folder'])/'%05d.jpg'),'-frames:v',str(c['frames']),'-c:v','libx264','-preset','fast','-threads','2','-crf','19','-pix_fmt','yuv420p',str(p)],check=True)
 c['startSeconds']=frame/24;c['start']=frame;end=frame+c['frames']
 meta+=f"[CHAPTER]\nTIMEBASE=1/24\nSTART={frame}\nEND={end}\ntitle={c['title']}\n";frame=end
(outdir/'chapters.ffmeta').write_text(meta);(outdir/'concat.txt').write_text(''.join(f"file '{p}'\n"for p in paths))
out=root/'docs/AEGIS_ACTIONS_V12.mp4'
subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(outdir/'concat.txt'),'-i',str(outdir/'chapters.ffmeta'),'-map_metadata','1','-map_chapters','1','-c','copy','-movflags','+faststart',str(out)],check=True)
subprocess.run(['ffmpeg','-v','error','-i',str(out),'-f','null','-'],check=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_chapters','-show_format','-of','json',str(out)]))
v=next(s for s in probe['streams']if s['codec_type']=='video');assert int(v['nb_read_frames'])==frame and len(probe['chapters'])==7
for c in m['chapters']:c.pop('folder',None)
m['durationSeconds']=frame/24;m['renderWidth']=640;m['renderHeight']=360;m['note']='Actual game at 60 Hz, 24fps encoded; no generated intermediate frames; silent.'
(root/'docs/qa-v12/video-capture.json').write_text(json.dumps(m,ensure_ascii=False,indent=2));(root/'docs/qa-v12/video-probe.json').write_text(json.dumps(probe,ensure_ascii=False,indent=2))
print(json.dumps({'chapters':len(m['chapters']),'duration':frame/24,'frames':frame,'bytes':out.stat().st_size}))
