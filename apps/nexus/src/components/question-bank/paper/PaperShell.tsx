'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Box } from '@neram/ui';
import { useViewportShellHeight } from '@/hooks/useViewportShellHeight';

export interface PaperShellProps {
  /**
   * A column. Give chrome that must never scroll `flexShrink: 0`, and give the
   * work area `flex: 1; minHeight: 0` plus its own `overflowY`. The minHeight is
   * the part people forget: without it a flex child refuses to shrink below its
   * content and the shell overflows instead of the pane scrolling.
   */
  children: ReactNode;
  focus: boolean;
  onFocusChange: (next: boolean) => void;
  /** Focus mode is only offered where a two-pane layout exists, so a caller on
   *  a tab without one can switch it off rather than stranding the teacher in a
   *  chromeless view of a single panel. */
  focusEnabled?: boolean;
}

/** Is the user typing? Then f is a letter, not a shortcut. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

/** Any MUI overlay currently mounted, i.e. a dialog, menu, popover or drawer. */
function hasOpenOverlay(): boolean {
  return !!document.querySelector('.MuiModal-root');
}

/**
 * The frame the paper workspace lives in: a column of the exact height the
 * viewport has left, which does not scroll.
 *
 * The panes below already ask for `overflowY: auto`, but that only becomes a
 * real scroll region once an ancestor has a resolved height to clip against.
 * Without this the whole page scrolled instead, and the two panes were only ever
 * as tall as the taller one's content.
 *
 * The workspace used to measure this for itself. It is one measurement per page
 * now, taken above the header rather than below it, so the header and the tabs
 * are inside the fixed height instead of pushing the panes down out of it.
 */
export default function PaperShell({
  children,
  focus,
  onFocusChange,
  focusEnabled = true,
}: PaperShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Focus mode pins this to `inset: 0`, where its measured top is 0 and means
  // nothing. Pause the measurement rather than poison it.
  const heightSx = useViewportShellHeight(rootRef, !focus);

  // A tab with no two-pane layout has nothing to focus on. Leaving the mode
  // stuck on while switching there would hide the nav for no gain.
  useEffect(() => {
    if (!focusEnabled && focus) onFocusChange(false);
  }, [focusEnabled, focus, onFocusChange]);

  // f toggles focus mode. Modifier combinations are left alone, or this would
  // eat Ctrl+F.
  useEffect(() => {
    if (!focusEnabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target) || hasOpenOverlay()) return;
      e.preventDefault();
      onFocusChange(!focus);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focus, focusEnabled, onFocusChange]);

  /**
   * Escape leaves focus mode.
   *
   * PaperWorkspace also binds Escape on window, to close the editor pane. Both
   * would fire on one keypress, so this one listens in the CAPTURE phase, which
   * runs before any bubble-phase listener on window, and stops propagation.
   * Escape therefore backs out one layer at a time: first the focus mode, then
   * the open question. The listener is only bound while focused, so when it is
   * off the workspace keeps Escape entirely.
   *
   * An open dialog or menu is skipped: MUI closes those on Escape too, and
   * stealing it would leave a teacher unable to dismiss the delete confirmation
   * without reaching for the mouse.
   */
  useEffect(() => {
    if (!focus) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || hasOpenOverlay()) return;
      e.stopPropagation();
      onFocusChange(false);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [focus, onFocusChange]);

  return (
    <Box
      ref={rootRef}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        // A floor, so a landscape phone or a short window degrades to its own
        // scrolling rather than crushing both panes to nothing.
        minHeight: 420,
        // Padding, not margin: the height is the viewport's leftover and margin
        // would be added on top of it and push the bottom edge off screen.
        // Without this the pane borders sit flush against the window edge.
        pb: 1,
        ...(focus
          ? {
              position: 'fixed',
              inset: 0,
              // Above DesktopSidebar (drawer, 1200) and TopBar/BottomNav
              // (appBar, 1100), below modal (1300) so every dialog on this page
              // still opens on top of it.
              zIndex: (theme) => theme.zIndex.drawer + 2,
              bgcolor: 'background.default',
              px: { xs: 1.5, md: 2 },
              py: 1,
            }
          : heightSx),
      }}
    >
      {children}
    </Box>
  );
}
