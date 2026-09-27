/**
 * Server-side first-party events (lifecycle plan M3b), for steps the browser
 * cannot be trusted to report: payment started, completed and failed.
 *
 * recordServerEvent never throws and never blocks the request on failure. The
 * row builder is pure (unit tested in server-events.test.ts) and keeps secrets
 * out: only an order id prefix, never signatures, payment ids or keys.
 */

import { insertFunnelEvent, type TypedSupabaseClient, type UserFunnelEventInsert } from '@neram/database';
import { ANON_ID_COOKIE, EVENT_TAXONOMY, isValidAnonymousId, readCookie, type TaxonomyEvent } from '@neram/database/analytics';

export type ServerEventStatus = 'started' | 'completed' | 'failed' | 'skipped';

/** Enough of a Razorpay order id to join on in support, not the whole id. */
export function orderIdPrefix(orderId: unknown): string | null {
  return typeof orderId === 'string' && orderId ? orderId.slice(0, 12) : null;
}

const SECRET_KEY = /secret|signature|token|password|key|razorpay_payment_id|card|vpa|phone|email/i;

/** Drop anything that looks like a secret or personal detail, keep plain scalars. */
export function safeMetadata(metadata: Record<string, unknown> | undefined): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(metadata || {})) {
    if (SECRET_KEY.test(k)) continue;
    if (v === null || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 120);
  }
  return out;
}

export function buildServerEventRow(input: {
  event: TaxonomyEvent;
  status: ServerEventStatus;
  userId?: string | null;
  anonymousId?: string | null;
  pageUrl?: string | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
}): UserFunnelEventInsert {
  return {
    user_id: input.userId || null,
    anonymous_id: isValidAnonymousId(input.anonymousId) ? input.anonymousId : null,
    session_id: null,
    funnel: EVENT_TAXONOMY[input.event] as UserFunnelEventInsert['funnel'],
    event: input.event,
    status: input.status,
    error_message: null,
    error_code: input.errorCode ? String(input.errorCode).slice(0, 64) : null,
    metadata: safeMetadata(input.metadata),
    device_session_id: null,
    device_type: null,
    browser: null,
    os: null,
    ip_address: null,
    source_app: 'marketing',
    page_url: input.pageUrl ?? null,
  };
}

/** The shared anonymous id from the request cookie, if it is one of ours. */
export function anonymousIdFromRequest(request: { headers: { get(name: string): string | null } }): string | null {
  const id = readCookie(request.headers.get('cookie'), ANON_ID_COOKIE);
  return isValidAnonymousId(id) ? id : null;
}

export async function recordServerEvent(
  client: TypedSupabaseClient,
  input: Parameters<typeof buildServerEventRow>[0],
): Promise<void> {
  try {
    await insertFunnelEvent(client, buildServerEventRow(input));
  } catch (error) {
    console.error('[analytics] server event not recorded:', input.event, error);
  }
}
