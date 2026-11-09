import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/channels';

contextBridge.exposeInMainWorld('recWorker', {
  onStart: (cb: (payload: unknown) => void) => {
    const handler = (_e: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on(CH.recWorkerStart, handler);
    return () => ipcRenderer.removeListener(CH.recWorkerStart, handler);
  },
  onStop: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('recording:stopEncoder', handler);
    return () => ipcRenderer.removeListener('recording:stopEncoder', handler);
  },
  onPause: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('recording:pauseEncoder', handler);
    return () => ipcRenderer.removeListener('recording:pauseEncoder', handler);
  },
  onResume: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('recording:resumeEncoder', handler);
    return () => ipcRenderer.removeListener('recording:resumeEncoder', handler);
  },
  sendChunk: (base64: string) => ipcRenderer.send(CH.recWorkerChunk, base64),
  sendDone: (payload: { webmBase64?: string; thumbPngBase64: string; durationMs: number }) =>
    ipcRenderer.send(CH.recWorkerDone, payload),
  sendError: (message: string) => ipcRenderer.send(CH.recWorkerError, message),
});
