'use client';

/**
 * Client-side error ring buffer (student PWA copy — mirrors apps/nexus).
 *
 * `installErrorCapture()` (called once from the protected shell) passively
 * records a capped ring of recent console errors/warnings, uncaught errors,
 * unhandled promise rejections, and failed `fetch` responses. When the student
 * opens the "Report a problem" dialog, `getRecentErrors()` is attached to the
 * ticket so staff can see what went wrong — WITHOUT the student ever seeing the
 * technical detail.
 */

import type { FoundationIssueLogEntry } from '@neram/database/types';

const MAX_ENTRIES = 50;
const MSG_MAX = 2000;
const BODY_MAX = 500;

const buffer: FoundationIssueLogEntry[] = [];
let installed = false;

function truncate(s: string, max = MSG_MAX): string {
  return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
}

function push(entry: FoundationIssueLogEntry) {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Record an entry explicitly (e.g. from an error boundary's caught error). */
export function recordError(entry: { level?: FoundationIssueLogEntry['level']; message: string; stack?: string | null; url?: string | null; status?: number | null }) {
  push({
    level: entry.level || 'error',
    message: truncate(entry.message || 'Unknown error'),
    stack: entry.stack ? truncate(entry.stack) : null,
    url: entry.url ?? null,
    status: entry.status ?? null,
    at: nowIso(),
  });
}

/** Recent captured entries, newest first. Safe to attach to a report. */
export function getRecentErrors(): FoundationIssueLogEntry[] {
  return buffer.slice().reverse();
}

function argsToString(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof Request) return input.url;
  if (input instanceof URL) return input.toString();
  try {
    return String(input);
  } catch {
    return 'unknown';
  }
}

export function installErrorCapture() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    push({ level: 'error', message: truncate(argsToString(args)), stack: null, url: null, status: null, at: nowIso() });
    origError(...args);
  };
  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    push({ level: 'warn', message: truncate(argsToString(args)), stack: null, url: null, status: null, at: nowIso() });
    origWarn(...args);
  };

  window.addEventListener('error', (e: ErrorEvent) => {
    recordError({ message: e.message || 'Uncaught error', stack: e.error?.stack || null });
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason as { message?: string; stack?: string } | undefined;
    recordError({
      message: `Unhandled rejection: ${reason?.message || String(e.reason)}`,
      stack: reason?.stack || null,
    });
  });

  if (typeof window.fetch !== 'function') return;
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const res = await origFetch(input, init);
      if (!res.ok) {
        let body = '';
        try {
          body = truncate(await res.clone().text(), BODY_MAX);
        } catch {
          /* body not readable — ignore */
        }
        recordError({
          message: `HTTP ${res.status} ${urlOf(input)}${body ? ` — ${body}` : ''}`,
          url: urlOf(input),
          status: res.status,
        });
      }
      return res;
    } catch (err) {
      recordError({
        message: `Fetch failed: ${urlOf(input)} — ${(err as Error)?.message || 'network error'}`,
        url: urlOf(input),
      });
      throw err;
    }
  };
}
