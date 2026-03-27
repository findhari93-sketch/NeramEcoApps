'use client';

import { useRef, useState, useCallback } from 'react';

interface UseSwipeGestureOptions {
  /** Callback when swiped left past threshold */
  onSwipeLeft?: () => void;
  /** Callback when swiped right past threshold */
  onSwipeRight?: () => void;
  /** Callback for long press (300ms) */
  onLongPress?: () => void;
  /** Swipe threshold as fraction of element width (default: 0.35) */
  threshold?: number;
  /** Whether swipe is enabled */
  enabled?: boolean;
}

interface UseSwipeGestureReturn {
  /** Spread these onto the swipeable element */
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
  /** Current horizontal offset in px (for transform) */
  offsetX: number;
  /** Whether currently swiping */
  isSwiping: boolean;
  /** Direction currently swiping: 'left' | 'right' | null */
  direction: 'left' | 'right' | null;
}

export function useSwipeGesture(options: UseSwipeGestureOptions = {}): UseSwipeGestureReturn {
  const {
    onSwipeLeft,
    onSwipeRight,
    onLongPress,
    threshold = 0.35,
    enabled = true,
  } = options;

  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);

  const startX = useRef(0);
  const startY = useRef(0);
  const elementWidth = useRef(0);
  const isHorizontal = useRef<boolean | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const vibrate = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;

      const touch = e.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      isHorizontal.current = null;

      const el = e.currentTarget as HTMLElement;
      elementWidth.current = el.offsetWidth;

      // Start long press timer
      if (onLongPress) {
        longPressTimer.current = setTimeout(() => {
          vibrate();
          onLongPress();
          longPressTimer.current = null;
        }, 300);
      }
    },
    [enabled, onLongPress, vibrate],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - startX.current;
      const deltaY = touch.clientY - startY.current;

      // Cancel long press if moved more than 10px
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        clearLongPress();
      }

      // Determine scroll direction on first significant move
      if (isHorizontal.current === null) {
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
          isHorizontal.current = Math.abs(deltaX) > Math.abs(deltaY);
        }
        return;
      }

      // If vertical scroll, do nothing
      if (!isHorizontal.current) return;

      setIsSwiping(true);
      setOffsetX(deltaX);
      setDirection(deltaX < 0 ? 'left' : deltaX > 0 ? 'right' : null);
    },
    [enabled, clearLongPress],
  );

  const onTouchEnd = useCallback(() => {
    if (!enabled) return;

    clearLongPress();

    const thresholdPx = threshold * elementWidth.current;

    if (isHorizontal.current) {
      if (offsetX < -thresholdPx && onSwipeLeft) {
        vibrate();
        onSwipeLeft();
      } else if (offsetX > thresholdPx && onSwipeRight) {
        vibrate();
        onSwipeRight();
      }
    }

    // Reset state
    setOffsetX(0);
    setIsSwiping(false);
    setDirection(null);
    isHorizontal.current = null;
  }, [enabled, offsetX, threshold, onSwipeLeft, onSwipeRight, clearLongPress, vibrate]);

  return {
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
    offsetX,
    isSwiping,
    direction,
  };
}
