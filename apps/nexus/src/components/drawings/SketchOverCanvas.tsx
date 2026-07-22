'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Box, Button, IconButton, Slider, ToggleButton, ToggleButtonGroup,
  Typography, Paper, Tooltip,
} from '@neram/ui';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import RedoOutlinedIcon from '@mui/icons-material/RedoOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import CloseIcon from '@mui/icons-material/Close';
import CreateOutlinedIcon from '@mui/icons-material/CreateOutlined';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import FitScreenOutlinedIcon from '@mui/icons-material/FitScreenOutlined';
import ZoomInOutlinedIcon from '@mui/icons-material/ZoomInOutlined';
import ZoomOutOutlinedIcon from '@mui/icons-material/ZoomOutOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import {
  applySmoothStroke, buildSmoothStroke, arrowHead, hitTestItem, textBounds,
  type CanvasItem, type Point,
} from '../../lib/sketch-geometry';

interface SketchOverCanvasProps {
  imageUrl: string;
  onSave: (blob: Blob) => Promise<void> | void;
  onClose: () => void;
}

type Tool = 'pen' | 'eraser' | 'text';
type Item = CanvasItem;

const COLORS = ['#FF0000', '#0066FF', '#00AA00', '#FF6600', '#9933FF', '#000000'];
const FONT_FAMILY = "'Segoe UI', system-ui, -apple-system, sans-serif";

// --- Pure canvas drawing helpers (operate on any 2D context) ---

function drawStrokeItem(
  ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number,
) {
  if (points.length === 0) return;
  if (points.length === 1) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, Math.max(width / 2, 0.5), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  applySmoothStroke(ctx, buildSmoothStroke(points));
  ctx.stroke();
}

