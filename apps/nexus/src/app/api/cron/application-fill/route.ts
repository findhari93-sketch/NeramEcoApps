import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { fillFromApplicationForms } from '@/lib/application-fill-store';
import { retryMicrosoftPhotoPushes, type PushRetrySummary } from '@/lib/photo-ms-sync';

export const dynamic = 'force-dynamic';
/** The fill, then a bounded Microsoft photo retry (budgeted at 35s inside the lib). */
export const maxDuration = 60;

/**
 * GET /api/cron/application-fill
 *
 * Once a day, fill any missing class and exam year from the student's own
 * application form, in every live classroom.
 *
 * Nexus Add and the form link fill straight away. This pass catches every other
 * way a student arrives or a form appears: Admin's enrol, Admin's Entra sync, and
 * a form staff fill in Admin after the student has joined. What is safe to copy is
 * decided in lib/application-form.ts; anything held back stays for the review
 * sheet on the Students screen.
 *
 * Idempotent: it only ever writes a value that is still empty.
 *
 * Also the daily second attempt at copying approved profile photos to Microsoft
 * (lib/photo-ms-sync.ts retryMicrosoftPhotoPushes). It rides this existing daily
 * student-record pass instead of a cron of its own. A brand new account usually
 * has no mailbox for a while, so its first push fails with no_mailbox and only
 * a later attempt can land. Runs after the fill and in its own try, so neither
 * job can stop the other.
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  let fill: Awaited<ReturnType<typeof fillFromApplicationForms>> | null = null;
  let fillError: string | null = null;
  try {
    fill = await fillFromApplicationForms(getSupabaseAdminClient() as any, { actorId: null });
  } catch (err) {
    fillError = err instanceof Error ? err.message : String((err as any)?.message ?? 'Application fill failed');
    console.error('[cron application-fill] failed:', fillError);
  }

  // Never throws. Its own failures come back in the summary.
  const photoRetry: PushRetrySummary = await retryMicrosoftPhotoPushes();
  if (photoRetry.error) {
    console.error('[cron application-fill] Microsoft photo retry:', photoRetry.error);
  }

  if (!fill) {
    return NextResponse.json({ ok: false, error: fillError, photoRetry }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    checked: fill.checked,
    stagesFilled: fill.stagesFilled,
    yearsFilled: fill.yearsFilled,
    held: fill.held,
    errors: fill.errors,
    photoRetry,
    ms: Date.now() - startedAt,
  });
}
