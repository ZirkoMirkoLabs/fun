"""Make a 2:1 card from real source pixels and the JS parity output, not a mockup."""
from pathlib import Path
import subprocess, math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
WORK = Path('G:/tmp/pixelsnap-web')
PROJECT = ROOT / 'projects/pixelsnap'
source = Image.open(ROOT.parent / 'pixelsnap/samples/input/07_ai_teapot_offset.png').convert('RGBA')
result = Image.frombytes('RGBA', (120, 65), (WORK / '07_ai_teapot_offset.rgba').read_bytes())
W, H = 960, 480
font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 33)
small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
label = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 13)
size = (660, 357)
before = source.resize(size, Image.Resampling.LANCZOS)
after = result.resize(size, Image.Resampling.NEAREST)
proc = subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate','24','-i','-','-an','-c:v','libx264','-preset','slow','-crf','26','-pix_fmt','yuv420p','-movflags','+faststart',str(PROJECT/'preview.mp4')],stdin=subprocess.PIPE)
for frame in range(144):
    t=frame/24
    split=round(size[0]*(.5+.5*math.cos(math.pi*min(max((t-.5)/4,0),1))))
    im=Image.new('RGB',(W,H),'#0b0c0b');d=ImageDraw.Draw(im)
    d.text((27,20),'PixelSnap',font=font,fill='#f5f5ed')
    d.text((675,31),'EVERY PIXEL. IN ITS PLACE.',font=label,fill='#84f800')
    im.paste(before,(150,84),before)
    if split<size[0]:im.paste(after.crop((split,0,size[0],size[1])),(150+split,84),after.crop((split,0,size[0],size[1])))
    d.line((150+split,84,150+split,441),fill='#84f800',width=3)
    d.text((27,449),'AI IMAGE → REAL PIXEL ART',font=small,fill='#a7aaa0')
    d.text((700,449),'FREE · IN YOUR BROWSER',font=label,fill='#84f800')
    if frame==62:im.save(PROJECT/'poster.jpg',quality=87,optimize=True)
    proc.stdin.write(im.tobytes())
proc.stdin.close()
assert proc.wait()==0
print([(p.name,p.stat().st_size) for p in [PROJECT/'poster.jpg',PROJECT/'preview.mp4']])
