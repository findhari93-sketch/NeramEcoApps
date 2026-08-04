import { NextRequest, NextResponse } from 'next/server';
import { getFolderById, getFolderMatrixReport } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * GET /api/study-materials/reports/folder/[folderId]?classroom=<id>
 *
 * Every tracked student against every chapter in a folder. The cohort view.
 *
 * Sorted furthest-behind first, because this is a worklist rather than a
 * leaderboard: the useful question is who to chase, not who is winning.
 */
export async function GET(request: NextRequest, { params }: { params: { folderId: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const folder = await getFolderById(params.folderId);
    if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });

    const classroom = request.nextUrl.searchParams.get('classroom');
    const { chapters, students } = await getFolderMatrixReport(params.folderId, classroom);

    const totalCells = students.length * chapters.length;
    const doneCells = students.reduce((sum, s) => sum + s.completed_count, 0);

    return NextResponse.json({
      folder: { id: folder.id, name: folder.name },
      chapters,
      students,
      stats: {
        students: students.length,
        chapters: chapters.length,
        completion_pct: totalCells ? Math.round((doneCells / totalCells) * 100) : null,
        fully_done: students.filter((s) => chapters.length && s.completed_count === chapters.length).length,
        not_started: students.filter((s) => s.completed_count === 0).length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the report';
    return NextResponse.json({ error: message }, { status: message === 'Not authorized' ? 403 : 500 });
  }
}
