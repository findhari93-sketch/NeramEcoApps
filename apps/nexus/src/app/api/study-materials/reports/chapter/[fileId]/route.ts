import { NextRequest, NextResponse } from 'next/server';
import { getFileById, getChapterReport } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * GET /api/study-materials/reports/chapter/[fileId]?classroom=<id>
 *
 * One chapter, every tracked student: where they are, what they scored, which
 * language they watched, and the watch-honesty signals.
 *
 * `classroom` is optional. Omitted, it reports across every classroom, which is
 * the right default for Foundation Books: they are standard for all cohorts, so
 * scoping to one classroom answers a narrower question than the one usually
 * being asked.
 */
export async function GET(request: NextRequest, { params }: { params: { fileId: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const file = await getFileById(params.fileId);
    if (!file) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

    const classroom = request.nextUrl.searchParams.get('classroom');
    const { rows, requires_video } = await getChapterReport(params.fileId, classroom);

    const completed = rows.filter((r) => r.status === 'completed');
    const scores = completed.map((r) => r.best_score_pct).filter((v): v is number => v != null);

    return NextResponse.json({
      file: { id: file.id, title: file.title },
      requires_video,
      rows,
      stats: {
        total: rows.length,
        completed: completed.length,
        video_pending: rows.filter((r) => r.status === 'video_pending').length,
        test_pending: rows.filter((r) => r.status === 'test_pending').length,
        studying: rows.filter((r) => r.status === 'studying').length,
        not_opened: rows.filter((r) => r.status === 'not_opened').length,
        avg_score: scores.length
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the report';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}
