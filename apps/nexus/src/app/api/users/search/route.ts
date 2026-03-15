import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/users/search?q={query}&exclude_classroom={classroomId}
 *
 * Search for students by name or email.
 * Optionally exclude students already enrolled in a classroom.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Verify caller is teacher/admin
    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || !['teacher', 'admin'].includes(caller.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const q = request.nextUrl.searchParams.get('q')?.trim();
    const excludeClassroom = request.nextUrl.searchParams.get('exclude_classroom');

    if (!q || q.length < 2) {
      return NextResponse.json({ users: [] });
    }

    // Search users who are students
    let query = supabase
      .from('users')
      .select('id, name, email, avatar_url, ms_oid, user_type')
      .eq('user_type', 'student')
      .eq('status', 'active')
      .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
      .order('name')
      .limit(20);

    const { data: users, error } = await query;
    if (error) throw error;

    // If excluding a classroom, filter out already-enrolled students
    let results = users || [];

    if (excludeClassroom && results.length > 0) {
      const userIds = results.map((u: any) => u.id);
      const { data: enrolled } = await supabase
        .from('nexus_enrollments')
        .select('user_id')
        .eq('classroom_id', excludeClassroom)
        .eq('is_active', true)
        .in('user_id', userIds);

      const enrolledIds = new Set((enrolled || []).map((e: any) => e.user_id));
      results = results.filter((u: any) => !enrolledIds.has(u.id));
    }

    return NextResponse.json({ users: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    console.error('User search error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
