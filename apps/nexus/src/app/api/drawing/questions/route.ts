import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getDrawingQuestions } from '@neram/database/queries/nexus';

export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const params = request.nextUrl.searchParams;
    const filters = {
      category: params.get('category') || undefined,
      sub_type: params.get('sub_type') || undefined,
      difficulty_tag: params.get('difficulty_tag') || undefined,
      year: params.get('year') ? parseInt(params.get('year')!) : undefined,
      search: params.get('search') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!) : 20,
      offset: params.get('offset') ? parseInt(params.get('offset')!) : 0,
    };

    const { data, count } = await getDrawingQuestions(filters);
    return NextResponse.json({ questions: data, total: count });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load questions';
    console.error('Drawing questions GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
