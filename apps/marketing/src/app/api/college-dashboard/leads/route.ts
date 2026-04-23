// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyCollegeDashboardAuth } from '@/lib/college-dashboard/auth';

function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return phone.slice(0, 2) + 'X'.repeat(phone.length - 4) + phone.slice(-2);
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyCollegeDashboardAuth(request);
    const supabase = createAdminClient();

    // Check the college's tier to decide phone masking
    const { data: college } = await supabase
      .from('colleges')
      .select('neram_tier')
      .eq('id', authUser.college_id)
      .single();

    const tier = college?.neram_tier ?? 'free';
    const showFullPhone = tier === 'gold' || tier === 'platinum';

    // Only show leads that Neram staff has approved. Pending/rejected/spam leads
    // stay invisible to the college.
    const { data: leads, error } = await supabase
      .from('college_leads')
      .select('id, name, phone, email, city, nata_score, status, created_at')
      .eq('college_id', authUser.college_id)
      .eq('admin_review_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    const rows = (leads ?? []).map((lead) => ({
      ...lead,
      phone: showFullPhone ? lead.phone : maskPhone(lead.phone ?? ''),
      phone_masked: !showFullPhone,
    }));

    return NextResponse.json({ data: rows, tier });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    const status = msg === 'No token' || msg === 'Invalid token' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authUser = await verifyCollegeDashboardAuth(request);
    const { id, status } = await request.json();

    const allowedStatuses = ['new', 'contacted', 'qualified', 'dropped'];
    if (!id || !status || !allowedStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${allowedStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify this lead belongs to the college admin's college AND is approved.
    // Non-approved leads are invisible to the college, so they can't be updated either.
    const { data: lead } = await supabase
      .from('college_leads')
      .select('college_id, admin_review_status')
      .eq('id', id)
      .single();

    if (!lead || lead.college_id !== authUser.college_id || lead.admin_review_status !== 'approved') {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('college_leads')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    const status = msg === 'No token' || msg === 'Invalid token' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
