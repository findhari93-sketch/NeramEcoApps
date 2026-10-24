/**
 * PATCH /api/crm/users/[id]/studies
 *
 * Staff record where a person is in school, from any Admin avatar: Class 10,
 * 11, 12, or a break year (finished Class 12, results in hand) with the year
 * they finished. Break-year students fill the avatar's exam pill orange.
 *
 * Writes users.study_stage (+ set_at, set_by) and users.twelfth_passed_year,
 * one user_profile_history row per field that changed. For a student with an
 * active Nexus enrolment it also writes nexus_enrollments.current_standard (as
 * the Nexus classification sheet does, source 'staff'), so the two apps agree:
 * the enrolment is what Nexus and the Admin avatar read first.
 *
 * Body: { studyStage: '10th' | '11th' | '12th' | 'gap_year' | null, twelfthPassedYear?: number | null }
 * A year goes only with 'gap_year' and cannot be in the future; any other
 * stage clears it.
 */
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, recordUserHistory } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';
import { isStudyStage } from '@/lib/person-study';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Unknown person' }, { status: 400 });

  let body: { studyStage?: unknown; twelfthPassedYear?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!('studyStage' in body) || (body.studyStage !== null && !isStudyStage(body.studyStage))) {
    return NextResponse.json({ error: 'studyStage must be 10th, 11th, 12th, gap_year or null' }, { status: 400 });
  }
  const stage = body.studyStage as string | null;
  let year: number | null = null;
  if (body.twelfthPassedYear != null) {
    const y = body.twelfthPassedYear;
    if (stage !== 'gap_year') {
      return NextResponse.json({ error: 'A Class 12 year goes only with a break year' }, { status: 400 });
    }
    if (typeof y !== 'number' || !Number.isInteger(y) || y < 1990 || y > new Date().getFullYear()) {
      return NextResponse.json({ error: 'The Class 12 year must be this year or earlier' }, { status: 400 });
    }
    year = y;
  }

  const supabase = getSupabaseAdminClient() as any;
  const { data: before, error: readError } = await supabase
    .from('users')
    .select('id, study_stage, twelfth_passed_year')
    .eq('id', params.id)
    .maybeSingle();
  if (readError) {
    console.error('[crm/users/studies] read failed', readError);
    const pending = readError.code === '42703' || /does not exist/i.test(readError.message ?? '');
    return NextResponse.json(
      { error: pending ? 'Saving the class needs a database update that is not applied yet' : 'Could not read this person' },
      { status: pending ? 503 : 500 },
    );
  }
  if (!before) return NextResponse.json({ error: 'Unknown person' }, { status: 404 });

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {};
  if ((before.study_stage ?? null) !== stage) update.study_stage = stage;
  if ((before.twelfth_passed_year ?? null) !== year) update.twelfth_passed_year = year;

  // A no-op UPDATE would still bump updated_at and write a history row.
  if (Object.keys(update).length) {
    const { error: writeError } = await supabase
      .from('users')
      .update({ ...update, study_stage_set_at: now, study_stage_set_by: adminId, updated_at: now })
      .eq('id', params.id);
    if (writeError) {
      console.error('[crm/users/studies] write failed', writeError);
      return NextResponse.json({ error: 'Could not save the class' }, { status: 500 });
    }
    if ('study_stage' in update) {
      await recordUserHistory(supabase, params.id, 'study_stage', before.study_stage ?? null, stage, adminId);
    }
    if ('twelfth_passed_year' in update) {
      await recordUserHistory(supabase, params.id, 'twelfth_passed_year', before.twelfth_passed_year ?? null, year, adminId);
    }
  }

  // Keep Nexus in step, even when users already held this value (Nexus may have
  // changed the enrolment since). Clearing in Admin leaves Nexus's own value alone.
  if (stage) {
    const { data: enrolments, error: enrolError } = await supabase
      .from('nexus_enrollments')
      .select('id, current_standard')
      .eq('user_id', params.id)
      .eq('role', 'student')
      .eq('is_active', true);
    if (enrolError) console.error('[crm/users/studies] enrolment read failed', enrolError);
    const stale = (enrolError ? [] : enrolments ?? [])
      .filter((e: { current_standard: string | null }) => e.current_standard !== stage)
      .map((e: { id: string }) => e.id);
    if (stale.length) {
      const { error: syncError } = await supabase
        .from('nexus_enrollments')
        .update({
          current_standard: stage,
          current_standard_source: 'staff',
          current_standard_set_at: now,
          current_standard_set_by: adminId,
        })
        .in('id', stale);
      if (syncError) {
        console.error('[crm/users/studies] enrolment sync failed', syncError);
        return NextResponse.json({ error: 'Saved here, but Nexus could not be updated' }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ studyStage: stage, twelfthPassedYear: year });
}
