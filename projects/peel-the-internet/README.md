# Backstage of the Internet (Peel the Internet)

Peel the corner of a perfectly normal web page and catch the tiny lime crew who hold the internet up. They freeze, stare at your cursor, fight you for the page, and rebuild it with a snarkier headline every time.

Play: https://zirkomirko.com/fun/projects/peel-the-internet/

- Three.js r180, Vite + TypeScript build (this folder is the built output).
- The paper is a CPU-deformed 120×150 plane: a deterministic cylindrical curl around a moving diagonal fold line with a tangent continuation, so the shading and shadows follow the real geometry.
- The workers, the factory and the props are all built from primitives. There are no downloaded models.
- `vendor/three-0.180.0/` holds the tree-shaken three.js chunk emitted by Vite from npm `three@0.180.0` (including the helvetiker example font).
- Source lives in the ZirkoMirko working folder (`peel-the-internet/app`).
