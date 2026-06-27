import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getAlumniColleges } from '@neram/database';

/**
 * GET /api/drawing/alumni-colleges
 * Distinct colleges where Neram seniors studied, for the Hall of Fame college
 * filter. Any signed-in user (students browse). Changes rarely.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const colleges = await getAlumniColleges();
    return NextResponse.json({ colleges });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
