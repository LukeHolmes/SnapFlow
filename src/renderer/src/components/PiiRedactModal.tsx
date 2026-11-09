import { useState } from 'react';
import { Shield, X } from 'lucide-react';
import type { Capture, PiiDetection, PiiType } from '../../../shared/types';

const TYPE_LABEL: Record<PiiType, string> = {
  email: 'Email',
  phone: 'Phone',
  name: 'Name',
  credit_card: 'Card',
  iban: 'IBAN',
  ip: 'IP address',
};

interface Props {
  capture: Capture;
  scan: { imageDataUrl: string; detections: PiiDetection[] };
  onClose: () => void;
  onApply: (selectedIds: string[]) => Promise<void>;
  busy: boolean;
}

export default function PiiRedactModal({ capture, scan, onClose, onApply, busy }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(scan.detections.map(d => d.id)));
  const [dims, setDims] = useState({ w: 1, h: 1 });

  const allOn = selected.size === scan.detections.length && scan.detections.length > 0;

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allOn ? new Set() : new Set(scan.detections.map(d => d.id)));
  };

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="pii-redact-title" onClick={onClose}>
      <div className="modal pii-redact-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 id="pii-redact-title" className="section-title"><Shield size={18} style={{ verticalAlign: -3 }} /> Redact personal data</h2>
            <p className="modal-sub">On-device scan of <strong>{capture.filename}</strong>. Toggle detections to blur before saving a copy.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        {scan.detections.length === 0 ? (
          <div className="pii-redact-empty">
            No email, phone, name, card, IBAN, or IP patterns were found in the OCR text for this capture.
          </div>
        ) : (
          <div className="pii-redact-body">
            <div className="pii-redact-preview">
              <img
                src={scan.imageDataUrl}
                alt=""
                onLoad={e => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
              {scan.detections.map(d => selected.has(d.id) && (
                <div
                  key={d.id}
                  className="pii-redact-highlight"
                  style={{
                    left: `${(d.bbox.x0 / dims.w) * 100}%`,
                    top: `${(d.bbox.y0 / dims.h) * 100}%`,
                    width: `${((d.bbox.x1 - d.bbox.x0) / dims.w) * 100}%`,
                    height: `${((d.bbox.y1 - d.bbox.y0) / dims.h) * 100}%`,
                  }}
                />
              ))}
            </div>
            <div className="pii-redact-list">
              <button type="button" className="btn-ghost pii-redact-toggle-all" onClick={toggleAll}>
                {allOn ? 'Deselect all' : 'Select all'}
              </button>
              <ul>
                {scan.detections.map(d => (
                  <li key={d.id}>
                    <label className="pii-redact-row">
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                      <span className="pii-redact-type">{TYPE_LABEL[d.type]}</span>
                      <span className="pii-redact-value">{d.value}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="annotation-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || selected.size === 0}
            onClick={() => onApply([...selected])}
          >
            {busy ? 'Saving…' : `Save redacted copy (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
