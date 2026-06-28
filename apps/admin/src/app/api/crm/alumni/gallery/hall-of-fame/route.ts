// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { setAlumniHallOfFame } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/crm/alumni/gallery/hall-of-fame
 * Show / hide a senior in the student Hall of Fame (alumni_profiles.is_hall_of_fame).
 * Independent of their drawings: a senior can be showcased on results alone.
 * Body: { userId: string, value: boolean, adminId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userId, value, adminId } = body;
    if (!userId || !UUID_REGEX.test(userId)) {
      return NextResponse.json({ error: 'userId must be a valid UUID.' }, { status: 400 });
    }
    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID.' }, { status: 400 });
    }
    await setAlumniHallOfFame(userId, !!value, adminId);
    return NextResponse.json({ success: true, isHallOfFame: !!value });
  } catch (error: any) {
    console.error('CRM alumni hall-of-fame error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update' }, { status: 500 });
  }
}
