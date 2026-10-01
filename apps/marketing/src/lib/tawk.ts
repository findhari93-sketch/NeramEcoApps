/**
 * Lazy Tawk.to loader.
 *
 * The Tawk.to embed is about 300 KB of script plus an iframe and a socket.
 * It used to load on every marketing page (hidden). Now nothing loads until a
 * visitor taps a chat button; the first tap downloads it, later taps reuse it.
 */

type TawkApi = Record<string, unknown> & {
  showWidget?: () => void;
  hideWidget?: () => void;
  maximize?: () => void;
  onLoad?: () => void;
  onChatMinimized?: () => void;
};

declare global {
  interface Window {
    Tawk_API?: TawkApi;
    Tawk_LoadStart?: Date;
  }
}

const SCRIPT_ID = 'tawk-to-script';
const LOAD_TIMEOUT_MS = 20000;

let pending: Promise<boolean> | null = null;

function isReady(api: TawkApi | undefined): api is TawkApi & { maximize: () => void } {
  return !!api && typeof api.maximize === 'function';
}

/** Loads the Tawk.to embed once. Resolves true when the widget API is ready. */
export function loadTawk(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (isReady(window.Tawk_API)) return Promise.resolve(true);
  if (pending) return pending;

  const propertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID?.trim();
  const widgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID?.trim();
  if (!propertyId || !widgetId) return Promise.resolve(false);

  pending = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (!ok) pending = null;
      resolve(ok);
    };

    const api: TawkApi = window.Tawk_API || {};
    window.Tawk_API = api;
    window.Tawk_LoadStart = new Date();
    const previousOnLoad = api.onLoad;
    api.onLoad = () => {
      try {
        previousOnLoad?.();
      } finally {
        finish(true);
      }
    };

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    script.addEventListener('error', () => {
      script.remove();
      finish(false);
    });
    document.head.appendChild(script);

    window.setTimeout(() => finish(isReady(window.Tawk_API)), LOAD_TIMEOUT_MS);
  });
  return pending;
}

/**
 * Loads Tawk.to if needed, then opens the chat window. Resolves false when the
 * widget could not load (caller shows a fallback).
 *
 * hideOnMinimize: hide the Tawk bubble again when the visitor minimises the
 * chat, for pages that have their own chat launcher.
 */
export async function openTawkChat(options: { hideOnMinimize?: boolean } = {}): Promise<boolean> {
  const ok = await loadTawk();
  const api = typeof window === 'undefined' ? undefined : window.Tawk_API;
  if (!ok || !isReady(api)) return false;
  // Set (or clear) every time: a page with its own launcher hides the bubble on
  // minimise, the contact page keeps the Tawk bubble as its way back in.
  api.onChatMinimized = options.hideOnMinimize ? () => api.hideWidget?.() : undefined;
  try {
    api.showWidget?.();
    api.maximize();
    return true;
  } catch {
    return false;
  }
}

/** Hides the Tawk bubble if the widget was loaded (no-op otherwise). */
export function hideTawk(): void {
  if (typeof window === 'undefined') return;
  try {
    window.Tawk_API?.hideWidget?.();
  } catch {
    // The widget may be mid-initialisation; nothing to hide yet.
  }
}
