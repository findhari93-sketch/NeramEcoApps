/**
 * Who may sit a test run, and when.
 *
 * A class test now closes at its due date. That is only safe because a student
 * who misses it has three ways back in, all of which live in
 * nexus_test_access_requests:
 *
 *   catchup_auto     they finished catch-up on the class they missed, so a
 *                    buffer opens by itself and nobody is asked
 *   student_request  they ask, and a teacher approves or declines
 *   teacher_grant    a teacher opens it for them unprompted
 *
 * Before this existed, class-test.ts deliberately refused to set
 * available_until, because a closed door with no way through it would strand a
 * required paper in a student's catch-up backlog forever. That constraint is
 * lifted here, and its header comment has been rewritten to say so.
 */
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';

const REQUESTS = 'nexus_test_access_requests';
const COVERED = 'nexus_test_run_covered_classes';
const OVERRIDES = 'nexus_test_run_eligibility_overrides';

/** How long a student gets once catch-up opens the door for them. */
export const CLASS_TEST_CATCHUP_BUFFER_DAYS = 3;

/** How long an approved reopen lasts when the teacher names no end. */
export const CLASS_TEST_REOPEN_DAYS = 3;

export type TestAccessSource = 'teacher_grant' | 'catchup_auto' | 'student_request';
export type TestAccessStatus = 'pending' | 'granted' | 'declined' | 'revoked';

