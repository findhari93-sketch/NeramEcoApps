/**
 * Demo Class v2: request-first bookings.
 *
 * Rows live in demo_class_registrations (slot_id null, ref_code set). Staff work
 * them from the admin request desk; the student sees them on /demo-class/my.
 * Server-only: every function defaults to the service-role client.
 *
 * The generated Database type does not know these columns yet, so the client is
 * widened at the `.from()` boundary and rows are typed here.
 */

import type { TypedSupabaseClient } from '../client';
import { getSupabaseAdminClient } from '../client';
import {
  ACTIVE_DEMO_STATUSES,
  type DemoMessageKind,
  type DemoRequestStatus,
  type DemoWindow,
} from '../utils/demo-schedule';

export interface DemoRequest {
  id: string;
  user_id: string | null;
  ref_code: string | null;
  join_token: string | null;
  name: string;
  email: string | null;
  phone: string;
  current_class: string | null;
  interest_course: string | null;
  city: string | null;
  status: DemoRequestStatus;
  preferred_date: string | null;
  preferred_window: DemoWindow | null;
  parent_joining: boolean;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  preferred_language: string | null;
  scheduled_start: string | null;
  scheduled_minutes: number;
  schedule_change_reason: string | null;
  host_user_id: string | null;
  organizer_upn: string | null;
  /** Staff on this demo: calendar invite + Neram Assistant reminders. */
  staff_upns: string[];
  /** Who teaches it; students see this name. */
  tutor_upn: string | null;
  teams_join_url: string | null;
  graph_event_id: string | null;
  next_contact_at: string | null;
  last_call_outcome: 'interested' | 'no_answer' | 'call_back' | 'not_interested' | null;
  drawing_received_at: string | null;
  drawing_feedback_at: string | null;
  cancel_reason: string | null;
  rejection_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  attended: boolean | null;
  attendance_marked_at: string | null;
  channel: string | null;
  landing_page: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
  updated_at: string;
}

export interface DemoRequestEvent {
  id: string;
  registration_id: string;
  kind: 'call' | 'note' | 'status' | 'message' | 'schedule' | 'drawing';
  outcome: string | null;
  note: string | null;
  actor_id: string | null;
  created_at: string;
}

export interface DemoRequestMessage {
  id: string;
  registration_id: string;
  /** 'whatsapp' (admin cron, students/parents) or 'assistant' (Nexus cron, staff). */
  channel: 'whatsapp' | 'assistant';
  recipient: 'student' | 'parent' | 'staff';
  to_phone: string | null;
  to_user_id: string | null;
  kind: DemoMessageKind;
  send_after: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled' | 'skipped';
  external_message_id: string | null;
  error_message: string | null;
  retry_count: number;
  sent_at: string | null;
  created_at: string;
}

export interface CreateDemoRequestInput {
  user_id: string;
  ref_code: string;
  join_token: string;
  name: string;
  email: string | null;
  phone: string;
  current_class: string | null;
  preferred_date: string | null;
  preferred_window: DemoWindow;
  parent_joining: boolean;
  parent_name: string | null;
  parent_phone: string | null;
  preferred_language: string | null;
  interest_course?: string | null;
}

/** Only v2 rows: a ref_code is what marks a request (vs an old slot registration). */
const V2 = 'ref_code';

// The generated Database type predates these tables and columns.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (client?: TypedSupabaseClient): any => client ?? getSupabaseAdminClient();

export async function createDemoRequest(
  input: CreateDemoRequestInput,
  client?: TypedSupabaseClient,
): Promise<DemoRequest> {
  const { data, error } = await db(client)
    .from('demo_class_registrations')
    .insert({ ...input, slot_id: null, status: 'pending' })
    .select('*')
    .single();
  if (error) throw error;
  return data as DemoRequest;
}

export async function getActiveDemoRequestForUser(
  userId: string,
  client?: TypedSupabaseClient,
): Promise<DemoRequest | null> {
  const { data, error } = await db(client)
    .from('demo_class_registrations')
    .select('*')
    .eq('user_id', userId)
    .not(V2, 'is', null)
    .in('status', ACTIVE_DEMO_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as DemoRequest) ?? null;
}

