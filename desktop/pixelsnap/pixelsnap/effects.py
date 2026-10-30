"""Effects use the identical pinned JS renderer shipped by the browser.

Node is a required optional runtime for effects only. Recipes are strictly validated
data, not code. No user paths are ever evaluated or imported by Node.
"""
from pathlib import Path
import base64
import json
import math
import os
import shutil
import subprocess
import uuid

ROOT = Path(__file__).resolve().parent
MAX_RECIPE_BYTES = 16384


def _run(message):
    node = shutil.which('node')
    if not node:
        raise ValueError('Effects require Node.js 18+ on PATH. Image snapping still works without Node.')
    env = {k: v for k, v in os.environ.items() if k.upper() not in ('NODE_OPTIONS', 'NODE_PATH')}
    result = subprocess.run([node, str(ROOT/'effects_runner.mjs')], input=json.dumps(message, allow_nan=False),
                            text=True, encoding='utf-8', capture_output=True, timeout=30, env=env,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    try:
        response = json.loads(result.stdout)
    except ValueError as exc:
        raise ValueError('Effects renderer failed. Check Node.js 18+ and the installed runtime files.') from exc
    if result.returncode or 'error' in response:
        raise ValueError(response.get('error', 'Effects renderer failed.'))
    return response['result']


def list_effects():
    return {'schema_version': 1, 'runtime': 'Node.js 18+', 'effects': _run({'type': 'list'}),
            'limits': {'side': 512, 'frames': 120, 'layers': 4, 'sheet_pixels': 4194304, 'recipe_bytes': MAX_RECIPE_BYTES},
            'authoring': 'Validated JSON recipes only. See EFFECTS.md. No executable plugins.'}


def validate_effect(recipe):
    if len(json.dumps(recipe, allow_nan=False).encode()) > MAX_RECIPE_BYTES:
        raise ValueError('Recipe exceeds 16 KB.')
    return _run({'type': 'validate', 'recipe': recipe})


def load_recipe(path):
    p = Path(path)
    if p.stat().st_size > MAX_RECIPE_BYTES:
        raise ValueError('Recipe exceeds 16 KB.')
    return validate_effect(json.loads(p.read_text(encoding='utf-8')))


def apply_effect(path, output, effect=None, recipe=None, frame=None, format='png'):
    """Render an already snapped image; writes unique artifacts, never overwrites inputs."""
    from PIL import Image, ImageOps
    if format not in ('png', 'gif', 'sheet'):
        raise ValueError('Effect format must be png, gif or sheet.')
    if (effect is None) == (recipe is None):
        raise ValueError('Supply exactly one effect ID or recipe.')
    if recipe is not None:
        recipe = validate_effect(recipe)
    else:
        recipe = _run({'type': 'recipe', 'effect': effect})
    if frame is None:
        frame = math.floor(math.ceil(recipe['duration']*recipe['fps'])*.45)
    # Inspect size before full decode; avoid loading huge images just to reject them.
    if Path(path).stat().st_size > 20*1024*1024:
        raise ValueError('Effects input exceeds 20 MiB.')
    with Image.open(path) as header:
        if not (1 <= header.width <= 512 and 1 <= header.height <= 512):
            raise ValueError('Effects require a snapped image at most 512 pixels per side. Snap it first.')
        image = ImageOps.exif_transpose(header).convert('RGBA')
    result = _run({'type': 'frame' if format == 'png' else format, 'recipe': recipe, 'frame': frame,
                   'width': image.width, 'height': image.height, 'rgba': base64.b64encode(image.tobytes()).decode()})
    raw = base64.b64decode(result['data'], validate=True)
    directory = Path(output).resolve()/('effect-'+uuid.uuid4().hex)
    directory.mkdir(parents=True, exist_ok=False)
    outputs = {}
    if format == 'gif':
        target = directory/'animation.gif'
        target.write_bytes(raw)
        outputs['gif'] = str(target)
    else:
        target = directory/('sheet.png' if format == 'sheet' else 'frame.png')
        Image.frombytes('RGBA', (result['width'], result['height']), raw).save(target)
        outputs['sheet' if format == 'sheet' else 'png'] = str(target)
        if format == 'sheet':
            atlas = directory/'sheet.json'
            atlas.write_text(json.dumps(result['atlas'], indent=2)+'\n', encoding='utf-8')
            outputs['atlas'] = str(atlas)
    definition = directory/'recipe.json'
    definition.write_text(json.dumps(recipe, indent=2)+'\n', encoding='utf-8')
    outputs['recipe'] = str(definition)
    return {'schema_version': 1, 'status': 'ok', 'input': str(Path(path).resolve()), 'outputs': outputs,
            'recipe': recipe, 'frame': frame if format == 'png' else None,
            'native_size': list(image.size), 'alpha': 'binary, 256-colour quantized' if format == 'gif' else 'full RGBA'}


def main(argv):
    from .cli import Parser
    p = Parser(prog='pixelsnap effects')
    commands = p.add_subparsers(dest='command', required=True)
    commands.add_parser('list')
    check = commands.add_parser('validate'); check.add_argument('recipe')
    for name in ('preview', 'apply'):
        c = commands.add_parser(name)
        c.add_argument('input')
        c.add_argument('-o', '--output', default='out')
        choice = c.add_mutually_exclusive_group(required=True)
        choice.add_argument('--effect'); choice.add_argument('--recipe')
        c.add_argument('--frame', type=int, help='Zero-based frame; omitted selects 45%% through the animation.')
        if name == 'apply': c.add_argument('--format', choices=['png', 'gif', 'sheet'], default='png')
    args = p.parse_args(argv)
    if args.command == 'list': result = list_effects()
    elif args.command == 'validate': result = {'valid': True, 'recipe': load_recipe(args.recipe)}
    else: result = apply_effect(args.input, args.output, args.effect,
                               load_recipe(args.recipe) if args.recipe else None, args.frame,
                               getattr(args, 'format', 'png'))
    print(json.dumps(result, allow_nan=False))
    return 0
