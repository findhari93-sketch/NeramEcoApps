'use client';

import { useRef } from 'react';
import { Box } from '@neram/ui';
import { MIN_WIDTH, maxPanelWidth } from './useChatPanelWidth';

const KEY_STEP = 40;

interface Props {
  /** The width being resized (the chat column). */
  width: number;
  onResize: (width: number, opts: { persist: boolean }) => void;
  onToggle: () => void;
  onDragChange: (dragging: boolean) => void;
}

/**
 * The grip on the panel's left edge. Drag to resize, double-click to switch
 * between compact and wide, or focus it and use the arrow keys (Home and End
 * jump to the narrowest and widest). The panel is anchored right, so moving
 * the pointer left makes it wider.
 */
export default function ResizeHandle({ width, onResize, onToggle, onDragChange }: Props) {
  const drag = useRef<{ startX: number; startWidth: number; last: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: width, last: width };
    onDragChange(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = drag.current.startWidth + (drag.current.startX - e.clientX);
    drag.current.last = next;
    onResize(next, { persist: false });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const final = drag.current.last;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onResize(final, { persist: true });
    onDragChange(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowLeft: width + KEY_STEP,
      ArrowRight: width - KEY_STEP,
      Home: MIN_WIDTH,
      End: maxPanelWidth(),
    };
    if (e.key in keys) {
      e.preventDefault();
      onResize(keys[e.key], { persist: true });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat. Use the left and right arrow keys, or double-click to switch between compact and wide."
      aria-valuenow={Math.round(width)}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={maxPanelWidth()}
      tabIndex={0}
      data-testid="aintra-resize-handle"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onToggle}
      onKeyDown={onKeyDown}
      onTouchStart={(e) => e.stopPropagation()}
      sx={{
        display: { xs: 'none', sm: 'flex' },
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: 12,
        zIndex: 5,
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'col-resize',
        touchAction: 'none',
        outline: 'none',
        '&::after': {
          content: '""',
          width: 4,
          height: 44,
          borderRadius: 2,
          bgcolor: 'grey.400',
          opacity: 0.55,
          transition: 'opacity 150ms ease, background-color 150ms ease, height 150ms ease',
        },
        '&:hover::after, &:focus-visible::after, &:active::after': { opacity: 1, bgcolor: 'primary.main', height: 64 },
        '&:focus-visible': { boxShadow: (t) => `inset 0 0 0 2px ${t.palette.primary.main}` },
        '@media (prefers-reduced-motion: reduce)': { '&::after': { transition: 'none' } },
      }}
    />
  );
}
