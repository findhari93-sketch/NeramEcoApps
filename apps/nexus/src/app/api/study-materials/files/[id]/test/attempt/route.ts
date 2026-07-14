import { NextRequest, NextResponse } from 'next/server';
import {
  getFileById,
  getFolderById,
  isFolderVisibleToStudent,
  gradeAndRecordAttempt,
} from '@neram/database';
import { getRequestUser, isStaff, getStudentExamSet } from '@/lib/study-materials';

/**
 * POST /api/study-materials/files/[id]/test/attempt
 * Student submits { answers: { [questionId]: 'a'|'b'|'c'|'d' } }. Grades server-side, records the
 * attempt, and marks the file completed if score >= passing_pct. Returns score + per-question review.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    if (isStaff(user)) {
      return NextResponse.json({ error: 'Only students take tests' }, { status: 403 });
    }

    // Re-check the student may see this file before accepting an attempt.
    const file = await getFileById(params.id);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    const folder = await getFolderById(file.folder_id);
    if (!folder) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    const exams = await getStudentExamSet(user.id);
    if (!isFolderVisibleToStudent(folder, exams, user.student_program)) {
      return NextResponse.json({ error: 'Not available' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const answers = (body?.answers && typeof body.answers === 'object' ? body.answers : {}) as Record<string, string>;

    const result = await gradeAndRecordAttempt(params.id, user.id, answers);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit test';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
