import { useEffect, useState } from 'react';
import { Camera, ScanText, Send, Shield, ArrowUpRight } from 'lucide-react';
import { api } from '../api';
import TeamPanel from '../components/TeamPanel';
import { STAT_META } from '../components/shared';
import type { Stats, Entitlements } from '../components/shared';
import type { AccountSummary } from '../../../shared/types';
import { initialsFromLabel } from '../accountProfile';

interface Props { flash: (text: string, ok?: boolean) => void; }

const TIER_FEATURES: Record<string, { history: string; presets: string; ai: string; sync: string }> = {
  free:      { history: '30-day rolling window', presets: '1 preset',          ai: 'None',                    sync: 'Local only' },
  pro:       { history: 'Unlimited',              presets: 'Up to 5 presets',   ai: 'OCR search, tags, Diff',  sync: 'Encrypted cloud sync' },
  team:      { history: 'Unlimited, shared',      presets: 'Unlimited',         ai: 'All features + SSO',      sync: 'Shared team library' },
  perpetual: { history: 'Unlimited (local)',       presets: 'Up to 5 presets',   ai: 'OCR search, Diff',        sync: 'Local only (no cloud)' },
};
const TIER_PRICE: Record<string, string> = { free: 'Free forever', pro: '€9 / month', team: '€18 / seat / month', perpetual: '€59 one-time' };

export default function Account({ flash }: Props) {
  const [stats, setStats] = useState<Stats>({ total: 0, ocrIndexed: 0, sent: 0, piiRedacted: 0 });
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [cloudSync, setCloudSync] = useState(false);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [aiTagging, setAiTagging] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  const refreshAccount = () => {
    Promise.all([
      api.stats.get(),
      api.entitlements.get(),
      api.sync.getEnabled(),
      api.account.get(),
      api.prefs.aiTagging.get(),
    ]).then(([s, e, syncPref, acct, aiPref]) => {
      setStats(s);
      setEnt(e);
      setCloudSync(syncPref.enabled);
      setAccount(acct);
      setAiTagging(aiPref.enabled);
    });
  };

  useEffect(() => {
    refreshAccount();
    const off = api.onAuthChanged?.(() => refreshAccount());
    return () => { off?.(); };
  }, []);

  const tier = ent?.tier ?? account?.tier ?? 'free';
  const features = TIER_FEATURES[tier] ?? TIER_FEATURES.pro;

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">Account</h1>
      </div>

      {/* User card */}
      <div className="card account-hero">
        <span className="account-avatar">
          {account?.signedIn && account.displayName ? initialsFromLabel(account.displayName) : '?'}
        </span>
        <div className="account-info">
          {account?.signedIn ? (
            <>
              <span className="account-name">{account.displayName ?? account.email}</span>
              <span className="account-email">{account.email}</span>
            </>
          ) : (
            <>
              <span className="account-name">Signed out</span>
              <span className="account-email">Sign in with Google or GitHub to link cloud sync, AI proxy, and delivery.</span>
            </>
          )}
        </div>
        <span className="tier-badge" style={{ marginLeft: 'auto' }}>{tier}</span>
      </div>

      <div className="card" style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {account?.signedIn ? (
          <button
            className="btn-secondary"
            disabled={authBusy}
            onClick={async () => {
              setAuthBusy(true);
              await api.auth.signOut();
              refreshAccount();
              flash('Signed out');
              setAuthBusy(false);
            }}
          >
            Sign out
          </button>
        ) : (
          <>
            <button
              className="btn-primary"
              disabled={authBusy}
              onClick={async () => {
                setAuthBusy(true);
                const r = await api.auth.login('google');
                flash(r.detail, r.ok);
                setAuthBusy(false);
              }}
            >
              Sign in with Google
            </button>
            <button
              className="btn-secondary"
              disabled={authBusy}
              onClick={async () => {
                setAuthBusy(true);
                const r = await api.auth.login('github');
                flash(r.detail, r.ok);
                setAuthBusy(false);
              }}
            >
              Sign in with GitHub
            </button>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginTop: 16 }}>
        {STAT_META.map(({ key, label, Icon, fg, bg }) => (
          <div className="card stat-card" key={key}>
            <div className="stat-icon" style={{ color: fg, background: bg }}><Icon size={16} strokeWidth={2} /></div>
            <div className="stat-value">{Number((stats as any)[key]).toLocaleString()}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Plan panel */}
      <div className="card account-plan" style={{ marginTop: 16 }}>
        <div className="account-plan-head">
          <div>
            <span className="account-plan-tier">{tier.charAt(0).toUpperCase() + tier.slice(1)}</span>
            <span className="account-plan-price">{TIER_PRICE[tier] ?? ''}</span>
          </div>
          {(tier === 'free' || tier === 'pro') && (
            <button className="btn-primary" onClick={() => flash('Upgrade at snapflow.app/pricing')}>
              {tier === 'free' ? 'Upgrade to Pro' : 'Upgrade to Team'}
              <ArrowUpRight size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
        <div className="plan-features">
          {[
            ['History',        features.history],
            ['Output presets', features.presets],
            ['AI features',    features.ai],
            ['Sync',           features.sync],
          ].map(([k, v]) => (
            <div className="plan-feature-row" key={k}>
              <span className="plan-feature-key">{k}</span>
              <span className="plan-feature-val">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {ent?.aiEnabled && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="plan-feature-row" style={{ alignItems: 'center' }}>
            <div>
              <span className="plan-feature-key">Cloud AI auto-tagging</span>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
                Off by default. When enabled, capture PNGs are sent to your configured SnapFlow AI proxy for tagging. Captures with detected PII are never sent; redact first or rely on local heuristics only.
              </p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={aiTagging}
                onChange={async e => {
                  const enabled = e.target.checked;
                  setAiTagging(enabled);
                  await api.prefs.aiTagging.set(enabled);
                  flash(enabled ? 'Cloud AI tagging enabled' : 'Cloud AI tagging disabled');
                }}
              />
              <span>{aiTagging ? 'On' : 'Off'}</span>
            </label>
          </div>
        </div>
      )}

      <TeamPanel flash={flash} teamEligible={Boolean(ent?.sharedLibrary || ent?.tier === 'team')} />

      {ent?.cloudSync && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="plan-feature-row" style={{ alignItems: 'center' }}>
            <div>
              <span className="plan-feature-key">Cloud sync</span>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
                Off by default. Metadata syncs in the background; images upload when you deliver to Notion, GitHub, or Jira (processed/redacted renders), or when you tap Sync now.
              </p>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={cloudSync}
                onChange={async e => {
                  const enabled = e.target.checked;
                  setCloudSync(enabled);
                  await api.sync.setEnabled(enabled);
                  flash(enabled ? 'Cloud sync enabled' : 'Cloud sync disabled');
                }}
              />
              <span>{cloudSync ? 'On' : 'Off'}</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
