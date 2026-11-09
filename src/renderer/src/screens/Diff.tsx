import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  GitCompare, ChevronRight, Loader, Cpu, RotateCcw, X, Columns2, Layers,
  Sparkles, BoxSelect, Download, Send, Copy, History,
} from 'lucide-react';
import { api, isLive } from '../api';
import { CaptureThumb, TAGS, rel } from '../components/shared';
import type { Capture, Entitlements, Preset, DiffRegion } from '../components/shared';
import DiffViewer, { type DiffViewMode } from '../components/DiffViewer';

interface Props {
  flash: (text: string, ok?: boolean) => void;
  refreshKey: number;
  initialAfterId?: string | null;
  initialBeforeId?: string | null;
  onSaved?: () => void;
}

type Phase = 'select' | 'result';

interface DiffResult {
  diffImagePath: string;
  changedPixels: number;
  totalPixels: number;
  changePercent: number;
  width: number;
  height: number;
  regions: DiffRegion[];
  threshold: number;
}

const VIEW_MODES: { id: DiffViewMode; label: string; Icon: typeof Columns2 }[] = [
  { id: 'side-by-side', label: 'Side by side', Icon: Columns2 },
  { id: 'overlay', label: 'Overlay', Icon: Layers },
  { id: 'highlight', label: 'Highlights', Icon: Sparkles },
  { id: 'regions', label: 'Change boxes', Icon: BoxSelect },
];

