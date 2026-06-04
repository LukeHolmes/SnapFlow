import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Circle, CircleDot, Crop, Highlighter, MessageSquare, MousePointer2, Redo2, ScanLine, Square, Trash2, Type, Undo2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  createAnnotation,
  DEFAULT_ANNOTATION_EFFECTS,
  emptyAnnotationDocument,
  hitTestAnnotation,
  normaliseAnnotationDocument,
  pushUndo,
} from '../../../annotation/model';
import { api } from '../api';
import type { AnnotationDocument, AnnotationEffects, AnnotationTool, Capture, CaptureAnnotation, AnnotationCrop } from '../../../shared/types';

type Tool = AnnotationTool | 'crop' | 'select';
type Point = { x: number; y: number };

interface Props {
  capture: Capture;
  flash: (text: string, ok?: boolean) => void;
  onClose: () => void;
  onSaved: (capture: Capture) => void;
}

const TOOLS: Array<{ id: Tool; label: string; Icon: LucideIcon }> = [
  { id: 'select', label: 'Select', Icon: MousePointer2 },
  { id: 'arrow', label: 'Arrow', Icon: ArrowUpRight },
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'rect', label: 'Box', Icon: Square },
  { id: 'ellipse', label: 'Ellipse', Icon: Circle },
  { id: 'callout', label: 'Callout', Icon: MessageSquare },
  { id: 'highlight', label: 'Highlight', Icon: Highlighter },
  { id: 'step', label: 'Step', Icon: CircleDot },
  { id: 'blur', label: 'Blur', Icon: ScanLine },
  { id: 'redact', label: 'Redact', Icon: Square },
  { id: 'crop', label: 'Crop', Icon: Crop },
];

