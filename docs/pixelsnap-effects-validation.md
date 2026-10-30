# PixelSnap effects: local validation

## One-click UX pass and follow-up review (2026-10-30)

The effects panel is now always open. After snapping/version generation, a curated
random effect appears automatically. All 27 effects have one-click thumbnails
made from the current image, with Surprise me, No effect and Undo apply controls.
Motion starts only when the preview is visible and reduced motion is off; Pause
and scrubbing remain respected. GitHub/how-to/agent navigation and larger buttons
are in place. Local-checkout installation is distinguished from the unreleased
GitHub package.

Follow-up fixes: copied agent calls are a machine-readable JSON array of tool
names/arguments. CLI/MCP PNG previews with no frame argument use the frame 45%
through the animation; explicit frame=0 still selects the initial frame. Hover
styling differs from the selected tile.

Latest observed checks:

```
python -m pytest tests/test_effects.py -q
15 passed in 5.20s

uv run --no-cache --isolated --no-project --with "G:/ClaudeOctober/XClaude/pixelsnap[mcp]" python tools/test_effects_mcp.py
PASS: 35 actual MCP calls; all 27 default PNG effects visibly change exact RGBA; snap -> preview image -> sheet/GIF; forbidden path and executable recipe rejected.

python tools/test_pixelsnap_effects_ui.py --output G:/tmp/pixelsnap-opus-ux-reviewed
PASS: desktop 1440, phone 390, tablet 768; 27 effects; automatic preview, one-click tiles/Surprise/No effect/Undo apply; autoplay+pause; rapid image race; PNG/sheet/apply exact RGBA; undo/redo; 30-frame GIF decode; recipe import/rejection; keyboard; zero CSP/console errors or third-party requests.

python tools/build_site.py
fun/projects/pixelsnap/index.html: 171,941/300,000 dependency bytes
Build passed: 4 project(s), 10 sitemap URLs; CSP and preflight verified

python tools/test_guardrails.py
Ran 8 tests in 0.367s
OK
```

The expanded browser test actually reads the clipboard after both install-copy
buttons and Copy agent call (built-in and custom recipe). Its rapid-image test
independently snaps the last Potion source and renders the chosen effect, then
compares exact exported PNG pixels. This confirms the final preview belongs to
the newest image, beyond merely checking a selected tile.

Latest screenshots and downloads: `G:/tmp/pixelsnap-opus-ux-reviewed/`.
Not exhaustively exercised: painting while previewing, maximum-size thumbnail
throughput, and physical mobile browsers. The earlier renderer/grid results
below remain applicable; descriptions of the old collapsed/explicit-play-only
interface are superseded by this section.

Validated 2026-10-30. Work remains local on `draft/pixelsnap-guide-copy`.
The existing uncommitted guide/CSS draft is preserved and extended. No publish,
deploy, remote push or PR. The unrelated main site checkout was not edited.

## What works

- 24 pinned pixelfx overlays and 3 native pixel operations, searchable by name/category.
- Local worker previews, explicit Play/Pause, frame selection, placement, scale,
  opacity, deterministic seed and source-alpha clipping (including partial alpha).
- Apply frame is undoable; existing PNG/SVG/palette/pack exports include applied edits.
- Preview PNG, animated GIF, PNG sprite sheet with atlas JSON, recipe download/import.
- CLI/MCP list, validate, preview and apply. MCP preview includes actual image content.
- New effects as bounded JSON compositions; no arbitrary code execution/import.
- Same pinned JS renderer in browser and Python's fixed Node runner.
- Conservative fallback for small cut-outs whose outline spacing mimics a coarse grid.

## Commands and observed output

From `G:/ClaudeOctober/XClaude/pixelsnap`:

```
python -m pytest -q
127 passed in 20.35s

python -m pytest tests/test_effects.py -q
14 passed in 4.50s
```

The focused rerun followed the final partial-alpha clipping adjustment.

From `fun`:

```
node tools/test_pixelsnap_effects.mjs
PASS: 27 effects, deterministic seek/repeat, empty input, alpha clipping, strict recipe rejection, limits, tint, sheet frame bytes and GIF signature.

node tools/test_pixelsnap_v3.mjs G:/tmp/pixelsnap-effects-validation/v3
20 snaps + 320 variants: 100% exact RGBA parity

node tools/test_pixelsnap_v2.mjs G:/tmp/pixelsnap-effects-validation/v3
Variants, cluster sampling, SVG, palette and ZIP checks passed.

node tools/test_pixelsnap_v31.mjs
32 variant/snap toggle, palette and metadata regressions passed; background notices passed

node tools/test_pixelsnap_small_sprites.mjs
PASS: 192 small-sprite fallback outputs match Python exactly in dimensions and RGBA.
```

The v3 fixtures were regenerated with `python tools/validate_v3.py
G:/tmp/pixelsnap-effects-validation/v3`. The old fixture directory had stale
metadata fields; the initial run against it failed on a missing field. The fresh
fixtures match, and all 20 native PNGs independently compare byte-for-byte with
the prior baseline outputs. All 27 effect PNGs written through the Python API
also match the canonical JS RGBA fixtures exactly.

Real MCP SDK calls, from the workspace:

