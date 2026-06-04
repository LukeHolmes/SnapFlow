import { useEffect, useState, useCallback } from 'react';
import { GitCompare, ChevronLeft, ChevronRight, Loader, Cpu, RotateCcw, X } from 'lucide-react';
import { api, isLive } from '../api';
import { CaptureThumb, TAGS, rel } from '../components/shared';
import type { Capture } from '../components/shared';

interface Props { flash: (text: string, ok?: boolean) => void; refreshKey: number; }

type Phase = 'select' | 'computing' | 'result';
type Tab   = 'before' | 'after' | 'diff';

interface DiffResult {
  diffImagePath: string;
  changedPixels: number;
  totalPixels: number;
  changePercent: number;
  width: number;
  height: number;
}

// ── Capture picker ────────────────────────────────────────────────────────────
function CapturePicker({ captures, onPick, onClose }: {
  captures: Capture[];
  onPick: (c: Capture) => void;
  onClose: () => void;
}) {
  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-panel" onClick={e => e.stopPropagation()}>
        <div className="picker-head">
          <span className="picker-title">Select a capture</span>
          <button className="icon-btn" onClick={onClose}><X size={15}/></button>
        </div>
        {captures.length === 0
          ? <div className="empty" style={{ padding: '16px 0' }}>No captures yet — take one first.</div>
          : (
            <div className="picker-grid">
              {captures.map(c => {
                const t = TAGS[c.tag ?? 'ui'] ?? TAGS.ui;
                return (
                  <button className="picker-card" key={c.id} onClick={() => { onPick(c); onClose(); }}>
                    <CaptureThumb tag={c.tag} size="sm" />
                    <div className="picker-card-info">
                      <span className="picker-card-name">{c.filename}</span>
                      <div className="picker-card-meta">
                        {c.tag && <span className="tag" style={{ background: t.bg, color: t.fg }}>{c.tag}</span>}
                        <span className="capture-time">{rel(c.createdAt)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

// ── Slot — the before / after selection card ──────────────────────────────────
function Slot({ label, capture, dataUrl, onSelect }: {
  label: string;
  capture: Capture | null;
  dataUrl: string | null;
  onSelect: () => void;
}) {
  return (
    <div className={`diff-slot${capture ? ' diff-slot-filled' : ''}`}>
      <div className="diff-slot-label">{label}</div>
      {capture ? (
        <>
          <div className="diff-slot-thumb">
            {dataUrl
              ? <img src={dataUrl} alt={capture.filename} className="diff-real-img" />
              : <CaptureThumb tag={capture.tag} />}
          </div>
          <div className="diff-slot-name">{capture.filename}</div>
          <button className="btn-ghost" onClick={onSelect} style={{ fontSize: 12 }}>Change</button>
        </>
      ) : (
        <>
          <div className="diff-slot-empty">
            <GitCompare size={28} color="#C7D2FE" strokeWidth={1.5} />
          </div>
          <button className="btn-primary" onClick={onSelect}>Select capture</button>
        </>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function Diff({ flash, refreshKey }: Props) {
  const [captures, setCaptures]   = useState<Capture[]>([]);
  const [before, setBefore]       = useState<Capture | null>(null);
  const [after, setAfter]         = useState<Capture | null>(null);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl]   = useState<string | null>(null);
  const [diffUrl, setDiffUrl]     = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [summary, setSummary]     = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [phase, setPhase]         = useState<Phase>('select');
  const [activeTab, setActiveTab] = useState<Tab>('diff');
  const [picker, setPicker]       = useState<'before' | 'after' | null>(null);
  const [computing, setComputing] = useState(false);

  const loadCaptures = useCallback(async () => {
    setCaptures(await api.history.list(30));
  }, []);

  useEffect(() => { loadCaptures(); }, [loadCaptures, refreshKey]);

  // Load image data URL when a slot is filled
  const loadUrl = useCallback(async (c: Capture | null, setter: (u: string | null) => void) => {
    if (!c) { setter(null); return; }
    const url = await api.capture.getImageDataUrl(c.id);
    setter(url);
  }, []);

  useEffect(() => { loadUrl(before, setBeforeUrl); }, [before, loadUrl]);
  useEffect(() => { loadUrl(after, setAfterUrl); },  [after, loadUrl]);

  const reset = () => {
    setPhase('select'); setDiffResult(null); setDiffUrl(null);
    setSummary(null); setActiveTab('diff');
  };

  const compare = async () => {
    if (!before || !after) return;
    setComputing(true);
    const res = await api.diff.compute(before.id, after.id) as any;
    setComputing(false);
    if (!res.ok) { flash(res.error ?? 'Diff failed', false); return; }

    setDiffResult(res);
    // The diff image path from Electron → load as data URL
    if (res.diffImagePath) {
      const url = await api.capture.getImageDataUrl?.('__diff__') ?? null;
      // Electron path: data URL from the diff file (the IPC returns the file path)
      if (isLive && res.diffImagePath) {
        try {
          // Electron renderer can read file:// URLs for local PNG files
          setDiffUrl('file://' + res.diffImagePath);
        } catch { setDiffUrl(null); }
      }
    }
    setPhase('result');
    setActiveTab('diff');

    // AI summary — loads asynchronously
    setSummaryLoading(true);
    const sumRes = await api.diff.summarise(before.id, after.id) as any;
    setSummaryLoading(false);
    if (sumRes.ok) setSummary(sumRes.summary);
  };

  const severityLabel = (pct: number) => {
    if (pct === 0) return { label: 'Identical', color: '#059669' };
    if (pct < 1)  return { label: 'Minor changes', color: '#F59E0B' };
    if (pct < 10) return { label: 'Moderate changes', color: '#FB923C' };
    return { label: 'Major changes', color: '#EF4444' };
  };

  const tabImage = (tab: Tab): string | null => {
    if (tab === 'before') return beforeUrl;
    if (tab === 'after')  return afterUrl;
    return diffUrl;
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Diff Mode</h1>
          <p className="screen-sub">Compare two captures and get an AI-powered summary of what changed.</p>
        </div>
        {phase === 'result' && (
          <button className="btn-ghost" onClick={reset}><RotateCcw size={13} strokeWidth={2} style={{ marginRight: 6 }} />New comparison</button>
        )}
      </div>

      {/* ── Selection phase ── */}
      {phase !== 'result' && (
        <>
          <div className="diff-slots">
            <Slot label="Before" capture={before} dataUrl={beforeUrl}
              onSelect={() => setPicker('before')} />
            <div className="diff-arrow"><ChevronRight size={28} color="#C7D2FE" strokeWidth={1.5} /></div>
            <Slot label="After" capture={after} dataUrl={afterUrl}
              onSelect={() => setPicker('after')} />
          </div>

          {before && after && before.id === after.id && (
            <p className="diff-same-warn">⚠ Before and After are the same capture — the diff will be empty.</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
            <button
              className="btn-primary diff-compare-btn"
              onClick={compare}
              disabled={!before || !after || computing}
            >
              {computing
                ? <><Loader size={15} strokeWidth={2} className="spin" />Computing…</>
                : <><GitCompare size={15} strokeWidth={2} />Compare</>}
            </button>
          </div>

          {!isLive && <p className="diff-mock-note">Preview mode — using mock captures. In Electron, select any two real captures.</p>}
        </>
      )}

      {/* ── Result phase ── */}
      {phase === 'result' && diffResult && (
        <>
          {/* Stats bar */}
          <div className="diff-stats-bar card">
            {(() => { const s = severityLabel(diffResult.changePercent); return (
              <>
                <span className="diff-severity" style={{ color: s.color }}>{s.label}</span>
                <span className="diff-stats-sep" />
                <span className="diff-stat"><strong>{diffResult.changePercent.toFixed(2)}%</strong> changed</span>
                <span className="diff-stats-sep" />
                <span className="diff-stat">{diffResult.changedPixels.toLocaleString()} pixels modified</span>
                <span className="diff-stats-sep" />
                <span className="diff-stat diff-dim">{diffResult.width} × {diffResult.height} px</span>
              </>
            ); })()}
          </div>

          {/* Tab switcher */}
          <div className="diff-tabs">
            {(['before','after','diff'] as Tab[]).map(tab => (
              <button
                key={tab}
                className={`diff-tab${activeTab === tab ? ' diff-tab-active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'before' ? `Before · ${before?.filename}` : tab === 'after' ? `After · ${after?.filename}` : '⬛ Diff overlay'}
              </button>
            ))}
          </div>

          {/* Image viewer */}
          <div className="diff-viewer card">
            {tabImage(activeTab)
              ? <img src={tabImage(activeTab)!} alt={activeTab} className="diff-viewer-img" />
              : (
                <div className="diff-viewer-placeholder">
                  <CaptureThumb tag={activeTab === 'before' ? before?.tag ?? null : after?.tag ?? null} />
                  {activeTab === 'diff' && <p className="diff-viewer-hint">Diff overlay not available in preview mode</p>}
                </div>
              )}
          </div>

          {/* AI summary */}
          <div className="card diff-summary">
            <div className="diff-summary-head">
              <Cpu size={14} strokeWidth={1.9} color="#818CF8" />
              <span className="diff-summary-label">AI Analysis</span>
              <span className="diff-summary-tier">Pro & Team</span>
            </div>
            {summaryLoading
              ? <div className="diff-summary-loading"><Loader size={14} className="spin" strokeWidth={2} /><span>Analysing changes…</span></div>
              : summary
                ? <p className="diff-summary-text">{summary}</p>
                : <p className="diff-summary-empty">AI summary not available — check your plan or backend connection.</p>}
          </div>
        </>
      )}

      {/* Capture picker */}
      {picker && (
        <CapturePicker
          captures={captures.filter(c => picker === 'after' ? c.id !== before?.id : c.id !== after?.id)}
          onPick={c => { picker === 'before' ? setBefore(c) : setAfter(c); }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
