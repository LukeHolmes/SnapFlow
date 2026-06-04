// Minimal bridge for the region-select overlay window.
import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/channels';

export interface OverlayFrame { dataURL: string; width: number; height: number; }
export type Rect = { x: number; y: number; width: number; height: number };

const overlay = {
  getFrame: (): Promise<OverlayFrame | null> => ipcRenderer.invoke(CH.overlayFrame),
  confirm: (rect: Rect): void => ipcRenderer.send(CH.overlayConfirm, rect),
  cancel: (): void => ipcRenderer.send(CH.overlayCancel),
};

export type OverlayApi = typeof overlay;
contextBridge.exposeInMainWorld('overlay', overlay);
