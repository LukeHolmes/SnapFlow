import { useEffect, useState, useCallback } from 'react';
import { Send, Trash2, Plus, X } from 'lucide-react';
import { api } from '../api';
import { PRESET_ICONS, PRESET_BG, rel } from '../components/shared';
import type { Preset, Entitlements } from '../components/shared';
import type { DestinationId } from '../../../shared/types';

interface Props { flash: (text: string, ok?: boolean) => void; refreshKey: number; }

const DESTINATIONS: { id: DestinationId; label: string; placeholder: string }[] = [
  { id: 'slack',     label: 'Slack',     placeholder: '#qa-bugs' },
  { id: 'jira',      label: 'Jira',      placeholder: 'PROJ-441' },
  { id: 'notion',    label: 'Notion',    placeholder: 'Release Notes page URL' },
  { id: 'email',     label: 'Email',     placeholder: 'client@agency.com' },
  { id: 'clipboard', label: 'Clipboard', placeholder: 'leave blank — copies to clipboard' },
];

export default function Presets({ flash, refreshKey }: Props) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [adding, setAdding] = useState(false);
  const [dest, setDest] = useState<DestinationId>('slack');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [p, e] = await Promise.all([api.presets.list(), api.entitlements.get()]);
    setPresets(p); setEnt(e);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const atLimit = ent && ent.maxPresets !== null && presets.length >= ent.maxPresets;
  const placeholderFor = DESTINATIONS.find(d => d.id === dest)?.placeholder ?? '';

  const openForm = () => { setAdding(true); setDest('slack'); setName(''); setTarget(''); };
  const closeForm = () => setAdding(false);

  const save = async () => {
    if (!name.trim()) { flash('Give the preset a name', false); return; }
    if (dest !== 'clipboard' && !target.trim()) { flash('Enter a target destination', false); return; }
    setSaving(true);
    const res = (await api.presets.add({ destination: dest, name: name.trim(), target: target.trim() })) as { ok: boolean; error?: string };
    setSaving(false);
    if (!res.ok) { flash(res.error ?? 'Could not add preset', false); return; }
    flash(`Preset "${name.trim()}" added`);
    closeForm(); load();
  };

  const remove = async (id: string, n: string) => {
    await api.presets.remove(id);
    flash(`Preset "${n}" removed`);
    load();
  };

  const send = async (p: Preset) => {
    const captures = await api.history.list(1);
    if (!captures[0]) { flash('Take a capture first', false); return; }
    const res = await api.presets.send(captures[0].id, p.id);
    flash(res.detail, res.ok);
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Output Presets</h1>
          <p className="screen-sub">Configure once, deliver in a single keystroke.</p>
        </div>
        {!adding && (
          atLimit
            ? <span className="limit-note">Limit reached — <a href="#" className="upgrade-link" onClick={e => { e.preventDefault(); flash('Upgrade at snapflow.app/pricing'); }}>upgrade</a></span>
            : <button className="btn-primary" onClick={openForm}><Plus size={14} strokeWidth={2.5} />Add preset</button>
        )}
      </div>

      {/* Tier note */}
      {ent && ent.maxPresets !== null && (
        <div className="tier-note">
          <span className="tier-note-text">
            {presets.length} of {ent.maxPresets} preset{ent.maxPresets > 1 ? 's' : ''} used — {ent.tier} plan
          </span>
          {ent.tier === 'free' && <button className="upgrade-link" onClick={() => flash('Upgrade at snapflow.app/pricing')}>Upgrade to Pro for 5 presets →</button>}
          {ent.tier === 'pro' && <button className="upgrade-link" onClick={() => flash('Upgrade at snapflow.app/pricing')}>Upgrade to Team for unlimited →</button>}
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div className="card form-panel">
          <div className="form-panel-head">
            <span className="form-panel-title">New preset</span>
            <button className="icon-btn" onClick={closeForm}><X size={15} /></button>
          </div>

          {/* Destination picker */}
          <div className="form-group">
            <label className="form-label">Destination</label>
            <div className="dest-chips">
              {DESTINATIONS.map(d => {
                const Icon = PRESET_ICONS[d.id] ?? Send;
                return (
                  <button
                    key={d.id}
                    className={`dest-chip${dest === d.id ? ' dest-chip-active' : ''}`}
                    onClick={() => setDest(d.id)}
                  >
                    <span className="dest-chip-icon" style={{ background: PRESET_BG[d.id] }}>
                      <Icon size={12} color="#fff" strokeWidth={2} />
                    </span>
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Name</label>
              <input className="form-input" placeholder="e.g. QA Bugs, Release Board" value={name} onChange={e => setName(e.target.value)} />
            </div>
            {dest !== 'clipboard' && (
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Target</label>
                <input className="form-input" placeholder={placeholderFor} value={target} onChange={e => setTarget(e.target.value)} />
              </div>
            )}
          </div>

          <div className="form-actions">
            <button className="btn-ghost" onClick={closeForm}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Adding…' : 'Add preset'}</button>
          </div>
        </div>
      )}

      {/* Preset list */}
      {presets.length === 0 && !adding ? (
        <div className="empty-state">
          <div className="empty-state-icon">📤</div>
          <div className="empty-state-title">No presets configured</div>
          <div className="empty-state-sub">Add a destination and send any capture in one click.</div>
        </div>
      ) : (
        <div className="preset-list-full">
          {presets.map(p => {
            const Icon = PRESET_ICONS[p.destination] ?? Send;
            return (
              <div className="card preset-row-full" key={p.id}>
                <span className="preset-icon" style={{ background: PRESET_BG[p.destination] ?? '#666' }}><Icon size={14} color="#fff" strokeWidth={2} /></span>
                <div className="preset-meta">
                  <span className="preset-name">{p.name}</span>
                  <span className="preset-dest">{p.destination}{p.target ? ` · ${p.target}` : ''}</span>
                </div>
                <div className="preset-row-actions">
                  <button className="btn-ghost" onClick={() => send(p)} title="Send last capture">
                    <Send size={13} strokeWidth={2} style={{ marginRight: 5 }} />Send
                  </button>
                  <button className="icon-btn danger-btn" onClick={() => remove(p.id, p.name)} title="Remove preset" aria-label="Remove">
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
