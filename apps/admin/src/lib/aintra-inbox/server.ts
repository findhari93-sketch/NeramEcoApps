/**
 * Server-side loading for Aintra Inbox: the light rows, the facts about the
 * signed-in people in them, and the guests staff asked to sign up. Each read
 * is one paged query; the shaping is in build.ts.
 */
import type { createAdminClient } from '@neram/database';
import type { AiReview, AiVerdict, InboxRow, InboxTurn, InboxUser, Nudge } from './types';
import { REVIEW_QUEUE_DAYS, SIGNUP_GATE_ERROR, turnStatus } from './status';

type Db = ReturnType<typeof createAdminClient>;

const PAGE = 1000;
/** Lifetime is about 850 turns today; the cap keeps the payload sane as it grows. */
export const ROW_CAP = 6000;
const IN_CHUNK = 150;

const BASE_LIGHT_COLUMNS =
  'id, session_id, user_id, user_message, source, page_url, lead_name, lead_phone, error, created_at, thumbs_up, admin_correction, promoted_to_kb, ai_verdict:ai_review->>verdict, geo_city, geo_state, geo_country, anonymous_id, device, channel';
const LIGHT_COLUMNS = `${BASE_LIGHT_COLUMNS}, resolved_at`;

/** Postgres "undefined column": resolved_at ships in a migration that may land after the code. */
const isMissingColumn = (error: any) => error?.code === '42703' || /resolved_(at|by)/.test(String(error?.message ?? ''));

const VERDICTS: AiVerdict[] = ['correct', 'needs_fix', 'wrong', 'uncertain'];
const asVerdict = (v: unknown): AiVerdict | null => (VERDICTS.includes(v as AiVerdict) ? (v as AiVerdict) : null);

