# fun

Small browser experiments by [ZirkoMirko](https://x.com/Zirkomirko). Each one is plain static files, so there's no build step. The site mirrors this layout: `projects/<slug>/` here is `zirkomirko.com/fun/projects/<slug>/` there. Play with them at **[zirkomirko.com/fun/projects](https://zirkomirko.com/fun/projects/)**.

| Project | What it is | Play |
|---|---|---|
| [Write in Stars](projects/write-in-stars) | Type anything and a galaxy of ~60k stars spells it. Drop in an image and the stars become it. | [open](https://zirkomirko.com/fun/projects/write-in-stars/) |

## Layout

```
projects/
  <slug>/
    index.html   the project
    poster.jpg   still for the gallery card (2:1)
    preview.mp4  short muted loop for the gallery card (2:1)
    README.md    what it is and how it works
```

## Run one locally

Serve the project folder with any static server, for example:

```
cd projects/write-in-stars
python -m http.server 8000
```

Then open http://localhost:8000.