function drawLeaderLine(
  ctx: CanvasRenderingContext2D, from: Point, tip: Point, color: string, width: number,
) {
  const barbSize = Math.max(width * 3.5, 12);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  const [b1, b2] = arrowHead(from, tip, barbSize);
  ctx.beginPath();
  ctx.moveTo(b1.x, b1.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.lineTo(b2.x, b2.y);
  ctx.stroke();
}

function drawTextItem(ctx: CanvasRenderingContext2D, item: Extract<Item, { type: 'text' }>) {
  const lines = item.text.split('\n');
  const lineHeight = item.fontSize * 1.25;
  const bounds = textBounds(item);
  if (item.leader) {
    const anchor = { x: bounds.x, y: bounds.y + bounds.height / 2 };
    drawLeaderLine(ctx, anchor, item.leader, item.color, Math.max(item.fontSize / 10, 2));
  }
  ctx.font = `600 ${item.fontSize}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = item.color;
  lines.forEach((line, i) => ctx.fillText(line, item.x, item.y + i * lineHeight));
}

function drawItem(ctx: CanvasRenderingContext2D, item: Item) {
  if (item.type === 'stroke') drawStrokeItem(ctx, item.points, item.color, item.width);
  else drawTextItem(ctx, item);
}

export default function SketchOverCanvas({ imageUrl, onSave, onClose }: SketchOverCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#FF0000');
  const [lineWidth, setLineWidth] = useState(3);
  const [items, setItems] = useState<Item[]>([]);
  const [undoStack, setUndoStack] = useState<Item[][]>([]);
  const [redoStack, setRedoStack] = useState<Item[][]>([]);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Zoom & pan state
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [canvasRes, setCanvasRes] = useState({ width: 0, height: 0 });

  // Live mirrors so the render path can stay stable (no rebuild on every zoom tick).
  const scaleRef = useRef(scale); scaleRef.current = scale;
  const lineWidthRef = useRef(lineWidth); lineWidthRef.current = lineWidth;

  // Inline text editor state
  const [editing, setEditing] = useState<
    | { id?: string; x: number; y: number; value: string; color: string; fontSize: number; leader?: Point }
    | null
  >(null);
  const editingRef = useRef(false);
  useEffect(() => { editingRef.current = editing !== null; }, [editing]);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Interaction refs (mutable, not rendered directly)
  const draftRef = useRef<{ points: Point[]; color: string; width: number } | null>(null);
  const arrowPreviewRef = useRef<{ from: Point; to: Point; color: string } | null>(null);
  const textGestureRef = useRef<{ start: Point; moved: boolean } | null>(null);
  const preEraseRef = useRef<Item[] | null>(null);
  const erasedAnythingRef = useRef(false);
  const activePointers = useRef<Map<number, { x: number; y: number; type: string }>>(new Map());
  const pinchRef = useRef<{ lastDist: number; lastMid: Point }>({ lastDist: 0, lastMid: { x: 0, y: 0 } });
  const rafRef = useRef<number | null>(null);
  const idRef = useRef(0);
  const genId = () => `i${idRef.current++}`;

  // --- Load background image and fit to container ---
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setBgImage(img);
      setCanvasRes({ width: img.width, height: img.height });
      fitToScreen(img);
    };
    img.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  const fitToScreen = useCallback((img?: HTMLImageElement) => {
    const image = img || bgImage;
    if (!image || !containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const fitScale = Math.min(cw / image.width, ch / image.height, 1);
    setScale(fitScale);
    setOffset({
      x: (cw - image.width * fitScale) / 2,
      y: (ch - image.height * fitScale) / 2,
    });
  }, [bgImage]);

  // --- Rendering: offscreen "base" (bg + committed items), composited to the visible canvas ---
  const renderBase = useCallback(() => {
    const base = baseCanvasRef.current;
    if (!base || !bgImage) return;
    const ctx = base.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, base.width, base.height);
    ctx.drawImage(bgImage, 0, 0, base.width, base.height);
    for (const item of items) drawItem(ctx, item);
  }, [bgImage, items]);

  const composite = useCallback(() => {
    const canvas = canvasRef.current;
    const base = baseCanvasRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    const draft = draftRef.current;
    if (draft && draft.points.length) drawStrokeItem(ctx, draft.points, draft.color, draft.width);
    const arrow = arrowPreviewRef.current;
    if (arrow) {
      drawLeaderLine(ctx, arrow.from, arrow.to, arrow.color, Math.max(lineWidthRef.current / scaleRef.current / 2, 2));
    }
  }, []);

  // Create/size the offscreen base canvas only when the image resolution changes.
  useEffect(() => {
    if (canvasRes.width === 0) return;
    if (!baseCanvasRef.current) baseCanvasRef.current = document.createElement('canvas');
    baseCanvasRef.current.width = canvasRes.width;
    baseCanvasRef.current.height = canvasRes.height;
  }, [canvasRes]);

  // Paint base (bg + committed items) and composite to the visible canvas when
  // items/bgImage change (renderBase identity) or the canvas is (re)sized.
  useEffect(() => { renderBase(); composite(); }, [renderBase, composite, canvasRes]);

  const scheduleComposite = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      composite();
    });
  }, [composite]);

  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  // --- Coordinate conversion ---
  const getCanvasPoint = useCallback((clientX: number, clientY: number): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offset.x) / scale,
      y: (clientY - rect.top - offset.y) / scale,
    };
  }, [offset, scale]);

  // --- Undo / redo (snapshot history) ---
  const commit = useCallback((next: Item[]) => {
    setUndoStack((s) => [...s, items]);
    setRedoStack([]);
    setItems(next);
  }, [items]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const snapshot = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, items]);
    setItems(snapshot);
    setUndoStack((s) => s.slice(0, -1));
  }, [undoStack, items]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const snapshot = redoStack[redoStack.length - 1];
    setUndoStack((s) => [...s, items]);
    setItems(snapshot);
    setRedoStack((r) => r.slice(0, -1));
  }, [redoStack, items]);

  // Keyboard: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (typing) return; // let the text field own its own undo
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // --- Eraser: remove whole items under the pointer ---
  const eraserRadius = () => Math.max(lineWidth * 2, 10) / scale;

  const eraseAt = (p: Point) => {
    const radius = eraserRadius();
    setItems((prev) => {
      const next = prev.filter((it) => !hitTestItem(it, p, radius));
      if (next.length !== prev.length) erasedAnythingRef.current = true;
      return next.length === prev.length ? prev : next;
    });
  };

  // --- Text editor ---
  const openTextEditor = (loc: Point, existing?: Extract<Item, { type: 'text' }>, leader?: Point) => {
    if (existing) {
      setEditing({
        id: existing.id, x: existing.x, y: existing.y, value: existing.text,
        color: existing.color, fontSize: existing.fontSize, leader: existing.leader,
      });
    } else {
      setEditing({
        x: loc.x, y: loc.y, value: '', color, fontSize: (18 + lineWidth * 3) / scale, leader,
      });
    }
  };

  const commitText = () => {
    const e = editing;
    setEditing(null);
    if (!e) return;
    const value = e.value.trim();
    if (!value) {
      // Empty text: remove the item if editing an existing one, else discard.
      if (e.id) commit(items.filter((it) => it.id !== e.id));
      return;
    }
    const textItem: Item = {
      id: e.id ?? genId(), type: 'text', x: e.x, y: e.y, text: value,
      color: e.color, fontSize: e.fontSize, leader: e.leader,
    };
    if (e.id) commit(items.map((it) => (it.id === e.id ? textItem : it)));
    else commit([...items, textItem]);
  };

  // --- Pointer interaction ---
  const hasActivePen = () =>
    Array.from(activePointers.current.values()).some((p) => p.type === 'pen');

  const handlePinch = () => {
    const pts = Array.from(activePointers.current.values());
    if (pts.length < 2) return;
    const [p1, p2] = pts;
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const rect = containerRef.current?.getBoundingClientRect();
    if (pinchRef.current.lastDist > 0 && rect) {
      const newScale = Math.min(Math.max(scale * (dist / pinchRef.current.lastDist), 0.2), 5);
      const relX = midX - rect.left;
      const relY = midY - rect.top;
      setOffset({
        x: relX - (relX - offset.x) * (newScale / scale),
        y: relY - (relY - offset.y) * (newScale / scale),
      });
      setScale(newScale);
    }
    if (pinchRef.current.lastDist > 0) {
      setOffset((prev) => ({
        x: prev.x + (midX - pinchRef.current.lastMid.x),
        y: prev.y + (midY - pinchRef.current.lastMid.y),
      }));
    }
    pinchRef.current = { lastDist: dist, lastMid: { x: midX, y: midY } };
  };

  const cancelDraft = () => {
    draftRef.current = null;
    arrowPreviewRef.current = null;
    textGestureRef.current = null;
    preEraseRef.current = null;
    scheduleComposite();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    // Palm rejection: ignore touch while a pen is drawing.
    if (e.pointerType === 'touch' && hasActivePen()) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    if (activePointers.current.size >= 2) {
      cancelDraft();
      const pts = Array.from(activePointers.current.values());
      pinchRef.current = {
        lastDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        lastMid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      };
      return;
    }

    if (editingRef.current) return; // a click-away commit is handled by the input's blur

    const point = getCanvasPoint(e.clientX, e.clientY);
    if (tool === 'pen') {
      draftRef.current = { points: [point], color, width: lineWidth / scale };
      scheduleComposite();
    } else if (tool === 'eraser') {
      preEraseRef.current = items;
      erasedAnythingRef.current = false;
      eraseAt(point);
    } else if (tool === 'text') {
      textGestureRef.current = { start: point, moved: false };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const ap = activePointers.current;
    if (!ap.has(e.pointerId)) return;
    ap.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    if (ap.size >= 2) { handlePinch(); return; }

    if (tool === 'pen' && draftRef.current) {
      const ne = e.nativeEvent as PointerEvent;
      const coalesced = typeof ne.getCoalescedEvents === 'function' ? ne.getCoalescedEvents() : [];
      const events = coalesced.length ? coalesced : [ne];
      for (const ev of events) draftRef.current.points.push(getCanvasPoint(ev.clientX, ev.clientY));
      scheduleComposite();
    } else if (tool === 'eraser' && preEraseRef.current) {
      eraseAt(getCanvasPoint(e.clientX, e.clientY));
    } else if (tool === 'text' && textGestureRef.current) {
      const cur = getCanvasPoint(e.clientX, e.clientY);
      const start = textGestureRef.current.start;
      if (Math.hypot(cur.x - start.x, cur.y - start.y) > 8 / scale) {
        textGestureRef.current.moved = true;
        // Drag = leader arrow: press point is the tip, cursor is where the label will sit.
        arrowPreviewRef.current = { from: cur, to: start, color };
        scheduleComposite();
      }
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    const ap = activePointers.current;
    const last = ap.get(e.pointerId);
    ap.delete(e.pointerId);
    try { (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }

    if (ap.size >= 1) { pinchRef.current.lastDist = 0; return; }

    if (tool === 'pen' && draftRef.current) {
      const d = draftRef.current;
      draftRef.current = null;
      if (d.points.length > 0) {
        commit([...items, { id: genId(), type: 'stroke', points: d.points, color: d.color, width: d.width }]);
      } else {
        composite();
      }
    } else if (tool === 'eraser') {
      if (erasedAnythingRef.current && preEraseRef.current) {
        setUndoStack((s) => [...s, preEraseRef.current as Item[]]);
        setRedoStack([]);
      }
      preEraseRef.current = null;
      erasedAnythingRef.current = false;
    } else if (tool === 'text' && textGestureRef.current) {
      const g = textGestureRef.current;
      textGestureRef.current = null;
      arrowPreviewRef.current = null;
      scheduleComposite();
      if (g.moved && last) {
        openTextEditor(getCanvasPoint(last.x, last.y), undefined, g.start);
      } else {
        // Tap: edit an existing label if hit, else place a new one.
        const hit = [...items].reverse().find(
          (it): it is Extract<Item, { type: 'text' }> =>
            it.type === 'text' && hitTestItem(it, g.start, 10 / scale),
        );
        if (hit) openTextEditor({ x: hit.x, y: hit.y }, hit);
        else openTextEditor(g.start);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const newScale = Math.min(Math.max(scale * (e.deltaY < 0 ? 1.1 : 0.9), 0.2), 5);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;
      setOffset({
        x: relX - (relX - offset.x) * (newScale / scale),
        y: relY - (relY - offset.y) * (newScale / scale),
      });
    }
    setScale(newScale);
  };

  const zoomBy = (factor: number) => {
    const newScale = Math.min(Math.max(scale * factor, 0.2), 5);
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth / 2;
      const ch = containerRef.current.clientHeight / 2;
      setOffset((prev) => ({
        x: cw - (cw - prev.x) * (newScale / scale),
        y: ch - (ch - prev.y) * (newScale / scale),
      }));
    }
    setScale(newScale);
  };

  const handleClear = () => { if (items.length) commit([]); };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setSaveStatus('idle');
    // Ensure the visible canvas reflects the latest committed items (no draft in flight).
    renderBase();
    composite();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
    if (!blob) { setSaving(false); setSaveStatus('error'); return; }

    try {
      await onSave(blob);
      setSaveStatus('success');
      setTimeout(() => onClose(), 800);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const displayW = canvasRes.width * scale;
  const displayH = canvasRes.height * scale;
  const cursor = tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : 'crosshair';

  return (
    <Box sx={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 1400, bgcolor: '#1a1a1a', display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Top toolbar */}
      <Paper elevation={2} sx={{
        display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5,
        borderRadius: 0, bgcolor: '#fff', zIndex: 1, flexShrink: 0,
      }}>
        <IconButton onClick={onClose} size="small" aria-label="Close"><CloseIcon /></IconButton>
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
          Draw Corrections
        </Typography>
        <Tooltip title="Undo (Ctrl+Z)">
          <span>
            <IconButton onClick={undo} disabled={undoStack.length === 0} size="small" aria-label="Undo">
              <UndoOutlinedIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo (Ctrl+Shift+Z)">
          <span>
            <IconButton onClick={redo} disabled={redoStack.length === 0} size="small" aria-label="Redo">
              <RedoOutlinedIcon />
            </IconButton>
          </span>
        </Tooltip>
        <IconButton onClick={handleClear} disabled={items.length === 0} size="small" aria-label="Clear all">
          <DeleteOutlineIcon />
        </IconButton>
        {saveStatus === 'success' ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main', ml: 0.5 }}>
            <CheckCircleIcon fontSize="small" />
            <Typography variant="body2" fontWeight={600}>Saved!</Typography>
          </Box>
        ) : saveStatus === 'error' ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
            <ErrorOutlineIcon fontSize="small" color="error" />
            <Button size="small" variant="contained" color="error" onClick={handleSave} sx={{ textTransform: 'none', minHeight: 36 }}>
              Retry
            </Button>
          </Box>
        ) : (
          <Button
            variant="contained" size="small" startIcon={<SaveOutlinedIcon />}
            onClick={handleSave} disabled={saving}
            sx={{ textTransform: 'none', minHeight: 36, ml: 0.5 }}
          >
            {saving ? 'Uploading...' : 'Save'}
          </Button>
        )}
      </Paper>

      {/* Canvas area */}
      <Box
        ref={containerRef}
        sx={{ flex: 1, overflow: 'hidden', position: 'relative', bgcolor: '#2a2a2a', cursor }}
        onWheel={handleWheel}
      >
        {canvasRes.width > 0 && (
          <canvas
            ref={canvasRef}
            width={canvasRes.width}
            height={canvasRes.height}
            style={{
              position: 'absolute',
              left: offset.x,
              top: offset.y,
              width: displayW,
              height: displayH,
              touchAction: 'none',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
          />
        )}

        {/* Inline text editor */}
        {editing && (
          <input
            ref={textInputRef}
            autoFocus
            value={editing.value}
            onChange={(e) => setEditing((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitText(); }
              else if (e.key === 'Escape') { e.preventDefault(); setEditing(null); }
            }}
            placeholder="Type label…"
            style={{
              position: 'absolute',
              left: editing.x * scale + offset.x,
              top: editing.y * scale + offset.y,
              fontSize: Math.max(editing.fontSize * scale, 12),
              fontFamily: FONT_FAMILY,
              fontWeight: 600,
              color: editing.color,
              background: 'rgba(255,255,255,0.9)',
              border: `2px solid ${editing.color}`,
              borderRadius: 4,
              padding: '2px 6px',
              outline: 'none',
              minWidth: 80,
              zIndex: 3,
            }}
          />
        )}

        {/* Zoom controls */}
        <Box sx={{
          position: 'absolute', bottom: 12, right: 12, display: 'flex',
          flexDirection: 'column', gap: 0.5, zIndex: 2,
        }}>
          <Tooltip title="Zoom in" placement="left">
            <IconButton onClick={() => zoomBy(1.3)} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.9)', '&:hover': { bgcolor: '#fff' } }}>
              <ZoomInOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom out" placement="left">
            <IconButton onClick={() => zoomBy(0.7)} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.9)', '&:hover': { bgcolor: '#fff' } }}>
              <ZoomOutOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Fit to screen" placement="left">
            <IconButton onClick={() => fitToScreen()} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.9)', '&:hover': { bgcolor: '#fff' } }}>
              <FitScreenOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Typography sx={{
          position: 'absolute', bottom: 12, left: 12,
          color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem',
          bgcolor: 'rgba(0,0,0,0.5)', px: 1, py: 0.25, borderRadius: 1,
        }}>
          {Math.round(scale * 100)}%
        </Typography>
      </Box>

      {/* Bottom toolbar */}
      <Paper elevation={4} sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1,
        borderRadius: 0, flexWrap: 'wrap', flexShrink: 0,
      }}>
        <ToggleButtonGroup value={tool} exclusive onChange={(_, v) => v && setTool(v)} size="small">
          <ToggleButton value="pen" sx={{ px: 1.5, gap: 0.5, textTransform: 'none' }}>
            <CreateOutlinedIcon sx={{ fontSize: 18 }} />
            <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>Pen</Typography>
          </ToggleButton>
          <ToggleButton value="eraser" sx={{ px: 1.5, gap: 0.5, textTransform: 'none' }}>
            <Box sx={{
              width: 16, height: 16, borderRadius: '50%', border: '2px solid',
              borderColor: tool === 'eraser' ? 'primary.main' : 'text.secondary',
              bgcolor: tool === 'eraser' ? 'primary.light' : 'transparent',
            }} />
            <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>Eraser</Typography>
          </ToggleButton>
          <ToggleButton value="text" sx={{ px: 1.5, gap: 0.5, textTransform: 'none' }}>
            <TextFieldsIcon sx={{ fontSize: 18 }} />
            <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>Text</Typography>
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Color picker */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {COLORS.map((c) => (
            <Box
              key={c}
              onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen'); }}
              sx={{
                width: 28, height: 28, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                border: color === c && tool !== 'eraser' ? '3px solid' : '2px solid',
                borderColor: color === c && tool !== 'eraser' ? 'primary.main' : 'divider',
                transition: 'transform 0.1s',
                '&:hover': { transform: 'scale(1.15)' },
              }}
            />
          ))}
        </Box>

        {/* Size (pen thickness / text size) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.secondary' }} />
          <Slider
            value={lineWidth}
            onChange={(_, v) => setLineWidth(v as number)}
            min={1} max={12} step={1} size="small"
            sx={{ width: 80 }}
            aria-label={tool === 'text' ? 'Text size' : 'Pen thickness'}
          />
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'text.secondary' }} />
        </Box>
      </Paper>
    </Box>
  );
}
