from pathlib import Path
import sys,json,time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pixelsnap import variants
out=Path(sys.argv[1] if len(sys.argv)>1 else 'G:/tmp/pixelsnap-v3')
# Generate expected snaps and the review sheet before the variant fixtures.
import subprocess
subprocess.run([sys.executable,str(Path(__file__).with_name('build_v3_report.py')),str(out)],check=True)
rows=json.loads((out/'fixtures.json').read_text())
for row in rows:
 dest=out/'variants'/row['stem'];dest.mkdir(parents=True,exist_ok=True)
 for v in variants(row['source']):
  v['native'].save(dest/(v['preset']+'.png'))
  (dest/(v['preset']+'.json')).write_text(json.dumps(v['meta']))
 print(row['stem'],flush=True)
