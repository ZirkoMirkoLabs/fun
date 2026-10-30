# fun

Small browser experiments by [ZirkoMirko](https://x.com/Zirkomirko). Each one is plain static files, so there's no build step. The site mirrors this layout: `projects/<slug>/` here is `zirkomirko.com/fun/projects/<slug>/` there. Play with them at **[zirkomirko.com/fun/projects](https://zirkomirko.com/fun/projects/)**.

| Project | What it is | Play |
|---|---|---|
| [PixelSnap](projects/pixelsnap) | Snap images to real pixel art, try 27 effects and export PNG, GIF or sprite sheets. Browser, CLI and MCP agent tools. | [open](https://zirkomirko.com/fun/projects/pixelsnap/) |
| [Write in Stars](projects/write-in-stars) | Type anything and a galaxy of ~60k stars spells it. Drop in an image and the stars become it. | [open](https://zirkomirko.com/fun/projects/write-in-stars/) |

## Layout

```
projects/
  <slug>/
    index.html   the project
    vendor/      libraries it uses, copied in (no CDNs, works offline)
    fonts/       self-hosted web fonts
    poster.webp  still for the gallery card (2:1)
    preview.mp4  short muted loop for the gallery card (2:1)
    og.jpg       1200x630 social preview
    README.md    what it is and how it works
```

## Run one locally

Serve the project folder with any static server, for example:

```
cd projects/write-in-stars
python -m http.server 8000
```

Then open http://localhost:8000.

## Before committing

Install the local secret hook once per clone: `git config --local core.hooksPath .githooks`.

Run `python tools/scan_secrets.py --staged` and `node tools/test_image_input.mjs`. Then run `python tools/build_site.py` in the sibling `zirkomirko-site` repo to sync and validate the hosted result. It owns the CSP, URL, metadata, vendor-hash and size checks. Review both repositories before committing. See [SECURITY.md](SECURITY.md) and [vendor-manifest.json](vendor-manifest.json).
