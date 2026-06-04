// Output-preset plugin contract (architecture §4.5). The capture core has ZERO
// inbound dependency on any integration; each destination is a self-contained
// plugin implementing one method. Adding a destination (or, in v1.2, a marketplace
// plugin) never requires touching capture, OCR or history.

import type { Capture, DeliverResult } from '../../shared/types';

export interface OutputDestination {
  id: string;
  label: string;
  requiresAuth: boolean;
  deliver(capture: Capture, config: Record<string, unknown>): Promise<DeliverResult>;
}

export class NotConfiguredError extends Error {
  constructor(dest: string) { super(`${dest} is not connected yet — add credentials in Settings → Integrations`); }
}
