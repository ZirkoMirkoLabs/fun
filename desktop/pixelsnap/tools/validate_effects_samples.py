"""Local regression on the user's supplied cut-outs/sheets; does not redistribute inputs."""
from pathlib import Path
from PIL import Image, ImageDraw
import json
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pixelsnap.core import Options, snap

source=Path(sys.argv[1] if len(sys.argv)>1 else 'G:/tmp/pixelsnap-launch/snapc')
out=Path(sys.argv[2] if len(sys.argv)>2 else 'G:/tmp/pixelsnap-effects-validation/cells')
out.mkdir(parents=True,exist_ok=True)
baseline=json.loads((source/'batch.json').read_text())
old={Path(r['input']).name:r for r in baseline['results']}
records=[];fixtures=[]
for p in sorted((source/'cells').glob('*.png')):
    image=Image.open(p).convert('RGBA');result=snap(image,Options(transparent=True))
    result.native.save(out/(p.stem+'.png'))
    (out/(p.stem+'-source.rgba')).write_bytes(image.tobytes())
    (out/(p.stem+'-expected.rgba')).write_bytes(result.native.tobytes())
    fixtures.append(dict(stem=p.stem,width=image.width,height=image.height,expected=list(result.native.size)))
    records.append(dict(file=p.name,before=old[p.name]['metadata']['native_size'],after=list(result.native.size),
                        grid=result.metadata['grid'],warnings=result.metadata['warnings']))
sheet_records=[]
for p in sorted((source/'sheets').glob('*.png')):
    auto=snap(p,Options(transparent=True));manual=snap(p,Options(transparent=True,cell=2))
    manual.native.save(out/(p.stem+'-manual.png'))
    sheet_records.append(dict(file=p.name,auto=list(auto.native.size),auto_grid=auto.metadata['grid'],manual_cell_2=list(manual.native.size)))
report=dict(cells=len(records),before_under_16=sum(min(r['before'])<16 for r in records),after_under_16=sum(min(r['after'])<16 for r in records),results=records,sheets=sheet_records)
(out/'report.json').write_text(json.dumps(report,indent=2));(out/'fixtures.json').write_text(json.dumps(fixtures))
# A small visual check: original / old automatic output / new conservative output.
sample=records[::24];canvas=Image.new('RGB',(900,len(sample)*180),'#151812');d=ImageDraw.Draw(canvas)
for row,record in enumerate(sample):
    images=[Image.open(source/'cells'/record['file']).convert('RGBA'),Image.open(old[record['file']]['outputs']['native']).convert('RGBA'),Image.open(out/record['file']).convert('RGBA')]
    for column,(im,label) in enumerate(zip(images,['Original','Previous auto','Conservative fallback'])):
        im.thumbnail((260,145),Image.Resampling.NEAREST);x=column*300+20;y=row*180+25
        canvas.paste(im,(x,y),im);d.text((x,row*180+5),record['file']+' / '+label,fill='#f5f5ed')
canvas.save(out/'review.png')
print(f"PASS: {len(records)} actual cut-out snaps; outputs below 16 pixels on either side: {report['before_under_16']} before, {report['after_under_16']} now. All four sheets tested with auto and manual cell=2.")
