# PixelSnap effects and agent authoring

Source: https://github.com/ZirkoMirkoLabs/fun/tree/main/desktop/pixelsnap
PixelSnap 3.1.0 includes the effects tools. Install from GitHub or a local checkout.
Effects require Node.js 18+ on PATH. Python snapping still works without Node.
Browser and Python use the **same JavaScript renderer**, copied and hash-verified
by `tools/sync_effects.py` before `tools/sync_public.py` in the development workspace.
In a standalone fun checkout, run `python tools/sync_pixelsnap_runtime.py`.

## Install from GitHub

```sh
uvx --refresh --from "git+https://github.com/ZirkoMirkoLabs/fun#subdirectory=desktop/pixelsnap" pixelsnap mcp
```

Use the same prefix with `pixelsnap effects list` to list the 27 effects.
For Claude Code, prefix the MCP command with `claude mcp add pixelsnap -- `.
Use `--input-root` and `--output-root` to choose which local files agents can access.

## Commands

Run from the Python source directory or `fun/desktop/pixelsnap`:

```sh
uv run --isolated --no-project --with ".[mcp]" pixelsnap effects list
uv run --isolated --no-project --with ".[mcp]" pixelsnap snap input.png -o snapped --cell 2 --json
uv run --isolated --no-project --with ".[mcp]" pixelsnap effects preview snapped/input_native.png --effect fire/torch --frame 6 -o effects
uv run --isolated --no-project --with ".[mcp]" pixelsnap effects validate effects-example.json
uv run --isolated --no-project --with ".[mcp]" pixelsnap effects apply snapped/input_native.png --recipe effects-example.json --format gif -o effects
uv run --isolated --no-project --with ".[mcp]" pixelsnap effects apply snapped/input_native.png --recipe effects-example.json --format sheet -o effects
uv run --isolated --no-project --with ".[mcp]" pixelsnap mcp --input-root ./assets --output-root ./out
```

Omit `--cell` when auto detection is appropriate. Frame indices start at zero.
Effects commands always print JSON on success. If uv reuses an older local build
after source edits, add `--no-cache` to the first validation run. `preview` writes a PNG;
`apply --format png|gif|sheet` writes unique folders and never overwrites inputs.
Sheets contain `sheet.png` and an Aseprite-style `sheet.json`: rectangles,
durations, source sizes, loop metadata and the recipe. Browser sheets are ZIPs.
GIF/sheets and CLI PNG are native size. Browser preview PNG uses Export scale.

## MCP workflow

1. `list_effects()` returns 27 IDs, metadata and limits. Any of them works below:
   24 pixelfx overlays plus pixel/tint, pixel/outline and pixel/dissolve.
2. `snap_image(path="input.png", options={"cell":2})` returns a native PNG path.
3. `preview_effect(path="ABSOLUTE_NATIVE_PATH", effect="fire/torch", frame=6)`
   returns PNG image content and paths, so an agent can inspect the result.
4. `validate_effect(recipe=RECIPE_OBJECT)` checks and normalizes a new recipe.
5. `preview_effect(path="ABSOLUTE_NATIVE_PATH", recipe=RECIPE_OBJECT, frame=6)`.
   Inspect early, middle and late frames; revise the recipe.
6. `apply_effect(path="ABSOLUTE_NATIVE_PATH", recipe=RECIPE_OBJECT, format="sheet")`
   or `format="gif"` exports the animation.

Supply exactly one `effect` or `recipe`. Effects can read from either configured
root, so snap output can be chained directly. Files are always written in unique
folders within output_root.

## Create an effect

Start with `effects-example.json` or Save recipe in the browser. Name the intended
look, choose approved IDs from list_effects, combine up to four layers in drawing
order, validate, preview on real artwork, refine, then export. Import the same JSON
in Add pixel effects. Imported recipes are not installed globally. Keep the recipe
with the artwork for reproducibility. In the browser, Copy agent call gives the
call for the effect on screen. The browser previews an effect as soon as pixels
are ready; it animates unless the device asks for reduced motion, and Pause stops it.