export default function AnnotationEditor({ capture, flash, onClose, onSaved }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState('#4F46E5');
  const [doc, setDoc] = useState<AnnotationDocument>(emptyAnnotationDocument);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<AnnotationDocument[]>([]);
  const [redoStack, setRedoStack] = useState<AnnotationDocument[]>([]);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fillOpacity, setFillOpacity] = useState(0);
  const [fontSize, setFontSize] = useState(24);
  const [highlightOpacity, setHighlightOpacity] = useState(0.4);
  const [blurIntensity, setBlurIntensity] = useState<'low' | 'medium' | 'high'>('medium');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDoc(emptyAnnotationDocument());
    setUndoStack([]);
    setRedoStack([]);
    setSelectedId(null);
    Promise.all([
      api.capture.getImageDataUrl(capture.id),
      api.capture.getAnnotations(capture.id),
    ]).then(([dataUrl, savedDoc]) => {
      if (cancelled) return;
      if (!dataUrl) {
        flash('Capture image is unavailable', false);
        onClose();
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        imageRef.current = img;
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const nextDoc = normaliseAnnotationDocument(savedDoc);
          setDoc(nextDoc);
          draw(canvas, img, nextDoc, undefined, undefined, null);
        }
        setLoading(false);
      };
      img.src = dataUrl;
    });
    return () => { cancelled = true; };
  }, [capture.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (canvas && img) draw(canvas, img, doc, undefined, undefined, selectedId);
  }, [doc, selectedId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (isTyping) return;
      if (e.key === 'Escape' || e.key.toLowerCase() === 's') { setTool('select'); setSelectedId(null); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); removeSelected(); return; }
      const keyMap: Record<string, Tool> = { a: 'arrow', t: 'text', r: 'rect', e: 'ellipse', c: 'callout', h: 'highlight', n: 'step', b: 'blur', x: 'crop' };
      const next = keyMap[e.key.toLowerCase()];
      if (next) setTool(next);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doc, selectedId, undoStack, redoStack]);

  const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = e.currentTarget;
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  };

  const commitDoc = (next: AnnotationDocument) => {
    setUndoStack(prev => pushUndo(prev, doc));
    setRedoStack([]);
    setDoc(next);
  };

  const annotationStyle = (): CaptureAnnotation['style'] => ({
    strokeColor: color,
    fillColor: color,
    fillOpacity,
    strokeWidth,
    fontSize,
    textColor: color,
    highlightOpacity,
    blurIntensity,
    arrowhead: 'filled',
  });

  const preview = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStart || tool === 'text' || tool === 'step' || tool === 'callout') return;
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const end = canvasPoint(e);
    if (tool === 'crop') draw(canvas, img, doc, undefined, toCrop(dragStart, end), selectedId);
    else if (tool !== 'select') draw(canvas, img, doc, createAnnotation({ type: tool, start: dragStart, end, color, existing: doc.annotations, style: annotationStyle() }), undefined, selectedId);
  };

  const begin = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(e);
    if (tool === 'select') {
      setSelectedId(hitTestAnnotation(doc.annotations, point)?.id ?? null);
      return;
    }
    setSelectedId(null);
    setDragStart(point);
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = dragStart;
    setDragStart(null);
    if (!start) return;
    const end = canvasPoint(e);
    if (tool === 'crop') {
      const crop = toCrop(start, end);
      if (crop.width < 16 || crop.height < 16) return;
      commitDoc({ ...doc, crop });
      return;
    }
    if (tool === 'text' || tool === 'callout') {
      const text = window.prompt(tool === 'callout' ? 'Callout text' : 'Text label');
      if (!text?.trim()) return;
      commitDoc({ ...doc, annotations: [...doc.annotations, createAnnotation({ type: tool, start, end, color, text: text.trim(), existing: doc.annotations, style: annotationStyle() })] });
      return;
    }
    if (tool === 'step') {
      commitDoc({ ...doc, annotations: [...doc.annotations, createAnnotation({ type: tool, start, end: start, color, existing: doc.annotations, style: annotationStyle() })] });
      return;
    }
    if (Math.abs(end.x - start.x) < 4 && Math.abs(end.y - start.y) < 4) return;
    if (tool !== 'select') commitDoc({ ...doc, annotations: [...doc.annotations, createAnnotation({ type: tool, start, end, color, existing: doc.annotations, style: annotationStyle() })] });
  };

  const setEffect = <K extends keyof AnnotationEffects>(key: K, value: AnnotationEffects[K]) => {
    commitDoc({ ...doc, effects: { ...doc.effects, [key]: value } });
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack(prev => pushUndo(prev, doc));
    setUndoStack(prev => prev.slice(0, -1));
    setDoc(previous);
    setSelectedId(null);
  };

  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack(prev => pushUndo(prev, doc));
    setRedoStack(prev => prev.slice(0, -1));
    setDoc(next);
    setSelectedId(null);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    commitDoc({ ...doc, annotations: doc.annotations.filter(a => a.id !== selectedId) });
    setSelectedId(null);
  };

  const clearAll = () => {
    if (!doc.annotations.length) return;
    if (!window.confirm('Clear all annotations on this capture?')) return;
    commitDoc({ ...doc, annotations: [] });
    setSelectedId(null);
  };

  const saveDraft = async () => {
    const r = await api.capture.saveAnnotations(capture.id, doc);
    flash(r.detail, r.ok);
  };

  const save = async () => {
    const img = imageRef.current;
    if (!img) return;
    const dataUrl = renderFinalImage(img, doc);
    if (!dataUrl) return;
    try {
      await api.capture.saveAnnotations(capture.id, doc);
      const saved = await api.capture.saveAnnotated(capture.id, dataUrl);
      flash('Annotated copy saved');
      onSaved(saved);
      onClose();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save annotation', false);
    }
  };

  return (
    <div className="modal-scrim annotation-scrim" onClick={onClose}>
      <div className="annotation-modal" onClick={e => e.stopPropagation()}>
        <div className="annotation-head">
          <div>
            <h2 className="section-title">Annotate capture</h2>
            <p className="annotation-sub">{capture.filename}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="annotation-toolbar">
          {TOOLS.map(({ id, label, Icon }) => (
            <button key={id} className={`tool-btn${tool === id ? ' tool-btn-active' : ''}`} onClick={() => setTool(id)}>
              <Icon size={14} /> {label}
            </button>
          ))}
          <span className="tool-divider" />
          <label className="color-pick">
            Color
            <input type="color" value={color} onChange={e => setColor(e.target.value)} disabled={tool === 'redact' || tool === 'blur' || tool === 'crop' || tool === 'select'} />
          </label>
          {(tool === 'arrow' || tool === 'rect' || tool === 'ellipse' || tool === 'callout') && (
            <label className="mini-style">Stroke
              <select value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))}>
                {[1, 2, 3, 4, 6].map(w => <option key={w} value={w}>{w}px</option>)}
              </select>
            </label>
          )}
          {(tool === 'rect' || tool === 'ellipse' || tool === 'callout') && (
            <label className="mini-style">Fill
              <select value={fillOpacity} onChange={e => setFillOpacity(Number(e.target.value))}>
                {[0, 0.2, 0.4, 0.6, 1].map(o => <option key={o} value={o}>{Math.round(o * 100)}%</option>)}
              </select>
            </label>
          )}
          {(tool === 'text' || tool === 'callout') && (
            <label className="mini-style">Font
              <select value={fontSize} onChange={e => setFontSize(Number(e.target.value))}>
                {[12, 16, 20, 24, 32, 40, 48].map(s => <option key={s} value={s}>{s}px</option>)}
              </select>
            </label>
          )}
          {tool === 'highlight' && (
            <label className="mini-style">Opacity
              <select value={highlightOpacity} onChange={e => setHighlightOpacity(Number(e.target.value))}>
                {[0.2, 0.4, 0.6].map(o => <option key={o} value={o}>{Math.round(o * 100)}%</option>)}
              </select>
            </label>
          )}
          {tool === 'blur' && (
            <label className="mini-style">Blur
              <select value={blurIntensity} onChange={e => setBlurIntensity(e.target.value as 'low' | 'medium' | 'high')}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          )}
          <button className="tool-btn" onClick={undo} disabled={undoStack.length === 0}>
            <Undo2 size={14} /> Undo
          </button>
          <button className="tool-btn" onClick={redo} disabled={redoStack.length === 0}>
            <Redo2 size={14} /> Redo
          </button>
          <button className="tool-btn" onClick={removeSelected} disabled={!selectedId}>
            <Trash2 size={14} /> Delete
          </button>
          <button className="tool-btn" onClick={clearAll} disabled={doc.annotations.length === 0}>
            Clear all
          </button>
        </div>

        <div className="annotation-effects">
          <label><input type="checkbox" checked={doc.effects.border} onChange={e => setEffect('border', e.target.checked)} /> Border</label>
          <label><input type="checkbox" checked={doc.effects.shadow} onChange={e => setEffect('shadow', e.target.checked)} /> Shadow</label>
          <label className="watermark-field">Watermark <input value={doc.effects.watermark} onChange={e => setEffect('watermark', e.target.value)} placeholder="Draft / Confidential / SnapFlow" /></label>
          {selectedId && <span className="annotation-selected-note">Selected annotation: Delete/Backspace removes it</span>}
          {doc.crop && <button className="tool-btn" onClick={() => commitDoc({ ...doc, crop: null })}>Clear crop</button>}
        </div>

        <div className="annotation-stage">
          {loading && <div className="empty">Loading capture…</div>}
          <canvas
            ref={canvasRef}
            className="annotation-canvas"
            onPointerDown={begin}
            onPointerMove={preview}
            onPointerUp={finish}
            onPointerLeave={preview}
          />
        </div>

        <div className="annotation-actions">
          <button className="btn-ghost" onClick={saveDraft} disabled={loading}>Save draft</button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={loading}>Save annotated copy</button>
        </div>
      </div>
    </div>
  );
}

