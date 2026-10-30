const root = document.documentElement, status = document.getElementById('status'), hint = document.getElementById('hint');
const fail = () => { status.textContent = 'This creature needs WebGL 2, which this browser could not start.'; };
addEventListener('creature-ready', () => root.classList.add('ready'), { once: true });
addEventListener('pointerdown', () => hint.classList.add('gone'), { once: true });
if (document.createElement('canvas').getContext('webgl2')) import('./main.js').catch(fail);
else fail();
