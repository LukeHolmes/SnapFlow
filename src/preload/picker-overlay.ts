import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/channels';
import type { ColorFormat } from '../shared/types';

export interface PickerFrame { dataURL: string; width: number; height: number; }

export interface PickerSampleResult {
  cssX: number;
  cssY: number;
  color: { r: number; g: number; b: number; hex: string; hsl: { h: number; s: number; l: number } };
  loupeDataUrl: string;
  formatted: string;
  format: ColorFormat;
}

const pickerOverlay = {
  getFrame: (): Promise<PickerFrame | null> => ipcRenderer.invoke(CH.colourPickerFrame),
  sample: (x: number, y: number): Promise<PickerSampleResult | null> => ipcRenderer.invoke(CH.colourPickerSample, x, y),
  pick: (x: number, y: number) => ipcRenderer.invoke(CH.colourPickerPick, x, y),
  cancel: (): void => ipcRenderer.send(CH.colourPickerCancel),
  getFormat: (): Promise<ColorFormat> => ipcRenderer.invoke(CH.colourFormatGet),
  setFormat: (format: ColorFormat): Promise<ColorFormat> => ipcRenderer.invoke(CH.colourFormatSet, format),
};

export type PickerOverlayApi = typeof pickerOverlay;
contextBridge.exposeInMainWorld('pickerOverlay', pickerOverlay);
