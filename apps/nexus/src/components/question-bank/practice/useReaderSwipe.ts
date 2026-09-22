'use client';

import { useCallback, useRef, type TouchEvent } from 'react';

const MIN_DX = 64;

/**
 * Did this touch start somewhere that owns horizontal drags itself?
 *
 * A wide formula (KaTeX display maths scrolls sideways), a tab strip, an image,
 * a video or a slider. Swiping there must scroll or play it, not change the
 * question.
 */
function startsInHorizontalOwner(target: EventTarget | null, boundary: HTMLElement | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== boundary) {
    if (el.matches?.('.katex-display, [role="tablist"], [role="slider"], img, video, iframe, input, textarea')) return true;
    const style = window.getComputedStyle(el);
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Swipe left for the next question, right for the previous one.
 *
 * Refs only: the older useSwipeGesture set state on every touchmove, which
 * re-rendered the whole reader sixty times a second on a budget phone. This
 * reads the gesture once, at the end. It fires only for a deliberate sideways
 * swipe (at least 64px, and more than twice as far across as down), so reading
 * down a long solution never flips the question.
 */
export function useReaderSwipe(onNext: () => void, onPrev: () => void, enabled: boolean) {
  const start = useRef<{ x: number; y: number; ignore: boolean } | null>(null);
  const boundary = useRef<HTMLElement | null>(null);

  const onTouchStart = useCallback(
    (e: TouchEvent<HTMLElement>) => {
      if (!enabled || e.touches.length !== 1) {
        start.current = null;
        return;
      }
      boundary.current = e.currentTarget;
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY, ignore: startsInHorizontalOwner(e.target, e.currentTarget) };
    },
    [enabled],
  );

  const onTouchEnd = useCallback(
    (e: TouchEvent<HTMLElement>) => {
      const s = start.current;
      start.current = null;
      if (!enabled || !s || s.ignore) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) < MIN_DX || Math.abs(dx) < 2 * Math.abs(dy)) return;
      if (dx < 0) onNext();
      else onPrev();
    },
    [enabled, onNext, onPrev],
  );

  return { onTouchStart, onTouchEnd };
}
