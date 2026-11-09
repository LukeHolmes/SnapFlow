import type { Capture } from '../../shared/types';

const SUFFIX_RE = /\s+(annotated|redacted|diff)$/i;

/** Normalise filenames so annotated/redacted variants still match the same source window. */
export function captureBaseName(filename: string): string {
  return filename.replace(SUFFIX_RE, '').trim();
}

/**
 * Given a newest-first capture list, return the prior capture of the same window/region name.
 */
export function findPreviousCapture(captures: Capture[], captureId: string): Capture | null {
  const idx = captures.findIndex(c => c.id === captureId);
  if (idx < 0) return null;
  const base = captureBaseName(captures[idx].filename);
  for (let i = idx + 1; i < captures.length; i++) {
    const candidate = captures[i];
    if (captureBaseName(candidate.filename) === base) return candidate;
  }
  return null;
}
