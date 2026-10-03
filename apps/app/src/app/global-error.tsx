'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary for errors thrown by the root layout itself. It replaces
 * the whole document, so it cannot use the MUI theme; plain inline styles only.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surfaces in the browser console and in any error capture already installed.
    console.error('Root layout crashed', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: '#F5F7FB',
          color: '#0b1629',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <main style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ color: '#4A5872', lineHeight: 1.6, margin: '0 0 24px' }}>
            aiArchitek could not load. Check your connection and try again.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                minHeight: 48,
                padding: '0 24px',
                border: 0,
                borderRadius: 10,
                background: '#0d6ecd',
                color: '#ffffff',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/dashboard')}
              style={{
                minHeight: 48,
                padding: '0 24px',
                border: '1px solid #CBD3DF',
                borderRadius: 10,
                background: '#ffffff',
                color: '#0b1629',
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Go to home
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
