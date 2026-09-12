import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { fillFromApplicationForms } from '@/lib/application-fill-store';

export const dynamic = 'force-dynamic';

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
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  try {
    const summary = await fillFromApplicationForms(getSupabaseAdminClient() as any, { actorId: null });
    return NextResponse.json({
      ok: true,
      checked: summary.checked,
      stagesFilled: summary.stagesFilled,
      yearsFilled: summary.yearsFilled,
      held: summary.held,
      errors: summary.errors,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String((err as any)?.message ?? 'Application fill failed');
    console.error('[cron application-fill] failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
