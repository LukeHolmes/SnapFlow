import { useEffect, useRef, useState } from 'react';
import { Focus, MousePointer2, Redo2, Undo2, X } from 'lucide-react';
import { cloneDocument, emptyAnnotationDocument, normaliseAnnotationDocument, pushUndo } from '../../../annotation/model';
import { defaultWindowFocusRegion, emptyFocusBlur, normaliseFocusBlur, regionFromPoints } from '../../../focus-blur/model';
import { paintFocusBlurPreview, exportFocusBlurDataUrl } from '../../../focus-blur/canvas';
import { api } from '../api';
import type { AnnotationDocument, Capture, Entitlements, FocusBlurRegion } from '../../../shared/types';

type Tool = 'select' | 'draw';
type Point = { x: number; y: number };

interface Props {
  capture: Capture;
  flash: (text: string, ok?: boolean) => void;
  onClose: () => void;
  onSaved: (capture: Capture) => void;
  /** Pre-seed one region (quick window / region focus). */
  seedWindowFocus?: boolean;
}

export default function FocusBlurEditor({ capture, flash, onClose, onSaved, seedWindowFocus }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<Tool>('draw');
  const [doc, setDoc] = useState<AnnotationDocument>(emptyAnnotationDocument);
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [undoStack, setUndoStack] = useState<AnnotationDocument[]>([]);
  const [redoStack, setRedoStack] = useState<AnnotationDocument[]>([]);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moveOffset, setMoveOffset] = useState<Point | null>(null);
  const moveSnapshot = useRef<AnnotationDocument | null>(null);

  const effect = normaliseFocusBlur(doc.focusBlur);
  const maxRegions = ent?.focusBlurMaxRegions ?? null;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.capture.getImageDataUrl(capture.id),
      api.capture.getAnnotations(capture.id),
      api.entitlements.get(),
    ]).then(([dataUrl, saved, entitlements]) => {
      if (cancelled) return;
      setEnt(entitlements);
      if (!dataUrl) {
        flash('Capture image is unavailable', false);
        onClose();
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        imageRef.current = img;
        let next = normaliseAnnotationDocument(saved);
        if (seedWindowFocus && (!next.focusBlur?.regions.length)) {
          const region = defaultWindowFocusRegion(img.naturalWidth, img.naturalHeight);
          next = { ...next, focusBlur: { ...emptyFocusBlur(), regions: [region] } };
        }
        setDoc(next);
        redraw(next, null);
        setLoading(false);
      };
      img.src = dataUrl;
    });
    return () => { cancelled = true; };
  }, [capture.id, seedWindowFocus]);

  const redraw = (current: AnnotationDocument, preview: FocusBlurRegion | null, selected = selectedId) => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const fx = normaliseFocusBlur(current.focusBlur);
    const overlay = preview ? [...fx.regions, preview] : fx.regions;
    paintFocusBlurPreview(ctx, img, canvas.width, canvas.height, fx, overlay, selected);
  };

  useEffect(() => {
    redraw(doc, null, selectedId);
  }, [doc, selectedId]);

  const commitDoc = (next: AnnotationDocument) => {
    setUndoStack(prev => pushUndo(prev, doc));
    setRedoStack([]);
    setDoc(next);
  };

  const patchFocus = (patch: Partial<typeof effect>) => {
    commitDoc({ ...doc, focusBlur: normaliseFocusBlur({ ...effect, ...patch }) });
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack(prev => pushUndo(prev, doc));
    setUndoStack(prev => prev.slice(0, -1));
    setDoc(cloneDocument(previous));
    setSelectedId(null);
  };

  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack(prev => pushUndo(prev, doc));
    setRedoStack(prev => prev.slice(0, -1));
    setDoc(cloneDocument(next));
    setSelectedId(null);
  };

  const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = e.currentTarget;
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  };

  const hitRegion = (point: Point): FocusBlurRegion | null => {
    const regions = effect.regions;
    for (let i = regions.length - 1; i >= 0; i -= 1) {
      const r = regions[i];
      if (point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height) return r;
    }
    return null;
  };

  const canAddRegion = () => maxRegions == null || effect.regions.length < maxRegions;

  const begin = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(e);
    if (tool === 'select') {
      const hit = hitRegion(point);
      setSelectedId(hit?.id ?? null);
      if (hit) {
        moveSnapshot.current = cloneDocument(doc);
        setMoveOffset({ x: point.x - hit.x, y: point.y - hit.y });
      }
      return;
    }
    if (!canAddRegion()) {
      flash(maxRegions === 1 ? 'Free tier allows one focus region. Upgrade to Pro for multi-region.' : 'Region limit reached', false);
      return;
    }
    setSelectedId(null);
    setDragStart(point);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(e);
    if (tool === 'select' && selectedId && moveOffset) {
      const regions = effect.regions.map(r =>
        r.id === selectedId
          ? { ...r, x: Math.round(point.x - moveOffset.x), y: Math.round(point.y - moveOffset.y) }
          : r,
      );
      const next = { ...doc, focusBlur: normaliseFocusBlur({ ...effect, regions }) };
      setDoc(next);
      redraw(next, null, selectedId);
      return;
    }
    if (!dragStart || tool !== 'draw') return;
    const preview = regionFromPoints(dragStart, point, effect.regions[0]?.cornerRadius ?? 0);
    redraw(doc, preview, selectedId);
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'select') {
      if (moveSnapshot.current && selectedId && moveOffset) {
        commitDoc(doc);
      }
      moveSnapshot.current = null;
      setMoveOffset(null);
      return;
    }
    const start = dragStart;
    setDragStart(null);
    if (!start) return;
    const end = canvasPoint(e);
    if (Math.abs(end.x - start.x) < 8 || Math.abs(end.y - start.y) < 8) return;
    if (!canAddRegion()) return;
    const region = regionFromPoints(start, end, Math.round(Math.min(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) * 0.08));
    commitDoc({ ...doc, focusBlur: normaliseFocusBlur({ ...effect, regions: [...effect.regions, region] }) });
  };

  const removeSelected = () => {
    if (!selectedId) return;
    commitDoc({
      ...doc,
      focusBlur: normaliseFocusBlur({ ...effect, regions: effect.regions.filter(r => r.id !== selectedId) }),
    });
    setSelectedId(null);
  };

  const saveDraft = async () => {
    const r = await api.capture.saveAnnotations(capture.id, doc);
    flash(r.detail, r.ok);
  };

  const save = async () => {
    const img = imageRef.current;
    if (!img || !effect.regions.length) {
      flash('Add at least one focus region', false);
      return;
    }
    const dataUrl = exportFocusBlurDataUrl(img, img.naturalWidth, img.naturalHeight, effect);
    if (!dataUrl) return;
    try {
      await api.capture.saveAnnotations(capture.id, doc);
      const saved = await api.capture.saveFocusBlur(capture.id, dataUrl);
      flash('Focus blur copy saved');
      onSaved(saved);
      onClose();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not save focus blur copy', false);
    }
  };

  return (
    <div className="modal-scrim annotation-scrim" onClick={onClose}>
      <div className="annotation-modal" onClick={e => e.stopPropagation()}>
        <div className="annotation-head">
          <div>
            <h2 className="section-title">Focus blur</h2>
            <p className="annotation-sub">{capture.filename} — sharp inside, blurred outside (non-destructive params)</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="annotation-toolbar">
          <button className={`tool-btn${tool === 'draw' ? ' tool-btn-active' : ''}`} onClick={() => setTool('draw')}>
            <Focus size={14} /> Draw focus
          </button>
          <button className={`tool-btn${tool === 'select' ? ' tool-btn-active' : ''}`} onClick={() => setTool('select')}>
            <MousePointer2 size={14} /> Move
          </button>
          <label className="mini-style">Blur
            <input type="range" min={4} max={32} value={effect.blurRadius} onChange={e => patchFocus({ blurRadius: Number(e.target.value) })} />
            <span>{effect.blurRadius}px</span>
          </label>
          <label className="mini-style">Dim
            <input type="range" min={0} max={80} value={Math.round(effect.dimAmount * 100)} onChange={e => patchFocus({ dimAmount: Number(e.target.value) / 100 })} />
            <span>{Math.round(effect.dimAmount * 100)}%</span>
          </label>
          <label><input type="checkbox" checked={effect.invert} onChange={e => patchFocus({ invert: e.target.checked })} /> Invert (blur inside)</label>
          <button className="tool-btn" onClick={undo} disabled={undoStack.length === 0}><Undo2 size={14} /> Undo</button>
          <button className="tool-btn" onClick={redo} disabled={redoStack.length === 0}><Redo2 size={14} /> Redo</button>
          <button className="tool-btn" onClick={removeSelected} disabled={!selectedId}>Delete region</button>
        </div>

        {maxRegions === 1 && (
          <p className="annotation-sub" style={{ margin: '0 16px 8px' }}>Free plan: one focus region. Multi-region and preset automation are on Pro.</p>
        )}

        <div className="annotation-stage">
          {loading && <div className="empty">Loading capture…</div>}
          <canvas
            ref={canvasRef}
            className="annotation-canvas"
            onPointerDown={begin}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerLeave={finish}
          />
        </div>

        <div className="annotation-actions">
          <button className="btn-ghost" onClick={saveDraft} disabled={loading}>Save params</button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={loading}>Save blurred copy</button>
        </div>
      </div>
    </div>
  );
}