```
uv run --no-cache --isolated --no-project --with "G:/ClaudeOctober/XClaude/pixelsnap[mcp]" python G:/ClaudeOctober/XClaude/pixelsnap/tools/test_effects_mcp.py
PASS: 8 actual MCP calls; 27 effects; snap -> preview image -> sheet/GIF; forbidden path and executable recipe rejected.
```

`--no-cache` was needed because uv initially reused an older local package build.
The system Python's incompatible MCP 2.x package was not used for this check.
The newly added standalone MCP test has a main guard so pytest collection does
not invoke it accidentally under that incompatible SDK.

Safe build destination: detached worktree
`G:/ClaudeOctober/XClaude/zirkomirko-pixelsnap-effects-check`, created from
`origin/main`, beside `fun`. Its build syncs the canonical `fun` source.

```
python tools/build_site.py
fun/projects/pixelsnap/index.html: 161,274/300,000 dependency bytes
Build passed: 4 project(s), 10 sitemap URLs; CSP and preflight verified

python tools/test_guardrails.py
Ran 8 tests in 0.324s
OK
```

The first build caught a CSS file over 16,000 bytes; effect styles were moved into
their own external stylesheet. No budget or CSP rule was loosened. Vendor hashes,
LF text, local references and no inline script/style requirements pass.

## Browser and actual exports

Test URL: `http://127.0.0.1:8843/fun/projects/pixelsnap/`, served only on loopback
with the built site's security headers. The shared T3 browser exercised the
desktop flow and produced real files. It then repeatedly timed out taking phone
screenshots, so verification continued with the project's Playwright runner.

```
python tools/test_pixelsnap_effects_ui.py
PASS: desktop 1440, phone 390, tablet 768; 27 effects; automatic preview, one-click tiles/Surprise/No effect/Undo apply; autoplay+pause; rapid image race; PNG/sheet/apply exact RGBA; undo/redo; 30-frame GIF decode; recipe import/rejection; keyboard; zero CSP/console errors or third-party requests.
```

The runner verifies lazy loading, automatic preview, one-click tiles, Surprise me,
No effect, Undo apply, rapid image changes, filtering, play/pause, source-alpha
clipping, imported two-layer recipes, invalid recipe rejection, keyboard focus,
no horizontal page overflow, and the retained guide/footer. Reduced motion is
enabled during these checks, so animations do not autoplay there. A separate run
with motion allowed verifies autoplay starts in view and Pause persists.

Pillow independently decodes downloaded PNG/GIF and ZIP sheet frames. Preview PNG
equals the matching atlas frame exactly; applied main PNG equals it; Undo equals the original
snapped PNG; Redo restores the effect PNG. All 30 GIF frames decode. This caught
Canvas's one-level RGB rounding through premultiplied alpha; PNG exports now encode
the original RGBA buffer with local CompressionStream deflate (stored-deflate
fallback) to avoid that loss.

Screenshots, exported files and machine-readable results:
`G:/tmp/pixelsnap-effects-validation/browser/`. Main screenshots:
`1440-full-page.png`, `1440-effects.png`, `390-effects.png` and `768-effects.png`.
MCP paths/results: `G:/tmp/pixelsnap-effects-validation/mcp-results.json`.

## Supplied sprite regressions

```
python tools/validate_effects_samples.py
PASS: 192 actual cut-out snaps; outputs below 16 pixels on either side: 148 before, 0 now. All four sheets tested with auto and manual cell=2.
```

The guard applies only to auto detection on images at most 192 pixels per side,
when a coarse pitch is insufficiently supported by actual pixel boundaries.
It retains real coarse nearest-neighbour grids and manual overrides. The supplied
cut-outs now produce 41–72 px widths and 46–74 px heights through an explicitly
labelled fallback, not a claim that their original pixel pitch was recovered.
All 192 outputs match Python/JS exactly. Visual review contact sheet and per-file
metadata: `G:/tmp/pixelsnap-effects-validation/cells/`.

Whole sheets remain a known limitation. Three supplied sheets still lock onto
character spacing; one uses the general fallback. All four manually using cell=2
produce 584×440 native images. The page warns to check sheet spacing and use manual
cell width/height. Crop a sprite or choose a smaller target grid before effects
when a whole sheet exceeds the 512-pixel effects limit.

## Remaining limits

- 208 upstream pixelfx effects omitted; no arbitrary-silhouette status/death port.
- Effects are fitted overlays; geometry and glow may clip at canvas boundaries.
- Agent recipes combine existing algorithms; new executable algorithms need review.
- CLI/MCP effects require Node 18+; the legacy Flask desktop UI has not gained the
  browser's new effects panel. The public browser app and agent/CLI are supported.
- Animation capped at 512 px per side, 120 frames, 4 MiPixels total.
- GIF uses binary alpha and an exact-colour/RGB-cube palette; PNG/sheets keep RGBA.
- Frame timing/loop quality follow the recipe and upstream effect duration; a
  composition is not automatically made seamless.
- Chromium was tested. Safari/Firefox and physical-phone performance are unverified.

See [repository survey](pixelsnap-effects-survey.md) and
[agent commands and effect format](../desktop/pixelsnap/EFFECTS.md).
