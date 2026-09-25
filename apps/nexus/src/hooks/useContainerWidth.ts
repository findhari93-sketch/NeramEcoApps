'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/** useLayoutEffect in the browser (measure before paint), useEffect on the server where it never runs and never warns. */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The width of an element, kept current as it resizes.
 *
 * MUI breakpoints (`sx` objects, `useMediaQuery`) measure the WINDOW. A list
 * inside a 480px drawer on a laptop still counts as "desktop" to them and lays
 * out four filter chips that wrap into three rows. This measures the box the
 * component actually sits in, so it can pick its compact form wherever space is
 * tight: a drawer, a dialog, a side panel or a phone.
 *
 * Returns a callback ref to put on the container and its width, which is null
 * until the first measurement, and null again while the box has no layout (a
 * hidden tab, `display: none`, a test DOM), so nothing collapses into its
 * compact form just because it was never laid out. The measurement runs in a
 * layout effect, so a client-mounted box (a drawer opening) never paints its
 * wide form first.
 */
export function useContainerWidth<T extends HTMLElement = HTMLDivElement>(): [
  (node: T | null) => void,
  number | null,
] {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const ref = useCallback((el: T | null) => setNode(el), []);

  useIsoLayoutEffect(() => {
    if (!node) return;
    const read = () => {
      const measured = Math.round(node.getBoundingClientRect().width);
      const w = measured > 0 ? measured : null;
      setWidth((prev) => (prev === w ? prev : w));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  return [ref, width];
}

/**
 * True when the container is narrower than `below` pixels. Before the first
 * measurement it answers `fallback` (wide by default, which matches what the
 * server renders).
 */
export function isNarrow(width: number | null, below: number, fallback = false): boolean {
  return width == null ? fallback : width < below;
}
