import type { AnnotationDocument, AnnotationEffects, AnnotationPoint, AnnotationTool, CaptureAnnotation } from '../shared/types';

export const DEFAULT_ANNOTATION_EFFECTS: AnnotationEffects = { border: false, shadow: false, watermark: '' };

export const emptyAnnotationDocument = (): AnnotationDocument => ({
  annotations: [],
  effects: { ...DEFAULT_ANNOTATION_EFFECTS },
  crop: null,
});

export interface AnnotationDraft {
  type: AnnotationTool;
  start: AnnotationPoint;
  end: AnnotationPoint;
  color: string;
  text?: string;
  existing?: CaptureAnnotation[];
  style?: CaptureAnnotation['style'];
}

export function createAnnotation({ type, start, end, color, text, existing = [], style }: AnnotationDraft): CaptureAnnotation {
  const order = type === 'step' ? existing.filter(a => a.type === 'step').length + 1 : undefined;
  const zIndex = existing.reduce((max, a) => Math.max(max, a.zIndex ?? 0), 0) + 1;
  return {
    id: randomId(),
    type,
    start,
    end,
    color,
    text,
    order,
    zIndex,
    style: normaliseStyle(type, color, style),
  };
}

export function normaliseAnnotationDocument(doc: AnnotationDocument | null | undefined): AnnotationDocument {
  return {
    annotations: (doc?.annotations ?? [])
      .map((annotation, idx) => ({
        ...annotation,
        zIndex: annotation.zIndex ?? idx + 1,
        style: normaliseStyle(annotation.type, annotation.color, annotation.style),
      }))
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    effects: { ...DEFAULT_ANNOTATION_EFFECTS, ...(doc?.effects ?? {}) },
    crop: doc?.crop ?? null,
  };
}

export function serialiseAnnotationDocument(doc: AnnotationDocument): string {
  return JSON.stringify(normaliseAnnotationDocument(doc));
}

export function deserialiseAnnotationDocument(json: string): AnnotationDocument {
  return normaliseAnnotationDocument(JSON.parse(json) as AnnotationDocument);
}

export function annotationBounds(annotation: CaptureAnnotation) {
  const x = Math.min(annotation.start.x, annotation.end.x);
  const y = Math.min(annotation.start.y, annotation.end.y);
  return {
    x,
    y,
    width: Math.abs(annotation.end.x - annotation.start.x),
    height: Math.abs(annotation.end.y - annotation.start.y),
  };
}

export function hitTestAnnotation(annotations: CaptureAnnotation[], point: AnnotationPoint): CaptureAnnotation | null {
  const sorted = [...annotations].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
  for (const annotation of sorted) {
    const b = annotationBounds(annotation);
    const pad = Math.max(10, annotation.style?.strokeWidth ?? 3);
    if (annotation.type === 'step') {
      const dx = point.x - annotation.start.x;
      const dy = point.y - annotation.start.y;
      if (Math.sqrt(dx * dx + dy * dy) <= 28) return annotation;
      continue;
    }
    if (
      point.x >= b.x - pad &&
      point.x <= b.x + Math.max(b.width, 1) + pad &&
      point.y >= b.y - pad &&
      point.y <= b.y + Math.max(b.height, 1) + pad
    ) return annotation;
  }
  return null;
}

export function pushUndo(history: AnnotationDocument[], current: AnnotationDocument, limit = 20): AnnotationDocument[] {
  return [...history, cloneDocument(current)].slice(-limit);
}

export function cloneDocument(doc: AnnotationDocument): AnnotationDocument {
  return deserialiseAnnotationDocument(serialiseAnnotationDocument(doc));
}

function normaliseStyle(type: AnnotationTool, color: string, style: CaptureAnnotation['style'] = {}): CaptureAnnotation['style'] {
  return {
    strokeColor: style.strokeColor ?? color,
    fillColor: style.fillColor ?? (type === 'callout' ? '#ffffff' : 'transparent'),
    fillOpacity: style.fillOpacity ?? 0,
    strokeWidth: style.strokeWidth ?? 3,
    fontSize: style.fontSize ?? 24,
    textColor: style.textColor ?? color,
    highlightOpacity: style.highlightOpacity ?? 0.4,
    blurIntensity: style.blurIntensity ?? 'medium',
    arrowhead: style.arrowhead ?? 'filled',
  };
}

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `ann_${Math.random().toString(36).slice(2)}`;
}
