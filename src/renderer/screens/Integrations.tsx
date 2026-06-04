import { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Bug, FileText, Mail, Clipboard, Check, ExternalLink } from 'lucide-react';
import { api } from '../api';
import type { Preset } from '../components/shared';

interface Props { flash: (text: string, ok?: boolean) => void; setActive: (s: string) => void; }

const INTEGRATIONS = [
  {
    id: 'slack',     name: 'Slack',     Icon: MessageSquare, bg: '#4A154B',
    desc: 'Post captures directly to a Slack channel. Your token is encrypted server-side — it never reaches the desktop.',
    oauthPath: '/auth/oauth/slack/start',
  },
  {
    id: 'jira',      name: 'Jira',      Icon: Bug,           bg: '#0052CC',
    desc: 'Attach captures to Jira issues. Authenticate once and send to any issue.',
    oauthPath: '/auth/oauth/jira/start',
  },
  {
    id: 'notion',    name: 'Notion',    Icon: FileText,      bg: '#191919',
    desc: 'Append captures as image blocks to a Notion page.',
    oauthPath: '/auth/oauth/notion/start',
  },
  {
    id: 'email',     name: 'Email',     Icon: Mail,          bg: '#059669',
    desc: 'Send captures as email attachments via SMTP.',
    oauthPath: null,  // SMTP credentials, not OAuth
  },
  {
    id: 'clipboard', name: 'Clipboard', Icon: Clipboard,     bg: '#666666',
    desc: 'Copy as a Markdown image reference or raw PNG. No authentication needed — always available.',
    oauthPath: null, local: true,
  },
] as const;

export default function Integrations({ flash, setActive }: Props) {
  const [presets, setPresets] = useState<Preset[]>([]);

  const load = useCallback(() => api.presets.list().then(setPresets), []);
  useEffect(() => { load(); }, [load]);

  const isConfigured = (id: string) => id === 'clipboard' || presets.some(p => p.destination === id);

  const handleConnect = (intg: typeof INTEGRATIONS[number]) => {
    if ('local' in intg && intg.local) {
      flash('Clipboard is always available — no connection needed');
    } else if (intg.oauthPath) {
      flash(`Connect at your SnapFlow backend: ${intg.oauthPath}`);
    } else {
      flash('Add SMTP credentials via a Clipboard → Email preset');
      setActive('Output Presets');
    }
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Integrations</h1>
          <p className="screen-sub">Connect destinations for one-click delivery.</p>
        </div>
      </div>

      <div className="integrations-note">
        <ExternalLink size={13} strokeWidth={1.9} color="#818CF8" style={{ flexShrink: 0 }} />
        Auth'd integrations (Slack, Jira, Notion) use OAuth tokens that are encrypted in the backend vault — they never live on your device.
        <button className="link-btn" onClick={() => setActive('Output Presets')}>Add a preset →</button>
      </div>

      <div className="integrations-list">
        {INTEGRATIONS.map(intg => {
          const Icon = intg.Icon;
          const configured = isConfigured(intg.id);
          const presetCount = presets.filter(p => p.destination === intg.id).length;
          return (
            <div className="card integration-card" key={intg.id}>
              <span className="integration-icon" style={{ background: intg.bg }}>
                <Icon size={18} color="#fff" strokeWidth={1.9} />
              </span>
              <div className="integration-body">
                <div className="integration-head">
                  <span className="integration-name">{intg.name}</span>
                  {'local' in intg && intg.local
                    ? <span className="badge-local">Local</span>
                    : configured
                      ? <span className="badge-connected"><Check size={10} strokeWidth={2.5} />Connected</span>
                      : <span className="badge-not-connected">Not connected</span>}
                </div>
                <p className="integration-desc">{intg.desc}</p>
                {configured && presetCount > 0 && (
                  <p className="integration-presets">{presetCount} preset{presetCount > 1 ? 's' : ''} configured</p>
                )}
              </div>
              <div className="integration-actions">
                {!('local' in intg && intg.local) && (
                  <button
                    className={configured ? 'btn-ghost' : 'btn-primary'}
                    onClick={() => handleConnect(intg)}
                  >
                    {configured ? 'Reconnect' : 'Connect'}
                  </button>
                )}
                <button className="btn-ghost" onClick={() => setActive('Output Presets')}>
                  {presetCount > 0 ? 'Presets' : 'Add preset'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
