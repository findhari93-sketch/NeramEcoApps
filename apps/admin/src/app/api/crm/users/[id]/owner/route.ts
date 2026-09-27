export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { setCrmOwner } from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';

/**
 * PUT /api/crm/users/[id]/owner  { ownerId: string | null }
 * Assign or clear the staff member responsible for this person. Audited.
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again to change the owner.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const ownerId = body.ownerId === null ? null : typeof body.ownerId === 'string' ? body.ownerId : undefined;
  if (ownerId === undefined) return NextResponse.json({ error: 'ownerId is required (or null to clear).' }, { status: 400 });
  try {
    await setCrmOwner(params.id, ownerId, adminId);
    return NextResponse.json({ success: true, ownerId });
  } catch (error: any) {
    const message = error?.message === 'The owner must be a staff member.' ? error.message : 'Could not change the owner.';
    return NextResponse.json({ error: message }, { status: error?.message === message ? 400 : 500 });
  }
}
