"""Native-grid exports. Size variants use nearest-neighbour, never interpolation."""
from io import BytesIO
from pathlib import Path
import zipfile
from PIL import Image
import numpy as np


def svg(image):
    a = np.asarray(image.convert('RGBA'))
    h, w = a.shape[:2]
    rects = []
    for y in range(h):
        x = 0
        while x < w:
            color = a[y, x]
            end = x+1
            while end < w and np.array_equal(a[y, end], color):
                end += 1
            if color[3]:
                fill = '#' + ''.join(f'{v:02x}' for v in color[:3])
                alpha = f' fill-opacity="{color[3]/255:.6f}"' if color[3] != 255 else ''
                rects.append(f'<rect x="{x}" y="{y}" width="{end-x}" height="1" fill="{fill}"{alpha}/>')
            x = end
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" shape-rendering="crispEdges">\n' + '\n'.join(rects) + '\n</svg>\n'


def palette_hex(palette):
    return ''.join(color.lstrip('#').lower()+'\n' for color in palette)


def palette_gpl(palette, name='PixelSnap'):
    name = name.replace('\r', ' ').replace('\n', ' ')
    lines = ['GIMP Palette', f'Name: {name}', 'Columns: 8', '# PixelSnap']
    for color in palette:
        color = color.lstrip('#')
        channels = [int(color[i:i+2], 16) for i in (0, 2, 4)]
        lines.append(' '.join(str(v) for v in channels) + f' #{color.lower()}')
    return '\n'.join(lines)+'\n'


def nearest_fit(image, size):
    if not isinstance(size, int) or isinstance(size, bool) or not 1 <= size <= 8192:
        raise ValueError('Fit size must be an integer from 1 to 8192.')
    w, h = image.size
    # Explicit half-up rounding, shared with export-core.mjs.
    from math import floor
    size = (max(1, floor(w*size/max(w,h)+.5)), max(1, floor(h*size/max(w,h)+.5)))
    return image.resize(size, Image.Resampling.NEAREST)


def pack_files(result):
    def png(image):
        stream = BytesIO()
        image.save(stream, format='PNG')
        return stream.getvalue()
    native = result.native
    files = {'native.png': png(native)}
    for size in (16, 32, 64, 128):
        files[f'fit-{size}.png'] = png(nearest_fit(native, size))
    if native.width*native.height*64 > 32_000_000:
        raise ValueError('8x preview exceeds 32 megapixels.')
    files['preview-8x.png'] = png(native.resize((native.width*8, native.height*8), Image.Resampling.NEAREST))
    files['palette.hex'] = palette_hex(result.metadata['palette']).encode()
    files['palette.gpl'] = palette_gpl(result.metadata['palette']).encode()
    files['native.svg'] = svg(native).encode()
    return files


def save_pack(result, destination, *, overwrite=False):
    """Write a new folder or .zip, refusing collisions unless overwrite is set."""
    destination = Path(destination).resolve()
    files = pack_files(result)
    if destination.suffix.lower() == '.zip':
        destination.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(destination, 'w' if overwrite else 'x', compression=zipfile.ZIP_STORED) as archive:
            for name, content in files.items():
                archive.writestr(name, content)
    else:
        destination.mkdir(parents=True, exist_ok=True)
        if not overwrite and any((destination/name).exists() for name in files):
            raise FileExistsError('Pack already exists; choose another folder or --overwrite.')
        for name, content in files.items():
            with (destination/name).open('wb' if overwrite else 'xb') as output:
                output.write(content)
    return str(destination)
