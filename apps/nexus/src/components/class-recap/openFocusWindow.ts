/**
 * Open Focus Mode in its own chromeless window on desktop.
 *
 * Three constraints shape this, and getting any of them wrong looks like the
 * feature is broken rather than like a browser rule:
 *
 * 1. window.open must be called SYNCHRONOUSLY inside the click handler. Awaiting
 *    anything first (a token, a fetch) means the call no longer counts as a user
 *    gesture and the popup blocker kills it silently. So this takes no async
 *    work: the popup mints its own grant after it loads.
 *
 * 2. `noopener` is deliberately NOT used. The opener needs the handle to notice
 *    the window closing and refresh its checkpoint list. Same origin, so there is
 *    no cross-origin risk to mitigate.
 *
 * 3. Fullscreen cannot be requested here. It needs a gesture inside the popup
 *    itself, which is why the focus page opens on a "Ready to watch" screen with
 *    one button rather than going fullscreen on load.
 */

export interface FocusWindowHandle {
  /** Null when the browser blocked the popup, so the caller can fall back. */
  win: Window | null;
}

/** Roughly 16:9 plus room for the control bar, clamped to the screen. */
function preferredSize(): { width: number; height: number } {
  const w = Math.min(1280, Math.max(880, Math.floor(window.screen.availWidth * 0.8)));
  const h = Math.min(820, Math.max(560, Math.floor((w * 9) / 16) + 140));
  return { width: w, height: h };
}

export function openFocusWindow(recapId: string): FocusWindowHandle {
  if (typeof window === 'undefined') return { win: null };

  const { width, height } = preferredSize();
  const left = Math.max(0, Math.floor((window.screen.availWidth - width) / 2));
  const top = Math.max(0, Math.floor((window.screen.availHeight - height) / 2));

  const features = [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'resizable=yes',
    'scrollbars=no',
  ].join(',');

  const win = window.open(`/student/focus/recap/${recapId}`, `neram-focus-${recapId}`, features);
  if (win) win.focus();
  return { win };
}

/**
 * Watch a focus window until it closes, then tell the opener to refresh. Polling
 * is the only option: a same-origin popup fires no event the opener can listen
 * for when the user closes it.
 */
export function onFocusWindowClosed(win: Window | null, done: () => void): () => void {
  if (!win) return () => {};
  const id = setInterval(() => {
    if (win.closed) {
      clearInterval(id);
      done();
    }
  }, 1000);
  return () => clearInterval(id);
}

/** Channel name both windows agree on, for live checkpoint updates. */
export const focusChannelName = (recapId: string) => `recap:${recapId}`;
