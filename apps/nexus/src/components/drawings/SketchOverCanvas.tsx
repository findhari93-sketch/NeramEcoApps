'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Box, Button, IconButton, ToggleButton, ToggleButtonGroup,
  Typography, Paper, Tooltip,
} from '@neram/ui';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import RedoOutlinedIcon from '@mui/icons-material/RedoOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import CloseIcon from '@mui/icons-material/Close';
import CreateOutlinedIcon from '@mui/icons-material/CreateOutlined';
import BorderColorOutlinedIcon from '@mui/icons-material/BorderColorOutlined';
import ImageNotSupportedOutlinedIcon from '@mui/icons-material/ImageNotSupportedOutlined';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import FitScreenOutlinedIcon from '@mui/icons-material/FitScreenOutlined';
import ZoomInOutlinedIcon from '@mui/icons-material/ZoomInOutlined';
import ZoomOutOutlinedIcon from '@mui/icons-material/ZoomOutOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { arrowHead, hitTestItem, textBounds, type CanvasItem, type Point } from '../../lib/sketch-geometry';
import { buildStrokeOutline, smoothCentreline, splitStrokeAtHits } from '../../lib/sketch-stroke';
import { normPoint, type SketchOp } from '../../lib/sketch-timeline';

/**
 * Set while a voice walkthrough is being recorded: every change to the canvas is
 * stamped against the recording's clock so the student can watch it happen in
 * time with the teacher's voice. Absent, this canvas behaves exactly as before.
 */
export interface SketchRecording {
  /** performance.now() at the moment recording started. */
  startedAt: number;
  onOp: (op: SketchOp) => void;
}

interface SketchOverCanvasProps {
  imageUrl: string;
  onSave: (blob: Blob) => Promise<void> | void;
  onClose: () => void;
  recording?: SketchRecording | null;
  /** Recording controls, shown in the top toolbar beside Undo and Save. */
  headerExtra?: React.ReactNode;
  /** Save is held while a walkthrough is still recording. */
  saveDisabled?: boolean;
  saveLabel?: string;
  /** The drawing's own pixel size once it loads. Recorded points are fractions of it. */
  onImageSize?: (size: { w: number; h: number }) => void;
}

type Tool = 'pen' | 'highlighter' | 'eraser' | 'text';
type Item = CanvasItem;

/**
 * Three marks, not six colours.
 *
 * Each maps onto the marker vocabulary drawing_annotation already stores
 * (problem / good / guide), so a saved stroke says what KIND of mark it is
 * rather than only what colour it happened to be.
 */
const COLORS = [
  { hex: '#DC2626', marker: 'problem', label: 'Correction' },
  { hex: '#16A34A', marker: 'good', label: 'This works' },
  { hex: '#2563EB', marker: 'guide', label: 'Guide line' },
] as const;

/** Nib widths in image pixels. Three sizes beat a 1 to 12 slider nobody reads. */
const NIBS = [
  { key: 'fine', label: 'Fine', width: 2 },
  { key: 'medium', label: 'Medium', width: 4 },
  { key: 'marker', label: 'Marker', width: 9 },
] as const;
type NibKey = (typeof NIBS)[number]['key'];

/**
 * Comment size as a fraction of the IMAGE height, never of the screen.
 *
 * It used to be `(18 + lineWidth * 3) / scale`, two faults in one expression:
 * the pen slider drove it, and dividing by the zoom anchored it to the screen.
 * A label was therefore a constant 27 CSS px whatever the sheet's resolution,
 * which is why comments landed far too large with no way to control them. As a
 * fraction of the drawing, Medium on a 1600px-tall sheet reads at about 12px at
 * fit, and keeps reading at about 12px on a phone, a laptop and a pen display.
 */
const TEXT_FRACTIONS = { S: 0.014, M: 0.018, L: 0.024 } as const;
type TextSize = keyof typeof TEXT_FRACTIONS;

/** Alpha for the highlighter, which lays ink under the student's own lines. */
const HIGHLIGHT_ALPHA = 0.32;

/**
 * Speed at which a synthesised stroke reaches its thinnest, in image px per ms.
 *
 * A mouse reports a flat 0.5 pressure and a finger reports 0 or 1, so neither
 * can taper on its own. Deriving it from speed is what keeps a correction drawn
 * with a mouse looking like the same hand as one drawn with the Wacom.
 */
const SYNTH_MAX_SPEED = 2.2;

const FONT_FAMILY = "'Segoe UI', system-ui, -apple-system, sans-serif";

