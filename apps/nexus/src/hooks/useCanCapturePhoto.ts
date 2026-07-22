'use client';

import { useEffect, useState } from 'react';

/**
 * True only on devices whose primary pointer is touch (phones, most tablets),
 * where the file input's `capture` hint actually opens the rear camera.
 *
 * Laptops and desktops (including touchscreen laptops, whose primary pointer is
 * still the trackpad/mouse) return false, so callers can hide a "Take photo"
 * action there: on those machines `capture` is ignored and the button would just
 * open the same file dialog as "Choose image", which is confusing.
 *
 * Returns false during SSR / first paint and resolves on mount, so guard UI on
 * the value rather than assuming it is stable across the very first render.
 */
export function useCanCapturePhoto(): boolean {
  const [canCapture, setCanCapture] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia?.('(pointer: coarse)');
    setCanCapture(mq ? mq.matches : 'ontouchstart' in window);
  }, []);

  return canCapture;
}
