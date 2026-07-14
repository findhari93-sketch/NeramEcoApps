import { NextRequest, NextResponse } from 'next/server';
import { getFileById, getStudyFileCompletion, hasTestForFiles } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * GET /api/study-materials/files/[id]/completion?classroom=<id>  (staff)
 * Per-student completion for a study file across the classroom's active students, plus summary
 * stats and whether the file has a test (a file with no test is not completable).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom is required' }, { status: 400 });
    }

    const file = await getFileById(params.id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

    const [students, testSet] = await Promise.all([
      getStudyFileCompletion(params.id, classroomId),
      hasTestForFiles([params.id]),
    ]);

    const completed = students.filter((s) => s.status === 'completed');
    const studying = students.filter((s) => s.status === 'studying').length;
    const notOpened = students.filter((s) => s.status === 'not_opened').length;
    const scores = completed.map((s) => s.best_score_pct).filter((v): v is number => v != null);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    return NextResponse.json({
      file: { id: file.id, title: file.title, has_test: testSet.has(file.id) },
      students,
      stats: { total: students.length, completed: completed.length, studying, not_opened: notOpened, avg_score: avgScore },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load completion';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
