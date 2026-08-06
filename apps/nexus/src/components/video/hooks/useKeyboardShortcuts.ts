'use client';

import { useEffect, useRef } from 'react';

/**
 * The shortcuts everyone already knows from YouTube.
 *
 * Two things make this safe rather than a hole in the gate. Every seek goes
 * through the single `onSeek` the player hands down, which clamps before it
 * touches the transport, so `L` on a gated video lands on the boundary and
 * nudges. And the percentage jumps (0-9) are only bound when there is no
 * boundary at all: on a gated video one keystroke would otherwise cross the
 * whole lecture.
 *
 * Bound to the player element rather than the document, so two players on a page
 * cannot both answer, and so typing in a form somewhere else never reaches here.
 * The player element carries tabIndex for this: with `controls={false}` a <video>
 * is not focusable, which is why the player had no keyboard support at all.
 */

export interface KeyboardActions {
  togglePlay: () => void;
  /** Already clamped by the player. Absolute seconds. */
  seekTo: (seconds: number) => void;
  getTime: () => number;
  getDuration: () => number;
  adjustVolume: (delta: number) => void;
  toggleMute: () => void;
  toggleFullscreen: () => void;
  toggleCaptions: () => void;
  cycleSpeed: (direction: 1 | -1) => void;
}

export interface UseKeyboardShortcutsOptions {
  enabled: boolean;
  /** Percentage jumps are bound only when playback is unbounded. */
  allowPercentageJumps: boolean;
  actions: KeyboardActions;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

export default function useKeyboardShortcuts(
  containerRef: React.MutableRefObject<HTMLElement | null>,
  { enabled, allowPercentageJumps, actions }: UseKeyboardShortcutsOptions,
) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const allowJumpsRef = useRef(allowPercentageJumps);
  allowJumpsRef.current = allowPercentageJumps;

  useEffect(() => {
    const node = containerRef.current;
    if (!enabled || !node) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const a = actionsRef.current;
      const take = (fn: () => void) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      };

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          return take(a.togglePlay);
        case 'j':
        case 'J':
          return take(() => a.seekTo(a.getTime() - 10));
        case 'l':
        case 'L':
          return take(() => a.seekTo(a.getTime() + 10));
        case 'ArrowLeft':
          return take(() => a.seekTo(a.getTime() - 5));
        case 'ArrowRight':
          return take(() => a.seekTo(a.getTime() + 5));
        case 'ArrowUp':
          return take(() => a.adjustVolume(0.1));
        case 'ArrowDown':
          return take(() => a.adjustVolume(-0.1));
        case 'm':
        case 'M':
          return take(a.toggleMute);
        case 'f':
        case 'F':
          return take(a.toggleFullscreen);
        case 'c':
        case 'C':
          return take(a.toggleCaptions);
        case '>':
        case '.':
          return take(() => a.cycleSpeed(1));
        case '<':
        case ',':
          return take(() => a.cycleSpeed(-1));
        default:
      }

      if (/^[0-9]$/.test(e.key)) {
        // On a gated video this single keystroke would cross the whole lecture.
        // The clamp would catch it, but a shortcut whose only outcome is a
        // refusal is not a shortcut.
        if (!allowJumpsRef.current) return;
        const duration = a.getDuration();
        if (duration > 0) take(() => a.seekTo((Number(e.key) / 10) * duration));
      }
    };

    node.addEventListener('keydown', onKeyDown);
    return () => node.removeEventListener('keydown', onKeyDown);
  }, [containerRef, enabled]);
}
