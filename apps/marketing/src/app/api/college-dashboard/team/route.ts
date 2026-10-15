export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { dashboardErrorResponse, requireCollegeAction, verifyCollegeDashboardAuth, DashboardError } from '@/lib/college-dashboard/auth';
import { isCollegeRole, normalizeRole } from '@/lib/college-dashboard/permissions';
import { inviteCollegePerson, inviteEmail, makeSignInLink } from '@/lib/college-dashboard/invite';
import { sendDashboardEmail, siteOrigin } from '@/lib/college-dashboard/email';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * GET   /api/college-dashboard/team    everyone with access to this college (any role)
 * POST  /api/college-dashboard/team    owner invites a person {name, email, phone?, designation?, role}
 * PATCH /api/college-dashboard/team    owner: {id, action: 'set_role', role} | {id, action: 'deactivate'|'reactivate'|'resend'}
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyCollegeDashboardAuth(request);
    const db = createAdminClient() as any;
    const { data, error } = await db
      .from('college_admins')
      .select('id, name, email, phone, designation, role, is_active, invited_at, accepted_at, last_login_at, invited_by')
      .eq('college_id', user.college_id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const people = (data ?? []).map((p: any) => ({ ...p, role: normalizeRole(p.role), is_me: p.id === user.id }));
    return NextResponse.json({ people, my_role: user.role });
  } catch (err) {
    return dashboardErrorResponse(err);
  }
}

async function collegeName(db: any, id: string): Promise<string> {
  const { data } = await db.from('colleges').select('name').eq('id', id).single();
  return data?.name ?? 'your college';
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCollegeAction(request, 'manage_team');
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!name || name.length > 80) throw new DashboardError(400, 'Enter the person\'s name.');
    if (!EMAIL.test(email)) throw new DashboardError(400, 'Enter a valid email address.');
    if (!isCollegeRole(body.role)) throw new DashboardError(400, 'Choose a role.');

    const db = createAdminClient() as any;
    const result = await inviteCollegePerson(db, {
      collegeId: user.college_id,
      collegeName: await collegeName(db, user.college_id),
      name,
      email,
      phone: typeof body.phone === 'string' ? body.phone : null,
      designation: typeof body.designation === 'string' ? body.designation : null,
      role: body.role,
      invitedBy: user.name,
      origin: siteOrigin(request.nextUrl.origin),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return dashboardErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireCollegeAction(request, 'manage_team');
    const body = (await request.json().catch(() => ({}))) as { id?: string; action?: string; role?: unknown };
    if (!body.id) throw new DashboardError(400, 'Choose a person.');
    const db = createAdminClient() as any;

    const { data: person } = await db
      .from('college_admins')
      .select('id, college_id, name, email, role, is_active')
      .eq('id', body.id)
      .maybeSingle();
    if (!person || person.college_id !== user.college_id) throw new DashboardError(404, 'That person is not on your team.');

    const { data: owners } = await db
      .from('college_admins')
      .select('id')
      .eq('college_id', user.college_id)
      .eq('is_active', true)
      .in('role', ['owner', 'admin']);
    const ownerCount = (owners ?? []).length;
    const isOwner = normalizeRole(person.role) === 'owner' && person.is_active;

    if (body.action === 'set_role') {
      if (!isCollegeRole(body.role)) throw new DashboardError(400, 'Choose a role.');
      if (isOwner && body.role !== 'owner' && ownerCount <= 1) throw new DashboardError(409, 'Your college needs at least one owner. Make someone else an owner first.');
      await db.from('college_admins').update({ role: body.role }).eq('id', person.id);
      return NextResponse.json({ success: true });
    }
    if (body.action === 'deactivate') {
      if (person.id === user.id) throw new DashboardError(409, 'You cannot switch off your own access.');
      if (isOwner && ownerCount <= 1) throw new DashboardError(409, 'Your college needs at least one owner.');
      await db.from('college_admins').update({ is_active: false }).eq('id', person.id);
      return NextResponse.json({ success: true });
    }
    if (body.action === 'reactivate') {
      await db.from('college_admins').update({ is_active: true }).eq('id', person.id);
      return NextResponse.json({ success: true });
    }
    if (body.action === 'resend') {
      const name = await collegeName(db, user.college_id);
      const { link, userId } = await makeSignInLink(db, person.email, person.name, siteOrigin(request.nextUrl.origin));
      await db.from('college_admins').update({ supabase_uid: userId, invited_at: new Date().toISOString() }).eq('id', person.id);
      const email = await sendDashboardEmail(
        person.email,
        `Your sign-in link for the ${name} dashboard`,
        inviteEmail({ collegeName: name, name: person.name, invitedBy: user.name, link })
      );
      return NextResponse.json({ success: true, invite_link: link, email });
    }
    throw new DashboardError(400, 'Unknown action.');
  } catch (err) {
    return dashboardErrorResponse(err);
  }
}
