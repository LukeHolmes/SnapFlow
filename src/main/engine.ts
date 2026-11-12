// Shared engine context. Created once at startup and handed to both the IPC
// handlers and the region-capture controller so they operate on the same stores.
import type { Db } from './db';
import { HistoryStore } from './history/store';
import { ColorHistoryStore } from './history/color-store';
import { PresetStore } from './presets/store';
import { EventLog } from './events/log';
import { EntitlementsCache } from './entitlements';
import type { Entitlements } from '../shared/types';

export const WORKSPACE = process.env.SNAPFLOW_WORKSPACE || 'ws_local';

export interface Engine {
  db: Db;
  history: HistoryStore;
  colors: ColorHistoryStore;
  presets: PresetStore;
  events: EventLog;
  ent: () => Entitlements;
  entitlementsCache: EntitlementsCache;
  workspace: string;
}

export function createEngine(db: Db, entitlementsCache = new EntitlementsCache()): Engine {
  return {
    db,
    history: new HistoryStore(db),
    colors: new ColorHistoryStore(db),
    presets: new PresetStore(db),
    events: new EventLog(db),
    ent: () => entitlementsCache.get(),
    entitlementsCache,
    workspace: WORKSPACE,
  };
}
