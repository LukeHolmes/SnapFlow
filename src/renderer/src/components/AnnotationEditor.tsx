import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CircleDot, Crop, Highlighter, MessageSquare, ScanLine, Square, Type, Undo2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../api';
import type { AnnotationDocument, AnnotationEffects, AnnotationTool, Capture, CaptureAnnotation, AnnotationCrop } from '../../../shared/types';

type Tool = AnnotationTool | 'crop';
type Point = { x: number; y: number };

const DEFAULT_EFFECTS: AnnotationEffects = { border: false, shadow: false, watermark: '' };
const emptyDoc = (): AnnotationDocument => ({ annotations: [], effects: DEFAULT_EFFECTS, crop: null });

interface Props {
  capture: Capture;
  flash: (text: string, ok?: boolean) => void;
  onClose: () => void;
  onSaved: (capture: Capture) => void;
}

const TOOLS: Array<{ id: Tool; label: string; Icon: LucideIcon }> = [
  { id: 'arrow', label: 'Arrow', Icon: ArrowUpRight },
  { id: 'rect', label: 'Box', Icon: Square },
  { id: 'step', label: 'Step', Icon: CircleDot },
  { id: 'callout', label: 'Callout', Icon: MessageSquare },
  { id: 'highlight', label: 'Highlight', Icon: Highlighter },
  { id: 'text', label: 'Text', Icon: Type },
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
  const [doc, setDoc] = useState<AnnotationDocument>(emptyDoc);
  const [dragStart, setDragStart] = useState<Point | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDoc(emptyDoc());
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
          const nextDoc = normaliseDoc(savedDoc);
          setDoc(nextDoc);
          draw(canvas, img, nextDoc);
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
    if (canvas && img) draw(canvas, img, doc);
  }, [doc]);

  const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = e.currentTarget;
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  };

  const preview = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStart || tool === 'text' || tool === 'step' || tool === 'callout') return;
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const end = canvasPoint(e);
    if (tool === 'crop') draw(canvas, img, doc, undefined, toCrop(dragStart, end));
    else draw(canvas, img, doc, makeAnnotation(tool, dragStart, end, color));
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = dragStart;
    setDragStart(null);
    if (!start) return;
    const end = canvasPoint(e);
    if (tool === 'crop') {
      const crop = toCrop(start, end);
      if (crop.width < 16 || crop.height < 16) return;
      setDoc(prev => ({ ...prev, crop }));
      return;
    }
    if (tool === 'text' || tool === 'callout') {
      const text = window.prompt(tool === 'callout' ? 'Callout text' : 'Text label');
      if (!text?.trim()) return;
      setDoc(prev => ({ ...prev, annotations: [...prev.annotations, makeAnnotation(tool, start, end, color, text.trim(), prev.annotations)] }));
      return;
    }
    if (tool === 'step') {
      setDoc(prev => ({ ...prev, annotations: [...prev.annotations, makeAnnotation(tool, start, start, color, undefined, prev.annotations)] }));
      return;
    }
    if (Math.abs(end.x - start.x) < 4 && Math.abs(end.y - start.y) < 4) return;
    setDoc(prev => ({ ...prev, annotations: [...prev.annotations, makeAnnotation(tool, start, end, color, undefined, prev.annotations)] }));
  };

  const setEffect = <K extends keyof AnnotationEffects>(key: K, value: AnnotationEffects[K]) => {
    setDoc(prev => ({ ...prev, effects: { ...prev.effects, [key]: value } }));
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
          <label className="color-pick">
            Color
            <input type="color" value={color} onChange={e => setColor(e.target.value)} disabled={tool === 'highlight' || tool === 'redact' || tool === 'blur' || tool === 'crop'} />
          </label>
          <button className="tool-btn" onClick={() => setDoc(prev => ({ ...prev, annotations: prev.annotations.slice(0, -1) }))} disabled={doc.annotations.length === 0}>
            <Undo2 size={14} /> Undo
          </button>
        </div>

        <div className="annotation-effects">
          <label><input type="checkbox" checked={doc.effects.border} onChange={e => setEffect('border', e.target.checked)} /> Border</label>
          <label><input type="checkbox" checked={doc.effects.shadow} onChange={e => setEffect('shadow', e.target.checked)} /> Shadow</label>
          <label className="watermark-field">Watermark <input value={doc.effects.watermark} onChange={e => setEffect('watermark', e.target.value)} placeholder="Draft / Confidential / SnapFlow" /></label>
          {doc.crop && <button className="tool-btn" onClick={() => setDoc(prev => ({ ...prev, crop: null }))}>Clear crop</button>}
        </div>

        <div className="annotation-stage">
          {loading && <div className="empty">Loading capture…</div>}
          <canvas
            ref={canvasRef}
            className="annotation-canvas"
            onPointerDown={e => setDragStart(canvasPoint(e))}
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

function draw(canvas: HTMLCanvasElement, img: HTMLImageElement, doc: AnnotationDocument, preview?: CaptureAnnotation, previewCrop?: AnnotationCrop): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  for (const shape of [...doc.annotations, ...(preview ? [preview] : [])]) drawAnnotation(ctx, shape);
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
  ctx.lineWidth = Math.max(4, Math.round(ctx.canvas.width / 360));

  if (shape.type === 'highlight') {
    ctx.fillStyle = 'rgba(250, 204, 21, 0.36)';
    fillRect(ctx, start, end);
  } else if (shape.type === 'redact') {
    ctx.fillStyle = '#111111';
    fillRect(ctx, start, end);
  } else if (shape.type === 'blur') {
    blurRect(ctx, start, end);
  } else if (shape.type === 'rect') {
    ctx.strokeStyle = shape.color;
    strokeRect(ctx, start, end);
  } else if (shape.type === 'text') {
    ctx.fillStyle = shape.color;
    ctx.font = `${Math.max(24, Math.round(ctx.canvas.width / 32))}px sans-serif`;
    ctx.fillText(shape.text ?? '', start.x, start.y);
  } else if (shape.type === 'step') {
    drawStep(ctx, shape);
  } else if (shape.type === 'callout') {
    drawCallout(ctx, shape);
  } else {
    drawArrow(ctx, start, end, shape.color);
  }

  ctx.restore();
}

