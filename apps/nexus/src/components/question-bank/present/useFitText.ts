'use client';

/**
 * The largest font size at which a question fits its box without scrolling.
 *
 * A shared screen cannot be scrolled by the class, so a long question shrinks
 * to fit and a short one grows to be read from the back of the room. The size
 * is set as the CSS variable --fit on the box; children size their text (and
 * maths) from it. Re-fits when the box resizes, when the content changes, and
 * when a picture inside finishes loading (call refit from its onLoad).
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function fitSize(fits: (size: number) => boolean, min: number, max: number): number {
  let lo = min;
  let hi = max;
  let best = min;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export function useFitText<T extends HTMLElement>(contentKey: unknown, options: { min?: number; max?: number } = {}) {
  const { min = 16, max = 44 } = options;
  const boxRef = useRef<T | null>(null);

  const refit = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    const size = fitSize(
      (px) => {
        box.style.setProperty('--fit', `${px}px`);
        return box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1;
      },
      min,
      max,
    );
    box.style.setProperty('--fit', `${size}px`);
  }, [min, max]);

  useIsoLayoutEffect(() => {
    refit();
  }, [refit, contentKey]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refit);
    });
    observer.observe(box);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [refit]);

  return { boxRef, refit };
}
