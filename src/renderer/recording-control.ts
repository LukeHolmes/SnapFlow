declare const recControl: {
  stop: () => void;
  pause: () => void;
  resume: () => void;
  onStatus: (cb: (s: { phase: string; elapsedMs: number; paused: boolean }) => void) => () => void;
};

const timeEl = document.getElementById('time')!;
const pauseBtn = document.getElementById('pause') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

recControl.onStatus((st) => {
  timeEl.textContent = fmt(st.elapsedMs);
  pauseBtn.textContent = st.paused ? 'Resume' : 'Pause';
});

pauseBtn.addEventListener('click', () => {
  if (pauseBtn.textContent === 'Resume') recControl.resume();
  else recControl.pause();
});
stopBtn.addEventListener('click', () => recControl.stop());
