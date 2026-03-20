import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { getQBExamTree } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const classroomId = request.nextUrl.searchParams.get('classroom_id') || null;

    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;

    const data = await getQBExamTree();

    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
