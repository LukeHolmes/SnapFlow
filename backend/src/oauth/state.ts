import { randomUUID } from 'node:crypto';
import { db } from '../store';

const TTL_MS = 10 * 60 * 1000;

// CSRF state for the OAuth round trip: created at /start, consumed once at /callback.
export const oauthState = {
  async create(provider: string): Promise<string> {
    const state = randomUUID();
    await db().run(`INSERT INTO oauth_state (state, provider, created_at) VALUES (?,?,?)`, [state, provider, Date.now()]);
    return state;
  },
  /** Returns the provider id if the state is valid and unexpired, else null. Single-use. */
  async consume(state: string): Promise<string | null> {
    const r = await db().get<{ provider: string; created_at: number }>(`SELECT provider, created_at FROM oauth_state WHERE state = ?`, [state]);
    if (!r) return null;
    await db().run(`DELETE FROM oauth_state WHERE state = ?`, [state]);
    if (Date.now() - Number(r.created_at) > TTL_MS) return null;
    return r.provider;
  },
};
