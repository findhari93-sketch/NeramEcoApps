import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { toggleQBStudyMark } from '@neram/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { classroom_id } = body;

    // Verify QB access (enrollment + QB enabled for students)
    const access = await verifyQBAccess(request.headers.get('Authorization'), classroom_id || null);
    if (!access.ok) return access.response;
    const caller = access.caller;

    const { id: questionId } = await params;

    const isStudied = await toggleQBStudyMark(caller.id, questionId);

    return NextResponse.json({ data: { is_studied: isStudied } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
