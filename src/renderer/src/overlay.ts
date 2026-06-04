// Region-select overlay logic (plain DOM, no framework — keeps the window light).
// Uses the box-shadow "spotlight" trick: a transparent selection box casts a huge
// shadow that dims everything outside it, while the frozen screenshot shows through bright inside.

import type { OverlayApi, Rect } from '../../preload/overlay';

declare global { interface Window { overlay: OverlayApi } }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const frame = $('frame') as HTMLImageElement;
const scrim = $('scrim');
const cv = $('cv'), ch = $('ch'), sel = $('sel'), pill = $('pill'), hint = $('hint');

let start: { x: number; y: number } | null = null;
let rect: Rect | null = null;

async function init() {
  const f = await window.overlay.getFrame();
  if (f) frame.src = f.dataURL;
}
init();

function setPill(x: number, y: number, text: string) {
  pill.textContent = text;
  // keep the pill on-screen near the cursor
  const ox = x + 16 + 90 > window.innerWidth ? x - 96 : x + 16;
  const oy = y + 16 + 24 > window.innerHeight ? y - 28 : y + 16;
  pill.style.left = `${ox}px`; pill.style.top = `${oy}px`;
}

function reset() {
  start = null; rect = null;
  sel.style.display = 'none';
  scrim.style.display = 'block';
  cv.style.display = ch.style.display = 'block';
  hint.style.display = 'block';
}

window.addEventListener('mousemove', (e) => {
  const { clientX: x, clientY: y } = e;
  if (!start) {
    cv.style.left = `${x}px`;
    ch.style.top = `${y}px`;
    setPill(x, y, '0 × 0 px');
    return;
  }
  rect = { x: Math.min(start.x, x), y: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) };
  sel.style.left = `${rect.x}px`; sel.style.top = `${rect.y}px`;
  sel.style.width = `${rect.width}px`; sel.style.height = `${rect.height}px`;
  setPill(x, y, `${Math.round(rect.width)} × ${Math.round(rect.height)} px`);
});

window.addEventListener('mousedown', (e) => {
  start = { x: e.clientX, y: e.clientY };
  rect = { x: start.x, y: start.y, width: 0, height: 0 };
  hint.style.display = 'none';
  scrim.style.display = 'none';          // selection box now provides the dimming
  cv.style.display = ch.style.display = 'none';
  sel.style.display = 'block';
  sel.style.left = `${start.x}px`; sel.style.top = `${start.y}px`;
  sel.style.width = sel.style.height = '0px';
});

window.addEventListener('mouseup', () => {
  if (rect && rect.width >= 8 && rect.height >= 8) window.overlay.confirm(rect);
  else reset();                          // too small — let the user try again
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.overlay.cancel();
  if (e.key === 'Enter' && rect && rect.width >= 8 && rect.height >= 8) window.overlay.confirm(rect);
});
