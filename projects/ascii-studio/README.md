# ASCII Studio

**[Use ASCII Studio free in your browser](https://zirkomirko.com/fun/projects/ascii-studio/)**

Type text or drop an image and it becomes animated ASCII art. Images stay on your device: no account, backend or upload. Export a PNG, a TXT or a video of one seamless loop. For batches, see the [command-line tool](../../desktop/ascii-studio).

## Styles

- **Liquid glyph** draws the shape in tiny characters that bend with a flowing warp, with dim trails, tendrils, dust and glow. It keeps outlines, not detail, so it suits text, logos and bold shapes. The pointer pushes the warp around.
- **Pixel** uses a 5x5 bitmap font, so solid areas read as flat colour and mid-tones as ASCII dither. It suits pictures. Palettes can be a single hue, the image's hues, or its exact colours.

## How it works

Plain static files with no build step and no libraries. `studio.mjs` is one WebGL 2 program.

Each input is drawn to a canvas, then reduced to a signed distance field, a luminance map and two blurs. Liquid warps a character grid through a low-resolution curl-noise field; Pixel displaces samples per cell and picks a glyph from local tone. Time walks a circle through the noise, so every animation loops exactly. TXT export runs the same shader with one output pixel per character.

Uploaded images get automatic motion: whatever connects to the border is treated as background and rolls, the subject's rim sways around its centre, and its core holds still. It doesn't know what hair or smoke is. The Terra and Smoke examples use hand-drawn motion regions instead, which is why they move more.

## Limits

Inputs are PNG, JPEG, WebP or GIF (first frame), up to 20 MiB, 16 MiPixels and 8192 px per side, validated before decoding by `image-input.mjs`. Busy images with no clear subject just drift gently. Liquid resolution drops automatically on slow devices. It needs WebGL 2. Animation starts paused if your device asks for reduced motion. Video export depends on your browser's MediaRecorder support.

## Run locally

Serve this folder with any static server, because browsers block WebGL textures and modules on `file://`:

```sh
python -m http.server 8000
```

## Licence

Code: MIT (see `LICENSE.txt`). The example art (`terra.webp`, `smoke.webp`) and the gallery media made from it are not covered by the MIT licence.
