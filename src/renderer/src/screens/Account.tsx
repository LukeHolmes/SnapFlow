import { useEffect, useState } from 'react';
import { Camera, ScanText, Send, Shield, ArrowUpRight } from 'lucide-react';
import { api } from '../api';
import { STAT_META } from '../components/shared';
import type { Stats, Entitlements } from '../components/shared';

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

  useEffect(() => {
    Promise.all([api.stats.get(), api.entitlements.get()]).then(([s, e]) => { setStats(s); setEnt(e); });
  }, []);

  const tier = ent?.tier ?? 'pro';
  const features = TIER_FEATURES[tier] ?? TIER_FEATURES.pro;

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">Account</h1>
      </div>

      {/* User card */}
      <div className="card account-hero">
        <span className="account-avatar">LH</span>
        <div className="account-info">
          <span className="account-name">Luke Holmes</span>
          <span className="account-email">luke@snapflow.app</span>
        </div>
        <span className="tier-badge" style={{ marginLeft: 'auto' }}>{tier}</span>
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
    </div>
  );
}
