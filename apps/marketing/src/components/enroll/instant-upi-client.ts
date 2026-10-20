'use client';

/**
 * The browser side of Instant UPI: which methods are on, start an order for
 * an intent, poll it, cancel it. Every call carries the Firebase token; every
 * amount comes back from the server.
 */
import { getCurrentUser } from '@neram/auth';
import type { InstantOrder, InstantStatus } from './InstantUpiPanel';

export interface PaymentMethodsView {
  upiAuto: { available: boolean; reason: string | null; orderMinutes: number; mode?: 'live' | 'shadow' };
  upiProof: { available: boolean };
  bankProof: { available: boolean };
  razorpay: { available: boolean; feePercent: number };
}

async function authHeaders(): Promise<Record<string, string>> {
  const idToken = await getCurrentUser()?.getIdToken();
  return { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) };
}

export async function fetchPaymentMethods(): Promise<PaymentMethodsView | null> {
  try {
    const res = await fetch('/api/payments/methods');
    if (!res.ok) return null;
    return (await res.json()) as PaymentMethodsView;
  } catch {
    return null;
  }
}

/** Creates the intent (enrol link: saves the form; balance: the next due) and returns its id. */
export async function createIntent(body: Record<string, unknown>): Promise<string> {
  const res = await fetch('/api/payments/intents', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not prepare the payment.');
  return json.data.intentId as string;
}

export async function startInstantOrder(intentId: string): Promise<InstantOrder> {
  const res = await fetch('/api/payments/attempts', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ intentId, method: 'upi_auto' }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not start the instant payment.');
  const d = json.data;
  return { attemptId: d.attemptId, amountPaise: d.amountPaise, paiseTag: d.paiseTag ?? null, upiUri: d.upiUri, expiresAt: d.expiresAt, payeeName: d.payeeName, upiId: d.upiId, note: d.note };
}

export async function pollInstantOrder(attemptId: string): Promise<InstantStatus> {
  const res = await fetch(`/api/payments/attempts/${encodeURIComponent(attemptId)}`, { headers: await authHeaders(), cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not read the payment.');
  return { state: json.data.state, enrolled: !!json.data.enrolled, expiresAt: json.data.expiresAt ?? null };
}

export async function cancelInstantOrder(attemptId: string): Promise<void> {
  await fetch(`/api/payments/attempts/${encodeURIComponent(attemptId)}`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ action: 'cancel' }) });
}