export interface TestAccessRequest {
  id: string;
  placement_id: string;
  student_id: string;
  source: TestAccessSource;
  status: TestAccessStatus;
  opens_at: string | null;
  closes_at: string | null;
  student_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface ResolvedTestWindow {
  open: boolean;
  /** Why the door is shut, for copy that tells a student what to do next. */
  reason: 'open' | 'not_yet' | 'closed' | 'grant_expired';
  /** When this student's own door shuts, if they hold a grant. */
  window_open_until: string | null;
  /** True when the student is inside a grant rather than the shared window. */
  via_grant: boolean;
}

/**
 * Whether this student may sit this run right now.
 *
 * PURE, so the rule can be tested without a database. The ordering is
 * load-bearing and mirrors the exam branch of api/tests/attempt: a granted
 * student is sitting a DIFFERENT window, so checking the shared close time
 * first would refuse every reopened student before their grant was ever read.
 * That bug looks like "the reopen feature does nothing", which is the kind of
 * thing only the student it happens to ever discovers.
 */
export function resolveTestRunWindow(input: {
  opensAt: string | null;
  closesAt: string | null;
  /** The student's own live grant, if they hold one. */
  grant: { opens_at: string | null; closes_at: string | null } | null;
  now: number;
}): ResolvedTestWindow {
  const { grant, now } = input;

  if (grant) {
    const gOpens = grant.opens_at ? Date.parse(grant.opens_at) : null;
    const gCloses = grant.closes_at ? Date.parse(grant.closes_at) : null;
    const notYet = gOpens != null && !Number.isNaN(gOpens) && gOpens > now;
    const expired = gCloses != null && !Number.isNaN(gCloses) && gCloses < now;

    if (!notYet && !expired) {
      return { open: true, reason: 'open', window_open_until: grant.closes_at, via_grant: true };
    }
    // An expired grant does NOT fall back to the shared window. It was issued
    // because the shared window had already shut, so falling through would
    // report "closed" anyway, and saying "grant_expired" lets the student see
    // that their extension ran out rather than that they never had one.
    if (expired) {
      return { open: false, reason: 'grant_expired', window_open_until: grant.closes_at, via_grant: true };
    }
  }

  const opens = input.opensAt ? Date.parse(input.opensAt) : null;
  if (opens != null && !Number.isNaN(opens) && opens > now) {
    return { open: false, reason: 'not_yet', window_open_until: null, via_grant: false };
  }
  const closes = input.closesAt ? Date.parse(input.closesAt) : null;
  if (closes != null && !Number.isNaN(closes) && closes < now) {
    return { open: false, reason: 'closed', window_open_until: null, via_grant: false };
  }
  return { open: true, reason: 'open', window_open_until: null, via_grant: false };
}

/** This student's live row on this run, if any. Granted beats pending. */
export async function getLiveAccessRequest(
  placementId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<TestAccessRequest | null> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from(REQUESTS)
    .select('*')
    .eq('placement_id', placementId)
    .eq('student_id', studentId)
    .in('status', ['pending', 'granted'])
    .maybeSingle();
  // Loud rather than degraded. A swallowed error here would silently refuse a
  // student who does hold a grant, which reads to them as the reopen never
  // having been approved.
  if (error) throw error;
  return (data as TestAccessRequest) || null;
}

/** Every live row on a run, for the teacher's roster. */
export async function loadAccessRequestsForRun(
  placementId: string,
  client?: TypedSupabaseClient,
): Promise<TestAccessRequest[]> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from(REQUESTS)
    .select('*')
    .eq('placement_id', placementId)
    .in('status', ['pending', 'granted'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as TestAccessRequest[];
}

/**
 * A student asks to be let back in.
 *
 * 23505 on uq_test_access_live means they already have a live row, which is not
 * an error worth showing: they have already asked, or they already have a
 * window and simply have not noticed. Return the existing row instead.
 */
export async function requestTestAccess(
  input: { placementId: string; studentId: string; note?: string | null },
  client?: TypedSupabaseClient,
): Promise<{ request: TestAccessRequest; alreadyLive: boolean }> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from(REQUESTS)
    .insert({
      placement_id: input.placementId,
      student_id: input.studentId,
      source: 'student_request',
      status: 'pending',
      student_note: input.note?.trim() || null,
    })
    .select('*')
    .maybeSingle();

  if (error) {
    if ((error as any).code === '23505') {
      const existing = await getLiveAccessRequest(input.placementId, input.studentId, supabase);
      if (existing) return { request: existing, alreadyLive: true };
    }
    throw error;
  }
  return { request: data as TestAccessRequest, alreadyLive: false };
}

/** A teacher answers a request. */
export async function decideTestAccessRequest(
  input: {
    requestId: string;
    decision: 'granted' | 'declined';
    closesAt?: string | null;
    note?: string | null;
    decidedBy: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<TestAccessRequest> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const now = new Date();
  const patch: Record<string, unknown> = {
    status: input.decision,
    decided_by: input.decidedBy,
    decided_at: now.toISOString(),
    decision_note: input.note?.trim() || null,
  };
  if (input.decision === 'granted') {
    patch.opens_at = now.toISOString();
    patch.closes_at =
      input.closesAt ?? new Date(now.getTime() + CLASS_TEST_REOPEN_DAYS * 86400000).toISOString();
  }

  const { data, error } = await supabase
    .from(REQUESTS)
    .update(patch)
    .eq('id', input.requestId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('That request no longer exists.');
  return data as TestAccessRequest;
}

/**
 * Open or close a run for one student directly, with no request involved.
 *
 * Upserts rather than inserts, because the student may already hold a live row
 * from an earlier grant or a pending ask, and uq_test_access_live allows only
 * one of those at a time.
 */
export async function setTestAccessForStudent(
  input: {
    placementId: string;
    studentId: string;
    action: 'open' | 'close';
    closesAt?: string | null;
    note?: string | null;
    source?: TestAccessSource;
    actorId: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<TestAccessRequest | null> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const now = new Date();
  const existing = await getLiveAccessRequest(input.placementId, input.studentId, supabase);

  if (input.action === 'close') {
    if (!existing) return null;
    const { data, error } = await supabase
      .from(REQUESTS)
      .update({ status: 'revoked', decided_by: input.actorId, decided_at: now.toISOString() })
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return (data as TestAccessRequest) || null;
  }

  const window = {
    status: 'granted' as const,
    opens_at: now.toISOString(),
    closes_at:
      input.closesAt ?? new Date(now.getTime() + CLASS_TEST_REOPEN_DAYS * 86400000).toISOString(),
    decided_by: input.actorId,
    decided_at: now.toISOString(),
    decision_note: input.note?.trim() || null,
  };

  if (existing) {
    const { data, error } = await supabase
      .from(REQUESTS)
      .update(window)
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data as TestAccessRequest;
  }

  const { data, error } = await supabase
    .from(REQUESTS)
    .insert({
      placement_id: input.placementId,
      student_id: input.studentId,
      source: input.source ?? 'teacher_grant',
      ...window,
    })
    .select('*')
    .maybeSingle();
  if (error) {
    // Lost a race with another grant. Idempotent by design, so read it back.
    if ((error as any).code === '23505') {
      return await getLiveAccessRequest(input.placementId, input.studentId, supabase);
    }
    throw error;
  }
  return data as TestAccessRequest;
}

/**
 * Open the buffer for a student who has just finished catching up.
 *
 * Idempotent through uq_test_access_live, and deliberately silent on failure:
 * this runs as a side effect of finishing a recap, and a student must never see
 * their catch-up fail because a class test window could not be written.
 */
export async function grantCatchupTestWindow(
  input: { placementId: string; studentId: string; days?: number },
  client?: TypedSupabaseClient,
): Promise<boolean> {
  try {
    const existing = await getLiveAccessRequest(input.placementId, input.studentId, client);
    // Already has a live door, whether granted or a pending ask they made
    // first. Widening it here would let a student shortcut a teacher's pending
    // decision by finishing a recap.
    if (existing) return false;

    const days = input.days ?? CLASS_TEST_CATCHUP_BUFFER_DAYS;
    await setTestAccessForStudent(
      {
        placementId: input.placementId,
        studentId: input.studentId,
        action: 'open',
        closesAt: new Date(Date.now() + days * 86400000).toISOString(),
        source: 'catchup_auto',
        actorId: null,
      },
      client,
    );
    return true;
  } catch {
    return false;
  }
}

/** The lecture(s) a run covers. Empty means everyone enrolled is mandatory. */
export async function listRunCoveredClasses(
  placementId: string,
  client?: TypedSupabaseClient,
): Promise<string[]> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from(COVERED)
    .select('scheduled_class_id')
    .eq('placement_id', placementId);
  if (error) throw error;
  return ((data || []) as any[]).map((r) => r.scheduled_class_id);
}

/** Replace the covered-class list for a run, keeping the host class in it. */
export async function setRunCoveredClasses(
  input: { placementId: string; scheduledClassIds: string[]; hostClassId?: string | null },
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const ids = [
    ...new Set([...(input.scheduledClassIds || []), ...(input.hostClassId ? [input.hostClassId] : [])].filter(Boolean)),
  ];

  const { error: delErr } = await supabase.from(COVERED).delete().eq('placement_id', input.placementId);
  if (delErr) throw delErr;
  if (ids.length === 0) return;

  const { error } = await supabase
    .from(COVERED)
    .insert(ids.map((id) => ({ placement_id: input.placementId, scheduled_class_id: id })));
  if (error) throw error;
}

/** Teacher force-mandatory / force-excuse rows for a run, keyed by student. */
export async function loadRunEligibilityOverrides(
  placementId: string,
  client?: TypedSupabaseClient,
): Promise<Map<string, { override: 'mandatory' | 'excused'; note: string | null; set_by: string | null; set_at: string }>> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase
    .from(OVERRIDES)
    .select('student_id, override, note, set_by, set_at')
    .eq('placement_id', placementId);
  if (error) throw error;
  return new Map(
    ((data || []) as any[]).map((r) => [
      r.student_id,
      { override: r.override, note: r.note ?? null, set_by: r.set_by ?? null, set_at: r.set_at },
    ]),
  );
}

/** Force a student mandatory or excused on a run, or clear the override. */
export async function setRunEligibilityOverride(
  input: {
    placementId: string;
    studentId: string;
    override: 'mandatory' | 'excused' | null;
    note?: string | null;
    setBy: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  if (input.override === null) {
    const { error } = await supabase
      .from(OVERRIDES)
      .delete()
      .eq('placement_id', input.placementId)
      .eq('student_id', input.studentId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from(OVERRIDES).upsert(
    {
      placement_id: input.placementId,
      student_id: input.studentId,
      override: input.override,
      note: input.note?.trim() || null,
      set_by: input.setBy,
      set_at: new Date().toISOString(),
    },
    { onConflict: 'placement_id,student_id' },
  );
  if (error) throw error;
}
