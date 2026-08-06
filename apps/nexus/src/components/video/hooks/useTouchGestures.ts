'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * The gestures a student already expects, because every other video app on their
 * phone has them.
 *
 * The tap rule is worth stating because it is counter-intuitive: a single tap
 * toggles the CONTROLS, it does not toggle playback. That is what YouTube,
 * Netflix and Prime all do on touch, and it matters here because the chrome
 * auto-hides: if a tap also played or paused, every attempt to see the scrub bar
 * would stop the lecture.
 *
 * Skipping forward is a gesture like any other, so it goes through the same
 * clamped `seekTo` the buttons and the keyboard use. When a skip is refused the
 * ripple is suppressed: a "+10" flourish for a seek that did not happen is worse
 * than no animation.
 *
 * Brightness is deliberately absent from the swipe set. A web page cannot read
 * or set screen brightness on any platform, so the gesture would be a no-op.
 */

const DOUBLE_TAP_MS = 300;
/** Below this a touch is a tap, not a drag. */
const TAP_SLOP_PX = 12;
const LONG_PRESS_MS = 500;

export interface TouchGestureActions {
  toggleChrome: () => void;
  /** Absolute seconds, clamped by the player before it reaches the transport. */
  seekTo: (seconds: number) => void;
  getTime: () => number;
  /** Ceiling in seconds, or Infinity. Used only to decide whether to ripple. */
  getSeekCeiling: () => number;
  adjustVolume: (delta: number) => void;
  setTemporaryRate: (rate: number | null) => void;
  maxRate: number;
  volumeSettable: boolean;
}

export interface Ripple {
  side: 'left' | 'right';
  seconds: number;
  key: number;
}

export interface UseTouchGesturesResult {
  ripple: Ripple | null;
  holdingSpeed: boolean;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
}

export default function useTouchGestures(
  containerRef: React.MutableRefObject<HTMLElement | null>,
  actions: TouchGestureActions,
): UseTouchGesturesResult {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const [ripple, setRipple] = useState<Ripple | null>(null);
  const [holdingSpeed, setHoldingSpeed] = useState(false);

  const lastTap = useRef<{ at: number; x: number } | null>(null);
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  const mode = useRef<'undecided' | 'volume' | 'moved'>('undecided');
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rippleKey = useRef(0);

  const clearLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current);
    longPress.current = null;
  };

  const skip = useCallback((side: 'left' | 'right') => {
    const a = actionsRef.current;
    const delta = side === 'left' ? -10 : 10;
    const target = a.getTime() + delta;
    const ceiling = a.getSeekCeiling();
    // Suppress the flourish when the seek will be refused.
    const refused = side === 'right' && Number.isFinite(ceiling) && target > ceiling;
    a.seekTo(target);
    if (!refused) {
      rippleKey.current += 1;
      setRipple({ side, seconds: 10, key: rippleKey.current });
      setTimeout(() => setRipple(null), 500);
    }
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      start.current = { x: t.clientX, y: t.clientY, at: Date.now() };
      mode.current = 'undecided';
      clearLongPress();
      longPress.current = setTimeout(() => {
        // Hold to speed up, capped by the gate. On an owed checkpoint maxRate is
        // 1, so the hold simply does nothing rather than being a way round it.
        const max = actionsRef.current.maxRate;
        if (max > 1) {
          actionsRef.current.setTemporaryRate(max);
          setHoldingSpeed(true);
        }
      }, LONG_PRESS_MS);
    },
    [],
  );

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    const s = start.current;
    if (!t || !s) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;

    if (mode.current === 'undecided') {
      if (Math.abs(dx) < TAP_SLOP_PX && Math.abs(dy) < TAP_SLOP_PX) return;
      clearLongPress();
      const node = containerRef.current;
      const rect = node?.getBoundingClientRect();
      const onRightHalf = !!rect && s.x - rect.left > rect.width / 2;
      // Vertical, on the right half, where volume is actually writable.
      mode.current =
        Math.abs(dy) > Math.abs(dx) && onRightHalf && actionsRef.current.volumeSettable
          ? 'volume'
          : 'moved';
    }

    if (mode.current === 'volume') {
      const rect = containerRef.current?.getBoundingClientRect();
      const height = rect?.height || 1;
      // Full height of the player is the full range, so the gesture is
      // proportional to the surface rather than to an arbitrary constant.
      actionsRef.current.adjustVolume(-(dy / height));
      start.current = { ...s, y: t.clientY };
    }
  }, [containerRef]);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      clearLongPress();
      if (holdingSpeed) {
        actionsRef.current.setTemporaryRate(null);
        setHoldingSpeed(false);
        start.current = null;
        return;
      }

      const s = start.current;
      start.current = null;
      if (!s || mode.current !== 'undecided') return;

      const now = Date.now();
      const x = e.changedTouches[0]?.clientX ?? s.x;
      const node = containerRef.current;
      const rect = node?.getBoundingClientRect();
      const side: 'left' | 'right' = rect && x - rect.left < rect.width / 2 ? 'left' : 'right';

      const previous = lastTap.current;
      if (previous && now - previous.at < DOUBLE_TAP_MS) {
        lastTap.current = null;
        skip(side);
        return;
      }
      lastTap.current = { at: now, x };
      // A single tap only counts once the double-tap window has closed,
      // otherwise the first tap of a skip would also flash the chrome.
      setTimeout(() => {
        if (lastTap.current?.at === now) {
          lastTap.current = null;
          actionsRef.current.toggleChrome();
        }
      }, DOUBLE_TAP_MS);
    },
    [containerRef, holdingSpeed, skip],
  );

  return { ripple, holdingSpeed, handlers: { onTouchStart, onTouchMove, onTouchEnd } };
}
