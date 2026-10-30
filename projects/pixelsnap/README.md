# PixelSnap

**[Use PixelSnap free in your browser](https://zirkomirko.com/fun/projects/pixelsnap/)**

Recover a real pixel grid from blurry AI pixel art, reduce the palette and export crisp PNGs. Images stay on your device. No account, backend, paid compute or runtime dependencies. The browser port runs in a module Web Worker with an OffscreenCanvas, and caches sampled cells when only colour settings change.

## Desktop / batch / agents

The original Python app is available in [desktop/pixelsnap](../../desktop/pixelsnap). Download or clone this repository, open that folder and run `run.bat` (Windows) or `sh run.sh` (macOS/Linux). First setup downloads Python/dependencies; subsequent cached launches work offline. The desktop README documents CLI, Python and MCP usage. The original Python implementation is preserved.

With uv installed, from that folder:

```sh
uvx --python 3.12 --from ".[web]" pixelsnap serve
uvx --python 3.12 --from . pixelsnap snap input.png -o out --json
```

## V2 workflow

Eight engine-generated versions, Off/Smart/Strong edge cleanup, zoom/pan and reversible native-pixel touch-ups. PNG exports default to 8x nearest-neighbour; native remains selectable. SVG, transparent PNG, a nine-file ZIP pack, GPL/HEX palettes and clipboard images include edits. Clean uses at most 16 colours, capped at the Faithful variant colour count.

The browser imports its local `presets.json`. Keep it byte-identical to `desktop/pixelsnap/pixelsnap/presets.json`; the v2 parity test checks this. The UI directly uses worker `presets`, `snap` and `variants` messages and the shared `export-core.mjs` exporters.

V2 checks: `node tools/test_pixelsnap_v2.mjs` (80 Python/JS variant comparisons), and `python tools/test_pixelsnap_ui.py --url http://127.0.0.1:8826/fun/projects/pixelsnap/ --output G:/tmp/pixelsnap-v2/final` (desktop/mobile flows, independent export validation). Generate expected fixtures first with `python ../pixelsnap/tools/validate_v2.py`.

## Implementation and limits

`math.mjs`, `grid.mjs`, `core.mjs` and `palettes.mjs` port the existing Python algorithm: spectral edge/curvature evidence, fractional per-axis pitch and phase, drift correction, nine alpha-aware weighted-cluster samples, bilinear unmixing, deterministic Oklab palette fitting, Bayer dithering, border-connected background removal and synchronous eight-neighbour cleanup.

UI: mobile upload/drop, before/after slider, all eight preset palettes, custom hex/GPL import, colour ceiling, manual grid/phase, 16–128 px target grids and nearest-neighbour 1–32× PNG export.

Inputs: PNG/JPEG/WebP/GIF first frame, at most 20 MiB, 16 MiPixels and 8192 px per side. Encoded headers are checked before decode using the site's existing input validator. Animated WebP and SVG are rejected. Images above 2048 px on the long side are downscaled with a visible notice. Native output is capped at 1 MP; exports at 32 MP and 16384 px per side. Browser colour management and JPEG decoding can differ from Pillow. Binary alpha is intentional.

Smooth images use a disclosed approximate grid. Perspective, mixed grids and missing detail cannot be recovered. Optional cleanup can remove eyes or stars. For more than 16000 colour bins both ports use the same deterministic stride subsampling.

## Parity and verification

From the repository root: `node tools/pixelsnap-parity.mjs ../pixelsnap G:/tmp/pixelsnap-web`. The Node runner executes the actual production JS modules against all ten original fixtures and compares saved Python metadata and native PNGs. Python/Pillow only decode image files in this test; the browser ships no Python.

Grid match tolerance: pitch ≤0.01 source px, phase ≤0.02 source px, identical native dimensions. All ten samples match, with **100% exact RGBA pixel agreement**. Median three-run Node processing times on the development PC: rhino 245 ms, earth 305 ms, teapot 423 ms, fantasy 284 ms, alien 380 ms, JPEG rhino 133 ms, offset teapot 240 ms, mountains 419 ms, 5.5× sprite 29 ms, 7.25× sprite 55 ms. Decode, browser startup and export are excluded. This is a fixture check, not a guarantee for arbitrary images/devices.

`tools/pixelsnap-media.py` produces the 960×480, 6-second, 24 fps H.264 silent card video and JPEG poster from real source and JS parity output.

## Example licences

Samples are separately licensed from the MIT app. See the retained [source record](../../desktop/pixelsnap/samples/SOURCES.md) for full source URLs and transformations.

* `examples/teapot.webp`: Vedmaka / Google AI, Wikimedia `Mediawiki-extension-blockai-thumbnail.png`, CC0 1.0. The cropped half-size test case is re-encoded as WebP quality 85 for the website.
* `examples/sprite-55.jpg` and `sprite-725.jpg`: Belohlavek, OpenGameArt `character-sprite-walk-animation`, CC0 1.0. Deliberately enlarged/blurred JPEG variants; original sample bytes retained.
* Poster/video: the same CC0 teapot and its actual reconstructed output.

No third-party resource requests are made by the app. The site's build sets `Cache-Control: public, no-cache, no-transform` for PixelSnap to prevent Cloudflare from injecting its analytics beacon on this page. Other pages retain their existing analytics policy.

## V3 results and examples

V3 removes a detected painted checkerboard before grid detection. Remove flat background also removes border-connected light sticker fringes before sampling. White details enclosed by an outline remain opaque.

Repeated aligned bright glyphs in the top eighth of an image trigger a half-pitch sampling grid, labelled **Mixed-scale approximation**. This protects common HUD text; arbitrary mixed scales and perspective remain limitations. Manual grids take priority.

Without a consistent grid, image detail chooses a 128, 160 or 192 px long side. Area means are restricted to the centre pixel's contrast group at hard edges, followed by the same Oklab palette fitting. Metadata and the UI explicitly identify this fallback. No missing detail is invented.

The browser picker includes eight owner-generated examples and the 5.5x blurry sprite. All ten new originals are in `samples/v3/` in the Python distribution. Transparent sprite examples enable Remove flat background; the eight existing version presets remain stable.

Validation (2026-10-30): 104 Python tests, 20 full-image comparisons and 160 preset comparisons with 100% exact RGBA Python/JS parity. Recreate fixtures with `python pixelsnap/tools/validate_v3.py G:/tmp/pixelsnap-v3` from the parent workspace; from `fun`, run `node tools/test_pixelsnap_v3.mjs G:/tmp/pixelsnap-v3`. The separate v2 exporter/sampling suite accepts that same fixture directory as its first argument.

## V3.1 option and palette consistency

Version generation accepts base options (`variants(image, presets=None, options=None)` in Python; `variants(data, width, height, names, baseOptions)` in JavaScript). Each preset overrides only its own keys, with one recovered-grid detection shared across versions. The browser rebuilds tiles when sticky toggles change and labels the current output with its actual nontransparent RGB palette count. Notices distinguish background removal, painted checkerboard removal and source transparency.

The v3 parity scripts also compare 160 variants with transparency, cleanup and dithering enabled. Run `node tools/test_pixelsnap_v31.mjs` for the toggle/palette regressions and `python tools/test_pixelsnap_v31_ui.py --output G:/tmp/pixelsnap-v31/live` for all nine examples at 1440/390 px, including thumbnails, toggle changes, selected PNG bytes and palette counts.

## PixelSnap 3.1.0 effects

24 pixelfx overlays, 3 pixel operations, validated JSON recipes, preview PNG, GIF and sprite-sheet export. Effects use the same JS renderer in browser and CLI/MCP (Node 18+ required for CLI/MCP effects). See [effects-guide.txt](effects-guide.txt). Effects load automatically with one-click thumbnails, a Surprise button and undoable application.
