'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, TextField, IconButton, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { NexusStudyAnnotationDTO, NexusStudyAnnotationPoint } from '@neram/database/types';

export type AnnotationTool = 'pen' | 'highlighter' | 'note' | 'eraser';

const PEN_WIDTH_PX = 2.5;
const HIGHLIGHTER_WIDTH_PX = 14;
const NOTE_BADGE_PX = 22;
const ERASE_HIT_PX = 18;
const TAP_MOVE_THRESHOLD_PX = 4;

interface PDFAnnotationLayerProps {
  annotations: NexusStudyAnnotationDTO[]; // already filtered to this page
  /** Pointer-interactive at all (annotate mode is on for this file). */
  active: boolean;
  tool: AnnotationTool;
  color: string;
  onCreateStroke: (kind: 'pen' | 'highlighter', points: NexusStudyAnnotationPoint[]) => void;
  onCreateNote: (anchor: NexusStudyAnnotationPoint, text: string) => void;
  onUpdateNote: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

function pointToPixels(p: NexusStudyAnnotationPoint, w: number, h: number) {
  return { x: p.x * w, y: p.y * h };
}

function pathD(points: NexusStudyAnnotationPoint[], w: number, h: number): string {
  if (points.length === 0) return '';
  const px = points.map((p) => pointToPixels(p, w, h));
  return `M ${px[0].x},${px[0].y} ` + px.slice(1).map((p) => `L ${p.x},${p.y}`).join(' ');
}

/** Shortest distance from a point to a polyline, in the same pixel space as both. */
function distanceToPolyline(pt: { x: number; y: number }, points: { x: number; y: number }[]): number {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    best = Math.min(best, Math.hypot(pt.x - cx, pt.y - cy));
  }
  if (points.length === 1) best = Math.hypot(pt.x - points[0].x, pt.y - points[0].y);
  return best;
}

/** Small popover to write/edit a sticky note's text, positioned at a fractional anchor. */
function NoteEditor({
  anchor,
  initialText,
  onSave,
  onDelete,
  onClose,
}: {
  anchor: NexusStudyAnnotationPoint;
  initialText: string;
  onSave: (text: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);
  // The page wrapper clips overflow, so a note near the bottom opens upward instead of
  // downward off the edge. Left/right is left alone: pages are narrow enough that the
  // popover's max-width rarely pushes past the right edge in practice.
  const openUpward = anchor.y > 0.6;
  return (
    <Box
      data-annotation-note
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      sx={{
        position: 'absolute',
        left: `${anchor.x * 100}%`,
        top: `${anchor.y * 100}%`,
        transform: openUpward ? 'translate(-8px, calc(-100% - 12px))' : 'translate(-8px, 12px)',
        zIndex: 20,
        // The overlay's own container turns pointer-events off outside annotate mode
        // (so normal reading/scrolling isn't blocked); a note popover must opt back in
        // explicitly so it stays usable when a student taps a note while just reading.
        pointerEvents: 'auto',
        bgcolor: 'background.paper',
        borderRadius: 1.5,
        boxShadow: 4,
        p: 1,
        minWidth: 220,
        maxWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
      }}
    >
      <TextField
        size="small"
        placeholder="Add a note..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        multiline
        maxRows={4}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (text.trim()) onSave(text.trim());
          }
          if (e.key === 'Escape') onClose();
        }}
        sx={{ '& .MuiInputBase-input': { fontSize: '0.85rem' } }}
      />
      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
        {onDelete && (
          <IconButton size="small" color="error" onClick={onDelete} aria-label="Delete note" sx={{ width: 40, height: 40 }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        )}
        <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ width: 40, height: 40 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          color="primary"
          disabled={!text.trim()}
          onClick={() => text.trim() && onSave(text.trim())}
          aria-label="Save note"
          sx={{ width: 40, height: 40 }}
        >
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>Save</Typography>
        </IconButton>
      </Box>
    </Box>
  );
}

