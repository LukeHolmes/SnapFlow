import { useEffect, useState, useCallback } from 'react';
import { Shield } from 'lucide-react';
import { api } from '../api';
import { TAGS, CaptureThumb, rel } from '../components/shared';
import type { Capture } from '../components/shared';

interface Props { flash: (text: string, ok?: boolean) => void; refreshKey: number; }

export default function PiiRedaction({ refreshKey }: Props) {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await api.history.list(200);
    setTotal(all.length);
    setCaptures(all.filter(c => c.hasPii));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="screen">
      <div className="screen-header">
        <div>
          <h1 className="screen-title">PII Redaction</h1>
          <p className="screen-sub">Personal data detected and blurred before saving or sharing.</p>
        </div>
        {captures.length > 0 && (
          <div className="pii-stat">
            <Shield size={15} color="#F472B6" strokeWidth={2} />
            <span>{captures.length} capture{captures.length !== 1 ? 's' : ''} protected</span>
          </div>
        )}
      </div>

      {/* Explanation banner */}
      <div className="pii-banner">
        <Shield size={16} color="#4338CA" strokeWidth={1.9} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong>Automatic, local-only protection.</strong>{' '}
          SnapFlow scans every capture for email addresses and phone numbers before it is saved or shared.
          Detected regions are blurred on-device — no raw capture data is sent externally during this step.
        </div>
      </div>

      {loading ? (
        <div className="empty" style={{ padding: '32px 0' }}>Loading…</div>
      ) : captures.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🛡️</div>
          <div className="empty-state-title">No PII detected yet</div>
          <div className="empty-state-sub">
            {total === 0
              ? 'Take your first capture and SnapFlow will check it automatically.'
              : `SnapFlow checked ${total} capture${total !== 1 ? 's' : ''} and found nothing to redact.`}
          </div>
        </div>
      ) : (
        <div className="captures-grid">
          {captures.map(c => {
            const t = TAGS[c.tag ?? 'ui'] ?? TAGS.ui;
            return (
              <div className="card capture-card" key={c.id}>
                <div style={{ position: 'relative' }}>
                  <CaptureThumb tag={c.tag} />
                  <span className="pii-thumb-badge" title="PII detected">🛡️</span>
                </div>
                <div className="capture-info">
                  <div className="capture-name">{c.filename}</div>
                  <div className="capture-meta">
                    {c.tag && <span className="tag" style={{ background: t.bg, color: t.fg }}>{c.tag}</span>}
                    <span className="pii-dot" title="PII redacted" />
                    <span className="capture-time">{rel(c.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
