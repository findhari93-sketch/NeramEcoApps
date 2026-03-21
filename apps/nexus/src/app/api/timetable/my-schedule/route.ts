import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

const CLASS_SELECT = `*, topic:nexus_topics(id, title, category), teacher:users!nexus_scheduled_classes_teacher_id_fkey(id, name, avatar_url), batch:nexus_batches!nexus_scheduled_classes_batch_id_fkey(id, name), classroom:nexus_classrooms!nexus_scheduled_classes_classroom_id_fkey(id, name, type)`;

/**
 * GET /api/timetable/my-schedule?start={date}&end={date}
 *
 * Returns scheduled classes from ALL classrooms the student is enrolled in,
 * merged and sorted by date/time. Each class includes its classroom info.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const start = request.nextUrl.searchParams.get('start');
    const end = request.nextUrl.searchParams.get('end');

    if (!start || !end) {
      return NextResponse.json({ error: 'Missing start and end parameters' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Look up user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get all active enrollments for the user
    const { data: enrollments } = await supabase
      .from('nexus_enrollments')
      .select('classroom_id, role, batch_id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ classes: [], classrooms: [] });
    }

    // Fetch classes from all enrolled classrooms in parallel
    const classPromises = enrollments.map(async (enrollment) => {
      let query = supabase
        .from('nexus_scheduled_classes')
        .select(CLASS_SELECT)
        .eq('classroom_id', enrollment.classroom_id)
        .gte('scheduled_date', start)
        .lte('scheduled_date', end)
        .order('scheduled_date', { ascending: true })
        .order('start_time', { ascending: true });

      // For students: filter by batch (classroom-wide + their batch)
      if (enrollment.role === 'student') {
        if (enrollment.batch_id) {
          query = query.or(`batch_id.is.null,batch_id.eq.${enrollment.batch_id}`);
        } else {
          query = query.is('batch_id', null);
        }
      }

      const { data } = await query;
      return data || [];
    });

    const allClassArrays = await Promise.all(classPromises);
    const allClasses = allClassArrays.flat();

    // Deduplicate by class ID (student could be in multiple enrollments pointing to same class)
    const seen = new Set<string>();
    const uniqueClasses = allClasses.filter((cls) => {
      if (seen.has(cls.id)) return false;
      seen.add(cls.id);
      return true;
    });

    // Sort merged results by date then time
    uniqueClasses.sort((a, b) => {
      const dateCompare = a.scheduled_date.localeCompare(b.scheduled_date);
      if (dateCompare !== 0) return dateCompare;
      return a.start_time.localeCompare(b.start_time);
    });

    // Build unique classrooms list
    const classroomMap = new Map<string, { id: string; name: string; type: string }>();
    for (const cls of uniqueClasses) {
      if (cls.classroom && !classroomMap.has(cls.classroom.id)) {
        classroomMap.set(cls.classroom.id, cls.classroom);
      }
    }

    return NextResponse.json({
      classes: uniqueClasses,
      classrooms: Array.from(classroomMap.values()),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load schedule';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
