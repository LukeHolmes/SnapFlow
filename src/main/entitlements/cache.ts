import type { Entitlements, Tier } from '../../shared/types';
import { entitlementsFor } from './index';
import { isDevEnvironment, tierFromDevEnv } from './tier';

const DEFAULT_TTL_MS = 15 * 60 * 1000;

const VALID_TIERS: Tier[] = ['free', 'pro', 'team', 'perpetual'];

function parseEntitlementsPayload(json: Record<string, unknown>): Entitlements | null {
  const tier = json.tier;
  if (typeof tier !== 'string' || !VALID_TIERS.includes(tier as Tier)) return null;
  return entitlementsFor(tier as Tier);
}

/** Local-first entitlements: server when signed in, cached with TTL, else free. */
export class EntitlementsCache {
  private cached: Entitlements | null = null;
  private fetchedAt = 0;

  constructor(private ttlMs = DEFAULT_TTL_MS) {}

  /** Effective entitlements for gating (uses cache, dev override, or free). */
  get(): Entitlements {
    const devTier = tierFromDevEnv();
    if (devTier) return entitlementsFor(devTier);

    if (this.cached && Date.now() - this.fetchedAt < this.ttlMs) return this.cached;

    return entitlementsFor('free');
  }

  clear(): void {
    this.cached = null;
    this.fetchedAt = 0;
  }

  /** Pull GET /v1/entitlements when backend token is configured. Offline → keep stale cache or free. */
  async refresh(): Promise<Entitlements> {
    const devTier = tierFromDevEnv();
    if (devTier) return entitlementsFor(devTier);

    const baseUrl = process.env.SNAPFLOW_CLOUD_URL || process.env.SNAPFLOW_AI_PROXY_URL;
    const token = process.env.SNAPFLOW_API_TOKEN;
    if (!baseUrl || !token) {
      this.clear();
      return this.get();
    }

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/entitlements`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = (await res.json()) as Record<string, unknown>;
        const parsed = parseEntitlementsPayload(json);
        if (parsed) {
          this.cached = parsed;
          this.fetchedAt = Date.now();
          return parsed;
        }
      }
    } catch {
      // offline — fall back below
    }

    if (this.cached && Date.now() - this.fetchedAt < this.ttlMs) return this.cached;
    this.clear();
    return entitlementsFor('free');
  }

  /** For tests / explicit injection. */
  setCached(ent: Entitlements, fetchedAt = Date.now()): void {
    this.cached = ent;
    this.fetchedAt = fetchedAt;
  }

  needsRefresh(): boolean {
    return !this.cached || Date.now() - this.fetchedAt >= this.ttlMs;
  }
}

export function backendConfigured(): boolean {
  const baseUrl = process.env.SNAPFLOW_CLOUD_URL || process.env.SNAPFLOW_AI_PROXY_URL;
  return !!(baseUrl && process.env.SNAPFLOW_API_TOKEN);
}

export function scheduleEntitlementsRefresh(cache: EntitlementsCache, intervalMs = DEFAULT_TTL_MS): () => void {
  if (!isDevEnvironment() && !backendConfigured()) return () => {};
  const tick = () => { void cache.refresh(); };
  tick();
  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
}
