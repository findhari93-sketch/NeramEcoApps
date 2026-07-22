'use client';

/**
 * Last-resort boundary for crashes in the root layout itself (where app
 * providers aren't available). Renders its own <html>/<body> with inline styles
 * and never shows the raw error. Segment-level errors use the richer
 * (student)/error.tsx with the "Report this issue" flow.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 24,
          }}
        >
          <div style={{ fontSize: 48, lineHeight: 1 }}>&#9888;&#65039;</div>
          <h1 style={{ fontSize: 20, margin: '12px 0 4px' }}>Something went wrong</h1>
          <p style={{ color: '#666', maxWidth: 420, fontSize: 14 }}>
            The app hit an unexpected error. Please reload the page. If it keeps happening, let your
            teacher know.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 16,
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#1565c0',
              color: '#fff',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
