'use client';

/**
 * Browser helpers for the /support screens: an authed fetch that never throws
 * on HTTP errors (the caller reads status), and short date words.
 */

import { getCurrentUser } from '@neram/auth';

export async function getIdTokenOrNull(): Promise<string | null> {
  const u = getCurrentUser();
  return u ? await u.getIdToken() : null;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** The server's friendly message, when it sent one. */
  message: string | null;
}

export async function supportFetch<T>(url: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const token = await getIdTokenOrNull();
  if (!token) return { ok: false, status: 401, data: null, message: 'Please sign in again.' };
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
    const body = await res.json().catch(() => null);
    return {
      ok: res.ok,
      status: res.status,
      data: res.ok ? (body as T) : null,
      message: body && typeof body.message === 'string' ? body.message : null,
    };
  } catch {
    return { ok: false, status: 0, data: null, message: 'You seem to be offline. Please try again.' };
  }
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then "12 Oct". */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const min = Math.floor((now - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/** "12 Oct, 4:05 pm" in IST. */
export function shortDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

const BUCKET_PREFIX = 'issue-screenshots/';

export function screenshotPathToUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_PREFIX}${path}`;
}

export function screenshotUrlToPath(url: string): string {
  const idx = url.indexOf(BUCKET_PREFIX);
  return idx >= 0 ? url.slice(idx + BUCKET_PREFIX.length) : url;
}

/** Upload one picture for a ticket (compressed first). Resolves to its url and storage path. */
export async function uploadSupportImage(file: File): Promise<{ url: string; path: string }> {
  const { compressForUpload } = await import('./issue-screenshot-upload');
  const token = await getIdTokenOrNull();
  if (!token) throw new Error('Please sign in again.');
  const compressed = await compressForUpload(file);
  const fd = new FormData();
  fd.append('file', compressed, 'screenshot.jpg');
  const res = await fetch('/api/error-reports/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Upload failed');
  }
  const { path } = await res.json();
  return { url: screenshotPathToUrl(path), path };
}
