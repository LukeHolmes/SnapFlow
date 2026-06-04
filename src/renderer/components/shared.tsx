// Shared constants + components used across all screens.
import { Camera, ScanText, Send, Shield, MessageSquare, Bug, FileText, Mail, Crop } from 'lucide-react';
export type { Capture, Preset, ActivityEvent, Stats, Entitlements } from '../../../shared/types';

// ── Design tokens ──────────────────────────────────────────────────────────────
export const TAGS: Record<string, { bg: string; fg: string }> = {
  ui:       { bg: '#EEF0FD', fg: '#4338CA' },
  code:     { bg: '#0D1117', fg: '#79C0FF' },
  chart:    { bg: '#FFF7ED', fg: '#C2410C' },
  document: { bg: '#F0FDF4', fg: '#166534' },
  web:      { bg: '#F0F9FF', fg: '#0369A1' },
};
export const PRESET_ICONS: Record<string, React.ComponentType<any>> = {
  slack: MessageSquare, jira: Bug, notion: FileText, email: Mail, clipboard: Crop,
};
export const PRESET_BG: Record<string, string> = {
  slack: '#4A154B', jira: '#0052CC', notion: '#191919', email: '#059669', clipboard: '#666',
};
export const DOT: Record<string, string> = {
  capture: '#818CF8', sent: '#34D399', pii: '#F472B6', tag: '#FB923C',
};
export const STAT_META = [
  { key: 'total',       label: 'Total Captures',   Icon: Camera,   fg: 'var(--color-brand)',      bg: '#EEF0FD' },
  { key: 'ocrIndexed',  label: 'OCR Indexed',       Icon: ScanText, fg: 'var(--color-brand)',      bg: '#EEF0FD' },
  { key: 'sent',        label: 'Sent via Presets',  Icon: Send,     fg: 'var(--color-green-600)',  bg: '#D1FAE5' },
  { key: 'piiRedacted', label: 'PII Redacted',      Icon: Shield,   fg: 'var(--color-pink-400)',   bg: '#FCE7F3' },
] as const;

// ── Utilities ─────────────────────────────────────────────────────────────────
export const rel = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

// ── CaptureThumb ──────────────────────────────────────────────────────────────
export function CaptureThumb({ tag, size = 'md' }: { tag: string | null; size?: 'sm' | 'md' }) {
  const cls = `thumb${size === 'sm' ? ' thumb-sm' : ''}`;
  if (tag === 'code') return (
    <div className={`${cls} thumb-code`}>
      {[80, 55, 90, 35, 70, 48].map((w, i) => <span key={i} className="th-cline" style={{ width: `${w}%`, opacity: i % 3 === 0 ? 1 : 0.5 }} />)}
    </div>
  );
  if (tag === 'chart') return (
    <div className={`${cls} thumb-chart`}>
      {[55, 80, 40, 95, 65, 75].map((h, i) => <span key={i} className="th-cbar" style={{ height: `${h}%` }} />)}
    </div>
  );
  if (tag === 'document') return (
    <div className={`${cls} thumb-doc`}>
      <span className="th-dline th-dline-h" />
      {[80, 70, 85, 60, 75].map((w, i) => <span key={i} className="th-dline" style={{ width: `${w}%` }} />)}
    </div>
  );
  if (tag === 'web') return (
    <div className={`${cls} thumb-web`}>
      <div className="th-web-chrome"><span /><span /><span /></div>
      {[65, 85, 50, 75].map((w, i) => <span key={i} className="th-wline" style={{ width: `${w}%` }} />)}
    </div>
  );
  return (
    <div className={`${cls} thumb-ui`}>
      <span className="th-ui-h" />
      {[60, 80, 45].map((w, i) => <span key={i} className="th-ui-r" style={{ width: `${w}%` }} />)}
    </div>
  );
}
