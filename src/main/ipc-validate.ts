import type { ColorFormat, DestinationId, GuideType } from '../shared/types';

const ID_PATTERN = /^[\w.-]{1,128}$/;
const MAX_LIMIT = 500;
const MAX_QUERY_LEN = 500;
const MAX_NAME_LEN = 200;
const VALID_GUIDE_TYPES = new Set<GuideType>(['sop', 'bug_report', 'training', 'validation', 'walkthrough']);
const VALID_DESTINATIONS = new Set<DestinationId>([
  'clipboard', 'slack', 'notion', 'gmail', 'github', 'zapier', 'jira', 'google-drive',
]);
const VALID_COLOR_FORMATS = new Set<ColorFormat>(['hex', 'rgb', 'hsl']);

export class IpcValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IpcValidationError';
  }
}

export function assertCaptureId(id: unknown): string {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new IpcValidationError('Invalid capture id');
  }
  return id;
}

export function assertPresetId(id: unknown): string {
  return assertCaptureId(id);
}

export function assertOptionalString(value: unknown, maxLen: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > maxLen) throw new IpcValidationError('Invalid string parameter');
  return value;
}

export function assertHistoryLimit(limit: unknown): number {
  const n = limit === undefined ? 50 : Number(limit);
  if (!Number.isFinite(n) || n < 1 || n > MAX_LIMIT) throw new IpcValidationError('Invalid history limit');
  return Math.floor(n);
}

export function assertDestinationId(d: unknown): DestinationId {
  if (typeof d !== 'string' || !VALID_DESTINATIONS.has(d as DestinationId)) {
    throw new IpcValidationError('Invalid destination');
  }
  return d as DestinationId;
}

export function assertTeamId(id: unknown): string {
  if (typeof id !== 'string' || !/^team_[\w-]{1,64}$/.test(id)) throw new IpcValidationError('Invalid team id');
  return id;
}

export function assertSearchQuery(q: unknown): string {
  if (typeof q !== 'string' || q.length > MAX_QUERY_LEN) throw new IpcValidationError('Invalid search query');
  return q;
}

export function assertTeamName(name: unknown): string {
  if (typeof name !== 'string' || name.trim().length < 1 || name.length > MAX_NAME_LEN) {
    throw new IpcValidationError('Invalid team name');
  }
  return name.trim();
}

export function assertGuideType(t: unknown): GuideType {
  if (typeof t !== 'string' || !VALID_GUIDE_TYPES.has(t as GuideType)) throw new IpcValidationError('Invalid guide type');
  return t as GuideType;
}

export function assertColorFormat(f: unknown): ColorFormat {
  if (typeof f !== 'string' || !VALID_COLOR_FORMATS.has(f as ColorFormat)) throw new IpcValidationError('Invalid colour format');
  return f as ColorFormat;
}

export function assertDiffThreshold(threshold: unknown): number | undefined {
  if (threshold === undefined || threshold === null) return undefined;
  const n = Number(threshold);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new IpcValidationError('Invalid diff threshold');
  return n;
}

export function assertBool(v: unknown): boolean {
  if (typeof v !== 'boolean') throw new IpcValidationError('Expected boolean');
  return v;
}