export async function loadRows(db: Db): Promise<{ rows: InboxRow[]; truncated: boolean }> {
  const rows: InboxRow[] = [];
  let columns = LIGHT_COLUMNS;
  for (let from = 0; from < ROW_CAP; from += PAGE) {
    const page = () =>
      (db as any)
        .from('chatbot_conversations')
        .select(columns)
        .order('created_at', { ascending: false })
        .range(from, Math.min(from + PAGE, ROW_CAP) - 1);
    let { data, error } = await page();
    if (error && columns === LIGHT_COLUMNS && isMissingColumn(error)) {
      columns = BASE_LIGHT_COLUMNS;
      ({ data, error } = await page());
    }
    if (error) throw error;
    for (const r of (data ?? []) as any[]) {
      rows.push({
        id: r.id,
        session_id: r.session_id,
        user_id: r.user_id,
        user_message: r.user_message ?? '',
        source: r.source,
        page_url: r.page_url,
        lead_name: r.lead_name,
        lead_phone: r.lead_phone,
        error: r.error,
        created_at: r.created_at,
        thumbs_up: r.thumbs_up,
        has_correction: !!r.admin_correction?.trim(),
        resolved: !!r.resolved_at,
        promoted_to_kb: r.promoted_to_kb,
        ai_verdict: asVerdict(r.ai_verdict),
        geo_city: r.geo_city,
        geo_state: r.geo_state,
        geo_country: r.geo_country,
        anonymous_id: r.anonymous_id ?? null,
        device: r.device ?? null,
        channel: r.channel ?? null,
      });
    }
    if (!data || data.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

function chunks<T>(list: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const COURSE_LABELS: Record<string, string> = { nata: 'NATA', jee_paper2: 'JEE B.Arch', both: 'NATA + JEE B.Arch' };
const titleWords = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function profileLabel(lead: { interest_course?: string | null; applicant_category?: string | null } | null): string | null {
  if (!lead) return null;
  const parts = [
    lead.applicant_category ? titleWords(lead.applicant_category) : null,
    lead.interest_course ? COURSE_LABELS[lead.interest_course] ?? titleWords(lead.interest_course) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export async function loadUsers(db: Db, ids: string[]): Promise<Map<string, InboxUser>> {
  const map = new Map<string, InboxUser>();
  if (!ids.length) return map;
  const any = db as any;
  for (const part of chunks(ids)) {
    const [users, leads, students, demos] = await Promise.all([
      any.from('users').select('id, name, first_name, last_name, phone, email, avatar_url, created_at, first_touch, anonymous_id, linked_classroom_email').in('id', part),
      any.from('lead_profiles').select('user_id, interest_course, applicant_category').in('user_id', part).is('deleted_at', null),
      any.from('student_profiles').select('user_id').in('user_id', part),
      any.from('demo_class_registrations').select('user_id').in('user_id', part),
    ]);
    if (users.error) throw users.error;
    const leadBy = new Map<string, any>();
    for (const l of leads.data ?? []) if (!leadBy.has(l.user_id)) leadBy.set(l.user_id, l);
    const enrolled = new Set((students.data ?? []).map((s: any) => s.user_id));
    const demoed = new Set((demos.data ?? []).map((d: any) => d.user_id));
    for (const u of users.data ?? []) {
      const name = u.first_name ? `${u.first_name}${u.last_name ? ` ${u.last_name}` : ''}` : u.name || null;
      map.set(u.id, {
        id: u.id,
        name,
        phone: u.phone ?? null,
        email: u.email ?? null,
        avatarUrl: u.avatar_url ?? null,
        joinedAt: u.created_at ?? null,
        firstChannel: u.first_touch?.channel ?? null,
        anonymousId: u.anonymous_id ?? null,
        profileLabel: profileLabel(leadBy.get(u.id) ?? null),
        // Same rule as the gold ring in CRM Users: a student profile, or a classroom account.
        enrolled: enrolled.has(u.id) || !!u.linked_classroom_email,
        demoBooked: demoed.has(u.id),
        applied: leadBy.has(u.id),
      });
    }
  }
  return map;
}

export async function loadNudges(db: Db): Promise<Map<string, Nudge>> {
  const { data, error } = await (db as any)
    .from('aintra_signup_nudges')
    .select('anonymous_id, requested_at, requested_by_name, shown_at');
  // The table ships in a migration; until it exists, nobody has been nudged.
  if (error) return new Map();
  return new Map(
    (data ?? []).map((n: any) => [n.anonymous_id, { requestedAt: n.requested_at, requestedByName: n.requested_by_name, shownAt: n.shown_at }])
  );
}

function parseReview(raw: any): AiReview | null {
  if (!raw || typeof raw !== 'object') return null;
  const verdict = asVerdict(raw.verdict);
  if (!verdict) return null;
  return {
    verdict,
    reasoning: String(raw.reasoning ?? ''),
    suggestedCorrection: String(raw.suggestedCorrection ?? ''),
    reviewedAt: raw.reviewedAt,
    model: raw.model,
    drafted: !!raw.drafted,
  };
}

/** Every turn of one chat session, oldest first, with the full answers. */
const TURN_COLUMNS =
  'id, created_at, user_message, ai_response, error, thumbs_up, admin_correction, corrected_by_name, corrected_at, promoted_to_kb, ai_review, model_used, response_time_ms, tool_calls, page_url';

export async function loadTurns(db: Db, sessionId: string): Promise<InboxTurn[]> {
  const query = (columns: string) =>
    (db as any)
      .from('chatbot_conversations')
      .select(columns)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(200);
  let { data, error } = await query(`${TURN_COLUMNS}, resolved_at, resolved_by_name`);
  if (error && isMissingColumn(error)) ({ data, error } = await query(TURN_COLUMNS));
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => toTurn(r));
}

export function toTurn(r: any): InboxTurn {
  const aiReview = parseReview(r.ai_review);
  const correction = r.admin_correction?.trim() ? r.admin_correction : null;
  return {
    id: r.id,
    at: r.created_at,
    question: r.user_message ?? '',
    answer: r.ai_response ?? null,
    error: r.error ?? null,
    status: turnStatus({
      error: r.error,
      thumbs_up: r.thumbs_up,
      has_correction: !!correction,
      ai_verdict: aiReview?.verdict ?? null,
      resolved: !!r.resolved_at,
    }),
    thumbsUp: r.thumbs_up,
    correction,
    correctedByName: r.corrected_by_name ?? null,
    correctedAt: r.corrected_at ?? null,
    resolvedAt: r.resolved_at ?? null,
    resolvedByName: r.resolved_by_name ?? null,
    promotedToKb: !!r.promoted_to_kb,
    aiReview,
    model: r.model_used ?? null,
    responseMs: r.response_time_ms ?? null,
    tools: Array.isArray(r.tool_calls) ? r.tool_calls.map((t: any) => t?.name).filter(Boolean) : [],
    pageUrl: r.page_url ?? null,
  };
}

/** Display name of the staff member behind a request, for "corrected by". */
export async function staffName(db: Db, adminId: string | null): Promise<string | null> {
  if (!adminId) return null;
  const { data } = await (db as any).from('users').select('name, first_name, last_name').eq('id', adminId).maybeSingle();
  if (!data) return null;
  return data.first_name ? `${data.first_name}${data.last_name ? ` ${data.last_name}` : ''}` : data.name ?? null;
}

export { REVIEW_QUEUE_DAYS };

/**
 * Turns in the Review queue: answered badly (thumbs down, or the saved AI
 * Review says wrong / needs a fix) or not answered at all, with no correction
 * and not marked resolved, in the last 30 days. A returning guest asked to
 * sign in (SIGNUP_REQUIRED) is not a failure and never counts. Null when the
 * count fails, so the caller keeps its own number.
 */
export async function countReviewQueue(db: Db, now = new Date()): Promise<number | null> {
  const since = new Date(now.getTime() - REVIEW_QUEUE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const query = (withResolved: boolean) => {
    let q = (db as any)
      .from('chatbot_conversations')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .is('admin_correction', null);
    if (withResolved) q = q.is('resolved_at', null);
    // error.neq also drops null errors, so it reads "failed, and not the sign-in gate".
    return q.or(`error.neq.${SIGNUP_GATE_ERROR},thumbs_up.eq.false,and(thumbs_up.is.null,ai_review->>verdict.in.(wrong,needs_fix))`);
  };
  let { count, error } = await query(true);
  if (error && isMissingColumn(error)) ({ count, error } = await query(false));
  return error ? null : count ?? 0;
}

/** PostgREST filter for the credits-ran-out failures isCreditsError recognises. */
export const CREDITS_ERROR_FILTER = 'error.like.*CREDITS_DEPLETED*,error.like."*Gemini API error: 402*",error.like.AI_BLOCKED*';

/**
 * "Resolve all credits ran out": marks every unanswered, unresolved question
 * that failed for lack of AI credits as dealt with. Returns how many changed.
 */
export async function resolveCreditErrors(db: Db, by: { id: string | null; name: string | null }, now = new Date()): Promise<number> {
  const { data, error } = await (db as any)
    .from('chatbot_conversations')
    .update({ resolved_at: now.toISOString(), resolved_by: by.id, resolved_by_name: by.name })
    .is('admin_correction', null)
    .is('resolved_at', null)
    .or(CREDITS_ERROR_FILTER)
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}
