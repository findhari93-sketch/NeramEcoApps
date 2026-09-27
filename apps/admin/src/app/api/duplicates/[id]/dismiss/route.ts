export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { dismissDuplicateCandidate } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';

/**
 * POST /api/duplicates/[id]/dismiss  { note }
 * "These are two different people." The pair is never proposed again.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to dismiss.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length < 3) {
    return NextResponse.json({ error: 'Add a short reason, for example "siblings sharing a parent phone".' }, { status: 400 });
  }
  try {
    await dismissDuplicateCandidate(params.id, adminId, note);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Duplicate dismiss error:', error);
    return NextResponse.json({ error: 'Could not dismiss this pair.' }, { status: 500 });
  }
}
