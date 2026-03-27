'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface KeyboardShortcutActions {
  /** Move focus to next question */
  onNext: () => void;
  /** Move focus to previous question */
  onPrev: () => void;
  /** Expand/collapse current question */
  onToggleExpand: () => void;
  /** Toggle studied mark on current question */
  onToggleStudied: () => void;
  /** Select MCQ option by number (1-4 maps to A-D) */
  onSelectOption: (optionIndex: number) => void;
  /** Escape: collapse or exit selection */
  onEscape: () => void;
  /** Toggle shortcuts overlay */
  onToggleHelp: () => void;
  /** Jump to question number (vim-style: G then digits) */
  onGoToQuestion: (questionNumber: number) => void;
}

interface UseKeyboardShortcutsOptions {
  actions: KeyboardShortcutActions;
  /** Whether shortcuts are active (set false on mobile) */
  enabled?: boolean;
}

interface UseKeyboardShortcutsReturn {
  /** Whether go-to mode is active (user pressed 'g') */
  goToMode: boolean;
  /** Digits collected so far in go-to mode */
  goToBuffer: string;
}

const IGNORED_TAG_NAMES = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const GO_TO_TIMEOUT_MS = 1500;

export function useKeyboardShortcuts({
  actions,
  enabled = true,
}: UseKeyboardShortcutsOptions): UseKeyboardShortcutsReturn {
  const [goToMode, setGoToMode] = useState(false);
  const [goToBuffer, setGoToBuffer] = useState('');
  const goToTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionsRef = useRef(actions);

  // Keep actions ref fresh to avoid stale closures
  actionsRef.current = actions;

  const clearGoToMode = useCallback(() => {
    if (goToTimerRef.current) {
      clearTimeout(goToTimerRef.current);
      goToTimerRef.current = null;
    }
    setGoToMode(false);
    setGoToBuffer('');
  }, []);

  const commitGoTo = useCallback(
    (buffer: string) => {
      const num = parseInt(buffer, 10);
      if (!isNaN(num) && num > 0) {
        actionsRef.current.onGoToQuestion(num);
      }
      clearGoToMode();
    },
    [clearGoToMode],
  );

  useEffect(() => {
    if (!enabled) {
      clearGoToMode();
      return;
    }

    let currentBuffer = '';
    let currentGoToMode = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when focus is on form elements
      const target = e.target as HTMLElement;
      if (IGNORED_TAG_NAMES.has(target.tagName)) return;
      if (target.isContentEditable) return;

      // --- Go-to mode handling ---
      if (currentGoToMode) {
        e.preventDefault();

        if (e.key === 'Escape') {
          currentGoToMode = false;
          currentBuffer = '';
          clearGoToMode();
          return;
        }

        if (e.key === 'Enter') {
          const buf = currentBuffer;
          currentGoToMode = false;
          currentBuffer = '';
          commitGoTo(buf);
          return;
        }

        if (e.key >= '0' && e.key <= '9') {
          currentBuffer += e.key;
          setGoToBuffer(currentBuffer);

          // Reset timeout
          if (goToTimerRef.current) clearTimeout(goToTimerRef.current);
          goToTimerRef.current = setTimeout(() => {
            const buf = currentBuffer;
            currentGoToMode = false;
            currentBuffer = '';
            commitGoTo(buf);
          }, GO_TO_TIMEOUT_MS);
          return;
        }

        // Any other key cancels go-to mode
        currentGoToMode = false;
        currentBuffer = '';
        clearGoToMode();
        return;
      }

      // --- Normal mode handling ---
      const { key } = e;

      switch (key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          actionsRef.current.onNext();
          break;

        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          actionsRef.current.onPrev();
          break;

        case 'Enter':
          e.preventDefault();
          actionsRef.current.onToggleExpand();
          break;

        case 's':
          e.preventDefault();
          actionsRef.current.onToggleStudied();
          break;

        case '1':
        case '2':
        case '3':
        case '4':
          e.preventDefault();
          actionsRef.current.onSelectOption(parseInt(key, 10) - 1);
          break;

        case 'Escape':
          actionsRef.current.onEscape();
          break;

        case '?':
          e.preventDefault();
          actionsRef.current.onToggleHelp();
          break;

        case 'g':
          e.preventDefault();
          currentGoToMode = true;
          currentBuffer = '';
          setGoToMode(true);
          setGoToBuffer('');

          // Auto-timeout if no digits pressed
          goToTimerRef.current = setTimeout(() => {
            currentGoToMode = false;
            currentBuffer = '';
            clearGoToMode();
          }, GO_TO_TIMEOUT_MS);
          break;

        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (goToTimerRef.current) {
        clearTimeout(goToTimerRef.current);
        goToTimerRef.current = null;
      }
    };
  }, [enabled, clearGoToMode, commitGoTo]);

  return { goToMode, goToBuffer };
}