export default function PDFAnnotationLayer({
  annotations,
  active,
  tool,
  color,
  onCreateStroke,
  onCreateNote,
  onUpdateNote,
  onDelete,
}: PDFAnnotationLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<NexusStudyAnnotationPoint[] | null>(null);
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const [creatingNoteAt, setCreatingNoteAt] = useState<NexusStudyAnnotationPoint | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setBox({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toFraction = useCallback((clientX: number, clientY: number): NexusStudyAnnotationPoint | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const eraseNear = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el || !box.w || !box.h) return;
      const rect = el.getBoundingClientRect();
      const tap = { x: clientX - rect.left, y: clientY - rect.top };
      let bestId: string | null = null;
      let bestDist = ERASE_HIT_PX;
      for (const a of annotations) {
        if (a.kind === 'note') {
          const p = pointToPixels({ x: a.anchor_x ?? 0, y: a.anchor_y ?? 0 }, box.w, box.h);
          const d = Math.hypot(tap.x - p.x, tap.y - p.y);
          if (d < bestDist) {
            bestDist = d;
            bestId = a.id;
          }
        } else if (a.points) {
          const px = a.points.map((p) => pointToPixels(p, box.w, box.h));
          const d = distanceToPolyline(tap, px);
          if (d < bestDist) {
            bestDist = d;
            bestId = a.id;
          }
        }
      }
      if (bestId) onDelete(bestId);
    },
    [annotations, box, onDelete],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-annotation-note]')) return; // let the badge/editor handle its own click
      const pt = toFraction(e.clientX, e.clientY);
      if (!pt) return;
      downRef.current = { x: e.clientX, y: e.clientY };
      if (tool === 'pen' || tool === 'highlighter') {
        setDraft([pt]);
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }
    },
    [active, tool, toFraction],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draft) return;
      const pt = toFraction(e.clientX, e.clientY);
      if (!pt) return;
      setDraft((prev) => (prev ? [...prev, pt] : prev));
    },
    [draft, toFraction],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      const down = downRef.current;
      downRef.current = null;
      const movedFar = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_MOVE_THRESHOLD_PX : false;

      if ((tool === 'pen' || tool === 'highlighter') && draft) {
        const points = draft;
        setDraft(null);
        if (movedFar && points.length >= 2) onCreateStroke(tool, points);
        return;
      }
      if (tool === 'eraser' && !movedFar) {
        eraseNear(e.clientX, e.clientY);
        return;
      }
      if (tool === 'note' && !movedFar) {
        const pt = toFraction(e.clientX, e.clientY);
        if (pt) setCreatingNoteAt(pt);
      }
    },
    [active, tool, draft, onCreateStroke, eraseNear, toFraction],
  );

  const editingNote = editingNoteId ? annotations.find((a) => a.id === editingNoteId) : null;

  return (
    <Box
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      sx={{
        position: 'absolute',
        inset: 0,
        pointerEvents: active ? 'auto' : 'none',
        touchAction: active ? 'none' : 'auto',
        cursor: active ? (tool === 'eraser' ? 'crosshair' : 'default') : 'default',
        userSelect: 'none',
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${box.w || 1} ${box.h || 1}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {annotations
          .filter((a) => a.kind !== 'note' && a.points)
          .map((a) => (
            <path
              key={a.id}
              d={pathD(a.points as NexusStudyAnnotationPoint[], box.w, box.h)}
              stroke={a.color}
              strokeWidth={a.kind === 'highlighter' ? HIGHLIGHTER_WIDTH_PX : PEN_WIDTH_PX}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={a.kind === 'highlighter' ? 0.4 : 0.92}
              style={a.kind === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined}
            />
          ))}
        {draft && (
          <path
            d={pathD(draft, box.w, box.h)}
            stroke={color}
            strokeWidth={tool === 'highlighter' ? HIGHLIGHTER_WIDTH_PX : PEN_WIDTH_PX}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={tool === 'highlighter' ? 0.4 : 0.92}
            style={tool === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined}
          />
        )}
      </svg>

      {annotations
        .filter((a) => a.kind === 'note')
        .map((a) => (
          <Box
            key={a.id}
            data-annotation-note
            onClick={(e) => {
              e.stopPropagation();
              setEditingNoteId(a.id);
            }}
            title={a.note_text || ''}
            sx={{
              position: 'absolute',
              left: `${(a.anchor_x ?? 0) * 100}%`,
              top: `${(a.anchor_y ?? 0) * 100}%`,
              width: NOTE_BADGE_PX,
              height: NOTE_BADGE_PX,
              ml: `-${NOTE_BADGE_PX / 2}px`,
              mt: `-${NOTE_BADGE_PX / 2}px`,
              borderRadius: '50%',
              bgcolor: a.color,
              border: '2px solid #fff',
              boxShadow: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              pointerEvents: 'auto',
              fontSize: '0.7rem',
            }}
          >
            📝
          </Box>
        ))}

      {creatingNoteAt && (
        <NoteEditor
          anchor={creatingNoteAt}
          initialText=""
          onClose={() => setCreatingNoteAt(null)}
          onSave={(text) => {
            onCreateNote(creatingNoteAt, text);
            setCreatingNoteAt(null);
          }}
        />
      )}

      {editingNote && (
        <NoteEditor
          anchor={{ x: editingNote.anchor_x ?? 0, y: editingNote.anchor_y ?? 0 }}
          initialText={editingNote.note_text || ''}
          onClose={() => setEditingNoteId(null)}
          onDelete={() => {
            onDelete(editingNote.id);
            setEditingNoteId(null);
          }}
          onSave={(text) => {
            onUpdateNote(editingNote.id, text);
            setEditingNoteId(null);
          }}
        />
      )}
    </Box>
  );
}
