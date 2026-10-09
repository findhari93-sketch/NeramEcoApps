/**
 * Browser helpers for Demo Class v2: the signed-in token, the API calls and
 * the draft that survives the sign-in popup or a reload.
 */

import type { DemoWindow } from '@neram/database/demo-schedule';
import type { PublicDemoRequest } from '@/lib/demo-request';

export interface DemoDraft {
  /** 0 When, 1 Who (sign in, then the details). */
  step: 0 | 1;
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
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Omit<DemoDraft, 'step'>> & { step?: number };
    // Drafts saved before the booking went to two steps may say step 2.
    return { ...EMPTY_DRAFT, ...saved, step: saved.step && saved.step > 0 ? 1 : 0 };
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

const APPLY_DRAFT_KEY = 'neram_application_draft';

/** The apply form's "I'm currently in" answer as a demo class pill. */
const APPLY_CLASS_TO_DEMO: Record<string, string> = {
  '11': '11th',
  '12': '12th',
  repeater: '12th-pass',
  other: 'other',
};

/** The apply form saved a draft on this device (it keeps one for 7 days). */
export function hasApplyDraft(): boolean {
  try {
    return !!window.localStorage.getItem(APPLY_DRAFT_KEY);
  } catch {
    return false;
  }
}

/**
 * Name and class from the apply draft, for a student who left the form to
 * book a demo. Only what the form already holds; empty strings otherwise.
 */
export function applyDraftPrefill(): { name: string; currentClass: string } {
  try {
    const raw = window.localStorage.getItem(APPLY_DRAFT_KEY);
    if (!raw) return { name: '', currentClass: '' };
    const state = JSON.parse(raw) as {
      formData?: {
        personal?: { firstName?: string };
        academic?: { applicantCategory?: string; currentlyIn?: string; schoolStudentData?: { current_class?: string } | null };
      };
    };
    const name = (state.formData?.personal?.firstName || '').trim();
    const academic = state.formData?.academic;
    let currentlyIn = academic?.currentlyIn || '';
    if (academic?.applicantCategory === 'school_student') {
      const cls = academic.schoolStudentData?.current_class;
      if (cls === '11' || cls === '12') currentlyIn = cls;
      else if (cls === '12_completed') currentlyIn = 'repeater';
    } else if (academic?.applicantCategory) {
      currentlyIn = 'other';
    }
    return { name, currentClass: APPLY_CLASS_TO_DEMO[currentlyIn] || '' };
  } catch {
    return { name: '', currentClass: '' };
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
