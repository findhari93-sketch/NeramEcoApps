import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';
import { isStaffRoleAny, resolveStaffRole } from '@/lib/staff-capabilities';
import { normalizePicks } from '@/lib/prewatch';
import { PrewatchError, isPrewatchEnabled, loadPrewatch, reconcilePrewatch } from '@/lib/prewatch-server';

/**
 * "Watch before class" videos on one class.
 *
 * GET  (staff and enrolled students)
 *   Student: { enabled, items } with their own `state` on each item.
 *   Staff:   { enabled, items, total, dormant } with a `summary` on each item
 *            ("12 of 30 watched"); `?detail=1` adds `students`, one row per
 *            tracked student, for the who-watched list.
 *
 * PUT  (staff who can run the class)  { items: [{ kind, id }] }
 *   Makes the class's list exactly that, in that order. Used by Edit Class and
 *   the class panel. Rows that stay keep their id, so links already posted to
 *   Teams keep working.
 */

interface Ctx {
  params: { classId: string };
}

interface PrewatchClass {
  classroom_id: string;
  teacher_id: string | null;
  publish_state: string | null;
}

const CLASS_COLS = 'classroom_id, teacher_id, publish_state';

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveClassStaffAccess<PrewatchClass>(supabase, msUser.oid, params.classId, CLASS_COLS);
    if ('error' in access) return access.error;

    const enabled = await isPrewatchEnabled();
    const staff = access.canEdit || isStaffRoleAny(resolveStaffRole(access.user));

    if (!staff) {
      // A draft class is not on the student's timetable yet; neither are its videos.
      if (!enabled || access.cls.publish_state === 'draft') {
        return NextResponse.json({ enabled, items: [] }, { headers: { 'Cache-Control': 'no-store' } });
      }
      const result = await loadPrewatch(supabase, params.classId, { studentId: access.userId });
      return NextResponse.json({ enabled, ...result }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const detail = request.nextUrl.searchParams.get('detail') === '1';
    const result = await loadPrewatch(supabase, params.classId, { classroomId: access.cls.classroom_id, detail });
    return NextResponse.json({ enabled, canEdit: access.canEdit, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return failure(err, 'Could not load the videos for this class');
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const access = await resolveClassStaffAccess<PrewatchClass>(supabase, msUser.oid, params.classId, CLASS_COLS);
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff who run this class can change its videos' }, { status: 403 });
    }
    if (!(await isPrewatchEnabled())) {
      return NextResponse.json({ error: 'Watch before class is switched off.' }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const picks = normalizePicks(body?.items);
    if (!picks) return NextResponse.json({ error: 'Pass items: [{ kind, id }]' }, { status: 400 });

    await reconcilePrewatch(supabase, params.classId, picks, access.userId);
    const result = await loadPrewatch(supabase, params.classId, { classroomId: access.cls.classroom_id });
    return NextResponse.json({ enabled: true, canEdit: true, ...result });
  } catch (err) {
    if (err instanceof PrewatchError) return NextResponse.json({ error: err.message }, { status: 400 });
    return failure(err, 'Could not save the videos');
  }
}

function failure(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback;
  if (/Missing or invalid Authorization/.test(message)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error('[prewatch] error:', message);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
