import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getDrawingSubmissionById } from '@neram/database/queries/nexus';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const submission = await getDrawingSubmissionById(id);
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    return NextResponse.json({ submission });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load submission';
    console.error('Submission GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
