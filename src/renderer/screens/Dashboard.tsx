import { useEffect, useState, useCallback } from 'react';
import { Send, ArrowUpRight, Crop, AppWindow, ScrollText, Timer } from 'lucide-react';
import { api } from '../api';
import { TAGS, PRESET_ICONS, PRESET_BG, DOT, STAT_META, CaptureThumb, rel } from '../components/shared';
import type { Capture, Preset, ActivityEvent, Stats, Entitlements } from '../components/shared';

interface Props {
  flash: (text: string, ok?: boolean) => void;
  refreshKey: number;
  setActive: (screen: string) => void;
  startRegion: () => void;
  openPicker: () => Promise<void>;
}

export default function Dashboard({ flash, refreshKey, setActive, startRegion, openPicker }: Props) {
  const [stats, setStats] = useState<Stats>({ total: 0, ocrIndexed: 0, sent: 0, piiRedacted: 0 });
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  const load = useCallback(async () => {
    const [s, c, p, ev] = await Promise.all([
      api.stats.get(), api.history.list(3), api.presets.list(), api.events.recent(6),
    ]);
    setStats(s); setCaptures(c); setPresets(p); setEvents(ev);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const send = async (presetId: string) => {
    const target = captures[0]?.id;
    if (!target) { flash('Take a capture first', false); return; }
    const res = await api.presets.send(target, presetId);
    flash(res.detail, res.ok);
    if (res.ok) load();
  };

  const onQuick = (label: string) => {
    if (label === 'Region') return startRegion();
    if (label === 'Window') return openPicker();
    flash(`${label} capture is coming in a later build`);
  };

  return (
    <>
      {/* Stats */}
      <section className="stats-grid">
        {STAT_META.map(({ key, label, Icon, fg, bg }) => (
          <div className="card stat-card" key={key}>
            <div className="stat-icon" style={{ color: fg, background: bg }}><Icon size={16} strokeWidth={2} /></div>
            <div className="stat-value">{Number((stats as any)[key]).toLocaleString()}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </section>

      {/* Quick capture */}
      <section className="quick-row">
        {([['Region','⌘⇧4',Crop],['Window','⌘⇧5',AppWindow],['Scroll','⌘⇧6',ScrollText],['Delay','2s / 5s',Timer]] as const).map(([l,c,Icon]: any) => (
          <button className="quick-btn" key={l} onClick={() => onQuick(l)}>
            <Icon size={15} strokeWidth={1.9} color="#666" />
            <span className="quick-label">{l}</span>
            <span className="quick-combo">{c}</span>
          </button>
        ))}
      </section>

      {/* Recent captures */}
      <section>
        <div className="section-head">
          <h2 className="section-title">Recent Captures</h2>
          <button className="btn-ghost" onClick={() => setActive('History')}>View all</button>
        </div>
        <div className="captures-grid">
          {captures.length === 0 && <div className="empty">No captures yet — hit New Capture to take your first.</div>}
          {captures.map(c => {
            const t = TAGS[c.tag ?? 'ui'] ?? TAGS.ui;
            return (
              <div className="card capture-card" key={c.id}>
                <CaptureThumb tag={c.tag} />
                <div className="capture-info">
                  <div className="capture-name">{c.filename}</div>
                  <div className="capture-meta">
                    {c.tag && <span className="tag" style={{ background: t.bg, color: t.fg }}>{c.tag}</span>}
                    {c.hasPii && <span className="pii-dot" title="PII redacted" />}
                    <span className="capture-time">{rel(c.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Presets + Activity */}
      <section className="bottom-grid">
        <div className="card panel">
          <div className="section-head" style={{ marginBottom: 14 }}>
            <h2 className="section-title">Output Presets</h2>
            <button className="btn-ghost" onClick={() => setActive('Output Presets')}>Manage</button>
          </div>
          <div className="preset-list">
            {presets.length === 0 && <div className="empty">No presets — <button className="link-btn" onClick={() => setActive('Output Presets')}>add one</button></div>}
            {presets.map(p => {
              const Icon = PRESET_ICONS[p.destination] ?? Send;
              return (
                <div className="preset-row" key={p.id}>
                  <span className="preset-icon" style={{ background: PRESET_BG[p.destination] ?? '#666' }}><Icon size={13} color="#fff" strokeWidth={2} /></span>
                  <div className="preset-meta"><span className="preset-name">{p.name}</span><span className="preset-dest">{p.target}</span></div>
                  <span className="badge-violet">{p.name}</span>
                  <button className="preset-send" title={`Send to ${p.name}`} onClick={() => send(p.id)}><ArrowUpRight size={14} strokeWidth={2.2} color="#4338CA" /></button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card panel">
          <div className="section-head" style={{ marginBottom: 14 }}><h2 className="section-title">Recent Activity</h2></div>
          <div className="activity-list">
            {events.length === 0 && <div className="empty">No activity yet.</div>}
            {events.map(ev => (
              <div className="activity-item" key={ev.id}>
                <span className="activity-dot" style={{ background: DOT[ev.kind] }} />
                <span className="activity-text">{ev.text}</span>
                <span className="activity-time">{rel(ev.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
