# PixelSnap open-source survey

Checked 2026-10-30 using GitHub repository metadata, READMEs and actual licence
files. Activity below is GitHub `pushed_at`, not a maintenance guarantee. No Etsy
pages were accessed. No accounts, paid generations, pushes or deployments were used.

| Project / source | Licence verified | Last push (UTC) | Value to PixelSnap | Decision |
|---|---|---|---|---|
| [pixelfx](https://github.com/patch-gg/pixelfx) | [MIT](https://github.com/patch-gg/pixelfx/blob/fe7103c36d94e02f2d7df7d8f7a341e493837cde/LICENSE), code/effects; [font exception](https://github.com/patch-gg/pixelfx/blob/fe7103c36d94e02f2d7df7d8f7a341e493837cde/NOTICE.md) | 2026-10-30 | Seeded pixel VFX, animation, palette ramps, authoring conventions | **Integrated:** 24 overlays; preserve Patch/Hugo Duprez notices. Do not import Patch Pixel font or gallery assets. |
| [gifenc](https://github.com/mattdesl/gifenc) | [MIT](https://github.com/mattdesl/gifenc/blob/27db5b982dba701ca440b55ea36fad3999040973/LICENSE.md) for writer; separately derived PNN code has extra provenance | 2024-09-19 | Browser/Node animated GIF writer | **Integrated writer only.** Original exact-colour/RGB-cube palette mapper avoids importing its PNN quantizer. |
| [Piskel](https://github.com/piskelapp/piskel) | [Apache-2.0](https://github.com/piskelapp/piskel/blob/master/LICENSE) | 2026-10-27 | Browser sprite editing and animation workflows | **Skip code import:** duplicates the existing editor and adds an application-sized integration. Exported PNG/GIF/sheets are useful interchange. No Piskel assets copied. |
| [Pixelorama](https://github.com/Orama-Interactive/Pixelorama) | [MIT](https://github.com/Orama-Interactive/Pixelorama/blob/master/LICENSE) | 2026-10-27 | Full sprite/animation/tile editing built with Godot | **Skip embedding:** different runtime and much broader scope. PixelSnap PNG/sheets remain useful inputs to desktop art workflows. No Pixelorama code/assets copied. |
| [aseprite-mcp](https://github.com/diivi/aseprite-mcp) | [MIT](https://github.com/diivi/aseprite-mcp/blob/main/LICENSE) | 2026-10-21 | Agent drawing, palettes, visual feedback, animation tools | **Skip importing:** requires Aseprite and exposes a raw Lua route. PixelSnap instead adds bounded recipes and image-returning preview tools to its own MCP. No tool code copied. |
| [Aseprite](https://github.com/aseprite/aseprite) | [EULA](https://github.com/aseprite/aseprite/blob/main/EULA.txt), with separately licensed modules | 2026-10-29 | Established sprite editor and atlas interchange | **Skip application code:** source-available does not imply permission to vendor the application under MIT. Export generic Aseprite-style atlas metadata; no Aseprite implementation copied. |
| [color-namer](https://github.com/meodai/color-namer) | Repository reports MIT; bundled named-colour collections require their own provenance review | 2017-09-13 | Human-readable colour labels | **Skip:** no clear improvement to existing custom HEX/GPL palettes and Oklab reduction. Includes Pantone/NTC-derived lists; no collection copied without an asset-level audit. |

## pixelfx code review and integration

Pinned revision: `fe7103c36d94e02f2d7df7d8f7a341e493837cde`, package 0.2.0.
The inspected checkout has **232 effect modules** (excluding `_lib.js` helpers).
Each exports `meta` and either `draw(p,t,o)` or `create(o)` with simulation state.
Core renders colour and additive-light buffers, uses seeded random functions,
and steps simulations at 120 Hz or finer. Runtime dependencies: none. esbuild is
a build-time dependency. Upstream tools use Node and optionally ffmpeg, but they
are not shipped or invoked by PixelSnap.

The authoring examples and stock actors are code under the root MIT notice.
`gallery/fonts/PatchPixel-Regular.woff2` is explicitly excluded by NOTICE.md;
PixelSnap keeps its existing Silkscreen font. No gallery assets are imported.
`src/core/sim.js` and tagged effects credit Hugo Duprez's Sprite Fusion MIT code;
those copyrights and source references remain in the notice bundle.

Chosen architecture: reviewed, pinned native JavaScript bundle in a dedicated
module worker; the Python package invokes that same renderer through a fixed Node
entry point. Recipe inputs cannot select an import path. No server or third-party
request is needed by the web app. New effects are compositions of approved
operations using strictly validated JSON, not uploaded executable source.

Selected overlays (24):

```
arcane/arcane-orb, arcane/portal, arcane/rune-circle
explosions/firework-burst, explosions/small-explosion, explosions/smoke-bomb
fire/campfire, fire/candle, fire/torch
ice/ice-crystal, ice/snowflake-burst, impacts/hit-spark
lightning/ball-lightning, lightning/lightning-strike
nature/healing-bloom, nature/poison-cloud, pickups/collect-burst
water/bubbles, water/ripples, water/splash
weather/fireflies, weather/rain, weather/snow, ui/confetti
```

PixelSnap adds `pixel/tint`, `pixel/outline`, `pixel/dissolve` (27 selectable IDs).
The other **208** upstream modules are deliberately omitted. The curated set
covers common visual overlays without hardcoded stock-character silhouette
assumptions, and limits downloaded code. Actor-specific status/death/melee effects
would need explicit adaptation and additional arbitrary-sprite tests. They are
not represented as supported here. No catalogue claim implies all 232 are shipped.

Vendor sizes: pixelfx bundle 144,579 bytes; gifenc writer 3,788 bytes. Effects are
loaded on opening the effects panel. The initial page dependency preflight stays
under its unchanged 300,000-byte budget. Each vendor file is SHA-256 pinned in
`vendor-manifest.json`. Rebuild script: `tools/vendor_pixelsnap_effects.py`.

## gifenc provenance decision

Pinned revision: `27db5b982dba701ca440b55ea36fad3999040973`, version 1.0.3.
Its README/source identify `pnnquant2.js` as adapted from
[PnnQuant.js](https://github.com/mcychan/PnnQuant.js), whose current
[licence](https://github.com/mcychan/PnnQuant.js/blob/master/LICENSE) is MPL-2.0.
Rather than relying on the package's MIT label to cover that lineage, the shipped
entry exports only GIFEncoder. Tree shaking excludes the quantizer. PixelSnap's
own mapper preserves up to 255 exact colours plus transparency, otherwise uses a
216-colour RGB cube plus transparency. Soft alpha becomes binary in GIF; PNG and
sprite sheets preserve full RGBA. This is a deliberately modest encoder, with no
perceptual GIF quantization claim.

## Evidence and reproducibility

Local source checkouts: `G:/tmp/pixelsnap-pixelfx-source` and
`G:/tmp/pixelsnap-gifenc-source`. Saved API/search evidence and downloaded READMEs
and licences: `G:/tmp/pixelsnap-effects-research`. Discovery used the configured
public web-search router and GitHub repository search; decisions use the primary
repository files. The reviewed `repositories.json` is retained beside this report
as `pixelsnap-repositories.json`. Source dates/counts describe this audit only.

See [agent format and exact commands](../desktop/pixelsnap/EFFECTS.md) and
[validation results](pixelsnap-effects-validation.md).
