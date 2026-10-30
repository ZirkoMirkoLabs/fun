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

Smooth images use a disclosed approximate grid. Perspective, mixed grids and missing detail cannot be recovered. Optional cleanup can remove eyes or stars. For more than 16000 colour bins the JS fitter uses deterministic subsampling rather than NumPy's seeded random sampling; this is an explicit pathological-photo difference, not used by any acceptance sample.

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
