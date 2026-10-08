/**
 * Browser helpers for Demo Class v2: the signed-in token, the API calls and
 * the draft that survives the sign-in popup or a reload.
 */

import type { DemoWindow } from '@neram/database/demo-schedule';
import type { PublicDemoRequest } from '@/lib/demo-request';

export interface DemoDraft {
  step: 0 | 1 | 2;
  date: string | null;
  window: DemoWindow | null;
  name: string;
  currentClass: string;
  language: string;
  parentJoining: boolean;
  parentName: string;
  parentPhone: string;
}

export const EMPTY_DRAFT: DemoDraft = {
  step: 0,
  date: null,
  window: null,
  name: '',
  currentClass: '',
  language: 'en',
  parentJoining: true,
  parentName: '',
  parentPhone: '',
};

const DRAFT_KEY = 'neram_demo_draft';

export function loadDraft(): DemoDraft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<DemoDraft>) } : null;
  } catch {
    return null;
  }
}

export function saveDraft(d: DemoDraft): void {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // Private mode or storage blocked: the booking still works, it just will not survive a reload.
  }
}

export function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

export async function currentIdToken(): Promise<string | null> {
  try {
    const { getFirebaseAuth } = await import('@neram/auth');
    const u = getFirebaseAuth().currentUser;
    return u ? await u.getIdToken() : null;
  } catch {
    return null;
  }
}

export type RequestResult =
  | { ok: true; request: PublicDemoRequest }
  | { ok: false; code: 'SIGN_IN_REQUIRED' | 'PHONE_REQUIRED' | 'ACTIVE_REQUEST' | 'ERROR'; message: string; request?: PublicDemoRequest | null };

async function call(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const token = await currentIdToken();
  if (!token && method !== 'GET') return { status: 401, data: { error: 'SIGN_IN_REQUIRED' } };
  const res = await fetch(path, {
    method,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function toResult(status: number, data: any): RequestResult {
  if (status >= 200 && status < 300 && data.request) return { ok: true, request: data.request };
  if (status === 401) return { ok: false, code: 'SIGN_IN_REQUIRED', message: 'Please sign in to continue.' };
  if (status === 428) return { ok: false, code: 'PHONE_REQUIRED', message: 'Please verify your WhatsApp number.' };
  if (status === 409 && data.error === 'ACTIVE_REQUEST') {
    return { ok: false, code: 'ACTIVE_REQUEST', message: 'You already have a demo booked.', request: data.request };
  }
  return { ok: false, code: 'ERROR', message: data.error || 'Something went wrong. Please try again.' };
}

export async function submitDemoRequest(draft: DemoDraft, attribution: Record<string, unknown>): Promise<RequestResult> {
  const { status, data } = await call('POST', '/api/demo-class/request', {
    date: draft.window === 'anytime' ? null : draft.date,
    window: draft.window,
    name: draft.name,
    currentClass: draft.currentClass || null,
    language: draft.language,
    parentJoining: draft.parentJoining,
    parentName: draft.parentName,
    parentPhone: draft.parentPhone,
    ...attribution,
  });
  return toResult(status, data);
}

export async function fetchMyDemo(): Promise<{ signedIn: boolean; request: PublicDemoRequest | null }> {
  const { status, data } = await call('GET', '/api/demo-class/mine');
  if (status !== 200) return { signedIn: false, request: null };
  return { signedIn: !!data.signedIn, request: data.request ?? null };
}

export async function updateMyDemo(
  body: { action: 'change_preference'; date: string | null; window: DemoWindow } | { action: 'cancel'; reason?: string },
): Promise<RequestResult> {
  const { status, data } = await call('PATCH', '/api/demo-class/mine', body);
  return toResult(status, data);
}

/** Google Ads conversion for a booked demo (only when a label is configured). */
export function fireDemoConversion(ref: string): void {
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_DEMO_LABEL;
  if (!w.gtag || !adsId || !label) return;
  w.gtag('event', 'conversion', { send_to: `${adsId}/${label}`, transaction_id: ref });
}