function draw(canvas: HTMLCanvasElement, img: HTMLImageElement, doc: AnnotationDocument, preview?: CaptureAnnotation, previewCrop?: AnnotationCrop, selectedId?: string | null): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  for (const shape of [...doc.annotations, ...(preview ? [preview] : [])]) drawAnnotation(ctx, shape);
  if (selectedId) {
    const selected = doc.annotations.find(a => a.id === selectedId);
    if (selected) drawSelection(ctx, selected);
  }
  const crop = previewCrop ?? doc.crop;
  if (crop) drawCropOverlay(ctx, crop);
  drawWatermark(ctx, doc.effects.watermark);
  if (doc.effects.border) drawBorder(ctx);
}

function drawAnnotation(ctx: CanvasRenderingContext2D, shape: CaptureAnnotation): void {
  const { start, end } = shape;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = shape.style?.strokeWidth ?? Math.max(4, Math.round(ctx.canvas.width / 360));

  if (shape.type === 'highlight') {
    ctx.fillStyle = hexToRgba(shape.style?.fillColor ?? shape.color, shape.style?.highlightOpacity ?? 0.4);
    fillRect(ctx, start, end);
  } else if (shape.type === 'redact') {
    ctx.fillStyle = '#111111';
    fillRect(ctx, start, end);
  } else if (shape.type === 'blur') {
    blurRect(ctx, start, end, shape.style?.blurIntensity ?? 'medium');
  } else if (shape.type === 'rect') {
    drawStyledRect(ctx, shape);
  } else if (shape.type === 'ellipse') {
    drawStyledEllipse(ctx, shape);
  } else if (shape.type === 'text') {
    ctx.fillStyle = shape.style?.textColor ?? shape.color;
    ctx.font = `${shape.style?.fontSize ?? Math.max(24, Math.round(ctx.canvas.width / 32))}px sans-serif`;
    ctx.fillText(shape.text ?? '', start.x, start.y);
  } else if (shape.type === 'step') {
    drawStep(ctx, shape);
  } else if (shape.type === 'callout') {
    drawCallout(ctx, shape);
  } else {
    drawArrow(ctx, start, end, shape.color, shape);
  }

  ctx.restore();
}

