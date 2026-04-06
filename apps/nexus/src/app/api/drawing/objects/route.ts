import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getDrawingObjects } from '@neram/database/queries/nexus';

export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const params = request.nextUrl.searchParams;
    const filters = {
      family: params.get('family') || undefined,
      difficulty: params.get('difficulty') || undefined,
      search: params.get('search') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!) : 100,
      offset: params.get('offset') ? parseInt(params.get('offset')!) : 0,
    };

    const { data, count } = await getDrawingObjects(filters);
    return NextResponse.json({ objects: data, total: count });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
