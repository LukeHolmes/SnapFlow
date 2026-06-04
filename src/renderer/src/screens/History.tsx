import { useEffect, useState, useMemo, useCallback } from 'react';
import { Trash2, Filter, Pencil } from 'lucide-react';
import { api } from '../api';
import { TAGS, CaptureThumb, rel } from '../components/shared';
import type { Capture } from '../components/shared';

interface Props { flash: (text: string, ok?: boolean) => void; refreshKey: number; onAnnotate?: (capture: Capture) => void; }

const TAG_FILTERS = ['all', 'ui', 'code', 'chart', 'document', 'web'] as const;
const DATE_FILTERS = [
  { id: 'all',   label: 'All time',  ms: 0 },
  { id: 'today', label: 'Today',     ms: 86_400_000 },
  { id: 'week',  label: 'This week', ms: 7 * 86_400_000 },
  { id: 'month', label: 'This month',ms: 30 * 86_400_000 },
] as const;

export default function History({ flash, refreshKey, onAnnotate }: Props) {
  const [all, setAll] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [tag, setTag] = useState<string>('all');
  const [date, setDate] = useState<string>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setAll(await api.history.list(200));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cutoff = DATE_FILTERS.find(d => d.id === date)?.ms ?? 0;
    return all.filter(c =>
      (tag === 'all' || c.tag === tag) &&
      (cutoff === 0 || Date.now() - c.createdAt < cutoff) &&
      (!q || c.filename.toLowerCase().includes(q) || (c.ocrText ?? '').toLowerCase().includes(q))
    );
  }, [all, tag, date, query]);

  const del = async (id: string) => {
    await api.history.remove(id);
    setAll(prev => prev.filter(c => c.id !== id));
    flash('Capture deleted');
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">History</h1>
          <p className="screen-sub">Every capture, OCR-indexed and searchable.</p>
        </div>
        <span className="count-badge">{filtered.length} {filtered.length === 1 ? 'capture' : 'captures'}</span>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <Filter size={14} strokeWidth={1.9} color="#aaa" style={{ flexShrink: 0 }} />
        <div className="filter-group">
          {TAG_FILTERS.map(t => {
            const colors = t !== 'all' ? TAGS[t] : null;
            return (
              <button
                key={t}
                className={`chip${tag === t ? ' chip-active' : ''}`}
                style={tag === t && colors ? { background: colors.bg, color: colors.fg, borderColor: colors.bg } : undefined}
                onClick={() => setTag(t)}
              >
                {t === 'all' ? 'All types' : t}
              </button>
            );
          })}
        </div>
        <div className="filter-divider" />
        <div className="filter-group">
          {DATE_FILTERS.map(d => (
            <button key={d.id} className={`chip${date === d.id ? ' chip-active' : ''}`} onClick={() => setDate(d.id)}>
              {d.label}
            </button>
          ))}
        </div>
        <input
          className="filter-search"
          placeholder="Filter by name or text…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="empty" style={{ padding: '32px 0' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📷</div>
          <div className="empty-state-title">{all.length === 0 ? 'No captures yet' : 'No captures match your filters'}</div>
          <div className="empty-state-sub">{all.length === 0 ? 'Hit New Capture to take your first.' : 'Try adjusting the tag or date filter.'}</div>
        </div>
      ) : (
        <div className="captures-grid">
          {filtered.map(c => {
            const t = TAGS[c.tag ?? 'ui'] ?? TAGS.ui;
            return (
              <div className="card capture-card capture-card-deletable" key={c.id} onClick={() => onAnnotate?.(c)}>
                <div style={{ position: 'relative' }}>
                  <CaptureThumb tag={c.tag} />
                  {c.hasAnnotations && (
                    <span className="annotation-badge" title="Annotation layer present">
                      <Pencil size={10} strokeWidth={2.4} />
                    </span>
                  )}
                </div>
                <div className="capture-info">
                  <div className="capture-name">{c.filename}</div>
                  <div className="capture-meta">
                    {c.tag && <span className="tag" style={{ background: t.bg, color: t.fg }}>{c.tag}</span>}
                    {c.hasPii && <span className="pii-dot" title="PII redacted" />}
                    <span className="capture-time">{rel(c.createdAt)}</span>
                  </div>
                </div>
                <button className="delete-btn" title="Delete capture" onClick={(e) => { e.stopPropagation(); del(c.id); }} aria-label="Delete">
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
