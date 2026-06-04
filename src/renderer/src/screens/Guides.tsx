import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardList, FileDown, Save } from 'lucide-react';
import { api } from '../api';
import { CaptureThumb, rel } from '../components/shared';
import type { Capture, Guide, GuideListItem, GuideType } from '../../../shared/types';

interface Props { flash: (text: string, ok?: boolean) => void; refreshKey: number; }

const GUIDE_TYPES: Array<{ id: GuideType; label: string }> = [
  { id: 'sop', label: 'SOP' },
  { id: 'bug_report', label: 'Bug report' },
  { id: 'training', label: 'Training guide' },
  { id: 'validation', label: 'Validation walkthrough' },
  { id: 'walkthrough', label: 'Walkthrough' },
];

export default function Guides({ flash, refreshKey }: Props) {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [guides, setGuides] = useState<GuideListItem[]>([]);
  const [active, setActive] = useState<Guide | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<GuideType>('sop');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, g] = await Promise.all([api.history.list(200), api.guides.list()]);
    setCaptures(c);
    setGuides(g);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const selectedCaptures = useMemo(
    () => selected.map(id => captures.find(c => c.id === id)).filter((c): c is Capture => !!c),
    [captures, selected],
  );

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const create = async () => {
    if (selected.length === 0) {
      flash('Select at least one capture for the guide', false);
      return;
    }
    const guide = await api.guides.create({ title, type, captureIds: selected });
    setActive(guide);
    setSelected([]);
    setTitle('');
    await load();
    flash('Guide created');
  };

  const openGuide = async (id: string) => {
    const guide = await api.guides.get(id);
    if (guide) setActive(guide);
  };

  const patchActive = (patch: Partial<Guide>) => {
    setActive(prev => prev ? { ...prev, ...patch } : prev);
  };

  const patchStep = (idx: number, patch: Partial<Guide['steps'][number]>) => {
    setActive(prev => {
      if (!prev) return prev;
      const steps = prev.steps.map((step, i) => i === idx ? { ...step, ...patch } : step);
      return { ...prev, steps };
    });
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    setActive(prev => {
      if (!prev) return prev;
      const next = [...prev.steps];
      const to = idx + dir;
      if (to < 0 || to >= next.length) return prev;
      [next[idx], next[to]] = [next[to], next[idx]];
      return { ...prev, steps: next.map((step, i) => ({ ...step, order: i + 1 })) };
    });
  };

  const save = async () => {
    if (!active) return;
    const res = await api.guides.update(active);
    flash(res.detail, res.ok);
    if (res.guide) setActive(res.guide);
    await load();
  };

  const exportMarkdown = async () => {
    if (!active) return;
    const res = await api.guides.exportMarkdown(active.id);
    flash(res.detail, res.ok);
  };

  return (
    <div className="screen guides-screen">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Guides</h1>
          <p className="screen-sub">Turn captures into SOPs, bug reports, validation walkthroughs, and training material.</p>
        </div>
        <span className="count-badge">{guides.length} guide{guides.length === 1 ? '' : 's'}</span>
      </div>

      <div className="guides-layout">
        <section className="card guide-create-panel">
          <div className="form-panel-head">
            <h2 className="form-panel-title">Create guide from captures</h2>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Title</label>
              <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Checkout validation walkthrough" />
            </div>
            <div className="form-group" style={{ width: 180 }}>
              <label className="form-label">Template</label>
              <select className="form-input" value={type} onChange={e => setType(e.target.value as GuideType)}>
                {GUIDE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="guide-selected-strip">
            {selectedCaptures.length === 0
              ? <span>Select captures below to build ordered steps.</span>
              : selectedCaptures.map((c, i) => <span key={c.id} className="guide-selected-pill">{i + 1}. {c.filename}</span>)}
          </div>

          {loading ? <div className="empty">Loading captures…</div> : captures.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📚</div>
              <div className="empty-state-title">No captures to document yet</div>
              <div className="empty-state-sub">Take a few captures, annotate them, then assemble them into a guide.</div>
            </div>
          ) : (
            <div className="guide-capture-picker">
              {captures.slice(0, 12).map(c => (
                <button key={c.id} className={`guide-capture-pick${selected.includes(c.id) ? ' guide-capture-pick-active' : ''}`} onClick={() => toggle(c.id)}>
                  <CaptureThumb tag={c.tag} size="sm" />
                  <span>{c.filename}</span>
                </button>
              ))}
            </div>
          )}

          <div className="form-actions">
            <button className="btn-primary" onClick={create} disabled={selected.length === 0}>
              <ClipboardList size={14} /> Create guide
            </button>
          </div>
        </section>

        <aside className="card guide-list-panel">
          <h2 className="form-panel-title">Saved guides</h2>
          {guides.length === 0 ? <div className="empty">No guides yet.</div> : (
            <div className="guide-list">
              {guides.map(g => (
                <button key={g.id} className={`guide-list-item${active?.id === g.id ? ' guide-list-item-active' : ''}`} onClick={() => openGuide(g.id)}>
                  <strong>{g.title}</strong>
                  <span>{g.type.replace(/_/g, ' ')} • {g.stepCount} steps • {rel(g.updatedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>

      {active && (
        <section className="card guide-editor">
          <div className="guide-editor-head">
            <div>
              <input className="guide-title-input" value={active.title} onChange={e => patchActive({ title: e.target.value })} />
              <select className="form-input guide-type-select" value={active.type} onChange={e => patchActive({ type: e.target.value as GuideType })}>
                {GUIDE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="guide-editor-actions">
              <button className="btn-ghost" onClick={save}><Save size={14} />Save</button>
              <button className="btn-primary" onClick={exportMarkdown}><FileDown size={14} />Export Markdown</button>
            </div>
          </div>

          <label className="form-label">Summary</label>
          <textarea className="guide-summary" value={active.summary} onChange={e => patchActive({ summary: e.target.value })} />

          <div className="guide-steps">
            {active.steps.map((step, idx) => (
              <div className="guide-step-card" key={step.id}>
                <div className="guide-step-thumb"><CaptureThumb tag={step.capture?.tag ?? null} size="sm" /></div>
                <div className="guide-step-body">
                  <div className="guide-step-top">
                    <span className="guide-step-num">Step {idx + 1}</span>
                    <div className="guide-step-move">
                      <button className="icon-btn" onClick={() => moveStep(idx, -1)} disabled={idx === 0} aria-label="Move up"><ArrowUp size={13} /></button>
                      <button className="icon-btn" onClick={() => moveStep(idx, 1)} disabled={idx === active.steps.length - 1} aria-label="Move down"><ArrowDown size={13} /></button>
                    </div>
                  </div>
                  <input className="form-input" value={step.title} onChange={e => patchStep(idx, { title: e.target.value })} />
                  <textarea className="guide-step-desc" value={step.description} onChange={e => patchStep(idx, { description: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
