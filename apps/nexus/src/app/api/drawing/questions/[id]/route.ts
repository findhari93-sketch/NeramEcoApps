import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getDrawingQuestionById } from '@neram/database/queries/nexus';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const question = await getDrawingQuestionById(id);
    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    return NextResponse.json({ question });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load question';
    console.error('Drawing question GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
