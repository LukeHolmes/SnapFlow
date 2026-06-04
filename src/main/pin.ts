import { BrowserWindow, nativeImage } from 'electron';
import type { Capture } from '../shared/types';

const pinned = new Set<BrowserWindow>();

export function pinCapture(capture: Capture): { ok: boolean; detail: string } {
  if (!capture.imagePath) return { ok: false, detail: 'Capture image is unavailable' };

  const image = nativeImage.createFromPath(capture.imagePath);
  if (image.isEmpty()) return { ok: false, detail: 'Capture image is unavailable' };

  const size = image.getSize();
  const maxW = 560;
  const maxH = 460;
  const scale = Math.min(1, maxW / Math.max(size.width, 1), maxH / Math.max(size.height, 1));
  const width = Math.max(260, Math.round(size.width * scale));
  const height = Math.max(180, Math.round(size.height * scale));

  const win = new BrowserWindow({
    width,
    height: height + 34,
    minWidth: 180,
    minHeight: 120,
    frame: false,
    transparent: false,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: `Pinned - ${capture.filename}`,
    backgroundColor: '#111111',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  pinned.add(win);
  win.setAlwaysOnTop(true, 'floating');
  win.on('closed', () => pinned.delete(win));
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pinHtml(capture, image.toDataURL()))}`);
  return { ok: true, detail: 'Pinned capture on screen' };
}

function pinHtml(capture: Capture, dataUrl: string): string {
  const safeTitle = escapeHtml(capture.filename);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #111; color: #f7f7f7; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow: hidden; }
    .bar { height: 34px; display: flex; align-items: center; gap: 8px; padding: 0 8px 0 10px; background: rgba(20,20,20,.95); -webkit-app-region: drag; border-bottom: 1px solid rgba(255,255,255,.1); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #4F46E5; flex: none; }
    .title { flex: 1; min-width: 0; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .85; }
    button { -webkit-app-region: no-drag; width: 24px; height: 24px; border: 0; border-radius: 6px; color: #fff; background: rgba(255,255,255,.1); cursor: pointer; }
    button:hover { background: rgba(255,255,255,.18); }
    .stage { height: calc(100vh - 34px); display: flex; align-items: center; justify-content: center; overflow: auto; }
    img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <div class="bar"><span class="dot"></span><span class="title">${safeTitle}</span><button title="Close" onclick="window.close()">x</button></div>
  <div class="stage"><img src="${dataUrl}" alt="${safeTitle}" /></div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

export function closePinnedCaptures(): void {
  for (const win of pinned) if (!win.isDestroyed()) win.close();
  pinned.clear();
}