function CapturePicker({ captures, onPick, onClose, title }: {
  captures: Capture[];
  onPick: (c: Capture) => void;
  onClose: () => void;
  title?: string;
}) {
  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-panel" onClick={e => e.stopPropagation()}>
        <div className="picker-head">
          <span className="picker-title">{title ?? 'Select a capture'}</span>
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

function Slot({ label, capture, dataUrl, onSelect, extra }: {
  label: string;
  capture: Capture | null;
  dataUrl: string | null;
  onSelect: () => void;
  extra?: React.ReactNode;
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
          <div className="diff-slot-actions">
            {extra}
            <button className="btn-ghost" onClick={onSelect} style={{ fontSize: 12 }}>Change</button>
          </div>
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

export default function Diff({ flash, refreshKey, initialAfterId, initialBeforeId, onSaved }: Props) {
  const [captures, setCaptures]     = useState<Capture[]>([]);
  const [ent, setEnt]               = useState<Entitlements | null>(null);
  const [presets, setPresets]       = useState<Preset[]>([]);
  const [before, setBefore]         = useState<Capture | null>(null);
  const [after, setAfter]           = useState<Capture | null>(null);
  const [beforeUrl, setBeforeUrl]   = useState<string | null>(null);
  const [afterUrl, setAfterUrl]     = useState<string | null>(null);
  const [diffUrl, setDiffUrl]       = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [savedCaptureId, setSavedCaptureId] = useState<string | null>(null);
  const [summary, setSummary]       = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [phase, setPhase]           = useState<Phase>('select');
  const [viewMode, setViewMode]     = useState<DiffViewMode>('highlight');
  const [overlayOpacity, setOverlayOpacity] = useState(0.45);
  const [threshold, setThreshold]   = useState(0.1);
  const [picker, setPicker]         = useState<'before' | 'after' | null>(null);
  const [computing, setComputing]   = useState(false);
  const [saving, setSaving]         = useState(false);

  const advanced = !!ent?.diffAdvanced;

  const loadCaptures = useCallback(async () => {
    setCaptures(await api.history.list(50));
    setPresets(await api.presets.list());
    setEnt(await api.entitlements.get());
  }, []);

  useEffect(() => { loadCaptures(); }, [loadCaptures, refreshKey]);

  const loadUrl = useCallback(async (c: Capture | null, setter: (u: string | null) => void) => {
    if (!c) { setter(null); return; }
    setter(await api.capture.getImageDataUrl(c.id));
  }, []);

  useEffect(() => { loadUrl(before, setBeforeUrl); }, [before, loadUrl]);
  useEffect(() => { loadUrl(after, setAfterUrl); }, [after, loadUrl]);

  const applyPair = useCallback(async (afterId: string, beforeId?: string) => {
    const list = captures.length ? captures : await api.history.list(50);
    const afterCap = list.find(c => c.id === afterId) ?? null;
    let beforeCap: Capture | null = null;
    if (beforeId) beforeCap = list.find(c => c.id === beforeId) ?? null;
    else if (afterCap) {
      const prev = await api.diff.findPrevious(afterCap.id) as { ok: boolean; captureId?: string };
      if (prev.ok && prev.captureId) beforeCap = list.find(c => c.id === prev.captureId) ?? null;
    }
    if (afterCap) setAfter(afterCap);
    if (beforeCap) setBefore(beforeCap);
  }, [captures]);

  useEffect(() => {
    if (!initialAfterId) return;
    void applyPair(initialAfterId, initialBeforeId ?? undefined);
  }, [initialAfterId, initialBeforeId, applyPair, captures.length]);

  const reset = () => {
    setPhase('select');
    setDiffResult(null);
    setDiffUrl(null);
    setSummary(null);
    setSavedCaptureId(null);
    setViewMode('highlight');
  };

  const loadDiffImage = async (path: string) => {
    if (!path) return;
    const url = isLive ? await api.diff.getImage(path) : null;
    setDiffUrl(url);
  };

  const runCompare = async (nextThreshold?: number) => {
    if (!before || !after) return;
    setComputing(true);
    const opts = advanced ? { threshold: nextThreshold ?? threshold } : undefined;
    const res = await api.diff.compute(before.id, after.id, opts) as DiffResult & { ok: boolean; error?: string };
    setComputing(false);
    if (!res.ok) {
      flash(res.error ?? 'Diff failed', false);
      return;
    }

    const { ok: _ok, error: _err, ...payload } = res;
    setDiffResult(payload);
    await loadDiffImage(payload.diffImagePath);
    setPhase('result');

    if (ent?.aiEnabled) {
      setSummaryLoading(true);
      const sumRes = await api.diff.summarise(before.id, after.id) as { ok?: boolean; summary?: string };
      setSummaryLoading(false);
      if (sumRes.ok) setSummary(sumRes.summary ?? null);
    } else {
      setSummary(null);
    }
  };

  const compare = () => runCompare();

  const onThresholdCommit = () => {
    if (!advanced || phase !== 'result') return;
    void runCompare(threshold);
  };

  const compareWithPrevious = async () => {
    if (!after) return;
    const prev = await api.diff.findPrevious(after.id) as { ok: boolean; captureId?: string };
    if (!prev.ok || !prev.captureId) {
      flash('No earlier capture with the same window name', false);
      return;
    }
    const list = captures.length ? captures : await api.history.list(50);
    const b = list.find(c => c.id === prev.captureId);
    if (b) {
      setBefore(b);
      flash('Paired with previous capture');
    }
  };

  const saveToHistory = async () => {
    if (!diffResult?.diffImagePath || !before || !after) return;
    setSaving(true);
    const res = await api.diff.save(diffResult.diffImagePath, before.id, after.id) as { ok: boolean; capture?: Capture; error?: string };
    setSaving(false);
    if (!res.ok) { flash(res.error ?? 'Save failed', false); return; }
    if (res.capture) setSavedCaptureId(res.capture.id);
    flash('Diff saved to History with diff tag');
    onSaved?.();
  };

  const deliverClipboard = async () => {
    const id = savedCaptureId;
    if (!id) { flash('Save to History first', false); return; }
    const r = await api.capture.copyImage(id);
    flash(r.detail, r.ok);
  };

  const deliverPreset = async (presetId: string) => {
    const id = savedCaptureId;
    if (!id) { flash('Save to History first', false); return; }
    const r = await api.presets.send(id, presetId);
    flash(r.detail, r.ok);
  };

  const severityLabel = (pct: number) => {
    if (pct === 0) return { label: 'Identical', color: '#059669' };
    if (pct < 1) return { label: 'Minor changes', color: '#F59E0B' };
    if (pct < 10) return { label: 'Moderate changes', color: '#FB923C' };
    return { label: 'Major changes', color: '#EF4444' };
  };

  const regions = useMemo(() => (advanced ? diffResult?.regions ?? [] : []), [advanced, diffResult]);

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">Diff Mode</h1>
          <p className="screen-sub">Compare two captures — pixel diff, overlays, and delivery. AI summaries stay on Pro &amp; Team.</p>
        </div>
        {phase === 'result' && (
          <button className="btn-ghost" onClick={reset}><RotateCcw size={13} strokeWidth={2} style={{ marginRight: 6 }} />New comparison</button>
        )}
      </div>

      {phase !== 'result' && (
        <>
          <div className="diff-slots">
            <Slot label="Before" capture={before} dataUrl={beforeUrl} onSelect={() => setPicker('before')} />
            <div className="diff-arrow"><ChevronRight size={28} color="#C7D2FE" strokeWidth={1.5} /></div>
            <Slot
              label="After"
              capture={after}
              dataUrl={afterUrl}
              onSelect={() => setPicker('after')}
              extra={after ? (
                <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => void compareWithPrevious()}>
                  <History size={12} style={{ marginRight: 4 }} />Previous same window
                </button>
              ) : null}
            />
          </div>

          {before && after && before.id === after.id && (
            <p className="diff-same-warn">Before and After are the same capture — the diff will be empty.</p>
          )}

          <div className="diff-controls-bar">
            {advanced ? (
              <label className="diff-threshold">
                <span>Sensitivity</span>
                <input
                  type="range"
                  min={0.01}
                  max={0.35}
                  step={0.01}
                  value={threshold}
                  onChange={e => setThreshold(parseFloat(e.target.value))}
                  onMouseUp={onThresholdCommit}
                  onTouchEnd={onThresholdCommit}
                />
                <span className="diff-threshold-val">{threshold.toFixed(2)}</span>
              </label>
            ) : (
              <span className="diff-tier-hint">Pixel diff is free. Sensitivity &amp; change boxes unlock on Pro.</span>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
            <button className="btn-primary diff-compare-btn" onClick={compare} disabled={!before || !after || computing}>
              {computing
                ? <><Loader size={15} strokeWidth={2} className="spin" />Computing…</>
                : <><GitCompare size={15} strokeWidth={2} />Compare</>}
            </button>
          </div>

          {!isLive && <p className="diff-mock-note">Preview mode — mock captures. Electron loads real PNGs and diff artefacts.</p>}
        </>
      )}

      {phase === 'result' && diffResult && (
        <>
          <div className="diff-stats-bar card">
            {(() => {
              const s = severityLabel(diffResult.changePercent);
              return (
                <>
                  <span className="diff-severity" style={{ color: s.color }}>{s.label}</span>
                  <span className="diff-stats-sep" />
                  <span className="diff-stat"><strong>{diffResult.changePercent.toFixed(2)}%</strong> changed</span>
                  <span className="diff-stats-sep" />
                  <span className="diff-stat">{diffResult.changedPixels.toLocaleString()} px</span>
                  {advanced && regions.length > 0 && (
                    <>
                      <span className="diff-stats-sep" />
                      <span className="diff-stat">{regions.length} region{regions.length === 1 ? '' : 's'}</span>
                    </>
                  )}
                  <span className="diff-stats-sep" />
                  <span className="diff-stat diff-dim">{diffResult.width} × {diffResult.height}</span>
                </>
              );
            })()}
          </div>

          <div className="diff-view-toolbar">
            <div className="diff-tabs diff-tabs-views">
              {VIEW_MODES.map(({ id, label, Icon }) => {
                const locked = id === 'regions' && !advanced;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`diff-tab${viewMode === id ? ' diff-tab-active' : ''}${locked ? ' diff-tab-locked' : ''}`}
                    onClick={() => !locked && setViewMode(id)}
                    title={locked ? 'Pro / Team' : undefined}
                  >
                    <Icon size={13} strokeWidth={2} style={{ marginRight: 6, verticalAlign: -2 }} />
                    {label}
                  </button>
                );
              })}
            </div>
            {viewMode === 'overlay' && (
              <label className="diff-opacity">
                <span>Before opacity</span>
                <input type="range" min={0.05} max={0.95} step={0.05} value={overlayOpacity} onChange={e => setOverlayOpacity(parseFloat(e.target.value))} />
              </label>
            )}
            {advanced && phase === 'result' && (
              <label className="diff-threshold diff-threshold-inline">
                <span>Sensitivity</span>
                <input
                  type="range"
                  min={0.01}
                  max={0.35}
                  step={0.01}
                  value={threshold}
                  onChange={e => setThreshold(parseFloat(e.target.value))}
                  onMouseUp={onThresholdCommit}
                  onTouchEnd={onThresholdCommit}
                />
              </label>
            )}
          </div>

          <div className="diff-viewer card">
            <DiffViewer
              mode={viewMode}
              beforeUrl={beforeUrl}
              afterUrl={afterUrl}
              diffUrl={diffUrl}
              overlayOpacity={overlayOpacity}
              regions={regions}
              showRegions={advanced}
              width={diffResult.width}
              height={diffResult.height}
            />
          </div>

          <div className="diff-export-bar card">
            <button className="btn-primary" onClick={() => void saveToHistory()} disabled={saving}>
              {saving ? <Loader size={14} className="spin" /> : <Download size={14} strokeWidth={2} />}
              <span style={{ marginLeft: 8 }}>Save diff to History</span>
            </button>
            <button className="btn-ghost" disabled={!savedCaptureId} onClick={() => void deliverClipboard()}>
              <Copy size={14} strokeWidth={2} style={{ marginRight: 6 }} />Clipboard
            </button>
            {presets.slice(0, 4).map(p => (
              <button key={p.id} className="btn-ghost" disabled={!savedCaptureId} onClick={() => void deliverPreset(p.id)} title={p.target}>
                <Send size={13} style={{ marginRight: 5 }} />{p.name}
              </button>
            ))}
          </div>

          <div className="card diff-summary">
            <div className="diff-summary-head">
              <Cpu size={14} strokeWidth={1.9} color="#818CF8" />
              <span className="diff-summary-label">AI Analysis</span>
              <span className="diff-summary-tier">Pro &amp; Team</span>
            </div>
            {!ent?.aiEnabled
              ? <p className="diff-summary-empty">AI summaries are not included on the free plan — pixel diff and export remain available.</p>
              : summaryLoading
                ? <div className="diff-summary-loading"><Loader size={14} className="spin" strokeWidth={2} /><span>Analysing changes…</span></div>
                : summary
                  ? <p className="diff-summary-text">{summary}</p>
                  : <p className="diff-summary-empty">AI summary not available — check your plan or backend connection.</p>}
          </div>
        </>
      )}

      {picker && (
        <CapturePicker
          title={picker === 'before' ? 'Before capture' : 'After capture'}
          captures={captures.filter(c => picker === 'after' ? c.id !== before?.id : c.id !== after?.id)}
          onPick={c => { picker === 'before' ? setBefore(c) : setAfter(c); }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
