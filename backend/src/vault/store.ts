import { db } from '../store';
import { encrypt, decrypt } from './crypto';

// Per-account OAuth tokens, AES-256-GCM encrypted at rest (architecture §5.2).
// Raw secrets never leave the server — getMeta() returns existence only;
// reveal() is internal-use, for server-side delivery.
export const vault = {
  async put(accountId: string, destination: string, secret: string): Promise<void> {
    await db().run(
      `INSERT INTO oauth_tokens (account_id, destination, secret, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(account_id, destination) DO UPDATE SET secret = excluded.secret, updated_at = excluded.updated_at`,
      [accountId, destination, encrypt(secret), Date.now()],
    );
  },
  async getMeta(accountId: string, destination: string): Promise<{ destination: string; updatedAt: number } | null> {
    const r = await db().get<{ updated_at: number }>(`SELECT updated_at FROM oauth_tokens WHERE account_id = ? AND destination = ?`, [accountId, destination]);
    return r ? { destination, updatedAt: Number(r.updated_at) } : null;
  },
  /** Internal use only — never exposed through an API that reaches the client. */
  async reveal(accountId: string, destination: string): Promise<string | null> {
    const r = await db().get<{ secret: string }>(`SELECT secret FROM oauth_tokens WHERE account_id = ? AND destination = ?`, [accountId, destination]);
    return r ? decrypt(r.secret) : null;
  },
  async remove(accountId: string, destination: string): Promise<void> {
    await db().run(`DELETE FROM oauth_tokens WHERE account_id = ? AND destination = ?`, [accountId, destination]);
  },
};
