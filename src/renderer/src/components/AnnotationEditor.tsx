import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Highlighter, Square, Type, Undo2, X } from 'lucide-react';
import { api } from '../api';
import type { Capture } from '../../../shared/types';

type Tool = 'arrow' | 'rect' | 'highlight' | 'text' | 'redact';
type Point = { x: number; y: number };
type Shape = { tool: Tool; start: Point; end: Point; color: string; text?: string };

interface Props {
  capture: Capture;
  flash: (text: string, ok?: boolean) => void;
  onClose: () => void;
  onSaved: (capture: Capture) => void;
}

const TOOLS: Array<{ id: Tool; label: string; Icon: typeof Square }> = [
  { id: 'arrow', label: 'Arrow', Icon: ArrowUpRight },
  { id: 'rect', label: 'Box', Icon: Square },
  { id: 'highlight', label: 'Highlight', Icon: Highlighter },
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'redact', label: 'Redact', Icon: Square },
];

export default function AnnotationEditor({ capture, flash, onClose, onSaved }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState('#4F46E5');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [dragStart, setDragStart] = useState<Point | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setShapes([]);
    api.capture.getImageDataUrl(capture.id).then(dataUrl => {
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
          draw(canvas, img, []);
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
    if (canvas && img) draw(canvas, img, shapes);
  }, [shapes]);

  const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = e.currentTarget;
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  };

  const preview = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStart || tool === 'text') return;
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    draw(canvas, img, shapes, { tool, start: dragStart, end: canvasPoint(e), color });
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = dragStart;
    setDragStart(null);
    if (!start) return;
    const end = canvasPoint(e);
    if (tool === 'text') {
      const text = window.prompt('Text label');
      if (!text?.trim()) return;
      setShapes(prev => [...prev, { tool, start, end: start, color, text: text.trim() }]);
      return;
    }
    if (Math.abs(end.x - start.x) < 4 && Math.abs(end.y - start.y) < 4) return;
    setShapes(prev => [...prev, { tool, start, end, color }]);
  };

  const save = async () => {
    const dataUrl = canvasRef.current?.toDataURL('image/png');
    if (!dataUrl) return;
    try {
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
            <input type="color" value={color} onChange={e => setColor(e.target.value)} disabled={tool === 'highlight' || tool === 'redact'} />
          </label>
          <button className="tool-btn" onClick={() => setShapes(prev => prev.slice(0, -1))} disabled={shapes.length === 0}>
            <Undo2 size={14} /> Undo
          </button>
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
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={loading}>Save annotated copy</button>
        </div>
      </div>
    </div>
  );
}

function draw(canvas: HTMLCanvasElement, img: HTMLImageElement, shapes: Shape[], preview?: Shape): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  for (const shape of [...shapes, ...(preview ? [preview] : [])]) drawShape(ctx, shape);
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
  const { start, end } = shape;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, Math.round(ctx.canvas.width / 360));

  if (shape.tool === 'highlight') {
    ctx.fillStyle = 'rgba(250, 204, 21, 0.36)';
    ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else if (shape.tool === 'redact') {
    ctx.fillStyle = '#111111';
    ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else if (shape.tool === 'rect') {
    ctx.strokeStyle = shape.color;
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else if (shape.tool === 'text') {
    ctx.fillStyle = shape.color;
    ctx.font = `${Math.max(24, Math.round(ctx.canvas.width / 32))}px sans-serif`;
    ctx.fillText(shape.text ?? '', start.x, start.y);
  } else {
    drawArrow(ctx, start, end, shape.color);
  }

  ctx.restore();
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
