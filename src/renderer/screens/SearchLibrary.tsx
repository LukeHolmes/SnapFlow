import { useEffect, useState, useRef } from 'react';
import { Search } from 'lucide-react';
import { api } from '../api';
import { TAGS, CaptureThumb, rel } from '../components/shared';
import type { Capture } from '../components/shared';

interface Props { flash: (text: string, ok?: boolean) => void; refreshKey: number; initialQuery?: string; }

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim() || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.trim().toLowerCase()
          ? <mark key={i} className="ocr-highlight">{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

function snippet(text: string, query: string, window = 120): string {
  if (!text || !query.trim()) return text?.slice(0, window) ?? '';
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx === -1) return text.slice(0, window);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

export default function SearchLibrary({ initialQuery = '', refreshKey }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Capture[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearched(false); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      const r = await api.history.search(query);
      setResults(r); setSearched(true); setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, refreshKey]);

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Search Library</h1>
          <p className="screen-sub">Full-text search across every OCR-indexed capture.</p>
        </div>
      </div>

      {/* Search input */}
      <div className="search-lib-bar">
        <Search size={18} color="#aaa" strokeWidth={1.9} style={{ flexShrink: 0 }} />
        <input
          ref={inputRef}
          className="search-lib-input"
          placeholder="Search by filename, code, error messages, URLs…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear">×</button>}
      </div>

      {/* Results */}
      {!query.trim() && (
        <div className="empty-state" style={{ marginTop: 48 }}>
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">Search your capture history</div>
          <div className="empty-state-sub">Try <em>NullPointerException</em>, <em>border-radius</em>, or a teammate's email address.</div>
        </div>
      )}
      {searching && <div className="empty" style={{ padding: '24px 0' }}>Searching…</div>}
      {searched && !searching && results.length === 0 && (
        <div className="empty-state" style={{ marginTop: 32 }}>
          <div className="empty-state-icon">💨</div>
          <div className="empty-state-title">No results for "{query}"</div>
          <div className="empty-state-sub">Try a different keyword, or check the History view to browse all captures.</div>
        </div>
      )}
      {results.length > 0 && (
        <>
          <p className="results-count">{results.length} {results.length === 1 ? 'result' : 'results'}</p>
          <div className="search-results">
            {results.map(c => {
              const t = TAGS[c.tag ?? 'ui'] ?? TAGS.ui;
              const snip = snippet(c.ocrText ?? '', query);
              return (
                <div className="card search-result-item" key={c.id}>
                  <CaptureThumb tag={c.tag} size="sm" />
                  <div className="search-result-body">
                    <div className="search-result-meta">
                      <span className="capture-name">{c.filename}</span>
                      {c.tag && <span className="tag" style={{ background: t.bg, color: t.fg }}>{c.tag}</span>}
                      {c.hasPii && <span className="pii-dot" title="PII redacted" />}
                      <span className="capture-time" style={{ marginLeft: 'auto' }}>{rel(c.createdAt)}</span>
                    </div>
                    {snip && (
                      <p className="search-result-snip">
                        <Highlight text={snip} query={query} />
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
