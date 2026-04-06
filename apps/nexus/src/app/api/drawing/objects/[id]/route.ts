import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getDrawingObjectById } from '@neram/database/queries/nexus';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;
    const object = await getDrawingObjectById(id);
    if (!object) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ object });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
