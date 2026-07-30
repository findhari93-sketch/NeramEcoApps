import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { RESOURCE_COLS } from '@/lib/class-resources';

/**
 * GET /api/student/resources
 *
 * Everything a student's teachers have shared, newest class first.
 *
 * The per-class views answer "what should I look at for THIS class". This one
 * answers the other question a student actually asks: "where was that video
 * sir showed us". Hunting back through the timetable for it is the failure mode
 * this page exists to remove.
 *
 * Scoped by enrollment, not by class: a student sees material from every
 * classroom they are actively enrolled in, and nothing else.
 */

/** Newest classes first, and a ceiling so a long-running student is not a slow page. */
const MAX_CLASSES = 60;

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { data: enrollments } = await supabase
      .from('nexus_enrollments')
      .select('classroom_id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const classroomIds = (enrollments || []).map((e: any) => e.classroom_id).filter(Boolean);
    if (!classroomIds.length) return NextResponse.json({ groups: [] });

    // One query, joined up from the class side, so the result is already grouped
    // the way the page renders it and needs no second round trip per class.
    const { data: classes } = await supabase
      .from('nexus_scheduled_classes')
      .select(
        `id, title, scheduled_date, resources:nexus_class_resources!inner(${RESOURCE_COLS})`,
      )
      .in('classroom_id', classroomIds)
      .order('scheduled_date', { ascending: false })
      .limit(MAX_CLASSES);

    const groups = (classes || [])
      .map((c: any) => ({
        class_id: c.id,
        class_title: c.title,
        scheduled_date: c.scheduled_date,
        resources: [...(c.resources || [])].sort(
          (a: any, b: any) =>
            a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
        ),
      }))
      .filter((g: any) => g.resources.length > 0);

    return NextResponse.json({ groups });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load reference material';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
