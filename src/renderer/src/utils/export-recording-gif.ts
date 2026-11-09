import { GIFEncoder, quantize, applyPalette } from 'gifenc';

const MAX_GIF_SEC = 15;
const FRAME_INTERVAL_MS = 200;

/** Export a short WebM data URL to a downloadable GIF (Pro feature; runs locally). */
export async function exportRecordingGifFromDataUrl(
  webmDataUrl: string,
  filename: string,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const video = document.createElement('video');
    video.src = webmDataUrl;
    video.muted = true;
    await video.play();

    const durationSec = Math.min(MAX_GIF_SEC, video.duration || MAX_GIF_SEC);
    const w = Math.min(480, video.videoWidth || 480);
    const h = Math.round(w * ((video.videoHeight || 270) / (video.videoWidth || 480)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, detail: 'Canvas unavailable' };

    const gif = GIFEncoder();
    const frames = Math.floor((durationSec * 1000) / FRAME_INTERVAL_MS);

    for (let i = 0; i < frames; i++) {
      video.currentTime = (i * FRAME_INTERVAL_MS) / 1000;
      await new Promise<void>(resolve => {
        video.onseeked = () => resolve();
      });
      ctx.drawImage(video, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const palette = quantize(data, 256);
      const index = applyPalette(data, palette);
      gif.writeFrame(index, w, h, { palette, delay: FRAME_INTERVAL_MS });
    }

    gif.finish();
    const bytes = gif.bytes();
    const blob = new Blob([Uint8Array.from(bytes)], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename.replace(/\.[^.]+$/, '') || 'recording'}.gif`;
    a.click();
    URL.revokeObjectURL(url);
    video.pause();
    return { ok: true, detail: 'GIF exported' };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'GIF export failed' };
  }
}