/** The newest request in any state: what /demo-class/my shows. */
export async function getLatestDemoRequestForUser(
  userId: string,
  client?: TypedSupabaseClient,
): Promise<DemoRequest | null> {
  const { data, error } = await db(client)
    .from('demo_class_registrations')
    .select('*')
    .eq('user_id', userId)
    .not(V2, 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as DemoRequest) ?? null;
}

export async function getDemoRequestById(id: string, client?: TypedSupabaseClient): Promise<DemoRequest | null> {
  const { data, error } = await db(client)
    .from('demo_class_registrations')
    .select('*')
    .eq('id', id)
    .not(V2, 'is', null)
    .maybeSingle();
  if (error) throw error;
  return (data as DemoRequest) ?? null;
}

export async function getDemoRequestByToken(token: string, client?: TypedSupabaseClient): Promise<DemoRequest | null> {
  if (!/^[A-Za-z0-9]{16,64}$/.test(token)) return null;
  const { data, error } = await db(client)
    .from('demo_class_registrations')
    .select('*')
    .eq('join_token', token)
    .maybeSingle();
  if (error) throw error;
  return (data as DemoRequest) ?? null;
}

export async function updateDemoRequest(
  id: string,
  patch: Partial<Omit<DemoRequest, 'id' | 'created_at'>>,
  client?: TypedSupabaseClient,
): Promise<DemoRequest> {
  const { data, error } = await db(client)
    .from('demo_class_registrations')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as DemoRequest;
}

/** Every v2 request, newest first. The desk is small (tens a week), so it filters client-side. */
export async function listDemoRequests(
  options: { since?: string; limit?: number } = {},
  client?: TypedSupabaseClient,
): Promise<DemoRequest[]> {
  let q = db(client)
    .from('demo_class_registrations')
    .select('*')
    .not(V2, 'is', null)
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 500);
  if (options.since) q = q.gte('created_at', options.since);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DemoRequest[];
}

export async function logDemoRequestEvent(
  event: Omit<DemoRequestEvent, 'id' | 'created_at'>,
  client?: TypedSupabaseClient,
): Promise<void> {
  const { error } = await db(client).from('demo_request_events').insert(event);
  if (error) throw error;
}

