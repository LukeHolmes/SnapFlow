/** Renderer runtime detection (mock vs live Electron bridge). */
export function isElectronRenderer(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /\bElectron\b/i.test(navigator.userAgent);
}

export function allowWebMock(): boolean {
  return import.meta.env.VITE_ALLOW_WEB_MOCK === 'true';
}

export function shouldShowPreloadError(): boolean {
  return isElectronRenderer() && !window.snapflow;
}
