export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUser360 } from '@neram/database';

/**
 * GET /api/users/[userId]/360 - the User 360 payload (lifecycle plan M4).
 * Staff only (middleware.ts). Each section degrades on its own.
 */
export async function GET(_request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const data = await getUser360(params.userId);
    if (!data) return NextResponse.json({ error: 'No user with this id.' }, { status: 404 });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('User 360 error:', error);
    return NextResponse.json({ error: 'Could not load this person.' }, { status: 500 });
  }
}
