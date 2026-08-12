'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Drawer, SwipeableDrawer, alpha, useTheme, useMediaQuery } from '@neram/ui';
import { videoOverlayDialogProps } from './overlay-dialog';

/**
 * Where a quiz is drawn, so the two quiz modals cannot answer that differently.
 *
 * There are two situations and they need different shapes.
 *
 * Inline, the player is a 16:9 box about 211px tall on a 375px phone. Nothing
 * useful fits on top of it, so the quiz stays a drawer at the edge of the
 * viewport: a bottom sheet on mobile, a right-hand drawer on desktop. That is
 * what shipped and it works.
 *
 * Fullscreen is the case this component exists for. A drawer portalled to
 * document.body is not painted at all, because the browser paints only the
 * fullscreen element's subtree, so a student reached a checkpoint, the video
 * paused, and nothing appeared. The player publishes its container through
 * `onFullscreenChange` and the caller hands it here as `container`; the quiz
 * then becomes an absolutely positioned child of that container, which is on
 * screen by construction and needs no z-index race with MUI's layers.
 *
 * The panel goes to the right edge and the scrim is deliberately light. A
 * checkpoint question is usually about what is on the paused frame, so hiding
 * the frame to ask about it would be the wrong trade. Below roughly 700px of
 * surface width, or 420px of height, there is no room beside the video and it
 * becomes a bottom sheet instead.
 */

/** Above every control the player draws (its scale tops out at 5). */
const QUIZ_SURFACE_Z_INDEX = 10;

/** Below this there is no room for a panel beside the video. */
const SIDE_PANEL_MIN_WIDTH = 700;
const SIDE_PANEL_MIN_HEIGHT = 420;

/**
 * Layout effect on the client, plain effect on the server, chosen once at module
 * load so the hook count never changes. The measurement has to land before the
 * browser paints or the panel renders as a sheet for a frame and then jumps to
 * the side; useLayoutEffect during SSR is a React warning, hence the pair.
 */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface QuizSurfaceProps {
  open: boolean;
  /**
   * The player's container while it is fullscreen, null otherwise. Non-null
   * switches this from a viewport drawer to an overlay inside the player.
   */
  container?: HTMLElement | null;
  /** False for a mandatory checkpoint: no close affordance, no dismissal. */
  dismissable?: boolean;
  onDismiss: () => void;
  /** Names the dialog for a screen reader. */
  ariaLabel: string;
  children: React.ReactNode;
}

/**
 * Measures the host rather than the viewport. In both fullscreen modes they are
 * the same thing, but reading the element keeps this honest if a caller ever
 * passes a container that is not full-screen sized. Falls back to the window
 * when the element cannot be measured, which is the right answer in fullscreen
 * and the only answer in jsdom.
 */
function useHostSize(container: HTMLElement | null | undefined) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!container) {
      setSize(null);
      return;
    }
    const measure = () => {
      const rect = container.getBoundingClientRect();
      setSize({
        width: rect.width || window.innerWidth,
        height: rect.height || window.innerHeight,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(container);
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [container]);

  return size;
}

export default function QuizSurface({
  open,
  container,
  dismissable = true,
  onDismiss,
  ariaLabel,
  children,
}: QuizSurfaceProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const hostSize = useHostSize(container);
  const panelRef = useRef<HTMLDivElement | null>(null);

  /**
   * The overlay is not a MUI Modal, so nothing moves focus into it. Without
   * this the player container keeps focus and the first Tab walks the control
   * bar rather than the questions.
   */
  useEffect(() => {
    if (!open || !container) return;
    panelRef.current?.focus({ preventScroll: true });
  }, [open, container]);

  if (container) {
    if (!open) return null;

    const sidePanel =
      !!hostSize &&
      hostSize.width >= SIDE_PANEL_MIN_WIDTH &&
      hostSize.height >= SIDE_PANEL_MIN_HEIGHT;

    return createPortal(
      <Box
        {...videoOverlayDialogProps}
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: QUIZ_SURFACE_Z_INDEX,
          display: 'flex',
          // A side panel hugs the right edge; a sheet sits on the floor.
          alignItems: sidePanel ? 'stretch' : 'flex-end',
          justifyContent: 'flex-end',
          // Light enough that the frame the question is about stays readable.
          bgcolor: alpha('#000', 0.45),
        }}
        onClick={dismissable ? onDismiss : undefined}
      >
        <Box
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          // The shape is a layout decision made from the host's measurements, so
          // it is worth stating in the DOM: emotion styles are class names, and a
          // test asserting on those asserts on nothing durable.
          data-quiz-layout={sidePanel ? 'side' : 'sheet'}
          onClick={(e) => e.stopPropagation()}
          sx={{
            bgcolor: 'background.paper',
            color: 'text.primary',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
            outline: 'none',
            '&:focus-visible': { boxShadow: 'inset 0 0 0 3px rgba(66,165,245,0.9)' },
            ...(sidePanel
              ? {
                  width: 'clamp(320px, 42%, 460px)',
                  height: '100%',
                  borderTopLeftRadius: 16,
                  borderBottomLeftRadius: 16,
                }
              : {
                  width: '100%',
                  maxHeight: '82%',
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                }),
            ...(reduceMotion
              ? null
              : {
                  animation: `${sidePanel ? 'quizPanelSlideIn' : 'quizSheetSlideUp'} 220ms ease-out`,
                  '@keyframes quizPanelSlideIn': {
                    from: { transform: 'translateX(28px)', opacity: 0 },
                    to: { transform: 'none', opacity: 1 },
                  },
                  '@keyframes quizSheetSlideUp': {
                    from: { transform: 'translateY(28px)', opacity: 0 },
                    to: { transform: 'none', opacity: 1 },
                  },
                }),
          }}
        >
          {!sidePanel && <DragHandle />}
          {children}
        </Box>
      </Box>,
      container,
    );
  }

  /**
   * `container` goes through ModalProps rather than as a top-level prop because
   * that is the one path Drawer and SwipeableDrawer treat identically: Drawer
   * spreads ModalProps last, so it wins, and SwipeableDrawer merges it into the
   * ModalProps it forwards. It is always undefined on this branch, but keeping
   * one object means the two drawers cannot drift again.
   */
  const modalProps = { disableEscapeKeyDown: !dismissable };

  if (isMobile) {
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={dismissable ? onDismiss : () => {}}
        onOpen={() => {}}
        disableSwipeToOpen={!dismissable}
        disableDiscovery={!dismissable}
        ModalProps={modalProps}
        PaperProps={{
          role: 'dialog',
          'aria-modal': true,
          'aria-label': ariaLabel,
          sx: {
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '85vh',
          },
        }}
      >
        <DragHandle />
        {children}
      </SwipeableDrawer>
    );
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={dismissable ? onDismiss : () => {}}
      ModalProps={modalProps}
      PaperProps={{
        role: 'dialog',
        'aria-modal': true,
        'aria-label': ariaLabel,
        sx: {
          width: { md: 420, lg: 460 },
          maxWidth: '100vw',
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 16,
        },
      }}
    >
      {children}
    </Drawer>
  );
}

function DragHandle() {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
      <Box
        sx={{
          width: 40,
          height: 4,
          borderRadius: 2,
          bgcolor: alpha(theme.palette.text.primary, 0.2),
        }}
      />
    </Box>
  );
}