function normaliseDoc(doc: AnnotationDocument | null): AnnotationDocument {
  return {
    annotations: doc?.annotations ?? [],
    effects: { ...DEFAULT_EFFECTS, ...(doc?.effects ?? {}) },
    crop: doc?.crop ?? null,
  };
}

function makeAnnotation(type: AnnotationTool, start: Point, end: Point, color: string, text?: string, annotations: CaptureAnnotation[] = []): CaptureAnnotation {
  const order = type === 'step' ? annotations.filter(a => a.type === 'step').length + 1 : undefined;
  return { id: crypto.randomUUID(), type, start, end, color, text, order };
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

function strokeRect(ctx: CanvasRenderingContext2D, start: Point, end: Point): void {
  const r = rect(start, end);
  ctx.strokeRect(r.x, r.y, r.width, r.height);
}

function blurRect(ctx: CanvasRenderingContext2D, start: Point, end: Point): void {
  const r = rect(start, end);
  if (r.width < 2 || r.height < 2) return;
  ctx.save();
  ctx.filter = 'blur(10px)';
  ctx.drawImage(ctx.canvas, r.x, r.y, r.width, r.height, r.x, r.y, r.width, r.height);
  ctx.restore();
}

function drawStep(ctx: CanvasRenderingContext2D, shape: CaptureAnnotation): void {
  const radius = Math.max(18, Math.round(ctx.canvas.width / 42));
  ctx.fillStyle = shape.color;
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
  ctx.font = `${Math.max(20, Math.round(ctx.canvas.width / 45))}px sans-serif`;
  const padding = 12;
  const width = Math.max(110, ctx.measureText(text).width + padding * 2);
  const height = Math.max(46, Math.round(ctx.canvas.width / 34));
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = Math.max(3, Math.round(ctx.canvas.width / 420));
  roundRect(ctx, x, y, width, height, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = shape.color;
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
  draw(full, img, { ...doc, effects: DEFAULT_EFFECTS, crop: null });

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

function drawArrow(ctx: CanvasRenderingContext2D, start: Point, end: Point, color: string): void {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = Math.max(18, Math.round(ctx.canvas.width / 45));
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}
