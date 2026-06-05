import { useEffect, useState, useCallback } from 'react';
import { MessageSquare, FileText, Mail, Clipboard, Check, ExternalLink, Github, Webhook, Layers } from 'lucide-react';
import { api } from '../api';
import type { IntegrationStatus } from '../../../shared/types';

interface Props { flash: (text: string, ok?: boolean) => void; setActive: (s: string) => void; }

const INTEGRATIONS = [
  {
    id: 'slack',     name: 'Slack',     Icon: MessageSquare, bg: '#4A154B',
    desc: 'Post captures directly to a Slack channel. Tokens stay encrypted server-side.',
  },
  {
    id: 'jira',      name: 'Jira',      Icon: Layers,        bg: '#0052CC',
    desc: 'Attach captures to existing issues or create new ones with context.',
  },
  {
    id: 'notion',    name: 'Notion',    Icon: FileText,      bg: '#191919',
    desc: 'Append captures as image blocks to a Notion page.',
  },
  {
    id: 'gmail',     name: 'Gmail',     Icon: Mail,          bg: '#EA4335',
    desc: 'Send captures as Gmail attachments with OAuth2.',
  },
  {
    id: 'github',    name: 'GitHub Issues', Icon: Github,    bg: '#24292F',
    desc: 'Create issues or comment with cloud-hosted capture images.',
  },
  {
    id: 'zapier',    name: 'Zapier Webhook', Icon: Webhook,  bg: '#FF4A00',
    desc: 'Post capture metadata to any HTTPS webhook.',
  },
  {
    id: 'clipboard', name: 'Clipboard', Icon: Clipboard,     bg: '#666666',
    desc: 'Copy the capture locally. No connection required.',
    local: true,
  },
] as const;

export default function Integrations({ flash, setActive }: Props) {
  const [statuses, setStatuses] = useState<Record<string, IntegrationStatus>>({});

  const load = useCallback(async () => {
    const list = await api.integrations.statuses();
    setStatuses(Object.fromEntries(list.map(item => [item.destination, item])));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Integrations</h1>
          <p className="screen-sub">Manage connections from Output Presets.</p>
        </div>
      </div>

      <div className="integrations-note">
        <ExternalLink size={13} strokeWidth={1.9} color="#818CF8" style={{ flexShrink: 0 }} />
        OAuth connections open in the browser via the backend callback flow; tokens are encrypted in the vault and never stored in the desktop app.
        <button className="link-btn" onClick={() => setActive('Output Presets')}>Manage presets →</button>
      </div>

      <div className="integrations-list">
        {INTEGRATIONS.map(intg => {
          const Icon = intg.Icon;
          const status = statuses[intg.id];
          const configured = 'local' in intg && intg.local ? true : !!status?.connected;
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
                {status?.label && (
                  <p className="integration-presets">{status.label}{status.secondary ? ` · ${status.secondary}` : ''}</p>
                )}
              </div>
              <div className="integration-actions">
                <button className={configured ? 'btn-ghost' : 'btn-primary'} onClick={() => {
                  flash('Open Output Presets to manage this integration');
                  setActive('Output Presets');
                }}>
                  {'local' in intg && intg.local ? 'Open' : configured ? 'Manage' : 'Connect'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
