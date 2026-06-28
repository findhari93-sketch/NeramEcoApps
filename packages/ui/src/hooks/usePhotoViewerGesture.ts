'use client';

/**
 * usePhotoViewerGesture
 *
 * Shared interaction model for clickable avatars so the photo viewer never
 * fights with a primary action (a menu trigger, a clickable row, etc.).
 *
 * - **Long-press** (touch) and **right-click** (desktop) always open the viewer.
 * - A plain **tap** opens the viewer only when `tapToView` is true. On an avatar
 *   that already has a primary action, pass `tapToView={false}` so the tap falls
 *   through to that action while long-press / right-click still views the photo.
 *
 * The trailing click after a long-press is swallowed so the parent action does
 * not also fire.
 */

import { useRef, useState, useCallback } from 'react';

export interface UsePhotoViewerGestureOptions {
  /** Whether the viewer can be opened at all (master switch AND a photo exists). */
  canOpen: boolean;
  /** Does a plain tap open the viewer? When false, only long-press / right-click do. Default true. */
  tapToView?: boolean;
  /** Long-press threshold in ms. Default 480. */
  longPressMs?: number;
}

export interface PhotoViewerGestureHandlers {
  onClick: (e: React.MouseEvent) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export interface UsePhotoViewerGestureReturn {
  open: boolean;
  setOpen: (open: boolean) => void;
  handlers: PhotoViewerGestureHandlers;
}

/** Movement (px) past which a press is treated as a scroll/drag, not a long-press. */
const MOVE_CANCEL_PX = 10;

export function usePhotoViewerGesture({
  canOpen,
  tapToView = true,
  longPressMs = 480,
}: UsePhotoViewerGestureOptions): UsePhotoViewerGestureReturn {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!canOpen) return;
      longPressFiredRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      timerRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(10);
        }
        setOpen(true);
      }, longPressMs);
    },
    [canOpen, clearTimer, longPressMs]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
        clearTimer();
      }
    },
    [clearTimer]
  );

  const onPointerUp = useCallback(() => clearTimer(), [clearTimer]);
  const onPointerLeave = useCallback(() => clearTimer(), [clearTimer]);
  const onPointerCancel = useCallback(() => clearTimer(), [clearTimer]);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (!canOpen) return;
      // Swallow the click that trails a long-press so a parent action (menu/row)
      // does not also fire.
      if (longPressFiredRef.current) {
        longPressFiredRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (tapToView) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      }
      // else: let the click bubble to the parent's primary action.
    },
    [canOpen, tapToView]
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!canOpen) return;
      // Right-click (desktop) and the native long-press callout (mobile) open
      // the viewer instead of the browser context menu.
      e.preventDefault();
      e.stopPropagation();
      if (!longPressFiredRef.current) {
        setOpen(true);
      }
    },
    [canOpen]
  );

  return {
    open,
    setOpen,
    handlers: {
      onClick,
      onPointerDown,
      onPointerUp,
      onPointerMove,
      onPointerLeave,
      onPointerCancel,
      onContextMenu,
    },
  };
}

export default usePhotoViewerGesture;
