'use client';

import { useEffect } from 'react';
import { siteTokens as t } from '@neram/ui/site-tokens';

// The Inter variable is not defined when this renders outside [locale]/layout, and an
// undefined var() voids the whole font stack (serif). Give it a fallback.
const fontFamily = t.fontSans.replace('var(--font-inter)', 'var(--font-inter, "Inter")');

// No MUI theme here, so hover and focus states live in one small stylesheet
// built from the site tokens.
const css = `
.err-primary,.err-outline{transition:background-color 150ms ease,color 150ms ease,border-color 150ms ease}
.err-primary:hover{background-color:${t.gold300}!important}
.err-outline:hover{background-color:${t.navy900}!important;color:${t.paper}!important;border-color:${t.navy900}!important}
a:focus-visible,button:focus-visible{outline:${t.focusOutline};outline-offset:2px}
`;

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
          backgroundColor: t.ground,
          fontFamily,
          color: t.ink,
        }}
      >
        <style>{css}</style>
        <div style={{ boxSizing: 'border-box', width: '100%', maxWidth: '480px', padding: '48px 16px', textAlign: 'center' }}>
          <div
            aria-hidden
            style={{
              width: '48px',
              height: '48px',
              margin: '0 auto 20px',
              borderRadius: `${t.radius}px`,
              backgroundColor: t.navy900,
              color: t.gold500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" focusable="false">
              <path d="M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
            </svg>
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1.25, margin: '0 0 12px', color: t.ink }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '16px', lineHeight: 1.6, margin: '0 0 32px', color: t.inkMuted }}>
            We&apos;re sorry. An unexpected error occurred. Please try again or
            return to the homepage.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => reset()}
              className="err-primary"
              style={{
                boxSizing: 'border-box',
                minHeight: '48px',
                padding: '12px 24px',
                fontFamily: 'inherit',
                fontSize: '16px',
                fontWeight: 700,
                border: '1px solid transparent',
                borderRadius: `${t.radius}px`,
                cursor: 'pointer',
                backgroundColor: t.gold500,
                color: t.navy900,
              }}
            >
              Try Again
            </button>
            <a
              href="/"
              className="err-outline"
              style={{
                boxSizing: 'border-box',
                minHeight: '48px',
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 600,
                border: `1px solid ${t.ink}`,
                borderRadius: `${t.radius}px`,
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: t.ink,
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
