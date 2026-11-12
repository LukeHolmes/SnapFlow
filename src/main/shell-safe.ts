import { shell } from 'electron';

/** Validates URL protocol for external browser opens. */
export function parseExternalHttpsUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Only https: links can be opened externally');
  }
  return parsed;
}

/** Only open https URLs in the system browser (block file:, javascript:, etc.). */
export function openExternalHttps(url: string): void {
  parseExternalHttpsUrl(url);
  void shell.openExternal(url);
}
