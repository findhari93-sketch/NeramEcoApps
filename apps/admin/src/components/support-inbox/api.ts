'use client';

/**
 * Browser calls for the support inbox. window.fetch is wrapped once by
 * api-auth-fetch.ts, which adds the staff member's Microsoft token, so these
 * never send a name or id for "who did it": the server knows.
 */
import type { SupportTicketDetail, SupportTicketListItem, SupportTicketQueueCounts } from '@neram/database';
import { listApiQuery, type InboxUrlState } from '@/lib/support-inbox/inbox-url';
import type { TicketRequesterSummary } from '@/lib/support-inbox/server';

export type { TicketRequesterSummary };

export class TicketApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
  /** Someone else moved the ticket, or the move is no longer allowed. */
  get conflict() {
    return this.status === 409;
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new TicketApiError(json.error || 'Something went wrong. Try again.', res.status);
  return json as T;
}

export interface ListResponse {
  data: SupportTicketListItem[];
  total: number;
  hasMore: boolean;
  counts?: SupportTicketQueueCounts;
}

export function fetchTicketList(state: InboxUrlState, page: number, withCounts: boolean): Promise<ListResponse> {
  return call<ListResponse>(`/api/support-tickets?${listApiQuery(state, page, withCounts)}`);
}

export interface DetailResponse {
  data: SupportTicketDetail;
  requester: TicketRequesterSummary;
}

export function fetchTicketDetail(ref: string, seen: boolean): Promise<DetailResponse> {
  return call<DetailResponse>(`/api/support-tickets/${encodeURIComponent(ref)}${seen ? '?seen=1' : ''}`);
}

export function patchTicket(id: string, body: Record<string, unknown>): Promise<{ data: SupportTicketDetail }> {
  return call(`/api/support-tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function postTicketMessage(
  id: string,
  body: { content: string; internal?: boolean; then?: 'none' | 'ask' | 'resolve'; resolution_code?: string }
): Promise<{ ticket: SupportTicketDetail | null }> {
  return call(`/api/support-tickets/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface StaffOption {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export function fetchTicketStaff(): Promise<{ staff: StaffOption[]; me: { id: string; name: string } }> {
  return call('/api/support-tickets/staff');
}
