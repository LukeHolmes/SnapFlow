// Runtime registry. Destinations register themselves; the rest of the system only
// ever sees the OutputDestination interface — never a concrete integration.
import type { OutputDestination } from './types';
import { clipboardDestination } from './clipboard';
import { slackDestination } from './slack';
import { notionDestination } from './notion';
import { gmailDestination } from './gmail';
import { githubDestination } from './github';
import { zapierDestination } from './zapier';

const registry = new Map<string, OutputDestination>();

export function registerBuiltins(): void {
  for (const d of [clipboardDestination, slackDestination, notionDestination, gmailDestination, githubDestination, zapierDestination]) {
    registry.set(d.id, d);
  }
}
export function getDestination(id: string): OutputDestination | undefined {
  return registry.get(id);
}
export function listDestinations(): { id: string; label: string; requiresAuth: boolean }[] {
  return [...registry.values()].map(({ id, label, requiresAuth }) => ({ id, label, requiresAuth }));
}
