import { clipboard, nativeImage } from 'electron';
import type { OutputDestination } from './types';

// Fully working, no auth required.
export const clipboardDestination: OutputDestination = {
  id: 'clipboard',
  label: 'Clipboard',
  requiresAuth: false,
  async deliver(capture) {
    if (capture.kind === 'recording' && capture.mediaPath) {
      clipboard.writeText(capture.mediaPath);
      return { ok: true, detail: 'Recording file path copied to clipboard' };
    }
    clipboard.writeImage(nativeImage.createFromPath(capture.imagePath));
    return { ok: true, detail: 'Copied to clipboard' };
  },
};
