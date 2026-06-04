// Shared engine context. Created once at startup and handed to both the IPC
// handlers and the region-capture controller so they operate on the same stores.
import type { Db } from './db';
import { HistoryStore } from './history/store';
import { PresetStore } from './presets/store';
import { EventLog } from './events/log';
import { entitlementsFor, currentTier } from './entitlements';
import type { Entitlements } from '../shared/types';

export const WORKSPACE = process.env.SNAPFLOW_WORKSPACE || 'ws_local';

export interface Engine {
  history: HistoryStore;
  presets: PresetStore;
  events: EventLog;
  ent: () => Entitlements;
  workspace: string;
}

export function createEngine(db: Db): Engine {
  return {
    history: new HistoryStore(db),
    presets: new PresetStore(db),
    events: new EventLog(db),
    ent: () => entitlementsFor(currentTier()),
    workspace: WORKSPACE,
  };
}
