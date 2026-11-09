import { useEffect, useState } from 'react';
import { X, Film } from 'lucide-react';
import type { Capture, Entitlements } from '../../../shared/types';
import { api } from '../api';
import { exportRecordingGifFromDataUrl } from '../utils/export-recording-gif';

interface Props {
  capture: Capture;
  ent: Entitlements | null;
  onClose: () => void;
  flash: (text: string, ok?: boolean) => void;
}

function formatDur(ms: number | null | undefined): string {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function formatSize(n: number | null | undefined): string {
  if (!n) return '—';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RecordingModal({ capture, ent, onClose, flash }: Props) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [media, setMedia] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [t, m] = await Promise.all([
        api.capture.getImageDataUrl(capture.id),
        api.capture.getMediaDataUrl(capture.id),
      ]);
      if (!cancelled) {
        setThumb(t);
        setMedia(m);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [capture.id]);

  const exportGif = async () => {
    if (!ent?.recordingGifExport) {
      flash('GIF export requires SnapFlow Pro', false);
      return;
    }
    if (!media) { flash('Recording file unavailable', false); return; }
  const res = await exportRecordingGifFromDataUrl(media, capture.filename);
    flash(res.detail, res.ok);
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal recording-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="section-title">{capture.filename}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {loading ? (
          <div className="empty">Loading recording…</div>
        ) : (
          <>
            {media ? (
              <video className="recording-player" src={media} controls playsInline style={{ width: '100%', borderRadius: 8, background: '#000' }} />
            ) : (
              <div className="empty">Video unavailable in preview mode.</div>
            )}
            {thumb && !media && <img src={thumb} alt="" style={{ width: '100%', borderRadius: 8 }} />}
            <div className="recording-meta-row">
              <span>Duration: <strong>{formatDur(capture.durationMs)}</strong></span>
              <span>Size: <strong>{formatSize(capture.byteSize)}</strong></span>
            </div>
            <div className="mode-actions">
              {ent?.recordingGifExport && media && (
                <button type="button" className="mode-card" onClick={() => void exportGif()}>
                  <Film size={18} /><span>Export GIF</span><small>Up to 15s, local encode via gifenc</small>
                </button>
              )}
            </div>
            <p className="mode-copy">Stored locally — not uploaded unless you send via a preset.</p>
          </>
        )}
      </div>
    </div>
  );
}