function toCrop(start: Point, end: Point): AnnotationCrop {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return { x, y, width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

function rect(start: Point, end: Point) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return { x, y, width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

function fillRect(ctx: CanvasRenderingContext2D, start: Point, end: Point): void {
  const r = rect(start, end);
  ctx.fillRect(r.x, r.y, r.width, r.height);
}

function blurRect(ctx: CanvasRenderingContext2D, start: Point, end: Point, intensity: 'low' | 'medium' | 'high' = 'medium'): void {
  const r = rect(start, end);
  if (r.width < 2 || r.height < 2) return;
  ctx.save();
  const radius = intensity === 'low' ? 4 : intensity === 'high' ? 16 : 8;
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(ctx.canvas, r.x, r.y, r.width, r.height, r.x, r.y, r.width, r.height);
  ctx.restore();
}

function drawStyledRect(ctx: CanvasRenderingContext2D, shape: CaptureAnnotation): void {
  const r = rect(shape.start, shape.end);
  const fillOpacity = shape.style?.fillOpacity ?? 0;
  if (fillOpacity > 0) {
    ctx.fillStyle = hexToRgba(shape.style?.fillColor ?? shape.color, fillOpacity);
    ctx.fillRect(r.x, r.y, r.width, r.height);
  }
  ctx.strokeStyle = shape.style?.strokeColor ?? shape.color;
  ctx.strokeRect(r.x, r.y, r.width, r.height);
}

function drawStyledEllipse(ctx: CanvasRenderingContext2D, shape: CaptureAnnotation): void {
  const r = rect(shape.start, shape.end);
  ctx.beginPath();
  ctx.ellipse(r.x + r.width / 2, r.y + r.height / 2, Math.max(1, r.width / 2), Math.max(1, r.height / 2), 0, 0, Math.PI * 2);
  const fillOpacity = shape.style?.fillOpacity ?? 0;
  if (fillOpacity > 0) {
    ctx.fillStyle = hexToRgba(shape.style?.fillColor ?? shape.color, fillOpacity);
    ctx.fill();
  }
  ctx.strokeStyle = shape.style?.strokeColor ?? shape.color;
  ctx.stroke();
}

function drawSelection(ctx: CanvasRenderingContext2D, shape: CaptureAnnotation): void {
  const r = rect(shape.start, shape.end);
  const x = shape.type === 'step' ? shape.start.x - 30 : r.x - 8;
  const y = shape.type === 'step' ? shape.start.y - 30 : r.y - 8;
  const w = shape.type === 'step' ? 60 : Math.max(r.width, 1) + 16;
  const h = shape.type === 'step' ? 60 : Math.max(r.height, 1) + 16;
  ctx.save();
  ctx.strokeStyle = '#4F46E5';
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#4F46E5';
  for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawStep(ctx: CanvasRenderingContext2D, shape: CaptureAnnotation): void {
  const radius = Math.max(18, Math.round(ctx.canvas.width / 42));
  ctx.fillStyle = shape.style?.fillColor && shape.style.fillColor !== 'transparent' ? shape.style.fillColor : shape.color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(3, Math.round(radius / 7));
  ctx.beginPath();
  ctx.arc(shape.start.x, shape.start.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(radius * 1.15)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(shape.order ?? 1), shape.start.x, shape.start.y + 1);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

function drawCallout(ctx: CanvasRenderingContext2D, shape: CaptureAnnotation): void {
  const text = shape.text ?? '';
  const x = shape.start.x;
  const y = shape.start.y;
  ctx.font = `${shape.style?.fontSize ?? Math.max(20, Math.round(ctx.canvas.width / 45))}px sans-serif`;
  const padding = 12;
  const width = Math.max(110, ctx.measureText(text).width + padding * 2);
  const height = Math.max(46, Math.round(ctx.canvas.width / 34));
  ctx.strokeStyle = shape.style?.strokeColor ?? shape.color;
  ctx.lineWidth = shape.style?.strokeWidth ?? Math.max(3, Math.round(ctx.canvas.width / 420));
  roundRect(ctx, x, y, width, height, 12);
  const fillOpacity = shape.style?.fillOpacity ?? 0;
  if (fillOpacity > 0) {
    ctx.fillStyle = hexToRgba(shape.style?.fillColor ?? '#ffffff', fillOpacity);
    ctx.fill();
  }
  ctx.stroke();
  ctx.fillStyle = shape.style?.textColor ?? shape.color;
  ctx.fillText(text, x + padding, y + height / 2 + 7);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCropOverlay(ctx: CanvasRenderingContext2D, crop: AnnotationCrop): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.34)';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.clearRect(crop.x, crop.y, crop.width, crop.height);
  ctx.strokeStyle = '#ffffff';
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 3;
  ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);
  ctx.restore();
}

function drawBorder(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = Math.max(6, Math.round(ctx.canvas.width / 180));
  ctx.strokeRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D, watermark: string): void {
  const text = watermark.trim();
  if (!text) return;
  ctx.save();
  ctx.font = `${Math.max(18, Math.round(ctx.canvas.width / 55))}px sans-serif`;
  const padding = 18;
  const metrics = ctx.measureText(text);
  const x = ctx.canvas.width - metrics.width - padding * 2;
  const y = ctx.canvas.height - padding * 2;
  ctx.fillStyle = 'rgba(255,255,255,.82)';
  ctx.fillRect(x - padding / 2, y - 24, metrics.width + padding, 34);
  ctx.fillStyle = 'rgba(17,17,17,.72)';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function renderFinalImage(img: HTMLImageElement, doc: AnnotationDocument): string {
  const full = document.createElement('canvas');
  full.width = img.naturalWidth;
  full.height = img.naturalHeight;
  draw(full, img, { ...doc, effects: DEFAULT_ANNOTATION_EFFECTS, crop: null });

  const crop = doc.crop ?? { x: 0, y: 0, width: full.width, height: full.height };
  const pad = doc.effects.shadow ? 28 : 0;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(crop.width + pad * 2));
  out.height = Math.max(1, Math.round(crop.height + pad * 2));
  const ctx = out.getContext('2d');
  if (!ctx) return full.toDataURL('image/png');

  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.clearRect(0, 0, out.width, out.height);
  if (doc.effects.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,.28)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
  }
  ctx.drawImage(full, crop.x, crop.y, crop.width, crop.height, pad, pad, crop.width, crop.height);
  if (doc.effects.border) drawBorder(ctx);
  drawWatermark(ctx, doc.effects.watermark);
  return out.toDataURL('image/png');
}

function drawArrow(ctx: CanvasRenderingContext2D, start: Point, end: Point, color: string, shape?: CaptureAnnotation): void {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = Math.max(18, Math.round(ctx.canvas.width / 45));
  ctx.strokeStyle = shape?.style?.strokeColor ?? color;
  ctx.fillStyle = shape?.style?.strokeColor ?? color;
  ctx.lineWidth = shape?.style?.strokeWidth ?? ctx.lineWidth;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  if (shape?.style?.arrowhead === 'none') return;
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  if (shape?.style?.arrowhead === 'open') ctx.stroke();
  else ctx.fill();
}

function hexToRgba(hex: string, alpha: number): string {
  if (hex === 'transparent') return `rgba(0,0,0,0)`;
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