export async function listDemoRequestEvents(
  registrationId: string,
  client?: TypedSupabaseClient,
): Promise<DemoRequestEvent[]> {
  const { data, error } = await db(client)
    .from('demo_request_events')
    .select('*')
    .eq('registration_id', registrationId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as DemoRequestEvent[];
}

/** Last 10 digits, or null when it is not an Indian mobile number. */
export function demoPhone10(raw: string | null | undefined): string | null {
  const d = (raw || '').replace(/\D/g, '').slice(-10);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/**
 * Queue WhatsApp sends for the student, plus a copy for the parent when a
 * parent number was given.
 */
export async function enqueueDemoMessages(
  request: Pick<DemoRequest, 'id' | 'phone' | 'parent_phone'>,
  plan: Array<{ kind: DemoMessageKind; sendAfter: Date }>,
  client?: TypedSupabaseClient,
): Promise<void> {
  const student = demoPhone10(request.phone);
  const parent = demoPhone10(request.parent_phone);
  const rows = plan.flatMap((p) => {
    const base = { registration_id: request.id, kind: p.kind, send_after: p.sendAfter.toISOString() };
    const out: Array<Record<string, unknown>> = [];
    if (student) out.push({ ...base, channel: 'whatsapp', recipient: 'student', to_phone: student });
    if (parent && parent !== student) out.push({ ...base, channel: 'whatsapp', recipient: 'parent', to_phone: parent });
    return out;
  });
  if (!rows.length) return;
  const { error } = await db(client).from('demo_request_messages').insert(rows);
  if (error) throw error;
}

/** Queue Neram Assistant reminders for staff (sent by the Nexus cron). */
export async function enqueueDemoStaffMessages(
  registrationId: string,
  rows: Array<{ userId: string; kind: DemoMessageKind; sendAfter: Date }>,
  client?: TypedSupabaseClient,
): Promise<void> {
  if (!rows.length) return;
  const { error } = await db(client)
    .from('demo_request_messages')
    .insert(
      rows.map((r) => ({
        registration_id: registrationId,
        channel: 'assistant',
        recipient: 'staff',
        to_user_id: r.userId,
        kind: r.kind,
        send_after: r.sendAfter.toISOString(),
      })),
    );
  if (error) throw error;
}

/**
 * Nexus user ids for staff Microsoft addresses, matched case-insensitively
 * (a UPN's case is not reliable). Unknown addresses are left out.
 */
export async function staffUserIdsByUpn(
  upns: string[],
  client?: TypedSupabaseClient,
): Promise<Record<string, string>> {
  const wanted = Array.from(new Set(upns.map((u) => u.trim().toLowerCase()).filter(Boolean)));
  const out: Record<string, string> = {};
  for (const upn of wanted) {
    const { data } = await db(client).from('users').select('id').ilike('email', upn).limit(1).maybeSingle();
    if (data?.id) out[upn] = data.id as string;
  }
  return out;
}

/** Stop queued sends (e.g. on reschedule or cancel). Omit `kinds` to stop all. */
export async function cancelPendingDemoMessages(
  registrationId: string,
  kinds?: DemoMessageKind[],
  client?: TypedSupabaseClient,
): Promise<void> {
  let q = db(client)
    .from('demo_request_messages')
    .update({ status: 'cancelled' })
    .eq('registration_id', registrationId)
    .in('status', ['pending', 'failed']);
  if (kinds?.length) q = q.in('kind', kinds);
  const { error } = await q;
  if (error) throw error;
}

/**
 * Sends that are due: pending, or failed with retries left and not a
 * permanent Meta failure. Anything due more than 6 hours ago is skipped by the
 * caller rather than sent late (a "starts in 30 minutes" sent the next day
 * is worse than none).
 */
export async function getDueDemoMessages(
  now: Date,
  channel: DemoRequestMessage['channel'],
  client?: TypedSupabaseClient,
): Promise<DemoRequestMessage[]> {
  const { data, error } = await db(client)
    .from('demo_request_messages')
    .select('*')
    .eq('channel', channel)
    .lte('send_after', now.toISOString())
    .or('status.eq.pending,and(status.eq.failed,retry_count.lt.3)')
    .order('send_after', { ascending: true })
    .limit(40);
  if (error) throw error;
  return ((data ?? []) as DemoRequestMessage[]).filter(
    (m) =>
      m.status === 'pending' ||
      !/^(WA_DEV_MODE|WA_TEMPLATE_PARAM_MISMATCH|WA_UNDELIVERABLE|WA_NOT_CONFIGURED)/.test(m.error_message || ''),
  );
}

export async function markDemoMessageResult(
  message: Pick<DemoRequestMessage, 'id' | 'retry_count'>,
  result: { status: 'sent' | 'failed' | 'skipped'; externalMessageId?: string; error?: string },
  client?: TypedSupabaseClient,
): Promise<void> {
  const { error } = await db(client)
    .from('demo_request_messages')
    .update({
      status: result.status,
      external_message_id: result.externalMessageId ?? null,
      error_message: result.error ?? null,
      sent_at: result.status === 'sent' ? new Date().toISOString() : null,
      retry_count: result.status === 'failed' ? message.retry_count + 1 : message.retry_count,
    })
    .eq('id', message.id);
  if (error) throw error;
}

export async function listDemoRequestMessages(
  registrationId: string,
  client?: TypedSupabaseClient,
): Promise<DemoRequestMessage[]> {
  const { data, error } = await db(client)
    .from('demo_request_messages')
    .select('*')
    .eq('registration_id', registrationId)
    .order('send_after', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DemoRequestMessage[];
}
