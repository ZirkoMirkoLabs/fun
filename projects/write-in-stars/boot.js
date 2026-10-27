// Paint the actual UI before parsing the engine. No arbitrary multi-second delay.
// Import each dependency stage in its own task; module caching prevents duplicates.
const nextTask = () => globalThis.scheduler?.yield ? scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0));
// Keep a fast submit from navigating (and leaking the input into a request) during boot.
const form = document.getElementById('form');
const holdSubmit = event => event.preventDefault();
form.addEventListener('submit', holdSubmit);
try {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await nextTask();
    await import('./vendor/three-0.186.0/three.core.min.js');
    await nextTask();
    await import('three/webgpu');
    await nextTask();
    await import('./main.js');
    form.removeEventListener('submit', holdSubmit);
} catch (error) {
    const status = document.getElementById('status');
    status.textContent = 'The stars could not load. Please reload to try again.';
    status.classList.add('fail');
    console.error(error);
}
