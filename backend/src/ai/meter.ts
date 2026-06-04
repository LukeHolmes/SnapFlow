import { db } from '../store';

// Per-account AI usage counter (architecture §5.4: meter cost before forwarding).
export const meter = {
  async increment(accountId: string): Promise<number> {
    const now = Date.now();
    await db().run(
      `INSERT INTO ai_usage (account_id, count, updated_at) VALUES (?, 1, ?)
       ON CONFLICT(account_id) DO UPDATE SET count = ai_usage.count + 1, updated_at = ?`,
      [accountId, now, now],
    );
    return this.get(accountId);
  },
  async get(accountId: string): Promise<number> {
    const r = await db().get<{ count: number }>(`SELECT count FROM ai_usage WHERE account_id = ?`, [accountId]);
    return r ? Number(r.count) : 0;
  },
};
