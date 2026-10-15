export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { dashboardErrorResponse, requireCollegeAction, verifyCollegeDashboardAuth, DashboardError } from '@/lib/college-dashboard/auth';
import { effectiveTier } from '@/lib/college-hub/plan';
import { LEAD_STATUSES, maskPhone, showsFullPhone } from '@/lib/college-dashboard/leads';

/**
 * GET   /api/college-dashboard/leads   enquiries delivered to this college
 * PATCH /api/college-dashboard/leads   {id, status?, college_note?}
 *
 * Only delivered leads are shown: approved by staff, or delivered straight
 * away because the student agreed to share with this college while it was on
 * a plan. Phones are masked below Gold.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyCollegeDashboardAuth(request);
    const db = createAdminClient() as any;

    const { data: college } = await db
      .from('colleges')
      .select('neram_tier, tier_start_date, tier_end_date')
      .eq('id', user.college_id)
      .single();
    const tier = effectiveTier(college ?? {});
    const full = showsFullPhone(tier);

    const { data: leads, error } = await db
      .from('college_leads')
      .select('id, name, phone, parent_phone, email, city, nata_score, jee_score, message, status, college_note, created_at, status_updated_at')
      .eq('college_id', user.college_id)
      .eq('admin_review_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;

    const rows = (leads ?? []).map((lead: any) => ({
      ...lead,
      phone: full ? lead.phone : maskPhone(lead.phone ?? ''),
      parent_phone: lead.parent_phone ? (full ? lead.parent_phone : maskPhone(lead.parent_phone)) : null,
      email: full ? lead.email : null,
      phone_masked: !full,
    }));

    return NextResponse.json({ data: rows, tier });
  } catch (err) {
    return dashboardErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireCollegeAction(request, 'manage_leads');
    const body = (await request.json().catch(() => ({}))) as { id?: string; status?: string; college_note?: string };
    if (!body.id) throw new DashboardError(400, 'Choose an enquiry.');
    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!LEAD_STATUSES.some((s) => s.value === body.status)) throw new DashboardError(400, 'Unknown status.');
      updates.status = body.status;
      updates.status_updated_at = new Date().toISOString();
    }
    if (body.college_note !== undefined) {
      const note = String(body.college_note).trim();
      if (note.length > 1000) throw new DashboardError(400, 'Keep the note under 1000 characters.');
      updates.college_note = note || null;
    }
    if (Object.keys(updates).length === 0) throw new DashboardError(400, 'Nothing to update.');

    const db = createAdminClient() as any;
    const { data: lead } = await db.from('college_leads').select('college_id, admin_review_status').eq('id', body.id).maybeSingle();
    if (!lead || lead.college_id !== user.college_id || lead.admin_review_status !== 'approved') {
      throw new DashboardError(404, 'Enquiry not found.');
    }
    const { error } = await db.from('college_leads').update(updates).eq('id', body.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return dashboardErrorResponse(err);
  }
}
