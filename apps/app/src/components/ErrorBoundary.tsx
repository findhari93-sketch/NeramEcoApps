'use client';

/**
 * Global error logging - catches uncaught JS errors and unhandled rejections
 * and POSTs them to /api/diagnostics for crash logging.
 */

import { useEffect } from 'react';

interface ErrorBoundaryProps {
  idToken: string | null;
  sessionId: string | null;
}

function sendErrorLog(
  idToken: string,
  sessionId: string | null,
  errorData: {
    error_type: string;
    error_message: string;
    error_stack?: string;
    page_url: string;
    component?: string;
  }
) {
  // Use sendBeacon for reliability (works even during page unload)
  const payload = JSON.stringify({
    type: 'error',
    idToken,
    session_id: sessionId,
    ...errorData,
  });

  // Try fetch first, fall back to sendBeacon
  fetch('/api/diagnostics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }).catch(() => {
    // If fetch fails (e.g., during unload), try sendBeacon
    try {
      navigator.sendBeacon('/api/diagnostics', new Blob([payload], { type: 'application/json' }));
    } catch {
      // Silently fail - we don't want error logging to cause more errors
    }
  });
}

export function GlobalErrorLogger({ idToken, sessionId }: ErrorBoundaryProps) {
  useEffect(() => {
    if (!idToken) return;

    const handleError = (event: ErrorEvent) => {
      sendErrorLog(idToken, sessionId, {
        error_type: 'js_error',
        error_message: event.message || 'Unknown error',
        error_stack: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`,
        page_url: window.location.href,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      sendErrorLog(idToken, sessionId, {
        error_type: 'unhandled_rejection',
        error_message: reason?.message || String(reason) || 'Unhandled promise rejection',
        error_stack: reason?.stack || undefined,
        page_url: window.location.href,
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [idToken, sessionId]);

  return null;
}
