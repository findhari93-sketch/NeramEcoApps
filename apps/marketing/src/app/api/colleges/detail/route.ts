export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCollegeBySlug } from '@/lib/college-hub/queries';

// GET /api/colleges/detail?slug=xxx
export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  try {
    const data = await getCollegeBySlug(slug);
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch college' }, { status: 500 });
  }
}
