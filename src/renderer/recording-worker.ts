export {};

interface RecWorkerBridge {
  onStart: (cb: (payload: WorkerPayload) => void) => void;
  onStop: (cb: () => void) => void;
  onPause: (cb: () => void) => void;
  onResume: (cb: () => void) => void;
  sendChunk: (base64: string) => void;
  sendDone: (payload: { webmBase64?: string; thumbPngBase64: string; durationMs: number }) => void;
  sendError: (message: string) => void;
}

declare global {
  interface Window { recWorker: RecWorkerBridge; }
}

const recWorker = window.recWorker;

interface WorkerPayload {
  sourceId?: string;
  crop: { x: number; y: number; width: number; height: number } | null;
  includeMic: boolean;
  includeSystemAudio: boolean;
  mimeType: string;
}

interface RecorderSession {
  recorder: MediaRecorder;
  stream: MediaStream;
  startedAt: number;
  pauseStarted: number;
  pausedMs: number;
  chunks: Blob[];
  canvas?: HTMLCanvasElement;
  video?: HTMLVideoElement;
  rafId?: number;
}

let session: RecorderSession | null = null;

recWorker.onStart((payload: WorkerPayload) => {
  void startSession(payload);
});

recWorker.onStop(() => { void stopSession(); });
recWorker.onPause(() => session?.recorder.pause());
recWorker.onResume(() => session?.recorder.resume());

async function startSession(payload: WorkerPayload): Promise<void> {
  try {
    if (!payload.sourceId) throw new Error('No capture source');

    const videoStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: payload.sourceId,
        },
      } as MediaTrackConstraints,
    });

    let recordStream: MediaStream = videoStream;
    if (payload.crop) {
      recordStream = await cropStream(videoStream, payload.crop);
    }

    const tracks: MediaStreamTrack[] = [...recordStream.getVideoTracks()];
    if (payload.includeMic) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        mic.getAudioTracks().forEach(t => tracks.push(t));
      } catch {
        // Mic denied — continue video-only.
      }
    }
    if (payload.includeSystemAudio) {
      try {
        const sys = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: payload.sourceId,
            },
          } as MediaTrackConstraints,
          video: false,
        });
        sys.getAudioTracks().forEach(t => tracks.push(t));
      } catch {
        // System audio not available on this OS.
      }
    }

    const stream = new MediaStream(tracks);
    const mimeType = MediaRecorder.isTypeSupported(payload.mimeType)
      ? payload.mimeType
      : 'video/webm;codecs=vp8';

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (!ev.data.size) return;
      chunks.push(ev.data);
      void ev.data.arrayBuffer().then(buf => {
        const b64 = bufferToBase64(buf);
        recWorker.sendChunk(b64);
      });
    };
    recorder.onerror = () => recWorker.sendError('MediaRecorder error');
    recorder.onstop = () => void finalize(chunks);

    session = {
      recorder,
      stream,
      startedAt: Date.now(),
      pauseStarted: 0,
      pausedMs: 0,
      chunks,
    };
    recorder.start(1000);
    void captureThumb(stream);
  } catch (e) {
    recWorker.sendError(e instanceof Error ? e.message : 'Could not start MediaRecorder');
  }
}

async function cropStream(input: MediaStream, crop: { x: number; y: number; width: number; height: number }): Promise<MediaStream> {
  const video = document.createElement('video');
  video.srcObject = input;
  video.muted = true;
  await video.play();
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const draw = () => {
    ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    session && (session.rafId = requestAnimationFrame(draw));
  };
  draw();
  session && Object.assign(session, { canvas, video });
  return canvas.captureStream(30);
}

async function captureThumb(stream: MediaStream): Promise<void> {
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  await video.play();
  await new Promise(r => setTimeout(r, 200));
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(640, video.videoWidth || 640);
  canvas.height = Math.round(canvas.width * ((video.videoHeight || 360) / (video.videoWidth || 640)));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  (session as RecorderSession & { thumb?: string }).thumb = canvas.toDataURL('image/png').split(',')[1];
}

async function stopSession(): Promise<void> {
  if (!session) return;
  if (session.recorder.state !== 'inactive') session.recorder.stop();
  else await finalize(session.chunks);
}

async function finalize(chunks: Blob[]): Promise<void> {
  const s = session;
  session = null;
  if (!s) return;
  if (s.rafId) cancelAnimationFrame(s.rafId);
  s.stream.getTracks().forEach(t => t.stop());

  const blob = new Blob(chunks, { type: 'video/webm' });
  const buf = await blob.arrayBuffer();
  const durationMs = Date.now() - s.startedAt - s.pausedMs;
  const thumb = (s as RecorderSession & { thumb?: string }).thumb ?? await thumbFromBlob(blob);
  recWorker.sendDone({
    webmBase64: bufferToBase64(buf),
    thumbPngBase64: thumb,
    durationMs,
  });
}

async function thumbFromBlob(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.src = url;
  await video.play();
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return (canvas.toDataURL('image/png').split(',')[1]) ?? '';
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
