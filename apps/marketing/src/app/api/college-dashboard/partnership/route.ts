// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyCollegeDashboardAuth } from '@/lib/college-dashboard/auth';

export async function GET(request: NextRequest) {
  try {
    const authUser = await verifyCollegeDashboardAuth(request);
    const supabase = createAdminClient();

    const { data: college } = await supabase
      .from('colleges')
      .select('partnership_page_url, partnership_page_status, partnership_page_notes, partnership_page_submitted_at')
      .eq('id', authUser.college_id)
      .single();

    return NextResponse.json({
      partnership_page_url: college?.partnership_page_url ?? null,
      partnership_page_status: college?.partnership_page_status ?? 'none',
      partnership_page_notes: college?.partnership_page_notes ?? null,
      partnership_page_submitted_at: college?.partnership_page_submitted_at ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    const status = msg === 'No token' || msg === 'Invalid token' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authUser = await verifyCollegeDashboardAuth(request);
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    // Basic URL validation
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json({ error: 'URL must start with http:// or https://' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('colleges')
      .update({
        partnership_page_url: url.trim(),
        partnership_page_status: 'pending',
        partnership_page_notes: null,
        partnership_page_submitted_at: new Date().toISOString(),
      })
      .eq('id', authUser.college_id);

    if (error) throw error;

    return NextResponse.json({ success: true, status: 'pending' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    const status = msg === 'No token' || msg === 'Invalid token' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
