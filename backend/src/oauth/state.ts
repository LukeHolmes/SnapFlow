import { randomUUID } from 'node:crypto';
import { db } from '../store';

const TTL_MS = 10 * 60 * 1000;

// CSRF state for the OAuth round trip: created at /start, consumed once at /callback.
export const oauthState = {
  async create(provider: string): Promise<string> {
    return this.createContext(provider, {});
  },
  async createContext(provider: string, data: Record<string, unknown>): Promise<string> {
    const state = randomUUID();
    await db().run(
      `INSERT INTO oauth_state (state, provider, data_json, created_at) VALUES (?,?,?,?)`,
      [state, provider, JSON.stringify(data), Date.now()],
    );
    return state;
  },
  /** Returns the provider id if the state is valid and unexpired, else null. Single-use. */
  async consume(state: string): Promise<string | null> {
    const result = await this.consumeContext(state);
    return result?.provider ?? null;
  },
  async consumeContext(state: string): Promise<{ provider: string; data: Record<string, unknown> } | null> {
    const r = await db().get<{ provider: string; created_at: number; data_json?: string }>(
      `SELECT provider, created_at, data_json FROM oauth_state WHERE state = ?`,
      [state],
    );
    if (!r) return null;
    await db().run(`DELETE FROM oauth_state WHERE state = ?`, [state]);
    if (Date.now() - Number(r.created_at) > TTL_MS) return null;
    let data: Record<string, unknown> = {};
    try {
      data = r.data_json ? JSON.parse(r.data_json) : {};
    } catch {
      data = {};
    }
    return { provider: r.provider, data };
  },
};
