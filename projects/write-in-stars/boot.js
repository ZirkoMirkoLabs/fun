// Paint the page first, then start the 3D engine (parsing three.js is the heaviest step on slow phones).
// The engine's files are already downloading via <link rel="modulepreload">.
requestAnimationFrame(() => setTimeout(() => import('./main.js'), 0));
