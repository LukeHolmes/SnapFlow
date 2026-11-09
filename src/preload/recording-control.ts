import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/channels';
import type { RecordingStatus } from '../shared/types';

contextBridge.exposeInMainWorld('recControl', {
  stop: () => ipcRenderer.send(CH.recControlStop),
  pause: () => ipcRenderer.send(CH.recControlPause),
  resume: () => ipcRenderer.send(CH.recControlResume),
  onStatus: (cb: (s: RecordingStatus) => void) => {
    const handler = (_e: unknown, status: RecordingStatus) => cb(status);
    ipcRenderer.on(CH.recordingStatus, handler);
    return () => ipcRenderer.removeListener(CH.recordingStatus, handler);
  },
});
