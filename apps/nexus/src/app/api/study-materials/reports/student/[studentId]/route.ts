import { NextRequest, NextResponse } from 'next/server';
import { getStudentChapterReport, getFolderById } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * GET /api/study-materials/reports/student/[studentId]?folder=<id>
 *
 * One student across every chapter in a folder. The view that did not exist
 * before: everything was scoped to one chapter, so "is this student behind
 * overall" could only be answered by opening ten pages and remembering.
 */
export async function GET(request: NextRequest, { params }: { params: { studentId: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const folderId = request.nextUrl.searchParams.get('folder');
    if (!folderId) return NextResponse.json({ error: 'folder is required' }, { status: 400 });

    const folder = await getFolderById(folderId);
    if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });

    const { chapters } = await getStudentChapterReport(params.studentId, folderId);
    const completed = chapters.filter((c) => c.status === 'completed');
    const scores = completed.map((c) => c.best_score_pct).filter((v): v is number => v != null);

    return NextResponse.json({
      folder: { id: folder.id, name: folder.name },
      student: chapters[0]
        ? {
            id: chapters[0].student_id,
            name: chapters[0].name,
            email: chapters[0].email,
            avatar_url: chapters[0].avatar_url,
          }
        : null,
      chapters,
      stats: {
        total: chapters.length,
        completed: completed.length,
        avg_score: scores.length
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null,
        total_watched_seconds: chapters.reduce((sum, c) => sum + c.watched_seconds, 0),
        blocked_seeks: chapters.reduce((sum, c) => sum + c.blocked_seeks, 0),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the report';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}
