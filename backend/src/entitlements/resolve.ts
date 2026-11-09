import type { Tier } from '../accounts/store';
import { accounts } from '../accounts/store';
import { teams } from '../teams/store';

const RANK: Record<Tier, number> = { free: 0, perpetual: 1, pro: 2, team: 3 };

/** Members of an active Team subscription inherit Team-tier server capabilities. */
export async function effectiveTierForAccount(accountId: string): Promise<Tier> {
  const account = await accounts.get(accountId);
  if (!account) return 'free';
  const membership = await teams.primaryMembership(accountId);
  if (membership) {
    if (RANK.team > RANK[account.tier]) return 'team';
  }
  return account.tier;
}
