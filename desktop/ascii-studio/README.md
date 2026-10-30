# ASCII Studio batch tool

Turn images, folders of images or text into ASCII art from the command line. It runs the same engine as the [browser version](https://zirkomirko.com/fun/projects/ascii-studio/) in headless Chrome, on your machine. Rendering the same input twice gives the same PNG.

Needs Node 18+, Chrome or Edge, and ffmpeg on your PATH for MP4 output. Keep this folder inside the repository, because it serves `../../projects/ascii-studio`.

```sh
npm install
node make.js photo.jpg
node make.js ./my-images --style both
node make.js logo.png --style liquid --formats png,mp4
node make.js photo.jpg --palette source
node make.js --text "HELLO"
```

On Windows you can also drag images onto `drop-images-here.cmd`. Results go in `out/`. Run `node make.js --help` for every option.

Output for each input and style is a PNG, a TXT and a seamless looping MP4. Accepts PNG, JPG, WebP and GIF (first frame), up to 20 MB and 16 megapixels.

Licence: MIT (see `LICENSE`).
