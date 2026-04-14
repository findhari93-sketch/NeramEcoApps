'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Box, TextField, IconButton, Typography, Chip } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { RegionAnnotation } from '@/lib/drawing-prompt-templates';

interface RegionAnnotationLayerProps {
  annotations: RegionAnnotation[];
  onChange: (annotations: RegionAnnotation[]) => void;
  disabled?: boolean;
}

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

/**
 * Transparent overlay that allows teachers to draw rectangular regions
 * on a student's drawing image and add text comments.
 * Coordinates are stored as percentages (0-100) for resolution independence.
 */
export default function RegionAnnotationLayer({
  annotations,
  onChange,
  disabled = false,
}: RegionAnnotationLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Convert pointer event to percentage coordinates relative to container
  const toPercent = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    // Ignore if clicking on an existing annotation element
    const target = e.target as HTMLElement;
    if (target.closest('[data-annotation-id]') || target.closest('input') || target.closest('textarea')) return;

    const pt = toPercent(e.clientX, e.clientY);
    if (!pt) return;

    setEditingId(null);
    setDragging({ startX: pt.x, startY: pt.y, currentX: pt.x, currentY: pt.y });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [disabled, toPercent]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const pt = toPercent(e.clientX, e.clientY);
    if (!pt) return;
    setDragging(prev => prev ? { ...prev, currentX: pt.x, currentY: pt.y } : null);
  }, [dragging, toPercent]);

  const handlePointerUp = useCallback(() => {
    if (!dragging) return;

    const x = Math.min(dragging.startX, dragging.currentX);
    const y = Math.min(dragging.startY, dragging.currentY);
    const width = Math.abs(dragging.currentX - dragging.startX);
    const height = Math.abs(dragging.currentY - dragging.startY);

    setDragging(null);

    // Minimum 3% width/height to prevent accidental tiny regions
    if (width < 3 || height < 3) return;

    const newAnnotation: RegionAnnotation = {
      id: crypto.randomUUID(),
      x, y, width, height,
      comment: '',
    };

    onChange([...annotations, newAnnotation]);
    setEditingId(newAnnotation.id);
    setEditText('');
  }, [dragging, annotations, onChange]);

  const handleDelete = useCallback((id: string) => {
    onChange(annotations.filter(a => a.id !== id));
    if (editingId === id) setEditingId(null);
  }, [annotations, onChange, editingId]);

  const handleSaveComment = useCallback((id: string) => {
    onChange(annotations.map(a => a.id === id ? { ...a, comment: editText } : a));
    setEditingId(null);
  }, [annotations, editText, onChange]);

  const handleAnnotationClick = useCallback((id: string) => {
    if (disabled) return;
    const ann = annotations.find(a => a.id === id);
    if (!ann) return;
    setEditingId(id);
    setEditText(ann.comment);
  }, [annotations, disabled]);

  // Close editor on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditingId(null);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // Current drag rectangle
  const dragRect = dragging ? {
    x: Math.min(dragging.startX, dragging.currentX),
    y: Math.min(dragging.startY, dragging.currentY),
    width: Math.abs(dragging.currentX - dragging.startX),
    height: Math.abs(dragging.currentY - dragging.startY),
  } : null;

  return (
    <Box
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      sx={{
        position: 'absolute',
        inset: 0,
        cursor: disabled ? 'default' : 'crosshair',
        touchAction: disabled ? 'auto' : 'none',
        userSelect: 'none',
        zIndex: 5,
      }}
    >
      {/* Existing annotations */}
      {annotations.map((ann) => (
        <Box
          key={ann.id}
          data-annotation-id={ann.id}
          onClick={(e) => { e.stopPropagation(); handleAnnotationClick(ann.id); }}
          sx={{
            position: 'absolute',
            left: `${ann.x}%`,
            top: `${ann.y}%`,
            width: `${ann.width}%`,
            height: `${ann.height}%`,
            border: '2px dashed',
            borderColor: editingId === ann.id ? '#1976d2' : 'rgba(220, 40, 40, 0.8)',
            bgcolor: editingId === ann.id ? 'rgba(25, 118, 210, 0.08)' : 'rgba(220, 40, 40, 0.08)',
            borderRadius: '4px',
            cursor: disabled ? 'default' : 'pointer',
            transition: 'border-color 0.15s, background-color 0.15s',
            '&:hover': disabled ? {} : {
              borderColor: '#1976d2',
              bgcolor: 'rgba(25, 118, 210, 0.1)',
            },
          }}
        >
          {/* Comment label chip */}
          {ann.comment && editingId !== ann.id && (
            <Chip
              label={ann.comment}
              size="small"
              sx={{
                position: 'absolute',
                top: -12,
                left: 4,
                maxWidth: '90%',
                height: 22,
                fontSize: '0.7rem',
                fontWeight: 600,
                bgcolor: 'rgba(255,255,255,0.95)',
                border: '1px solid rgba(220, 40, 40, 0.4)',
                color: '#b71c1c',
                '& .MuiChip-label': { px: 1 },
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Annotation number badge */}
          {!ann.comment && editingId !== ann.id && (
            <Box
              sx={{
                position: 'absolute',
                top: -10,
                left: 4,
                width: 20,
                height: 20,
                borderRadius: '50%',
                bgcolor: 'rgba(220, 40, 40, 0.85)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.65rem',
                fontWeight: 700,
                pointerEvents: 'none',
              }}
            >
              {annotations.indexOf(ann) + 1}
            </Box>
          )}

          {/* Editing popover */}
          {editingId === ann.id && !disabled && (
            <Box
              onClick={(e) => e.stopPropagation()}
              sx={{
                position: 'absolute',
                top: '100%',
                left: 0,
                mt: 0.5,
                zIndex: 20,
                bgcolor: '#fff',
                borderRadius: 1,
                boxShadow: 3,
                p: 1,
                minWidth: 200,
                maxWidth: 280,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.75,
              }}
            >
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                Add comment for this area
              </Typography>
              <TextField
                size="small"
                placeholder="e.g., Shadow direction is wrong"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                autoFocus
                multiline
                maxRows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveComment(ann.id);
                  }
                }}
                sx={{ '& .MuiInputBase-input': { fontSize: '0.82rem' } }}
              />
              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                <IconButton size="small" color="error" onClick={() => handleDelete(ann.id)} title="Delete region">
                  <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                </IconButton>
                <IconButton size="small" onClick={() => setEditingId(null)} title="Close">
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            </Box>
          )}
        </Box>
      ))}

      {/* Active drag rectangle */}
      {dragRect && dragRect.width >= 1 && dragRect.height >= 1 && (
        <Box
          sx={{
            position: 'absolute',
            left: `${dragRect.x}%`,
            top: `${dragRect.y}%`,
            width: `${dragRect.width}%`,
            height: `${dragRect.height}%`,
            border: '2px dashed #1976d2',
            bgcolor: 'rgba(25, 118, 210, 0.12)',
            borderRadius: '4px',
            pointerEvents: 'none',
          }}
        />
      )}
    </Box>
  );
}
