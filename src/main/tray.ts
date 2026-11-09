import { Menu, Tray, nativeImage, type BrowserWindow } from 'electron';
import { CH } from '../shared/channels';
import { startRegionCapture } from './region';
import { startColourPicker } from './colour-picker';
import { startRecording, stopRecording } from './recording/manager';

let tray: Tray | null = null;

function buildTrayImage(): Electron.NativeImage {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      const o = (y * size + x) * 4;
      if (edge) {
        buf[o] = 0xff;
        buf[o + 1] = 0xff;
        buf[o + 2] = 0xff;
        buf[o + 3] = 0;
      } else {
        buf[o] = 0xe5;     // B
        buf[o + 1] = 0x46; // G
        buf[o + 2] = 0x4f; // R  #4F46E5
        buf[o + 3] = 255;
      }
    }
  }
  const img = nativeImage.createFromBuffer(buf, { width: size, height: size });
  if (process.platform === 'darwin') img.setTemplateImage(true);
  return img;
}

export function installTray(getMainWindow: () => BrowserWindow | null): void {
  if (tray) return;
  tray = new Tray(buildTrayImage());
  tray.setToolTip('SnapFlow');

  const sendError = (err: unknown) => {
    const win = getMainWindow();
    const message = err instanceof Error ? err.message : 'Action failed';
    win?.show();
    win?.focus();
    win?.webContents.send(CH.captureError, message);
  };

  const showMain = () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.show();
    win.focus();
  };

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show SnapFlow', click: showMain },
    { type: 'separator' },
    {
      label: 'Pick colour (⌘⇧7)',
      click: () => { void startColourPicker().catch(sendError); },
    },
    {
      label: 'Region capture (⌘⇧4)',
      click: () => { void startRegionCapture().catch(sendError); },
    },
    {
      label: 'Window capture (⌘⇧5)',
      click: () => {
        showMain();
        getMainWindow()?.webContents.send(CH.openWindowPicker);
      },
    },
    {
      label: 'Screen recording (⌘⇧8)',
      click: () => {
        void startRecording({ mode: 'screen', countdownSec: 2 }).catch(sendError);
      },
    },
    {
      label: 'Record window…',
      click: () => {
        showMain();
        getMainWindow()?.webContents.send(CH.openRecordWindowPicker);
      },
    },
    { type: 'separator' },
    {
      label: 'Stop recording',
      click: () => { void stopRecording(); },
    },
  ]));

  tray.on('click', showMain);
}

export function disposeTray(): void {
  tray?.destroy();
  tray = null;
}
