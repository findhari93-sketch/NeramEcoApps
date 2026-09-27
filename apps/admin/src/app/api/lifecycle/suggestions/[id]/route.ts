export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveLifecycleSuggestion } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';

/**
 * POST /api/lifecycle/suggestions/[id]  { status: 'accepted' | 'dismissed', note? }
 *
 * Closes the suggestion. The action itself (archive, turn off sign-in, graduate)
 * is done by the page through the existing audited routes BEFORE it calls this
 * with 'accepted'.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (body.status !== 'accepted' && body.status !== 'dismissed') {
    return NextResponse.json({ error: "status must be 'accepted' or 'dismissed'." }, { status: 400 });
  }
  try {
    const row = await resolveLifecycleSuggestion(params.id, body.status, adminId, body.note ?? null);
    return NextResponse.json({ success: true, suggestion: row });
  } catch (error: any) {
    if (error?.status === 409) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Resolve suggestion error:', error);
    return NextResponse.json({ error: 'Could not update the suggestion.' }, { status: 500 });
  }
}
