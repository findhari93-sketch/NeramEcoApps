'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * When the control bar is on screen.
 *
 * Three rules, and the second two are the ones that stop it feeling hostile:
 * it fades while playing, it never fades while paused, and it never fades while
 * the student is mid-drag on the scrub bar. Losing the bar under your own thumb
 * is the specific failure that makes a player feel cheap.
 */

const HIDE_AFTER_MS = 3200;

export interface UsePlayerChromeResult {
  visible: boolean;
  /** Any sign of intent: a mouse move, a touch, a keypress, a control press. */
  bump: () => void;
  /** A tap on the picture, which shows the bar if hidden and hides it if shown. */
  toggle: () => void;
  setScrubbing: (scrubbing: boolean) => void;
  /** Force it open and keep it there, for as long as a quiz is up. */
  setHeldOpen: (held: boolean) => void;
}

export default function usePlayerChrome(playing: boolean): UsePlayerChromeResult {
  const [visible, setVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const bump = useCallback(() => {
    setVisible(true);
    clear();
    timer.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
  }, []);

  const toggle = useCallback(() => {
    setVisible((wasVisible) => {
      clear();
      // Hiding is only allowed while playing. Tapping a paused video to hide its
      // controls leaves a still frame with no way back except another tap, which
      // reads as the player having died.
      if (wasVisible && playing && !scrubbing && !heldOpen) return false;
      timer.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
      return true;
    });
  }, [playing, scrubbing, heldOpen]);

  useEffect(() => {
    if (!playing || scrubbing || heldOpen) {
      clear();
      setVisible(true);
      return;
    }
    bump();
    return clear;
  }, [playing, scrubbing, heldOpen, bump]);

  useEffect(() => clear, []);

  return { visible, bump, toggle, setScrubbing, setHeldOpen };
}
