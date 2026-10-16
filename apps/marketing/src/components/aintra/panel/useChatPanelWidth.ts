'use client';

import { useCallback, useEffect, useState } from 'react';

export const COMPACT_WIDTH = 420;
export const WIDE_WIDTH = 680;
export const MIN_WIDTH = 380;
const STORAGE_KEY = 'aintra:width';

/** The widest the chat may be: 1200px, and never past 96% of the window. */
export function maxPanelWidth(): number {
  if (typeof window === 'undefined') return 1200;
  return Math.max(MIN_WIDTH, Math.min(1200, Math.floor(window.innerWidth * 0.96)));
}

export function clampWidth(width: number): number {
  return Math.round(Math.min(maxPanelWidth(), Math.max(MIN_WIDTH, width)));
}

function readStored(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? clampWidth(n) : COMPACT_WIDTH;
  } catch {
    return COMPACT_WIDTH;
  }
}

/**
 * The chat panel's width on tablets and desktops. Remembered per browser, so a
 * visitor who likes it wide gets it wide next time. Phones ignore it: there
 * the panel is always full screen.
 */
export function useChatPanelWidth() {
  const [width, setWidthState] = useState(COMPACT_WIDTH);
  const [viewport, setViewport] = useState(1440);

  useEffect(() => {
    setWidthState(readStored());
    setViewport(window.innerWidth);
    const onResize = () => {
      setViewport(window.innerWidth);
      setWidthState((w) => clampWidth(w));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /** Set the width. Pass persist: false while dragging, then persist on release. */
  const setWidth = useCallback((next: number, opts: { persist?: boolean } = {}) => {
    const clamped = clampWidth(next);
    setWidthState(clamped);
    if (opts.persist !== false) {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(clamped));
      } catch {
        // Private mode or blocked storage: the width just is not remembered.
      }
    }
  }, []);

  const isWide = width >= (COMPACT_WIDTH + WIDE_WIDTH) / 2;
  const toggle = useCallback(() => setWidth(isWide ? COMPACT_WIDTH : WIDE_WIDTH), [isWide, setWidth]);

  return { width, setWidth, isWide, toggle, viewport };
}
