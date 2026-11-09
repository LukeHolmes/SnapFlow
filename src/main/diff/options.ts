export interface DiffComputeOptions {
  /** pixelmatch colour distance threshold 0–1; default 0.1 */
  threshold?: number;
  /** Highlight opacity for unchanged pixels in the diff artefact 0–1; default 0.2 */
  diffAlpha?: number;
  includeAA?: boolean;
}

export const DEFAULT_DIFF_OPTIONS: Required<DiffComputeOptions> = {
  threshold: 0.1,
  diffAlpha: 0.2,
  includeAA: false,
};

export function normaliseDiffOptions(opts?: DiffComputeOptions): Required<DiffComputeOptions> {
  const threshold = opts?.threshold;
  const diffAlpha = opts?.diffAlpha;
  return {
    threshold: typeof threshold === 'number' && threshold >= 0 && threshold <= 1 ? threshold : DEFAULT_DIFF_OPTIONS.threshold,
    diffAlpha: typeof diffAlpha === 'number' && diffAlpha >= 0 && diffAlpha <= 1 ? diffAlpha : DEFAULT_DIFF_OPTIONS.diffAlpha,
    includeAA: opts?.includeAA ?? DEFAULT_DIFF_OPTIONS.includeAA,
  };
}
