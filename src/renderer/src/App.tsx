import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Camera, Bell, Search, History, Library, LayoutDashboard, EyeOff,
  User, Cable, Send, Monitor, AppWindow, X, RefreshCw, GitCompare,
} from 'lucide-react';
import { api, isLive } from './api';
import type { Entitlements, CaptureSource } from '../../shared/types';

import Dashboard    from './screens/Dashboard';
import HistoryScreen from './screens/History';
import SearchLibrary from './screens/SearchLibrary';
import Presets      from './screens/Presets';
import PiiRedaction from './screens/PiiRedaction';
import Account      from './screens/Account';
import Diff           from './screens/Diff';
import Integrations from './screens/Integrations';

const NAV = [
  { label: 'CAPTURE',  items: [['Dashboard','Dashboard',LayoutDashboard], ['History','History',History], ['Search Library','Search Library',Library], ['Diff Mode','Diff Mode',GitCompare]] },
  { label: 'DELIVER',  items: [['Output Presets','Output Presets',Send], ['PII Redaction','PII Redaction',EyeOff]] },
  { label: 'SETTINGS', items: [['Account','Account',User], ['Integrations','Integrations',Cable]] },
] as const;

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

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
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((text: string, ok = true) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, ok });
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => { api.entitlements.get().then(setEnt); }, [refreshKey]);

  useEffect(() => api.onCaptureAdded(() => {
    setRefreshKey(k => k + 1);
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

  const pickSource = async (sourceId: string) => {
    setPicker(p => ({ ...p, open: false }));
    setCapturing(true);
    try { await api.capture.screen(sourceId); setRefreshKey(k => k + 1); flash('Capture saved & indexed'); }
    catch (e) { flash(e instanceof Error ? e.message : 'Capture failed', false); }
    finally { setCapturing(false); }
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
      case 'Dashboard':      return <Dashboard {...screenProps} setActive={setActive} startRegion={startRegion} openPicker={openPicker} />;
      case 'History':        return <HistoryScreen {...screenProps} />;
      case 'Search Library': return <SearchLibrary {...screenProps} initialQuery={active === 'Search Library' ? topbarQuery : ''} />;
      case 'Output Presets': return <Presets {...screenProps} />;
      case 'PII Redaction':  return <PiiRedaction {...screenProps} />;
      case 'Account':        return <Account flash={flash} />;
      case 'Integrations':   return <Integrations flash={flash} setActive={setActive} />;
      case 'Diff Mode':      return <Diff flash={flash} refreshKey={refreshKey} />;
      default:               return <Dashboard {...screenProps} setActive={setActive} startRegion={startRegion} openPicker={openPicker} />;
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
