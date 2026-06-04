import { clipboard, nativeImage } from 'electron';
import type { OutputDestination } from './types';

// Fully working, no auth required.
export const clipboardDestination: OutputDestination = {
  id: 'clipboard',
  label: 'Clipboard',
  requiresAuth: false,
  async deliver(capture) {
    clipboard.writeImage(nativeImage.createFromPath(capture.imagePath));
    return { ok: true, detail: 'Copied to clipboard' };
  },
};
