# Driftlight

A jellyfish ocean you can swim. Made of code.

Move the mouse to steer, hold to swim, and use the wheel to zoom. Dive in to explore; the three-dot menu changes colour, sound, captures, and returns to the title. Touch controls support phones. Requires WebGL 2. All runtime resources are self-hosted.

## Publishing build

Source: `zm-ether-variants/vitreous` in the ZirkoMirko workspace.

```sh
npx vite build --config vite.site.config.js --base ./ --outDir dist-site
python stage-site.py
```

The separate publish config handles chunking, metadata, LF output and URLs. The normal app/cine build remains unchanged. App modules stay below 60,000 bytes. Package chunks live in versioned vendor directories and are SHA-256 pinned in `fun/vendor-manifest.json`, with lockfile provenance. Licenses are included where shipped by the npm package; notices record omitted upstream license files. CSS is split at complete rule boundaries below 16,000 bytes.

The generated `dist-site/site-build-manifest.json` is build metadata and is not published. The staging script removes stale generated JS/CSS from this project's assets directory, preserves media and README, and refreshes vendor hashes. Imports use the canonical `/fun/projects/driftlight/` mount to avoid parent traversal.

Poster (960x480) and OG image (1200x630) derive from the existing app start poster. The eight-second H.264 preview derives from seconds 1-9 of `driftlight_montage_C.mp4`, letterboxed to 720x360 at 24 fps without audio. The original recording is not bundled.

Publication is prepared only. Run `python tools/build_site.py` in the sibling site worktree before the art lead commits and deploys.