/** Pressure for one sample, real where the device reports it and speed-derived where it does not. */
function readPressure(
  real: boolean,
  raw: number,
  prev: Point | undefined,
  next: Point,
  dtMs: number,
): number {
  if (real) return Math.max(0, Math.min(1, raw));
  if (!prev || dtMs <= 0) return 0.8;
  const speed = Math.hypot(next.x - prev.x, next.y - prev.y) / dtMs;
  return Math.max(0, Math.min(1, 1 - speed / SYNTH_MAX_SPEED));
}

// --- Pure canvas drawing helpers (operate on any 2D context) ---

/**
 * A stroke as a filled outline rather than a stroked path.
 *
 * `ctx.stroke()` carries one lineWidth for the whole path, so it cannot taper:
 * every correction landed at the same weight whatever the teacher did with the
 * pen. The centreline is smoothed first, on the same quadratic-midpoint curve
 * the old renderer used, then offset by half the width scaled by pressure, so
 * one fill paints the mark with no seams where the width changes.
 */
function drawStrokeItem(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  width: number,
  pressures?: number[],
  highlight?: boolean,
) {
  if (points.length === 0) return;
  const smoothed = smoothCentreline(points, pressures);
  const outline = buildStrokeOutline(smoothed.points, smoothed.pressures, width);
  if (outline.length === 0) return;

  ctx.save();
  if (highlight) {
    // multiply keeps the student's pencil visible through the highlight.
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = HIGHLIGHT_ALPHA;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(outline[0].x, outline[0].y);
  for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
  if (item.type === 'stroke') {
    drawStrokeItem(ctx, item.points, item.color, item.width, item.pressures, item.highlight);
  } else {
    drawTextItem(ctx, item);
  }
}

export default function SketchOverCanvas({
  imageUrl,
  onSave,
  onClose,
  recording = null,
  headerExtra,
  saveDisabled = false,
  saveLabel = 'Save',
  onImageSize,
}: SketchOverCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(COLORS[0].hex);
  const [nib, setNib] = useState<NibKey>('medium');
  const [textSize, setTextSize] = useState<TextSize>('M');
  // The highlighter is deliberately fat: it is for circling an area, not drawing.
  const lineWidth = (NIBS.find((n) => n.key === nib)?.width ?? 4) * (tool === 'highlighter' ? 4 : 1);
  const [items, setItems] = useState<Item[]>([]);
  const [undoStack, setUndoStack] = useState<Item[][]>([]);
  const [redoStack, setRedoStack] = useState<Item[][]>([]);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [bgError, setBgError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
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
  // `times` is filled only while recording: one stamp per point, so the replay
  // draws at the speed the teacher drew rather than all at once.
  const draftRef = useRef<{
    points: Point[];
    color: string;
    width: number;
    times: number[];
    pressures: number[];
    highlight: boolean;
    /** A stylus reports real pressure; a mouse and a finger do not. */
    realPressure: boolean;
    lastAt: number;
  } | null>(null);
  const arrowPreviewRef = useRef<{ from: Point; to: Point; color: string } | null>(null);
  const textGestureRef = useRef<{ start: Point; moved: boolean } | null>(null);
  const preEraseRef = useRef<Item[] | null>(null);
  const erasedAnythingRef = useRef(false);
  const activePointers = useRef<Map<number, { x: number; y: number; type: string }>>(new Map());
  const pinchRef = useRef<{ lastDist: number; lastMid: Point }>({ lastDist: 0, lastMid: { x: 0, y: 0 } });
  const rafRef = useRef<number | null>(null);
  const idRef = useRef(0);
  const genId = () => `i${idRef.current++}`;

  // Recording lives in refs so the pointer handlers never need rebinding, and a
  // canvas nobody is recording pays nothing for any of it.
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const canvasResRef = useRef(canvasRes);
  canvasResRef.current = canvasRes;

  /** Milliseconds since the voice recording started. */
  const stamp = () => (recordingRef.current ? performance.now() - recordingRef.current.startedAt : 0);

  const emit = useCallback((op: SketchOp) => {
    recordingRef.current?.onOp(op);
  }, []);

  /** Undo, redo, the eraser and Clear all reduce to "these are the items now". */
  const emitShow = useCallback((next: Item[]) => {
    if (!recordingRef.current) return;
    recordingRef.current.onOp({ t: stamp(), k: 'show', ids: next.map((i) => i.id) });
  }, []);

  // --- Load background image and fit to container ---
  //
  // crossOrigin is required so the finished markup can be read back out with
  // toBlob(). It also means a host that sends no CORS headers fails the load
  // outright, and the <canvas> below is gated on the size this sets. Before
  // onerror existed, that pair left the teacher looking at a working toolbar
  // over an empty dark box, with no message, for as long as they cared to wait.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    setBgError(false);
    img.onload = () => {
      setBgImage(img);
      setCanvasRes({ width: img.width, height: img.height });
      fitToScreen(img);
      onImageSize?.({ w: img.width, h: img.height });
    };
    img.onerror = () => setBgError(true);
    img.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, loadAttempt]);

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
    if (draft && draft.points.length) {
      drawStrokeItem(ctx, draft.points, draft.color, draft.width, draft.pressures, draft.highlight);
    }
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
    emitShow(snapshot);
    setUndoStack((s) => s.slice(0, -1));
  }, [undoStack, items, emitShow]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const snapshot = redoStack[redoStack.length - 1];
    setUndoStack((s) => [...s, items]);
    setItems(snapshot);
    emitShow(snapshot);
    setRedoStack((r) => r.slice(0, -1));
  }, [redoStack, items, emitShow]);

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

  // --- Eraser: rub out the part of a mark it actually touched ---
  //
  // It used to delete whole items. Correcting over a student's lines means many
  // long overlapping strokes, and losing a 300-point line because the eraser
  // grazed its tail is the single most enraging thing this tool did. A stroke
  // now comes back as the pieces that survived; a label still goes as a whole,
  // because half a sentence is not a correction.
  const eraserRadius = () => Math.max(lineWidth * 2, 10) / scale;

  const eraseAt = (p: Point) => {
    const radius = eraserRadius();
    setItems((prev) => {
      let changed = false;
      const next: Item[] = [];
      for (const it of prev) {
        if (it.type !== 'stroke') {
          if (hitTestItem(it, p, radius)) changed = true;
          else next.push(it);
          continue;
        }
        const spans = splitStrokeAtHits(it.points, it.pressures, p, radius);
        const kept = spans.reduce((n, span) => n + span.points.length, 0);
        if (kept === it.points.length) {
          next.push(it);
          continue;
        }
        changed = true;
        // The first surviving piece keeps the original id so any `show` op
        // already emitted for it still refers to something.
        spans.forEach((span, i) => {
          next.push({
            ...it,
            id: i === 0 ? it.id : genId(),
            points: span.points,
            pressures: span.pressures,
          });
        });
      }
      if (changed) {
        erasedAnythingRef.current = true;
        // Emitted here rather than on pointer-up so a quick erase-and-lift cannot
        // leave the rubbed-out item showing in the replay. Repeated identical
        // `show` ops are harmless: the recorder drops the duplicates.
        emitShow(next);
      }
      return changed ? next : prev;
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
        x: loc.x,
        y: loc.y,
        value: '',
        color,
        // A fraction of the drawing, not of the screen. See TEXT_FRACTIONS.
        fontSize: TEXT_FRACTIONS[textSize] * (canvasRes.height || 1000),
        leader,
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
      if (e.id) {
        const next = items.filter((it) => it.id !== e.id);
        commit(next);
        emitShow(next);
      }
      return;
    }
    const textItem: Item = {
      id: e.id ?? genId(), type: 'text', x: e.x, y: e.y, text: value,
      color: e.color, fontSize: e.fontSize, leader: e.leader,
    };
    if (e.id) commit(items.map((it) => (it.id === e.id ? textItem : it)));
    else commit([...items, textItem]);

    // Re-emitting an edited label under its own id replaces it in the replay.
    const { width: iw, height: ih } = canvasResRef.current;
    if (recordingRef.current && iw > 0 && ih > 0) {
      const at = normPoint({ x: textItem.x, y: textItem.y }, iw, ih);
      const leader = textItem.leader ? normPoint(textItem.leader, iw, ih) : null;
      emit({
        t: stamp(),
        k: 'text',
        id: textItem.id,
        c: textItem.color,
        // A fraction of the image height, so the label keeps its size on a phone.
        fs: textItem.fontSize / ih,
        x: at.x,
        y: at.y,
        s: textItem.text,
        ...(leader ? { lx: leader.x, ly: leader.y } : {}),
      });
    }
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
    if (tool === 'pen' || tool === 'highlighter') {
      // Decided once per stroke: a device either reports usable pressure or it
      // does not, and switching mid-stroke would make the line jump.
      const realPressure = e.pointerType === 'pen' && e.pressure > 0 && e.pressure !== 0.5;
      draftRef.current = {
        points: [point],
        color,
        width: lineWidth / scale,
        times: [stamp()],
        pressures: [readPressure(realPressure, e.pressure, undefined, point, 0)],
        highlight: tool === 'highlighter',
        realPressure,
        lastAt: performance.now(),
      };
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

    if ((tool === 'pen' || tool === 'highlighter') && draftRef.current) {
      const ne = e.nativeEvent as PointerEvent;
      // Each coalesced event carries its own pressure, which is the whole reason
      // a 240Hz stylus can taper within a single animation frame.
      const coalesced = typeof ne.getCoalescedEvents === 'function' ? ne.getCoalescedEvents() : [];
      const events = coalesced.length ? coalesced : [ne];
      const draft = draftRef.current;
      for (const ev of events) {
        const point = getCanvasPoint(ev.clientX, ev.clientY);
        const now = performance.now();
        const prev = draft.points[draft.points.length - 1];
        draft.points.push(point);
        draft.times.push(stamp());
        draft.pressures.push(
          readPressure(draft.realPressure, ev.pressure, prev, point, now - draft.lastAt),
        );
        draft.lastAt = now;
      }
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

    if ((tool === 'pen' || tool === 'highlighter') && draftRef.current) {
      const d = draftRef.current;
      draftRef.current = null;
      if (d.points.length > 0) {
        const id = genId();
        commit([...items, {
          id,
          type: 'stroke',
          points: d.points,
          color: d.color,
          width: d.width,
          pressures: d.pressures,
          highlight: d.highlight,
        }]);

        const { width: iw, height: ih } = canvasResRef.current;
        if (recordingRef.current && iw > 0 && ih > 0) {
          const startedAt = d.times[0] ?? stamp();
          // The pen's width is divided by the zoom, and a canvas measured before
          // it has been laid out has a zoom of zero. That made this Infinity, and
          // an infinite number is not a width the replay could ever store.
          const penWidth = Number.isFinite(d.width) && d.width > 0 ? d.width : lineWidth;
          const spread = d.pressures.length
            ? Math.max(...d.pressures) - Math.min(...d.pressures)
            : 0;
          const varies = spread > 0.08;
          emit({
            t: startedAt,
            k: 'stroke',
            id,
            c: d.color,
            // Held as a fraction of the image width, so a line drawn on a laptop
            // keeps its weight when it replays on a phone.
            wd: Math.min(penWidth / iw, 0.2),
            // Pressure rides in an optional fourth slot. A stroke whose weight
            // never really varied sends three, so a steady mouse line does not
            // pay for a number that says nothing. See sketch-timeline.ts.
            p: d.points.map((point, i) => {
              const at = normPoint(point, iw, ih);
              const dt = Math.max(0, Math.round((d.times[i] ?? startedAt) - startedAt));
              if (!varies) return [dt, at.x, at.y] as [number, number, number];
              return [dt, at.x, at.y, Math.round((d.pressures[i] ?? 1) * 100) / 100] as [number, number, number, number];
            }),
          });
        }
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

  const handleClear = () => {
    if (!items.length) return;
    commit([]);
    emitShow([]);
  };

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
        borderRadius: 0, bgcolor: '#fff', zIndex: 1, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <IconButton onClick={onClose} size="small" aria-label="Close"><CloseIcon /></IconButton>
        <Typography
          variant="body2"
          fontWeight={600}
          sx={{
            flex: 1,
            minWidth: 0,
            // Recording controls need the room on a phone, and the title is the
            // one thing in this bar that is not a control.
            display: headerExtra ? { xs: 'none', sm: 'block' } : 'block',
          }}
        >
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
        {headerExtra}
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
            onClick={handleSave} disabled={saving || saveDisabled}
            sx={{ textTransform: 'none', minHeight: 36, ml: 0.5 }}
          >
            {saving ? 'Uploading...' : saveLabel}
          </Button>
        )}
      </Paper>

      {/* Canvas area */}
      <Box
        ref={containerRef}
        sx={{ flex: 1, overflow: 'hidden', position: 'relative', bgcolor: '#2a2a2a', cursor }}
        onWheel={handleWheel}
      >
        {bgError && (
          <Box
            role="alert"
            sx={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 1.5, px: 3, textAlign: 'center',
            }}
          >
            <ImageNotSupportedOutlinedIcon sx={{ fontSize: 40, color: 'rgba(255,255,255,0.6)' }} />
            <Typography sx={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
              This drawing could not be loaded
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', maxWidth: 360 }}>
              Marking it up needs the image itself, not just a preview. Check the connection and try
              again, or close and reopen the review.
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setLoadAttempt((n) => n + 1)}
              sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.5)', minHeight: 44, textTransform: 'none' }}
            >
              Try again
            </Button>
          </Box>
        )}

        {canvasRes.width > 0 && (
          <canvas
            ref={canvasRef}
            aria-label="Drawing canvas"
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
        {/* aria-label on each, so the name survives the label hiding on a phone. */}
        <ToggleButtonGroup
          value={tool}
          exclusive
          onChange={(_, v) => v && setTool(v)}
          size="small"
          sx={{ '& .MuiToggleButton-root': { minHeight: 44 } }}
        >
          <ToggleButton value="pen" aria-label="Pen" sx={{ px: 1.5, gap: 0.5, textTransform: 'none' }}>
            <CreateOutlinedIcon sx={{ fontSize: 18 }} />
            <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>Pen</Typography>
          </ToggleButton>
          <ToggleButton value="highlighter" aria-label="Highlighter" sx={{ px: 1.5, gap: 0.5, textTransform: 'none' }}>
            <BorderColorOutlinedIcon sx={{ fontSize: 18 }} />
            <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>Highlight</Typography>
          </ToggleButton>
          <ToggleButton value="eraser" aria-label="Eraser" sx={{ px: 1.5, gap: 0.5, textTransform: 'none' }}>
            <Box sx={{
              width: 16, height: 16, borderRadius: '50%', border: '2px solid',
              borderColor: tool === 'eraser' ? 'primary.main' : 'text.secondary',
              bgcolor: tool === 'eraser' ? 'primary.light' : 'transparent',
            }} />
            <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>Eraser</Typography>
          </ToggleButton>
          <ToggleButton value="text" aria-label="Text" sx={{ px: 1.5, gap: 0.5, textTransform: 'none' }}>
            <TextFieldsIcon sx={{ fontSize: 18 }} />
            <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>Text</Typography>
          </ToggleButton>
        </ToggleButtonGroup>

        {/* What kind of mark this is, which is also what colour it is. */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          {COLORS.map((c) => {
            const active = color === c.hex && tool !== 'eraser';
            const pick = () => { setColor(c.hex); if (tool === 'eraser') setTool('pen'); };
            return (
              <Tooltip key={c.hex} title={c.label}>
                <Box
                  role="button"
                  tabIndex={0}
                  aria-label={c.label}
                  aria-pressed={active}
                  onClick={pick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
                  }}
                  sx={{
                    width: 44, height: 44, borderRadius: '50%', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                    '&:hover > *': { transform: 'scale(1.12)' },
                  }}
                >
                  <Box sx={{
                    width: 26, height: 26, borderRadius: '50%', bgcolor: c.hex,
                    border: active ? '3px solid' : '2px solid',
                    borderColor: active ? 'primary.main' : 'divider',
                    transition: 'transform 0.1s',
                  }} />
                </Box>
              </Tooltip>
            );
          })}
        </Box>

        {/* The text tool sizes comments; everything else sizes the nib.
            Fixed width on the slot: the two groups are not quite the same size,
            and letting the toolbar reflow made every other control jump sideways
            the moment you picked up the text tool. */}
        <Box sx={{ display: 'flex', justifyContent: 'center', minWidth: 168 }}>
        {tool === 'text' ? (
          <ToggleButtonGroup
            value={textSize}
            exclusive
            onChange={(_, v) => v && setTextSize(v as TextSize)}
            size="small"
            aria-label="Comment size"
            sx={{ '& .MuiToggleButton-root': { minHeight: 44, px: 1.5 } }}
          >
            {(Object.keys(TEXT_FRACTIONS) as TextSize[]).map((key) => (
              <ToggleButton key={key} value={key} aria-label={`Comment size ${key}`}>
                <Typography sx={{
                  fontSize: key === 'S' ? 11 : key === 'M' ? 13 : 16,
                  fontWeight: 700, lineHeight: 1,
                }}>
                  Aa
                </Typography>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        ) : (
          <ToggleButtonGroup
            value={nib}
            exclusive
            onChange={(_, v) => v && setNib(v as NibKey)}
            size="small"
            aria-label="Nib size"
            sx={{ '& .MuiToggleButton-root': { minHeight: 44, px: 1.5 } }}
          >
            {NIBS.map((n) => (
              <ToggleButton key={n.key} value={n.key} aria-label={n.label}>
                <Box sx={{
                  width: 4 + n.width, height: 4 + n.width, borderRadius: '50%',
                  bgcolor: nib === n.key ? 'primary.main' : 'text.secondary',
                }} />
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}
        </Box>
      </Paper>
    </Box>
  );
}
