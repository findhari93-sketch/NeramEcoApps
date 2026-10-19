export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getChildrenFor,
  getGuardiansFor,
  linkGuardian,
  listUnlinkedGuardianAccounts,
  unlinkGuardian,
} from '@neram/database';
import { getRequestAdminId } from '@/lib/request-admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parents linked to their children (user_guardian_links + Nexus parent logins).
 *
 * GET ?unlinked=1        parent accounts no child is linked to yet
 * GET ?person=<id>       { guardians, children } of one person (User 360)
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    if (params.get('unlinked')) {
      return NextResponse.json({ accounts: await listUnlinkedGuardianAccounts() });
    }
    const person = params.get('person');
    if (person && UUID.test(person)) {
      const [guardians, children] = await Promise.all([getGuardiansFor([person]), getChildrenFor(person)]);
      return NextResponse.json({ guardians: guardians[person] || [], children });
    }
    return NextResponse.json({ error: 'Pass ?unlinked=1 or ?person=<id>.' }, { status: 400 });
  } catch (error) {
    console.error('Guardians read error:', error);
    return NextResponse.json({ error: 'Could not load parents.' }, { status: 500 });
  }
}

/** POST { guardianUserId, studentUserId, relationship? } links a parent to a child. */
export async function POST(request: NextRequest) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (!UUID.test(body.guardianUserId || '') || !UUID.test(body.studentUserId || '')) {
    return NextResponse.json({ error: 'Pick both the parent and the student.' }, { status: 400 });
  }
  try {
    const link = await linkGuardian({
      guardianUserId: body.guardianUserId,
      studentUserId: body.studentUserId,
      relationship: body.relationship,
      source: 'staff',
      note: body.note ?? null,
      createdBy: UUID.test(adminId) ? adminId : null,
    });
    return NextResponse.json({ success: true, link });
  } catch (error: any) {
    if (error?.status === 400) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Link guardian error:', error);
    return NextResponse.json({ error: 'Could not link the parent.' }, { status: 500 });
  }
}

/** DELETE ?id=<linkId> removes a link (kept as history). */
export async function DELETE(request: NextRequest) {
  const adminId = getRequestAdminId(request);
  if (!adminId) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  const id = request.nextUrl.searchParams.get('id') || '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Which link?' }, { status: 400 });
  try {
    await unlinkGuardian(id, UUID.test(adminId) ? adminId : null);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.status === 409) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Unlink guardian error:', error);
    return NextResponse.json({ error: 'Could not remove the link.' }, { status: 500 });
  }
}
