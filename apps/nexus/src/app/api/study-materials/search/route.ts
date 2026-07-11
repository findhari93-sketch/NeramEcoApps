import { NextRequest, NextResponse } from 'next/server';
import { searchStudyMaterials } from '@neram/database';
import { getRequestUser, isStaff, getStudentExamSet } from '@/lib/study-materials';

/**
 * GET /api/study-materials/search?q=...
 * Search folder + file names. Students only get hits inside folders in their audience.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    if (q.length < 2) return NextResponse.json({ results: [] });

    const staff = isStaff(user);
    const studentExams = staff ? [] : await getStudentExamSet(user.id);

    const results = await searchStudyMaterials(q, {
      staff,
      studentExams,
      studentProgram: user.student_program,
    });
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
