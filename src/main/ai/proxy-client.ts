// Client side of the metered AI proxy (architecture §2.3, §5.4, §11).
//
// The vision-model API key NEVER lives in the client. autoTag() posts the image
// to the backend proxy, which authenticates, checks entitlement, meters cost,
// rate-limits, and only then forwards to the model. Free tier is rejected at the
// proxy. heuristicTag() is a local rule (NOT an AI call) used as the offline fallback.

import type { ContentTag, Entitlements } from '../../shared/types';

export class AiProxyClient {
  constructor(private proxyUrl?: string, private token?: string) {}

  /** Returns a tag from the backend, or null if not entitled / not configured / on any error. */
  async autoTag(imagePng: Buffer, ent: Entitlements): Promise<ContentTag | null> {
    if (!ent.aiEnabled) return null;            // Free tier never reaches the model
    if (!this.proxyUrl || !this.token) return null;
    try {
      const res = await fetch(`${this.proxyUrl}/v1/ai/tag`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ imageBase64: imagePng.toString('base64') }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { tag?: ContentTag };
      return json.tag ?? null;
    } catch {
      return null;                               // network/backend down → caller falls back to heuristic
    }
  }

  /** Ask the backend AI proxy to summarise what changed between two screenshots. */
  async diffSummary(beforePng: Buffer, afterPng: Buffer, ent: Entitlements): Promise<string | null> {
    if (!ent.aiEnabled) return null;
    if (!this.proxyUrl || !this.token) return null;
    try {
      const res = await fetch(`${this.proxyUrl}/v1/ai/diff`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        body: JSON.stringify({
          beforeBase64: beforePng.toString('base64'),
          afterBase64:  afterPng.toString('base64'),
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { summary?: string };
      return json.summary ?? null;
    } catch { return null; }
  }
}

export const aiProxyFromEnv = (): AiProxyClient =>
  new AiProxyClient(process.env.SNAPFLOW_AI_PROXY_URL, process.env.SNAPFLOW_API_TOKEN);

/** Offline heuristic classifier — the fallback when the AI proxy is unavailable. */
export function heuristicTag(ocr: string): ContentTag {
  const t = ocr.toLowerCase();
  if (/[{};]|=>|function|const |let |error:|import |class |\bnull\b|undefined/.test(ocr)) return 'code';
  if (/\b(revenue|q[1-4]|yoy|growth|total|chart|%|\$|€)\b/.test(t)) return 'chart';
  if (/https?:\/\/|www\.|\.com|\.io|\.dev/.test(t)) return 'web';
  if (ocr.length > 200 && /\b(the|and|introduction|section|summary)\b/.test(t)) return 'document';
  return 'ui';
}
