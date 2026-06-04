import { randomUUID } from 'node:crypto';
import { db } from '../store';

export type Tier = 'free' | 'pro' | 'team' | 'perpetual';
export interface Account { id: string; email: string; tier: Tier; createdAt: number; }

function row(r: Record<string, unknown>): Account {
  return { id: r.id as string, email: r.email as string, tier: r.tier as Tier, createdAt: Number(r.created_at) };
}

export const accounts = {
  async getOrCreate(email: string, tier: Tier = 'pro'): Promise<Account> {
    const existing = await db().get(`SELECT * FROM accounts WHERE email = ?`, [email]);
    if (existing) return row(existing);
    const acc: Account = { id: randomUUID(), email, tier, createdAt: Date.now() };
    await db().run(`INSERT INTO accounts (id, email, tier, created_at) VALUES (?,?,?,?)`, [acc.id, acc.email, acc.tier, acc.createdAt]);
    return acc;
  },
  async get(id: string): Promise<Account | undefined> {
    const r = await db().get(`SELECT * FROM accounts WHERE id = ?`, [id]);
    return r ? row(r) : undefined;
  },
  async setTier(id: string, tier: Tier): Promise<void> {
    await db().run(`UPDATE accounts SET tier = ? WHERE id = ?`, [tier, id]);
  },
};
