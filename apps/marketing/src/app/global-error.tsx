'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const isChunkError =
      /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(
        error.message
      );
    if (isChunkError && typeof window !== 'undefined') {
      const key = 'chunk-reload-attempted';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        return;
      }
      sessionStorage.removeItem(key);
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#060d1f',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#ffffff',
        }}
      >
        <div style={{ textAlign: 'center', padding: '24px', maxWidth: '480px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              margin: '0 auto 24px',
              borderRadius: '50%',
              backgroundColor: 'rgba(232, 160, 32, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
            }}
          >
            ⚠
          </div>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 600,
              margin: '0 0 12px',
              color: '#e8a020',
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: '15px',
              lineHeight: 1.6,
              margin: '0 0 32px',
              color: 'rgba(255, 255, 255, 0.7)',
            }}
          >
            We&apos;re sorry — an unexpected error occurred. Please try again or
            return to the homepage.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => reset()}
              style={{
                padding: '12px 24px',
                fontSize: '15px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                backgroundColor: '#e8a020',
                color: '#060d1f',
              }}
            >
              Try Again
            </button>
            <a
              href="/"
              style={{
                padding: '12px 24px',
                fontSize: '15px',
                fontWeight: 600,
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: '#ffffff',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Go Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
