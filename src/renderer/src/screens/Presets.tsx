import { useEffect, useState, useCallback, useMemo } from 'react';
import { ArrowUpRight, Send } from 'lucide-react';
import { api } from '../api';
import { PRESET_ICONS, PRESET_BG, rel } from '../components/shared';
import type { Preset, Entitlements } from '../components/shared';
import type { DestinationId, IntegrationOption, IntegrationStatus } from '../../../shared/types';

interface Props { flash: (text: string, ok?: boolean) => void; refreshKey: number; }

const DESTINATIONS: { id: DestinationId; label: string; sub: string }[] = [
  { id: 'clipboard', label: 'Clipboard', sub: 'Always available locally' },
  { id: 'slack', label: 'Slack', sub: 'Upload to a Slack channel' },
  { id: 'jira', label: 'Jira', sub: 'Create or attach to Jira issues' },
  { id: 'notion', label: 'Notion', sub: 'Append to a Notion page' },
  { id: 'gmail', label: 'Gmail', sub: 'Send as an email attachment' },
  { id: 'github', label: 'GitHub Issues', sub: 'Create an issue or comment with the capture' },
  { id: 'zapier', label: 'Zapier Webhook', sub: 'POST capture metadata to any HTTPS webhook' },
];

const EMAIL_RE = /^(?:[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;

export default function Presets({ flash, refreshKey }: Props) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [statuses, setStatuses] = useState<Record<string, IntegrationStatus>>({});
  const [channels, setChannels] = useState<IntegrationOption[]>([]);
  const [notionPages, setNotionPages] = useState<IntegrationOption[]>([]);
  const [repos, setRepos] = useState<IntegrationOption[]>([]);
  const [slack, setSlack] = useState({ channel_id: '', channel_name: '', workspace_name: '' });
  const [jira, setJira] = useState({ issue_key: '', project_key: '', issue_summary: '', issue_description: '' });
  const [notion, setNotion] = useState({ page_id: '', page_title: '', query: '' });
  const [gmail, setGmail] = useState({ recipients: '', account_email: '' });
  const [github, setGithub] = useState({ owner: '', repo: '', mode: 'create' as 'create' | 'comment', issue_number: '', scope: 'repo' });
  const [zapier, setZapier] = useState({ webhook_url: '', secret: '' });

  const load = useCallback(async () => {
    const [p, e, s] = await Promise.all([api.presets.list(), api.entitlements.get(), api.integrations.statuses()]);
    setPresets(p);
    setEnt(e);
    setStatuses(Object.fromEntries(s.map(status => [status.destination, status])));

    const slackPreset = p.find(item => item.destination === 'slack');
    const jiraPreset = p.find(item => item.destination === 'jira');
    const notionPreset = p.find(item => item.destination === 'notion');
    const gmailPreset = p.find(item => item.destination === 'gmail');
    const githubPreset = p.find(item => item.destination === 'github');
    const zapierPreset = p.find(item => item.destination === 'zapier');

    setSlack({
      channel_id: String(slackPreset?.config.channel_id ?? ''),
      channel_name: String(slackPreset?.config.channel_name ?? ''),
      workspace_name: String(slackPreset?.config.workspace_name ?? s.find(item => item.destination === 'slack')?.label ?? ''),
    });
    setJira({
      issue_key: String(jiraPreset?.config.issue_key ?? ''),
      project_key: String(jiraPreset?.config.project_key ?? ''),
      issue_summary: String(jiraPreset?.config.issue_summary ?? ''),
      issue_description: String(jiraPreset?.config.issue_description ?? ''),
    });
    setNotion({
      page_id: String(notionPreset?.config.page_id ?? ''),
      page_title: String(notionPreset?.config.page_title ?? ''),
      query: '',
    });
    setGmail({
      recipients: Array.isArray(gmailPreset?.config.recipients)
        ? (gmailPreset?.config.recipients as string[]).join(', ')
        : String(gmailPreset?.target ?? ''),
      account_email: String(gmailPreset?.config.account_email ?? ''),
    });
    setGithub({
      owner: String(githubPreset?.config.owner ?? ''),
      repo: String(githubPreset?.config.repo ?? ''),
      mode: githubPreset?.config.mode === 'comment' ? 'comment' : 'create',
      issue_number: githubPreset?.config.issue_number ? String(githubPreset.config.issue_number) : '',
      scope: 'repo',
    });
    setZapier({
      webhook_url: String(zapierPreset?.config.webhook_url ?? ''),
      secret: String(zapierPreset?.config.secret ?? ''),
    });
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    if (statuses.slack?.connected) {
      api.integrations.slackChannels().then(setChannels).catch(() => setChannels([]));
    }
    if (statuses.gmail?.connected) {
      api.integrations.gmailProfile().then(profile => {
        setGmail(prev => ({ ...prev, account_email: profile.email }));
      }).catch(() => {});
    }
  }, [statuses]);

  const presetMap = useMemo(() => Object.fromEntries(presets.map(p => [p.destination, p])), [presets]);
  const atLimit = ent && ent.maxPresets !== null && presets.length >= ent.maxPresets;

  const sendPreset = async (destination: DestinationId) => {
    if (destination === 'clipboard') {
      const capture = (await api.history.list(1))[0];
      if (!capture) { flash('Take a capture first', false); return; }
      const result = await api.capture.copyImage(capture.id);
      flash(result.detail, result.ok);
      return;
    }
    const preset = presetMap[destination];
    const capture = (await api.history.list(1))[0];
    if (!capture) { flash('Take a capture first', false); return; }
    if (!preset) { flash('Save this destination first', false); return; }
    const result = await api.presets.send(capture.id, preset.id);
    flash(result.detail, result.ok);
    load();
  };

  const connect = async (destination: DestinationId, params?: Record<string, string>) => {
    const result = await api.integrations.connect(destination, params);
    flash(result.detail, result.ok);
  };

  const savePreset = async (destination: DestinationId, name: string, target: string, config: Record<string, unknown>) => {
    const result = await api.presets.upsert({ destination, name, target, config }) as { ok: boolean; error?: string };
    if (!result.ok) {
      flash(result.error ?? 'Could not save preset', false);
      return;
    }
    flash(`${name} saved`);
    load();
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Output Presets</h1>
          <p className="screen-sub">Configure once, deliver in a single keystroke.</p>
        </div>
        {atLimit && <span className="limit-note">Preset limit reached for the current plan.</span>}
      </div>

      {ent && ent.maxPresets !== null && (
        <div className="tier-note">
          <span className="tier-note-text">
            {presets.length} of {ent.maxPresets} preset{ent.maxPresets > 1 ? 's' : ''} used — {ent.tier} plan
          </span>
          {ent.tier === 'free' && <button className="upgrade-link" onClick={() => flash('Upgrade at snapflow.app/pricing')}>Upgrade to Pro for 5 presets →</button>}
          {ent.tier === 'pro' && <button className="upgrade-link" onClick={() => flash('Upgrade at snapflow.app/pricing')}>Upgrade to Team for unlimited →</button>}
        </div>
      )}

      <div className="preset-config-list">
        {DESTINATIONS.map(destination => {
          const Icon = PRESET_ICONS[destination.id] ?? Send;
          const preset = presetMap[destination.id];
          const status = statuses[destination.id];
          const dot = destination.id === 'clipboard'
            ? '#34D399'
            : status?.state === 'connected'
              ? '#34D399'
              : status?.state === 'error'
                ? '#F87171'
                : '#FBBF24';
          const secondary = preset?.target || status?.label || destination.sub;
          return (
            <div className="card preset-config-card" key={destination.id}>
              <div className="preset-config-head">
                <div className="preset-config-title">
                  <span className="preset-icon" style={{ background: PRESET_BG[destination.id] ?? '#666' }}><Icon size={14} color="#fff" strokeWidth={2} /></span>
                  <div className="preset-meta">
                    <span className="preset-name">{destination.label}</span>
                    <span className="preset-dest">{secondary}</span>
                  </div>
                </div>
                <div className="preset-config-actions">
                  <span className="preset-status-dot" style={{ background: dot }} />
                  <button className="preset-send" title="Send latest capture" onClick={() => sendPreset(destination.id)}>
                    <ArrowUpRight size={14} strokeWidth={2.2} color="#4338CA" />
                  </button>
                </div>
              </div>

              {destination.id === 'clipboard' && (
                <div className="preset-config-body">
                  <p className="integration-hint">Clipboard delivery is always available, including on the free plan.</p>
                </div>
              )}

              {destination.id === 'slack' && (
                <div className="preset-config-body">
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Workspace</label>
                      <input className="form-input" value={slack.workspace_name || status?.label || ''} readOnly placeholder="Connect Slack first" />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Channel</label>
                      <select className="form-input" value={slack.channel_id} onChange={e => {
                        const selected = channels.find(item => item.id === e.target.value);
                        setSlack(prev => ({ ...prev, channel_id: e.target.value, channel_name: selected?.label ?? '' }));
                      }}>
                        <option value="">Select a Slack channel</option>
                        {channels.map(channel => <option key={channel.id} value={channel.id}>{channel.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-actions">
                    <button className="btn-ghost" onClick={() => connect('slack')}>Connect Slack</button>
                    <button className="btn-primary" onClick={() => {
                      if (!slack.channel_id) { flash('Select a Slack channel', false); return; }
                      savePreset('slack', 'Slack', slack.channel_name || slack.channel_id, slack);
                    }}>Save preset</button>
                  </div>
                </div>
              )}

              {destination.id === 'jira' && (
                <div className="preset-config-body">
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Attach to existing issue</label>
                      <input className="form-input" placeholder="ENG-123" value={jira.issue_key} onChange={e => setJira(prev => ({ ...prev, issue_key: e.target.value }))} />
                      <p className="integration-hint">Provide an issue key to attach screenshots to an existing Jira issue.</p>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Create new in project</label>
                      <input className="form-input" placeholder="ENG" value={jira.project_key} onChange={e => setJira(prev => ({ ...prev, project_key: e.target.value }))} />
                      <p className="integration-hint">Leave blank if using an existing issue key.</p>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Issue summary</label>
                    <input className="form-input" placeholder="Summarise the capture" value={jira.issue_summary} onChange={e => setJira(prev => ({ ...prev, issue_summary: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description (optional)</label>
                    <textarea className="form-input" placeholder="Context for this capture" value={jira.issue_description} onChange={e => setJira(prev => ({ ...prev, issue_description: e.target.value }))} />
                  </div>
                  <div className="form-actions">
                    <button className="btn-ghost" onClick={() => connect('jira')}>Connect Jira</button>
                    <button className="btn-primary" onClick={() => {
                      const trimmedIssueKey = jira.issue_key.trim();
                      const trimmedProjectKey = jira.project_key.trim();
                      if (!trimmedIssueKey && !trimmedProjectKey) { flash('Add an issue key or project key', false); return; }
                      if (trimmedProjectKey && !jira.issue_summary.trim()) { flash('Add an issue summary to create a new Jira issue', false); return; }
                      const target = trimmedIssueKey || trimmedProjectKey;
                      savePreset('jira', 'Jira', target, {
                        issue_key: trimmedIssueKey,
                        project_key: trimmedProjectKey,
                        issue_summary: jira.issue_summary.trim(),
                        issue_description: jira.issue_description.trim(),
                      });
                    }}>Save preset</button>
                  </div>
                </div>
              )}

              {destination.id === 'notion' && (
                <div className="preset-config-body">
                  <p className="integration-hint">Make sure you’ve shared this page with the SnapFlow integration in Notion.</p>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Search pages</label>
                      <input className="form-input" value={notion.query} placeholder="Release notes" onChange={e => setNotion(prev => ({ ...prev, query: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ width: 160 }}>
                      <label className="form-label">Search</label>
                      <button className="btn-ghost" onClick={async () => setNotionPages(await api.integrations.notionPages(notion.query))}>Find pages</button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Page</label>
                    <select className="form-input" value={notion.page_id} onChange={e => {
                      const selected = notionPages.find(item => item.id === e.target.value);
                      setNotion(prev => ({ ...prev, page_id: e.target.value, page_title: selected?.label ?? '' }));
                    }}>
                      <option value="">Select a Notion page</option>
                      {notionPages.map(page => <option key={page.id} value={page.id}>{page.label}</option>)}
                    </select>
                  </div>
                  <div className="form-actions">
                    <button className="btn-ghost" onClick={() => connect('notion')}>Connect Notion</button>
                    <button className="btn-primary" onClick={() => {
                      if (!notion.page_id) { flash('Select a Notion page', false); return; }
                      savePreset('notion', 'Notion', notion.page_title || notion.page_id, { page_id: notion.page_id, page_title: notion.page_title });
                    }}>Save preset</button>
                  </div>
                </div>
              )}

              {destination.id === 'gmail' && (
                <div className="preset-config-body">
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Connected account</label>
                      <input className="form-input" readOnly value={gmail.account_email || 'Connect Gmail first'} />
                    </div>
                    <div className="form-group" style={{ flex: 2 }}>
                      <label className="form-label">Recipients</label>
                      <input className="form-input" placeholder="qa@example.com, client@example.com" value={gmail.recipients} onChange={e => setGmail(prev => ({ ...prev, recipients: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button className="btn-ghost" onClick={() => connect('gmail')}>Connect Gmail</button>
                    <button className="btn-primary" onClick={() => {
                      const recipients = gmail.recipients.split(',').map(item => item.trim()).filter(Boolean);
                      if (!recipients.length || recipients.some(email => !EMAIL_RE.test(email))) {
                        flash('Enter valid recipient email addresses', false);
                        return;
                      }
                      savePreset('gmail', 'Gmail', recipients.join(', '), { recipients, account_email: gmail.account_email });
                    }}>Save preset</button>
                  </div>
                </div>
              )}

              {destination.id === 'github' && (
                <div className="preset-config-body">
                  <p className="integration-hint">GitHub integration requires a Pro or Team account because the capture image uses SnapFlow cloud sync.</p>
                  <div className="form-row">
                    <div className="form-group" style={{ width: 180 }}>
                      <label className="form-label">OAuth scope</label>
                      <select className="form-input" value={github.scope} onChange={e => setGithub(prev => ({ ...prev, scope: e.target.value }))}>
                        <option value="repo">repo</option>
                        <option value="public_repo">public_repo</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Search repos</label>
                      <input className="form-input" value={`${github.owner && github.repo ? `${github.owner}/${github.repo}` : ''}`} placeholder="acme/snapflow" onChange={e => {
                        const value = e.target.value;
                        const [owner = '', repo = ''] = value.split('/');
                        setGithub(prev => ({ ...prev, owner, repo }));
                      }} />
                    </div>
                    <div className="form-group" style={{ width: 150 }}>
                      <label className="form-label">Search</label>
                      <button className="btn-ghost" onClick={async () => setRepos(await api.integrations.githubRepos(`${github.owner}/${github.repo}`))}>Find repos</button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Repository</label>
                    <select className="form-input" value={github.owner && github.repo ? `${github.owner}/${github.repo}` : ''} onChange={e => {
                      const [owner, repo] = e.target.value.split('/');
                      setGithub(prev => ({ ...prev, owner, repo }));
                    }}>
                      <option value="">Select a repository</option>
                      {repos.map(repo => <option key={repo.id} value={repo.id}>{repo.label}</option>)}
                    </select>
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ width: 180 }}>
                      <label className="form-label">Mode</label>
                      <select className="form-input" value={github.mode} onChange={e => setGithub(prev => ({ ...prev, mode: e.target.value as 'create' | 'comment' }))}>
                        <option value="create">Create issue</option>
                        <option value="comment">Comment on issue</option>
                      </select>
                    </div>
                    {github.mode === 'comment' && (
                      <div className="form-group" style={{ width: 180 }}>
                        <label className="form-label">Issue number</label>
                        <input className="form-input" value={github.issue_number} onChange={e => setGithub(prev => ({ ...prev, issue_number: e.target.value }))} />
                      </div>
                    )}
                  </div>
                  <div className="form-actions">
                    <button className="btn-ghost" onClick={() => connect('github', { scope: github.scope })}>Connect GitHub</button>
                    <button className="btn-primary" onClick={() => {
                      if (!github.owner || !github.repo) { flash('Select a GitHub repository', false); return; }
                      if (github.mode === 'comment' && (!Number.isInteger(Number(github.issue_number)) || Number(github.issue_number) <= 0)) {
                        flash('Enter a valid issue number', false);
                        return;
                      }
                      savePreset('github', 'GitHub Issues', `${github.owner}/${github.repo}`, {
                        owner: github.owner,
                        repo: github.repo,
                        mode: github.mode,
                        issue_number: github.mode === 'comment' ? Number(github.issue_number) : undefined,
                      });
                    }}>Save preset</button>
                  </div>
                </div>
              )}

              {destination.id === 'zapier' && (
                <div className="preset-config-body">
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Webhook URL</label>
                      <input className="form-input" placeholder="https://hooks.zapier.com/..." value={zapier.webhook_url} onChange={e => setZapier(prev => ({ ...prev, webhook_url: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Secret</label>
                      <input className="form-input" placeholder="Optional HMAC secret" value={zapier.secret} onChange={e => setZapier(prev => ({ ...prev, secret: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button className="btn-ghost" onClick={async () => {
                      const result = await api.integrations.testZapier({ webhook_url: zapier.webhook_url, secret: zapier.secret, preset_name: 'Zapier Webhook' });
                      flash(result.detail, result.ok);
                    }}>Test webhook</button>
                    <button className="btn-primary" onClick={() => {
                      try {
                        const url = new URL(zapier.webhook_url);
                        if (url.protocol !== 'https:') throw new Error();
                      } catch {
                        flash('Enter a valid HTTPS webhook URL', false);
                        return;
                      }
                      savePreset('zapier', 'Zapier Webhook', zapier.webhook_url, { ...zapier, preset_name: 'Zapier Webhook' });
                    }}>Save preset</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
