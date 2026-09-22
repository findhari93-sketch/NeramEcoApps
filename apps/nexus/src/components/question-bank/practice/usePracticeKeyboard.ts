'use client';

import { useEffect, useRef } from 'react';

export interface PracticeKeyboardActions {
  next: () => void;
  prev: () => void;
  /** 0 for A, 1 for B, ... */
  selectOption: (index: number) => void;
  /** Enter: check the answer, or go on once it is checked. */
  primary: () => void;
  /** g then digits: open that question number. */
  goTo: (number: number) => void;
  help: () => void;
}

const LETTERS = ['a', 'b', 'c', 'd'];
const GO_TO_MS = 1500;

/** Typing, so a key is a letter rather than a shortcut. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

/** A dialog, menu, popover or drawer is open, and owns the keyboard. */
function hasOpenOverlay(): boolean {
  return !!document.querySelector('.MuiModal-root:not(.MuiModal-hidden)');
}

/**
 * The practice screen's keys, on a laptop.
 *
 * Written fresh rather than reusing useKeyboardShortcuts, which took Enter and
 * the up/down arrows from everything on the page: a focused button stopped
 * activating, and the arrows stopped scrolling the panes. This one steps aside
 * for typing, for modifier combinations (Ctrl+F, Alt+Left), for an open
 * overlay, for anything that already handled the key (the number grid moves
 * its own focus with the arrows), and for Enter on a button or link, which
 * must keep doing what the button says.
 */
export function usePracticeKeyboard(actions: PracticeKeyboardActions, enabled: boolean) {
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    if (!enabled) return;
    let buffer = '';
    let goTo = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finishGoTo = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      const n = parseInt(buffer, 10);
      goTo = false;
      buffer = '';
      if (Number.isFinite(n) && n > 0) ref.current.goTo(n);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target) || hasOpenOverlay()) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[role="tablist"], [data-roving]')) return;

      if (goTo) {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          buffer += e.key;
          if (timer) clearTimeout(timer);
          timer = setTimeout(finishGoTo, GO_TO_MS);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          finishGoTo();
          return;
        }
        goTo = false;
        buffer = '';
        if (timer) clearTimeout(timer);
        if (e.key === 'Escape') return;
      }

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      switch (key) {
        case 'ArrowRight':
        case 'j':
          e.preventDefault();
          ref.current.next();
          return;
        case 'ArrowLeft':
        case 'k':
          e.preventDefault();
          ref.current.prev();
          return;
        case '1':
        case '2':
        case '3':
        case '4':
          e.preventDefault();
          ref.current.selectOption(Number(key) - 1);
          return;
        case 'a':
        case 'b':
        case 'c':
        case 'd':
          e.preventDefault();
          ref.current.selectOption(LETTERS.indexOf(key));
          return;
        case 'Enter': {
          if (target?.closest?.('button, a, [role="button"], [role="radio"]')) return;
          e.preventDefault();
          ref.current.primary();
          return;
        }
        case 'g':
          e.preventDefault();
          goTo = true;
          buffer = '';
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            goTo = false;
            buffer = '';
          }, GO_TO_MS);
          return;
        case '?':
          e.preventDefault();
          ref.current.help();
          return;
        default:
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);
}
