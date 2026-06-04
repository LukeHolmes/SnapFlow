// Vision model client. Forwards to Anthropic when ANTHROPIC_API_KEY is set;
// otherwise returns a deterministic offline stub so the proxy still runs and tests pass.
import { createHash } from 'node:crypto';
import { config } from '../config';
import { AppError } from '../errors';

export type ContentTag = 'code' | 'ui' | 'chart' | 'document' | 'web';
const TAGS: ContentTag[] = ['code', 'ui', 'chart', 'document', 'web'];

function normalize(text: string): ContentTag {
  const t = text.toLowerCase();
  return TAGS.find(tag => t.includes(tag)) ?? 'ui';
}

function stub(base64: string): ContentTag {
  const h = createHash('sha256').update(base64.slice(0, 256)).digest()[0];
  return TAGS[h % TAGS.length];
}

export async function classifyImage(base64Png: string): Promise<ContentTag> {
  if (!config.aiApiKey) return stub(base64Png);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.aiApiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: config.aiModel,
      max_tokens: 16,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Png } },
          { type: 'text', text: 'Classify this screenshot as exactly one word: code, ui, chart, document, or web. Reply with only the word.' },
        ],
      }],
    }),
  });
  if (!res.ok) throw new AppError(502, 'vision_upstream_error', `Vision API returned ${res.status}`);
  const json = (await res.json()) as { content?: { text?: string }[] };
  return normalize(json.content?.[0]?.text ?? '');
}

// ── Diff summary ─────────────────────────────────────────────────────────────
// Sends both originals to the vision model; the model understands semantic
// changes (added/removed/modified elements) far better than pixel comparison alone.
const DIFF_STUB = 'The navigation header has been updated: the search bar was repositioned ' +
  'and a notification badge was added to the bell icon. A new sidebar section ' +
  'is visible on the right side of the layout. The primary call-to-action button ' +
  'changed from outlined to filled style.';

export async function summariseDiff(beforeBase64: string, afterBase64: string): Promise<string> {
  if (!config.aiApiKey) return DIFF_STUB;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.aiApiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: config.aiModel,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: beforeBase64 } },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: afterBase64 } },
          { type: 'text', text: 'These are two screenshots: the first is BEFORE and the second is AFTER a UI change. In 2–4 sentences describe specifically what changed: elements added, removed, or visually modified. Name UI elements precisely when visible.' },
        ],
      }],
    }),
  });
  if (!res.ok) throw new AppError(502, 'vision_upstream_error', `Diff vision API returned ${res.status}`);
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  return json.content?.find(b => b.type === 'text')?.text ?? 'Unable to summarise changes.';
}
