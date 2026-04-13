export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyCollegeDashboardAuth } from '@/lib/college-dashboard/auth';

export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyCollegeDashboardAuth(request);
    const supabase = createAdminClient();

    const { data: college, error } = await supabase
      .from('colleges')
      .select(
        'id, name, slug, neram_tier, verified, about, phone, email, admissions_phone, admissions_email, website, youtube_channel_url, instagram_handle, city, state'
      )
      .eq('id', authUser.college_id)
      .single();

    if (error) throw error;

    return NextResponse.json({
      admin: { id: authUser.id, college_id: authUser.college_id, name: authUser.name, role: authUser.role },
      college,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    const status = msg === 'No token' || msg === 'Invalid token' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// Allowed fields for college admins to update (admin-only fields like tier, slug are excluded)
const ALLOWED_FIELDS = new Set([
  'about', 'phone', 'email', 'admissions_phone', 'admissions_email',
  'website', 'youtube_channel_url', 'instagram_handle',
]);

export async function PATCH(request: NextRequest) {
  try {
    const authUser = await verifyCollegeDashboardAuth(request);
    const body = await request.json();

    // Filter to allowed fields only
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_FIELDS.has(key)) {
        updates[key] = value ?? null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('colleges')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', authUser.college_id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    const status = msg === 'No token' || msg === 'Invalid token' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
