import { NextRequest, NextResponse } from 'next/server';
import { listFavorites } from '@neram/database';
import { getRequestUser, isStaff, getStudentExamSet } from '@/lib/study-materials';

/**
 * GET /api/study-materials/favorites
 * The current user's starred files (view-safe DTOs with breadcrumb), audience re-checked.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    const staff = isStaff(user);
    const examSet = staff ? [] : await getStudentExamSet(user.id);
    const files = await listFavorites(user.id, examSet, user.student_program);
    return NextResponse.json({ files });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load favorites';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
