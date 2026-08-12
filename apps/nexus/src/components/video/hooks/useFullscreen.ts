'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Fullscreen for the video player, on the two kinds of browser that exist.
 *
 * `native` is the Fullscreen API on the player's container div. `pseudo` is a
 * fixed, full-viewport box that looks the same and is the only option on an
 * iPhone, where `Element.prototype.requestFullscreen` simply does not exist.
 *
 * The tempting third option is `video.webkitEnterFullscreen()`, which iOS does
 * support. Never call it. It hands the element to the native iOS player, which
 * restores the native scrubber (the exact control Html5Surface exists to remove),
 * the native rate menu, and AirPlay. Our React chrome is not composited over that
 * player, so the watermark disappears too. It would defeat the gate and the
 * attribution in one call.
 *
 * The distinction the caller actually cares about is `hostElement`, not the mode.
 * In native fullscreen the browser paints only the fullscreen element's subtree,
 * so anything portalled to document.body (the checkpoint quiz, chiefly) has to be
 * redirected into the container. The host is published in pseudo mode too, and
 * for the same reason it is published at all: one rule for the caller, and one
 * shape on screen. This used to be native-only, on the argument that a
 * body-portalled drawer at z-index 1200 already lands on top of the 1150 sheet.
 * That was true and still gave iPhones a different quiz from everyone else, and
 * it made the whole thing hostage to a z-index comparison between two unrelated
 * components. QuizSurface draws an `inset: 0` child of the container instead,
 * which the container's `overflow: hidden` does not clip and no MUI layer can
 * out-stack.
 */

export type FullscreenMode = 'native' | 'pseudo';

/**
 * Above MUI's app bar (1100), below its drawer (1200) and modal (1300) layers,
 * so anything else on the page that legitimately portals to document.body while
 * the player is in the CSS fallback still paints over it.
 */
export const PSEUDO_FULLSCREEN_Z_INDEX = 1150;

export interface UseFullscreenOptions {
  /** Turns the whole thing off; the button is not rendered. */
  enabled: boolean;
  /**
   * Called with the container while the player is fullscreen by either route,
   * and null otherwise. Drives where the checkpoint quiz is drawn.
   */
  onHostChange?: (el: HTMLElement | null) => void;
}

export interface UseFullscreenResult {
  isFullscreen: boolean;
  /** True only while the CSS fallback is in use, so the caller can style it. */
  isPseudo: boolean;
  toggle: () => void;
  exit: () => void;
}

function canGoNative(node: HTMLElement | null): boolean {
  return !!node && typeof node.requestFullscreen === 'function';
}

export default function useFullscreen(
  containerRef: React.MutableRefObject<HTMLElement | null>,
  { enabled, onHostChange }: UseFullscreenOptions,
): UseFullscreenResult {
  const [isNative, setIsNative] = useState(false);
  const [isPseudo, setIsPseudo] = useState(false);

  // Held in a ref so the publish effect does not re-run when a caller passes an
  // inline arrow, which every caller will.
  const onHostChangeRef = useRef(onHostChange);
  onHostChangeRef.current = onHostChange;

  /**
   * One place publishes the host, so native and pseudo cannot disagree and the
   * unmount case cannot be forgotten. A caller that stored the element in state
   * would otherwise keep portalling into a node that is no longer in the document.
   */
  useEffect(() => {
    onHostChangeRef.current?.(isNative || isPseudo ? containerRef.current : null);
  }, [isNative, isPseudo, containerRef]);

  useEffect(() => () => onHostChangeRef.current?.(null), []);

  useEffect(() => {
    if (!enabled) return;
    const onChange = () => {
      const active = document.fullscreenElement === containerRef.current;
      setIsNative(active);
      // Leaving fullscreen by Escape or the browser's own affordance must not
      // strand the orientation lock.
      if (!active) {
        try {
          screen.orientation?.unlock?.();
        } catch {
          /* Not supported anywhere it matters. Never worth a console line. */
        }
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [enabled, containerRef]);

  // Escape leaves pseudo-fullscreen. The native path gets this from the browser.
  useEffect(() => {
    if (!isPseudo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsPseudo(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isPseudo]);

  const exit = useCallback(() => {
    setIsPseudo(false);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;

    if (isNative || isPseudo) {
      exit();
      return;
    }

    if (canGoNative(node)) {
      void node
        .requestFullscreen()
        .then(() => {
          // Landscape is the right shape for a lecture, but this throws outright
          // on every iOS Safari and, on Android, resolves only inside an active
          // fullscreen. It is a nicety: never let anything depend on it.
          try {
            void (screen.orientation as { lock?: (o: string) => Promise<void> })
              ?.lock?.('landscape')
              ?.catch(() => {});
          } catch {
            /* NotSupportedError. Expected. */
          }
        })
        .catch(() => {
          // Some embedded webviews advertise the method and then refuse it.
          setIsPseudo(true);
        });
      return;
    }

    setIsPseudo(true);
  }, [containerRef, isNative, isPseudo, exit]);

  return { isFullscreen: isNative || isPseudo, isPseudo, toggle, exit };
}