Top-level fields (unknown keys are rejected):

- `version`: exactly 1
- `name`: 1–80 characters
- `fps`: integer 1–30, default 15
- `duration`: .1–8 seconds, default 2; ceil(duration*fps) must be <= 120
- `loop`: boolean, default true; controls playback repetition, not loop quality
- `layers`: 1–4 objects

Layer fields:

- `effect`: exact approved ID, never a URL, file path, code or recursive recipe
- `x`, `y`: centre as fraction of canvas, 0–1; default .5
- `scale`: .1–4, default 1 (aspect-preserving fit)
- `opacity`: 0–1, default 1
- `seed`: integer 0–2147483647, default 1
- `clip`: boolean, default false; clips overlay alpha to original source alpha
- `palette`: optional 2–16 #rrggbb colours, dark to bright, for pixelfx overlays
- `color`: optional #rrggbb for tint/outline, default #84f800
- `amount`: 0–1; tint strength (default .5) or dissolve maximum (default 1)

`pixel/tint` changes visible RGB and preserves alpha. `pixel/outline` adds a
one-pixel four-neighbour border inside the canvas; clip=true suppresses that outer
border. `pixel/dissolve` removes seeded pixels, peaks at mid-duration and returns
toward the start. Position/scale/palette are ignored by pixel operations. Opacity
affects tint/outline; dissolve uses amount. Imported first-layer controls can be
adjusted in the UI; additional layers remain in the JSON recipe.

Overlay sampling is nearest-neighbour on the native grid. Canvas dimensions stay
unchanged, so effect edges can clip. The source itself is not rescaled. No stock
actor is drawn. These overlays are not silhouette-aware status effects.

## Security and limits

Recipes are bounded JSON data, **not executable plugins**. The validator rejects
unknown properties/IDs, invalid colours, non-finite values, booleans used as
numbers, excessive layers and frame counts. Rendering calls only pinned modules
in an explicit registry; no recipe is evaluated, imported or executed as code.
New drawing algorithms require a reviewed source change and rebuilt vendor bundle.

The dedicated browser worker is terminated after a 30-second timeout. Python
invokes only the fixed packaged Node runner, without a shell, removes NODE_OPTIONS
and NODE_PATH, and kills timed-out jobs after 30 seconds. MCP resolves image paths
within its input/output roots. These guards protect this data-only format; they
are not a general sandbox for arbitrary code.

Input: already snapped RGBA, at most 512 pixels per side. Animation: 120 frames and
4,194,304 total pixels (including unused sheet slots). Reduce size/duration/fps if
exceeded. GIF preserves up to 255 exact colours plus transparency per frame, otherwise
uses a 216-colour RGB cube plus transparency. It has binary alpha (threshold 128) and
centisecond frame timing. PNG/sheets preserve RGBA including soft glow. Layers can
have different upstream durations; seamless looping is the author's responsibility.
The browser and Node runtimes use identical code; floating-point platform details
may still vary across engines. All processing and import/export stay on device.

## Attribution

24 pixelfx overlays from Patch and Hugo Duprez, revision
`fe7103c36d94e02f2d7df7d8f7a341e493837cde` (0.2.0). The other 208 upstream effects
are not shipped, to bound load and avoid stock-character assumptions. Patch Pixel
font and gallery assets are excluded. GIF: mattdesl/gifenc 1.0.3, revision
`27db5b982dba701ca440b55ea36fad3999040973`. MIT notices are retained in both vendor
directories and `effects-notices.txt`. See the repository survey for selection.

PNG and MCP previews default to the frame 45% through the animation, so effects are visible immediately. Pass --frame 0 (CLI) or frame=0 (MCP) to deliberately render the first frame. Copy agent call copies a JSON array of tool names and arguments; replace ABSOLUTE_NATIVE_PATH with the native PNG path.
