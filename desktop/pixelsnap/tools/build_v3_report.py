from pathlib import Path
import sys,json
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageOps
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from pixelsnap import snap,Options,variants
out=Path(sys.argv[1] if len(sys.argv)>1 else 'G:/tmp/pixelsnap-v3');out.mkdir(parents=True,exist_ok=True);exp=out/'expected';exp.mkdir(exist_ok=True)
new=sorted((ROOT/'samples/v3').glob('*-1.png'))
old=sorted(p for p in (ROOT/'samples/input').glob('*') if p.suffix in ('.png','.jpg'))
rows=[]
for p in old+new:
 isnew=p in new
 before=ROOT/'samples/v3/before'
 opts={} if isnew else json.loads((before/(p.stem+'_info.json')).read_text())['options']
 opts['edge_cleanup']='smart'
 if isnew and any(k in p.stem for k in ['knight','cat','food','frog']):opts['transparent']=True
 r=snap(p,Options(**opts));r.native.save(exp/(p.stem+'_native.png'));(exp/(p.stem+'_info.json')).write_text(json.dumps(r.metadata))
 r.native.resize((r.native.width*8,r.native.height*8),Image.Resampling.NEAREST).save(out/(p.stem+'_8x.png'))
 print(p.stem,r.native.size,r.metadata['grid'],r.metadata['warnings'],flush=True)
 rows.append(dict(source=str(p.resolve()),stem=p.stem,before=str(before/(p.stem+'_native.png')),options=opts))
(out/'fixtures.json').write_text(json.dumps(rows,indent=2))
sheet=Image.new('RGB',(1200, len(rows)*330),'#111311');d=ImageDraw.Draw(sheet);font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',16) if Path('C:/Windows/Fonts/consola.ttf').exists() else ImageFont.load_default(size=16)
for i,row in enumerate(rows):
 p=Path(row['source']);meta=json.loads((exp/(p.stem+'_info.json')).read_text());d.text((10,i*330+5),p.stem+' | '+str(meta['native_size'])+' | '+meta['grid']['x']['method'],font=font,fill='#84f800')
 for j,path in enumerate([p,Path(row['before']),exp/(p.stem+'_native.png')]):
  im=Image.open(path).convert('RGBA');im=ImageOps.contain(im,(380,268),Image.Resampling.LANCZOS if j==0 else Image.Resampling.NEAREST)
  d.text((j*400+10,i*330+28),['SOURCE','BEFORE','V3 AFTER'][j],font=font,fill='white');sheet.paste(im,(j*400+10,i*330+49),im)
sheet.save(out/'v3_sheet.png')
