import type { PickerOverlayApi, PickerSampleResult } from '../../preload/picker-overlay';
import type { ColorFormat } from '../../shared/types';

declare global { interface Window { pickerOverlay: PickerOverlayApi } }

const frame = document.getElementById('frame') as HTMLImageElement;
const loupe = document.getElementById('loupe') as HTMLDivElement;
const loupeImg = document.getElementById('loupe-img') as HTMLImageElement;
const readout = document.getElementById('readout') as HTMLDivElement;
const valueEl = document.getElementById('value') as HTMLSpanElement;
const subEl = document.getElementById('sub') as HTMLElement;

let lastX = 0;
let lastY = 0;
let lastSample: PickerSampleResult | null = null;
let sampling = false;
let format: ColorFormat = 'hex';

async function init() {
  window.focus();
  document.body.focus();
  format = await window.pickerOverlay.getFormat();
  const f = await window.pickerOverlay.getFrame();
  if (f) frame.src = f.dataURL;
}

init();

function placeHud(x: number, y: number) {
  const pad = 18;
  const lw = 132;
  const lh = 132;
  let lx = x + pad;
  let ly = y + pad;
  if (lx + lw > window.innerWidth) lx = x - lw - pad;
  if (ly + lh > window.innerHeight) ly = y - lh - pad;
  loupe.style.left = `${lx}px`;
  loupe.style.top = `${ly}px`;
  loupe.style.display = 'block';

  const rx = x + pad;
  const ry = y - 48;
  readout.style.left = `${Math.max(8, Math.min(window.innerWidth - 200, rx))}px`;
  readout.style.top = `${Math.max(8, ry)}px`;
  readout.style.display = 'block';
}

async function refreshSample(x: number, y: number) {
  if (sampling) return;
  sampling = true;
  try {
    const sample = await window.pickerOverlay.sample(x, y);
    if (!sample) return;
    lastSample = sample;
    loupeImg.src = sample.loupeDataUrl;
    valueEl.textContent = sample.formatted;
    subEl.textContent = `${sample.color.hex} · ${sample.format.toUpperCase()}`;
    readout.style.borderColor = sample.color.hex;
  } finally {
    sampling = false;
  }
}

function onMove(x: number, y: number) {
  lastX = x;
  lastY = y;
  placeHud(x, y);
  void refreshSample(x, y);
}

window.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY));

window.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  void (async () => {
    const res = await window.pickerOverlay.pick(e.clientX, e.clientY);
    if (!res?.ok) window.pickerOverlay.cancel();
  })();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.pickerOverlay.cancel();
  const key = e.key.toLowerCase();
  const next: ColorFormat | null = key === 'h' ? 'hex' : key === 'r' ? 'rgb' : key === 'l' ? 'hsl' : null;
  if (!next) return;
  e.preventDefault();
  void window.pickerOverlay.setFormat(next).then((f) => {
    format = f;
    void refreshSample(lastX, lastY);
  });
});
