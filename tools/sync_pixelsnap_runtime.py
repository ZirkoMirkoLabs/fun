"""Sync canonical browser effects into the distributable Python package (no network).

The sibling pixelsnap/tools/sync_public.py maintains the full desktop copy in the
development workspace. This smaller script works in a standalone fun checkout.
"""
from pathlib import Path
import hashlib
import shutil

root=Path(__file__).resolve().parents[1]
web=root/'projects/pixelsnap'
target=root/'desktop/pixelsnap/pixelsnap/effects_runtime'
files=[web/name for name in ('effects-core.mjs','effects-export.mjs','effects-catalog.json','effects-guide.txt','effects-notices.txt')]
files += [p for folder in ('pixelfx-0.2.0','gifenc-1.0.3') for p in (web/'vendor'/folder).iterdir() if p.is_file()]
for p in files:
    dest=target/p.relative_to(web);dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(p,dest)
    assert hashlib.sha256(p.read_bytes()).digest()==hashlib.sha256(dest.read_bytes()).digest()
print(f'Synced and hash-verified {len(files)} browser effects runtime files into desktop/pixelsnap.')
