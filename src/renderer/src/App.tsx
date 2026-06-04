import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Camera, Bell, Search, History, Library, LayoutDashboard, EyeOff,
  User, Cable, Send, Monitor, AppWindow, X, RefreshCw, GitCompare,
  Copy, Edit3, FileText, Timer, ScrollText, Pin, Shield, ClipboardList,
} from 'lucide-react';
import { api, isLive } from './api';
import type { Capture, Entitlements, CaptureSource, ScrollCapturePreview } from '../../shared/types';

import Dashboard    from './screens/Dashboard';
import HistoryScreen from './screens/History';
import SearchLibrary from './screens/SearchLibrary';
import Presets      from './screens/Presets';
import PiiRedaction from './screens/PiiRedaction';
import Account      from './screens/Account';
import Diff           from './screens/Diff';
import Integrations from './screens/Integrations';
import AnnotationEditor from './components/AnnotationEditor';
import Guides from './screens/Guides';

const NAV = [
  { label: 'CAPTURE',  items: [['Dashboard','Dashboard',LayoutDashboard], ['History','History',History], ['Search Library','Search Library',Library], ['Diff Mode','Diff Mode',GitCompare], ['Guides','Guides',ClipboardList]] },
  { label: 'DELIVER',  items: [['Output Presets','Output Presets',Send], ['PII Redaction','PII Redaction',EyeOff]] },
  { label: 'SETTINGS', items: [['Account','Account',User], ['Integrations','Integrations',Cable]] },
] as const;

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export default function App() {
  const [active, setActive]     = useState('Dashboard');
  const [ent, setEnt]           = useState<Entitlements | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [toast, setToast]       = useState<{ text: string; ok: boolean } | null>(null);
  const [searchFocus, setSearchFocus] = useState(false);
  const [topbarQuery, setTopbarQuery] = useState('');
  const [refreshKey, setRefreshKey]   = useState(0);
  const [picker, setPicker]     = useState<{ open: boolean; loading: boolean; sources: CaptureSource[] }>({ open: false, loading: false, sources: [] });
  const [delayOpen, setDelayOpen] = useState(false);
  const [scrollOpen, setScrollOpen] = useState(false);
  const [scrollStatus, setScrollStatus] = useState<'idle' | 'countdown' | 'capturing' | 'preview'>('idle');
  const [scrollCountdown, setScrollCountdown] = useState(3);
  const [scrollPreview, setScrollPreview] = useState<ScrollCapturePreview | null>(null);
  const [quickCapture, setQuickCapture] = useState<Capture | null>(null);
  const [editorCapture, setEditorCapture] = useState<Capture | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((text: string, ok = true) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, ok });
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => { api.entitlements.get().then(setEnt); }, [refreshKey]);

  useEffect(() => api.onCaptureAdded((capture) => {
    setRefreshKey(k => k + 1);
    setQuickCapture(capture);
    flash('Capture saved & indexed');
  }), [flash]);

  // ⌘⇧5 global shortcut → open window picker from anywhere
  const openPicker = useCallback(async () => {
    setPicker({ open: true, loading: true, sources: [] });
    const sources = await api.capture.listSources();
    setPicker({ open: true, loading: false, sources });
  }, []);
  useEffect(() => api.onOpenWindowPicker(openPicker), [openPicker]);

  // Escape closes the picker
  useEffect(() => {
    if (!picker.open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicker(p => ({ ...p, open: false })); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [picker.open]);

  const startRegion = useCallback(() => { void api.region.start(); }, []);

  const rememberCapture = (capture: Capture) => {
    setQuickCapture(capture);
    setRefreshKey(k => k + 1);
  };

  const openScrollCapture = () => {
    setScrollPreview(null);
    setScrollStatus('idle');
    setScrollCountdown(3);
    setScrollOpen(true);
  };

  const closeScrollCapture = () => {
    setScrollOpen(false);
    setScrollPreview(null);
    setScrollStatus('idle');
    setScrollCountdown(3);
  };

  const pickSource = async (sourceId: string) => {
    setPicker(p => ({ ...p, open: false }));
    setCapturing(true);
    try { const capture = await api.capture.screen(sourceId); rememberCapture(capture); flash('Capture saved & indexed'); }
    catch (e) { flash(e instanceof Error ? e.message : 'Capture failed', false); }
    finally { setCapturing(false); }
  };

  const startDelayedCapture = async (seconds: number) => {
    setDelayOpen(false);
    setCapturing(true);
    flash(`Capturing full screen in ${seconds}s… set up the menu or tooltip now`);
    try {
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      const capture = await api.capture.screen();
      rememberCapture(capture);
      flash('Delayed capture saved & indexed');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Delayed capture failed', false);
    } finally {
      setCapturing(false);
    }
  };

  const startScrollingCapture = async () => {
    setCapturing(true);
    setScrollPreview(null);
    setScrollStatus('countdown');
    try {
      for (let i = 3; i > 0; i -= 1) {
        setScrollCountdown(i);
        await wait(1000);
      }
      setScrollStatus('capturing');
      flash('Scroll slowly now — SnapFlow is sampling frames');
      const preview = await api.capture.scrollPreview({ frames: 5, intervalMs: 900 });
      setScrollPreview(preview);
      setScrollStatus('preview');
      flash(preview.warnings.length ? 'Scroll preview ready with stitching warnings' : 'Scroll preview ready');
    } catch (e) {
      setScrollStatus('idle');
      flash(e instanceof Error ? e.message : 'Scrolling capture failed', false);
    } finally {
      setCapturing(false);
    }
  };

  const acceptScrollingCapture = async () => {
    if (!scrollPreview) return;
    setCapturing(true);
    try {
      const capture = await api.capture.saveScrollPreview(scrollPreview);
      rememberCapture(capture);
      closeScrollCapture();
      flash('Scrolling capture saved & indexed');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not save scrolling capture', false);
    } finally {
      setCapturing(false);
    }
  };

  const copyCaptureImage = async (capture: Capture) => {
    const r = await api.capture.copyImage(capture.id);
    flash(r.detail, r.ok);
  };

  const copyCaptureOcr = async (capture: Capture) => {
    const r = await api.capture.copyOcr(capture.id);
    flash(r.detail, r.ok);
  };

  const pinCapture = async (capture: Capture) => {
    const r = await api.capture.pin(capture.id);
    flash(r.detail, r.ok);
  };

  const redactCapture = async (capture: Capture) => {
    setCapturing(true);
    try {
      const redacted = await api.capture.saveRedacted(capture.id);
      rememberCapture(redacted);
      flash('Redacted copy saved');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not create redacted copy', false);
    } finally {
      setCapturing(false);
    }
  };

  const sendCapture = async (capture: Capture) => {
    const presets = await api.presets.list();
    const first = presets[0];
    if (!first) {
      setActive('Output Presets');
      flash('Add a preset to send captures');
      return;
    }
    const r = await api.presets.send(capture.id, first.id);
    flash(r.detail, r.ok);
    if (r.ok) setRefreshKey(k => k + 1);
  };

  const runSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const r = await api.sync.now();
      if (r.error) flash(`Sync error: ${r.error}`, false);
      else if (r.skipped) flash('Cloud sync is available on Pro and Team');
      else { setRefreshKey(k => k + 1); flash(`Synced — ${r.pushed ?? 0} up, ${r.pulled ?? 0} down`); }
    } finally { setSyncing(false); }
  };

  // Topbar search: navigate to Search Library on Enter
  const handleSearchSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && topbarQuery.trim()) {
      setActive('Search Library');
    }
  };

  const screenProps = { flash, refreshKey };

  const renderScreen = () => {
    switch (active) {
      case 'Dashboard':      return <Dashboard {...screenProps} setActive={setActive} startRegion={startRegion} openPicker={openPicker} startScroll={openScrollCapture} startDelay={() => setDelayOpen(true)} />;
      case 'History':        return <HistoryScreen {...screenProps} />;
      case 'Search Library': return <SearchLibrary {...screenProps} initialQuery={active === 'Search Library' ? topbarQuery : ''} />;
      case 'Output Presets': return <Presets {...screenProps} />;
      case 'PII Redaction':  return <PiiRedaction {...screenProps} />;
      case 'Account':        return <Account flash={flash} />;
      case 'Integrations':   return <Integrations flash={flash} setActive={setActive} />;
      case 'Diff Mode':      return <Diff flash={flash} refreshKey={refreshKey} />;
      case 'Guides':         return <Guides {...screenProps} />;
      default:               return <Dashboard {...screenProps} setActive={setActive} startRegion={startRegion} openPicker={openPicker} startScroll={openScrollCapture} startDelay={() => setDelayOpen(true)} />;
    }
  };

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <span className="logo-mark"><Camera size={15} color="#fff" strokeWidth={2.2} /></span>
          <span className="wordmark">SnapFlow</span>
          <span className="version-badge">v0.6</span>
        </div>
        <nav className="nav">
          {NAV.map(sec => (
            <div className="nav-section" key={sec.label}>
              <div className="nav-section-label">{sec.label}</div>
              {sec.items.map(([id, , Icon]: any) => (
                <button key={id} className={`nav-item${active === id ? ' nav-item-active' : ''}`} onClick={() => setActive(id)}>
                  <Icon size={16} strokeWidth={1.9} /><span>{id}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="user-card">
          <span className="avatar">LH</span>
          <div className="user-meta"><span className="user-name">Luke Holmes</span><span className="user-mail">luke@snapflow.app</span></div>
          <span className="tier-badge">{ent?.tier ?? '…'}</span>
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        <header className="topbar">
          <span className="greeting">{greet()}, Luke 👋</span>
          <div className={`searchwrap${searchFocus ? ' focus' : ''}`}>
            <Search size={15} color="#aaa" strokeWidth={2} />
            <input
              className="search"
              placeholder="Search captures… ⌘K"
              value={topbarQuery}
              onChange={e => setTopbarQuery(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setSearchFocus(false)}
              onKeyDown={handleSearchSubmit}
            />
            {topbarQuery && <span className="kbd" style={{ cursor: 'pointer' }} onClick={() => { setActive('Search Library'); }}>↵</span>}
          </div>
          <div className="topbar-right">
            {ent?.cloudSync && (
              <button className="icon-btn" onClick={runSync} title="Sync now" aria-label="Sync now">
                <RefreshCw size={16} strokeWidth={1.9} className={syncing ? 'spin' : undefined} />
              </button>
            )}
            <button className="icon-btn"><Bell size={16} strokeWidth={1.9} /><span className="bell-dot" /></button>
            <button className="btn-primary" onClick={startRegion} disabled={capturing}>
              <Camera size={15} strokeWidth={2.1} />{capturing ? 'Capturing…' : 'New Capture'}
              <span className="kbd kbd-light">⌘⇧4</span>
            </button>
          </div>
        </header>

        <main className="content">
          {renderScreen()}
          {!isLive && active === 'Dashboard' && (
            <div className="empty" style={{ textAlign: 'center', marginTop: 24 }}>
              Preview mode (browser) — running on mock data. Launch with <code>npm run dev</code> for the live engine.
            </div>
          )}
        </main>
      </div>

      {/* Window picker modal */}
      {picker.open && (
        <div className="modal-scrim" onClick={() => setPicker(p => ({ ...p, open: false }))}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="section-title">Capture a window or screen</h2>
              <button className="icon-btn" onClick={() => setPicker(p => ({ ...p, open: false }))} aria-label="Close"><X size={16} /></button>
            </div>
            {picker.loading ? <div className="empty">Loading sources…</div>
              : picker.sources.length === 0 ? <div className="empty">No capture sources found.</div>
              : (
                <div className="source-grid">
                  {picker.sources.map(s => (
                    <button className="source-card" key={s.id} onClick={() => pickSource(s.id)}>
                      <div className="source-thumb">
                        {s.thumbnail ? <img src={s.thumbnail} alt="" /> : (s.kind === 'screen' ? <Monitor size={28} color="#aaa" /> : <AppWindow size={28} color="#aaa" />)}
                      </div>
                      <div className="source-meta">
                        <span className="source-kind">{s.kind}</span>
                        <span className="source-name">{s.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}

      {/* Delay capture modal */}
      {delayOpen && (
        <div className="modal-scrim" onClick={() => setDelayOpen(false)}>
          <div className="modal capture-mode-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="section-title">Delayed full-screen capture</h2>
              <button className="icon-btn" onClick={() => setDelayOpen(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <p className="mode-copy">Use a timer for hover menus, tooltips, dropdowns, and context menus that need a moment to set up.</p>
            <div className="mode-actions">
              <button className="mode-card" onClick={() => startDelayedCapture(2)}>
                <Timer size={18} /><span>Capture in 2 seconds</span><small>Fast menu setup</small>
              </button>
              <button className="mode-card" onClick={() => startDelayedCapture(5)}>
                <Timer size={18} /><span>Capture in 5 seconds</span><small>More time to arrange state</small>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guided scrolling capture modal */}
      {scrollOpen && (
        <div className="modal-scrim" onClick={closeScrollCapture}>
          <div className="modal capture-mode-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="section-title">Guided scrolling capture</h2>
              <button className="icon-btn" onClick={closeScrollCapture} aria-label="Close"><X size={16} /></button>
            </div>
            {scrollStatus === 'idle' && (
              <>
                <p className="mode-copy">SnapFlow will countdown, sample five frames, align overlapping bands, and show a preview before saving. Put the long page or document in view first.</p>
                <ol className="scroll-steps">
                  <li>Click start and wait for the countdown.</li>
                  <li>Scroll slowly through the content while sampling runs.</li>
                  <li>Review the stitched preview, then save or retry.</li>
                </ol>
                <div className="mode-actions">
                  <button className="mode-card mode-card-wide" onClick={startScrollingCapture}>
                    <ScrollText size={18} /><span>Start guided scroll capture</span><small>5 frames, about one second apart, with overlap de-dupe</small>
                  </button>
                </div>
              </>
            )}
            {scrollStatus === 'countdown' && (
              <div className="scroll-status">
                <div className="scroll-countdown">{scrollCountdown}</div>
                <strong>Get ready to scroll</strong>
                <span>Sampling starts when the countdown reaches zero.</span>
              </div>
            )}
            {scrollStatus === 'capturing' && (
              <div className="scroll-status">
                <ScrollText size={32} color="#4338CA" />
                <strong>Scroll slowly now</strong>
                <span>SnapFlow is sampling and will stitch overlapping content automatically.</span>
              </div>
            )}
            {scrollStatus === 'preview' && scrollPreview && (
              <div className="scroll-preview">
                <div className="scroll-preview-meta">
                  <span>{scrollPreview.frameCount} frames</span>
                  <span>{Math.round(scrollPreview.confidence * 100)}% alignment confidence</span>
                  <span>{scrollPreview.width} × {scrollPreview.height}</span>
                </div>
                <div className="scroll-preview-image">
                  {scrollPreview.dataUrl
                    ? <img src={scrollPreview.dataUrl} alt="Scrolling capture preview" />
                    : <div className="empty">Preview image unavailable in browser mock mode.</div>}
                </div>
                {scrollPreview.warnings.length > 0 && (
                  <div className="scroll-warnings">
                    {scrollPreview.warnings.map(w => <div key={w}>• {w}</div>)}
                  </div>
                )}
                <div className="annotation-actions">
                  <button className="btn-ghost" onClick={() => { setScrollPreview(null); setScrollStatus('idle'); }}>Retry</button>
                  <button className="btn-ghost" onClick={closeScrollCapture}>Cancel</button>
                  <button className="btn-primary" onClick={acceptScrollingCapture} disabled={capturing}>Save panorama</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Post-capture quick actions */}
      {quickCapture && (
        <div className="quick-action-bar">
          <div className="quick-action-meta">
            <strong>{quickCapture.filename}</strong>
            <span>Capture ready</span>
          </div>
          <button className="quick-action-btn" onClick={() => copyCaptureImage(quickCapture)}><Copy size={14} />Copy</button>
          <button className="quick-action-btn" onClick={() => setEditorCapture(quickCapture)}><Edit3 size={14} />Annotate</button>
          <button className="quick-action-btn" onClick={() => pinCapture(quickCapture)}><Pin size={14} />Pin</button>
          <button className="quick-action-btn" onClick={() => copyCaptureOcr(quickCapture)}><FileText size={14} />OCR</button>
          <button className="quick-action-btn" onClick={() => redactCapture(quickCapture)}><Shield size={14} />Redact</button>
          <button className="quick-action-btn" onClick={() => sendCapture(quickCapture)}><Send size={14} />Send</button>
          <button className="quick-action-close" onClick={() => setQuickCapture(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      {editorCapture && (
        <AnnotationEditor
          capture={editorCapture}
          flash={flash}
          onClose={() => setEditorCapture(null)}
          onSaved={(capture) => rememberCapture(capture)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast${toast.ok ? '' : ' toast-error'}`}>
          {toast.text}
          {toast.ok ? <span className="toast-icon toast-ok">✓</span> : <span className="toast-icon toast-err">✗</span>}
        </div>
      )}
    </div>
  );
}
