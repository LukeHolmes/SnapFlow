/** Shown when the dashboard loads in Electron but the sandboxed preload bridge failed. */
export default function PreloadError() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        fontFamily: 'system-ui, sans-serif',
        background: '#EDEBE5',
        color: '#1a1a1a',
      }}
    >
      <div style={{ maxWidth: 520 }}>
        <h1 style={{ fontSize: 22, marginBottom: 12 }}>SnapFlow could not start</h1>
        <p style={{ lineHeight: 1.5, marginBottom: 16 }}>
          The secure preload script did not load, so the app cannot talk to capture, history, or
          integrations. This usually means the build produced split preload chunks incompatible with{' '}
          <code style={{ background: '#ddd', padding: '2px 6px', borderRadius: 4 }}>sandbox: true</code>.
        </p>
        <p style={{ lineHeight: 1.5, marginBottom: 8, fontSize: 14, color: '#444' }}>
          Try reinstalling from a fresh build, or run from source with <code>npm run dev</code> after{' '}
          <code>npm run build</code>.
        </p>
        <p style={{ fontSize: 13, color: '#666' }}>
          If you are developing the UI in a browser, use{' '}
          <code>npm run web:dev</code> with <code>VITE_ALLOW_WEB_MOCK=true</code> — never the packaged app.
        </p>
      </div>
    </div>
  );
}
