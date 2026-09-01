import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse, ApiError } from '@/lib/api-errors';
import { isInternalStaff, resolveStaffRole } from '@/lib/staff-capabilities';

/**
 * GET /api/timetable/class-options?classroom={id}[&q=text][&limit=20]  (staff)
 *
 * The searchable class list behind the assignment form's class picker. Newest
 * class first, because an assignment is almost always being attached to one that
 * has just happened or is about to.
 *
 * Not /api/timetable: that route's own comment calls it "the most requested
 * response in the app" and it joins teacher, batch, images and resource counts
 * for a date window. A picker needs four columns and a search term, and paying
 * for the rest of that payload on every keystroke would be silly. Modelled
 * instead on class-recaps/candidates, which is the same shape minus the search.
 *
 * Shape: { classes: [{ id, title, scheduled_date, start_time, topic_title }] }
 *
 * Staff-only, AND scoped to a classroom the caller can actually see. Being staff
 * is not enough on its own: an external teacher is staff everywhere but belongs
 * to the cohorts they were enrolled in, and this endpoint would otherwise hand
 * them the class titles and dates of every classroom in the school for the cost
 * of guessing an id. Internal staff reach any classroom, which is the point of
 * that tier. Same rule as the class-scoped assignments route.
 */

/** Cap the page so a long-running classroom cannot return its whole history. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * PostgREST passes the pattern straight to ILIKE, where % and _ are wildcards
 * and a comma would end the filter argument. A teacher typing "50%" should get
 * a literal search, not every class in the classroom.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_,]/g, (ch) => `\\${ch}`);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const params = request.nextUrl.searchParams;
    const classroomId = (params.get('classroom') || '').trim();
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom is required' }, { status: 400 });
    }

    // Staffness is a property of the user; the enrollment decides whether they
    // can see THIS classroom. Internal staff skip it by design.
    const supabaseAuth = getSupabaseAdminClient() as any;
    if (!isInternalStaff(resolveStaffRole(user as any))) {
      const { data: enrollment } = await supabaseAuth
        .from('nexus_enrollments')
        .select('role')
        .eq('user_id', (user as any).id)
        .eq('classroom_id', classroomId)
        .eq('is_active', true)
        .maybeSingle();
      if (!enrollment) throw new ApiError('Not enrolled in this classroom', 403);
    }

    const q = (params.get('q') || '').trim();
    const requested = Number(params.get('limit'));
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT;

    const supabase = supabaseAuth;
    let query = supabase
      .from('nexus_scheduled_classes')
      .select(
        'id, title, scheduled_date, start_time, ' +
          'course_topic:nexus_course_topics(title), topic:nexus_topics(title)',
      )
      .eq('classroom_id', classroomId)
      .order('scheduled_date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(limit);

    if (q) query = query.ilike('title', `%${escapeLike(q)}%`);

    const { data, error } = await query;
    if (error) throw error;

    const classes = (data || []).map((c: any) => ({
      id: c.id,
      title: c.title,
      scheduled_date: c.scheduled_date,
      start_time: c.start_time,
      // Current plan topic first, legacy topic second. Same fallback the prep
      // test picker uses, so the two dialogs name a class identically.
      topic_title: c.course_topic?.title || c.topic?.title || '',
    }));

    return NextResponse.json({ classes });
  } catch (err) {
    return errorResponse(err, 'Failed to load classes');
  }
}
