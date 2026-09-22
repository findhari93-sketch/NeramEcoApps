'use client';

import { useEffect } from 'react';
import { clearPersistentCache } from '@/lib/swr-cache';
import { clearCachedAuth } from '@/lib/auth-cache';

/**
 * Last-resort boundary for crashes in the root layout itself, where the app's
 * providers and theme are gone. Renders its own <html>/<body> with inline styles
 * and never shows the raw error. Everything below the root layout is caught by
 * app/error.tsx or a segment boundary first.
 *
 * Its button used to call reset(), which re-rendered the same tree from the same
 * device storage and could land straight back here, and nothing was recorded
 * (PERF-0028). It now reloads the page, offers to clear the saved data a crash
 * like this usually comes from, and logs the message and digest.
 */

const buttonBase = {
  minHeight: 48,
  padding: '12px 20px',
  borderRadius: 8,
  fontSize: 15,
  cursor: 'pointer',
  fontFamily: 'inherit',
} as const;

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[global-error]', error.message, error.digest ? `digest ${error.digest}` : '(no digest)');
  }, [error]);

  const clearAndReload = () => {
    clearPersistentCache();
    clearCachedAuth();
    window.location.reload();
  };

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          background: '#FAFAFA',
          color: '#1a1a1a',
        }}
      >
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 24,
            boxSizing: 'border-box',
          }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true" fill="#B45309">
            <path d="M12 2 1 21h22L12 2Zm0 4.2L19.5 19h-15L12 6.2ZM11 10v4h2v-4h-2Zm0 6v2h2v-2h-2Z" />
          </svg>
          <h1 style={{ fontSize: 20, margin: '12px 0 4px' }}>Something went wrong</h1>
          <p style={{ color: '#555', maxWidth: 420, fontSize: 15, lineHeight: 1.6 }}>
            Nexus hit an unexpected error. Reloading usually fixes it. If it keeps happening, clear
            this device&apos;s saved data and reload; you stay signed in.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 12 }}>
            <button
              onClick={() => window.location.reload()}
              style={{ ...buttonBase, border: 'none', background: '#1565c0', color: '#fff' }}
            >
              Reload
            </button>
            <button
              onClick={clearAndReload}
              style={{ ...buttonBase, border: '1px solid #1565c0', background: '#fff', color: '#1565c0' }}
            >
              Clear saved data and reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
