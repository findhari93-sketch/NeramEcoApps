/**
 * The writes behind lib/not-started.ts planEntry. Called only by /api/auth/me.
 *
 * Kept out of the route because a Next App Router route.ts may export only its
 * handlers, and because this is the one place a Not started enrolment is lifted,
 * which deserves its own name rather than twenty lines inside the auth handler.
 *
 * Never throws: a failed sign-in log must not sign anybody out. Failures are
 * logged, and a failed first entry simply happens again on the next app open,
 * because nexus_entered_at is still NULL.
 */
import { deviceFromUserAgent, type EntryPlan } from './not-started';

interface RecordEntryInput {
  userId: string;
  plan: EntryPlan;
  userAgent: string | null;
}

export async function recordNexusEntry(supabase: any, input: RecordEntryInput): Promise<void> {
  const { userId, plan } = input;
  const now = new Date().toISOString();
  const writes: Promise<unknown>[] = [];

  if (plan.logOutcome) {
    writes.push(
      supabase
        .from('nexus_sign_in_events')
        .insert({
          user_id: userId,
          occurred_at: now,
          outcome: plan.logOutcome,
          device: deviceFromUserAgent(input.userAgent),
        })
        .then(({ error }: { error: { message: string } | null }) => {
          if (error) console.error('nexus_sign_in_events insert failed:', error.message);
        }),
    );
  }

  if (plan.firstEntry) writes.push(liftNotStarted(supabase, userId, now));

  await Promise.all(writes);
}

async function liftNotStarted(supabase: any, userId: string, now: string): Promise<void> {
  try {
    // Lift BEFORE stamping. If the stamp landed first and the lift then failed,
    // nexus_entered_at would stop this ever running again and the student would
    // stay Not started for good. This order fails safe: a lift with no stamp just
    // repeats (and finds nothing) on the next open.
    //
    // The filter on the current status is also the race guard: when two tabs open
    // at once, only the first update gets rows back, so the audit is not doubled.
    //
    // Only automatic rows. A student staff paused stays paused however often they
    // sign in; the Students page flags them "Back in Nexus" instead.
    const { data: lifted, error: liftError } = await supabase
      .from('nexus_enrollments')
      .update({
        participation_status: 'active',
        dormant_source: null,
        dormant_since: null,
        dormant_reason: null,
        dormant_by: null,
      })
      .eq('user_id', userId)
      .eq('role', 'student')
      .eq('participation_status', 'dormant')
      .eq('dormant_source', 'auto')
      .select('id, classroom_id');
    if (liftError) throw liftError;

    if (lifted?.length) {
      const { error: eventError } = await supabase.from('nexus_enrollment_classification_events').insert(
        lifted.map((row: { id: string; classroom_id: string }) => ({
          enrollment_id: row.id,
          classroom_id: row.classroom_id,
          student_id: userId,
          axis: 'participation',
          from_value: 'dormant',
          to_value: 'active',
          reason: 'Entered Nexus',
          performed_by: null,
        })),
      );
      if (eventError) console.error('Not started lift audit insert failed:', eventError.message);
    }

    const { error: stampError } = await supabase
      .from('users')
      .update({ nexus_entered_at: now })
      .eq('id', userId)
      .is('nexus_entered_at', null);
    if (stampError) throw stampError;
  } catch (err) {
    const message = err && typeof err === 'object' && 'message' in err ? String((err as any).message) : String(err);
    console.error('Not started lift failed:', message);
  }
}
