import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Shield } from 'lucide-react';
import { api } from '../api';

export default function About() {
  const [version, setVersion] = useState('…');
  const [notices, setNotices] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.app.getMeta().then(meta => {
      setVersion(meta.version);
      setNotices(meta.licenseNotices);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="screen">
      <div className="screen-header">
        <h1 className="screen-title">About SnapFlow</h1>
      </div>

      <div className="card account-hero">
        <div className="account-info">
          <span className="account-name">SnapFlow</span>
          <span className="account-email">Version {version}</span>
          <span className="account-email" style={{ marginTop: 4 }}>
            Copyright © 2026 Luke Holmes. All rights reserved. Proprietary software.
          </span>
        </div>
      </div>

      <p className="integration-hint" style={{ marginTop: 12 }}>
        DRAFT — Privacy Policy and EULA below are for Luke&apos;s review only, not final legal text.
      </p>

      <div className="card" style={{ marginTop: 16, padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" className="btn-secondary" onClick={() => void api.app.openLegal('privacy')}>
          <Shield size={15} /> Open Privacy Policy (draft)
        </button>
        <button type="button" className="btn-secondary" onClick={() => void api.app.openLegal('eula')}>
          <FileText size={15} /> Open EULA (draft)
        </button>
        <button type="button" className="btn-secondary" onClick={() => void api.app.openLegal('license')}>
          <FileText size={15} /> Proprietary licence (LICENSE)
        </button>
        <button type="button" className="btn-secondary" onClick={() => window.open('https://github.com/LukeHolmes/SnapFlow/blob/main/docs/AUTO_UPDATE.md', '_blank')}>
          <ExternalLink size={15} /> Auto-update notes
        </button>
      </div>

      <div className="card" style={{ marginTop: 16, padding: '14px 18px' }}>
        <h2 className="screen-subtitle" style={{ margin: '0 0 10px' }}>Third-party licences</h2>
        {loading ? (
          <p className="integration-hint">Loading…</p>
        ) : (
          <pre
            className="license-notices-pre"
            style={{
              maxHeight: 420,
              overflow: 'auto',
              fontSize: 11,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              margin: 0,
              fontFamily: 'var(--mono)',
            }}
          >
            {notices}
          </pre>
        )}
      </div>
    </div>
  );
};
