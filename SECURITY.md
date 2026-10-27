# Security

Report vulnerabilities via [ZirkoMirko on X](https://x.com/Zirkomirko). Do not include credentials or private images in public issues.

Install the local hook in each clone: `git config --local core.hooksPath .githooks`. On Unix, also run `chmod +x .githooks/pre-commit`. It runs `python tools/scan_secrets.py --staged` against the complete staged index. Run `python tools/scan_secrets.py --history` to scan all refs and patches. Environment files and private-key files are forbidden; hooks and pattern matching are useful guardrails, not an absolute guarantee. Rotate exposed credentials.

Write in Stars validates raster signatures and dimensions before decoding: 20 MiB encoded, at most 16 MiPixels / 8192 pixels per side, one decode at a time, then a canvas at most 640 pixels per side. These bound input and RGBA sizes, not every browser-internal allocation. SVG and animated WebP are rejected; GIF frame dimensions and aggregate pixels are bounded. PNG, JPEG, static WebP and bounded GIF inputs remain local. Downloads use temporary Blob URLs that are revoked when the preview closes.

Run `node tools/test_image_input.mjs` for malformed/oversized header tests. The sibling site repository owns build/CSP/URL checks and browser export tests. After changes, run `python tools/build_site.py` there. Libraries and their licenses are recorded in `vendor-manifest.json`; review upgrades and hashes together. The repo-local Git helper obtains its token from `gh auth token` at runtime without storing a token in this repository.
