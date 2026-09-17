import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { AUTO_ADD_COLUMNS, sweepClassMeetings, type AutoAddClass } from '@/lib/pad/auto-add';
import { istDate } from '@/lib/pad/meeting-binding';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/cron/pad-meeting-tabs
 *
 * Puts the Answer Pad button into today's class meetings shortly before they
 * start (lib/pad/auto-add.ts). Scheduling a class tries the same thing at once,
 * but a new meeting's chat usually refuses Graph until somebody joins, so this
 * sweep runs every five minutes through the teaching day and finishes the job.
 * A class that already has the pad costs one Graph read and nothing more.
 *
 * `?classId=<id>` runs one class whatever the time: the first real-tenant test,
 * and support for "the button is missing in this class". It sits behind the
 * same secret and still refuses a cancelled class, a channel meeting and an
 * unlisted classroom.
 *
 * The secret is required rather than optional, because every call spends Graph
 * requests under the app's own permissions.
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request, { required: true });
  if (unauthorized) return unauthorized;

  const classId = request.nextUrl.searchParams.get('classId');
  if (classId !== null && !UUID.test(classId)) {
    return NextResponse.json({ error: 'classId must be a class id' }, { status: 400 });
  }

  const started = Date.now();
  const now = new Date();

  try {
    const supabase = getSupabaseAdminClient() as any;
    const query = supabase.from('nexus_scheduled_classes').select(AUTO_ADD_COLUMNS);
    const { data, error } = await (classId ? query.eq('id', classId) : query.eq('scheduled_date', istDate(now)));
    if (error) throw error;

    const summary = await sweepClassMeetings({ rows: (data || []) as AutoAddClass[], now, ignoreWindow: classId !== null });

    const trouble = summary.results.filter((result) => result.outcome === 'failed' || result.outcome === 'permission_missing');
    if (trouble.length > 0) console.error('[pad-meeting-tabs] could not add the Answer Pad:', JSON.stringify(trouble));

    return NextResponse.json({ ok: true, ...summary, ms: Date.now() - started });
  } catch (err) {
    console.error('[pad-meeting-tabs] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'The Answer Pad sweep failed. See the server log.' }, { status: 500 });
  }
}
