import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/question-bank/tests/student-tests   (staff)
 *
 * Papers students built for themselves, grouped by student.
 *
 * Read only on purpose. Which chapters a student chooses to drill is a real
 * signal a teacher should be able to see, but a student's own workspace is not
 * the teacher's to reorganise, so there is no write path here.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (resolveStaffRole(access.caller) === null) {
      return NextResponse.json({ error: 'Only staff can see student tests' }, { status: 403 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const search = (new URL(request.url).searchParams.get('search') || '').trim();

    let query = supabase
      .from('nexus_tests')
      .select('id, title, created_by_student, created_at, folder_id, created_from')
      .eq('test_kind', 'student_custom')
      .eq('is_active', true)
      .not('created_by_student', 'is', null)
      .order('created_at', { ascending: false })
      .limit(300);
    if (search) {
      query = query.ilike('title', `%${search.replace(/[%_]/g, (m: string) => `\\${m}`)}%`);
    }

    const { data: tests, error } = await query;
    if (error) throw error;
    const rows = tests || [];
    if (rows.length === 0) return NextResponse.json({ data: { groups: [] } });

    const testIds = rows.map((t: any) => t.id);
    const studentIds = [...new Set(rows.map((t: any) => t.created_by_student))];

    const [{ data: users }, { data: tqRows }, { data: attempts }, { data: folders }] = await Promise.all([
      supabase.from('users').select('id, full_name, avatar_url').in('id', studentIds),
      supabase.from('nexus_test_questions').select('test_id').in('test_id', testIds).range(0, 100000),
      supabase.from('nexus_test_attempts').select('test_id, percentage').in('test_id', testIds).eq('status', 'submitted'),
      supabase.from('nexus_test_folders').select('id, name').in('id', rows.map((t: any) => t.folder_id).filter(Boolean)),
    ]);

    const userMap = new Map<string, { full_name: string | null; avatar_url: string | null }>(
      (users || []).map((u: any) => [u.id, { full_name: u.full_name ?? null, avatar_url: u.avatar_url ?? null }]),
    );
    const folderMap = new Map((folders || []).map((f: any) => [f.id, f.name]));
    const qCount = new Map<string, number>();
    for (const r of tqRows || []) qCount.set(r.test_id, (qCount.get(r.test_id) || 0) + 1);
    const best = new Map<string, number>();
    const attemptCount = new Map<string, number>();
    for (const a of attempts || []) {
      attemptCount.set(a.test_id, (attemptCount.get(a.test_id) || 0) + 1);
      const pct = a.percentage == null ? null : Number(a.percentage);
      if (pct != null) best.set(a.test_id, Math.max(best.get(a.test_id) ?? 0, pct));
    }

    const groups = new Map<string, any>();
    for (const t of rows as any[]) {
      const key = t.created_by_student;
      if (!groups.has(key)) {
        const u = userMap.get(key);
        groups.set(key, {
          student_id: key,
          student_name: u?.full_name ?? 'Unknown student',
          avatar_url: u?.avatar_url ?? null,
          tests: [],
        });
      }
      groups.get(key).tests.push({
        id: t.id,
        title: t.title,
        folder_name: t.folder_id ? folderMap.get(t.folder_id) ?? null : null,
        // A "Fix my mistakes" paper is a different signal from a chosen topic
        // drill, so the two are distinguishable rather than blended.
        from_mistakes: t.created_from === 'mistakes',
        question_count: qCount.get(t.id) || 0,
        attempts: attemptCount.get(t.id) || 0,
        best_percentage: best.get(t.id) ?? null,
        created_at: t.created_at,
      });
    }

    return NextResponse.json({
      data: {
        groups: [...groups.values()].sort((a, b) => String(a.student_name).localeCompare(String(b.student_name))),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load student tests';
    console.error('Student tests list error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
