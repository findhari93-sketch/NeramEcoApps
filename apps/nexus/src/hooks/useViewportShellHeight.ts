'use client';

import { useEffect, useState, type RefObject } from 'react';
import { useMediaQuery, useTheme } from '@neram/ui';
import { SHELL_CHROME, BOTTOM_NAV_HEIGHT } from '@/lib/shell-chrome';

/**
 * The nearest ancestor that actually scrolls.
 *
 * Nexus pages do not scroll the window: the teacher/student/parent layouts put
 * `overflowY: auto` on `<main>`. Anything that re-measures on scroll has to
 * listen there, not on window.
 */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * An sx `height` fragment that makes an element fill the rest of the viewport.
 *
 * Measured rather than hardcoded, because what sits above a shell wraps
 * differently case to case (a long exam name, a warning chip, an impersonation
 * banner) and a fixed number would either clip the content or waste space. The
 * SHELL_CHROME constants stay as the first-paint value so there is no jump
 * before the measurement lands.
 *
 * Give the returned fragment to the element `ref` points at, and give that
 * element `overflow: hidden` plus children with `minHeight: 0`. That is what
 * turns `overflowY: auto` on a descendant into a real scroll region: without a
 * resolved height on the ancestor there is nothing for it to clip against, and
 * the whole page scrolls instead.
 */
export function useViewportShellHeight(
  ref: RefObject<HTMLElement>,
  /**
   * Pass false while the element is taken out of the document flow, for example
   * pinned to `inset: 0` by a focus mode.
   *
   * Measuring then would read a top of 0 and store it, and the stored value is
   * what the element falls back to the moment it returns to the flow, leaving it
   * a full viewport tall in a place that no longer starts at the top of the
   * screen. Holding the last good measurement instead means leaving focus mode
   * restores the correct height with no reflow at all.
   */
  enabled = true,
) {
  const theme = useTheme();
  const isMobile = !useMediaQuery(theme.breakpoints.up('md'));
  const [topOffset, setTopOffset] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let frame = 0;
    const measure = () => {
      const node = ref.current;
      if (!node) return;
      setTopOffset(Math.max(0, Math.round(node.getBoundingClientRect().top)));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('resize', schedule);

    // Watch the body AND our own parent. The things that push this element down
    // are usually SIBLINGS that mount once their data arrives, so our own size
    // never changes, only our position. Watching one or the other misses half
    // the cases.
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    if (el.parentElement) observer.observe(el.parentElement);

    // getBoundingClientRect().top is viewport-relative, so it goes stale the
    // moment the scroll container moves. Since that container is <main> and not
    // the window, a window scroll listener would never fire.
    const scroller = findScrollParent(el);
    scroller?.addEventListener('scroll', schedule, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      scroller?.removeEventListener('scroll', schedule);
    };
  }, [ref, enabled]);

  const bottomChrome = isMobile ? BOTTOM_NAV_HEIGHT : 0;

  // svh rather than dvh: dvh changes as a mobile browser's address bar
  // collapses, which would resize the panes mid-scroll.
  if (topOffset !== null) {
    return { height: `calc(100svh - ${topOffset + bottomChrome}px)` };
  }

  return {
    height: {
      xs: `calc(100vh - ${SHELL_CHROME.xs}px)`,
      sm: `calc(100vh - ${SHELL_CHROME.sm}px)`,
      md: `calc(100vh - ${SHELL_CHROME.md}px)`,
    },
    '@supports (height: 100svh)': {
      height: {
        xs: `calc(100svh - ${SHELL_CHROME.xs}px)`,
        sm: `calc(100svh - ${SHELL_CHROME.sm}px)`,
        md: `calc(100svh - ${SHELL_CHROME.md}px)`,
      },
    },
  };
}
