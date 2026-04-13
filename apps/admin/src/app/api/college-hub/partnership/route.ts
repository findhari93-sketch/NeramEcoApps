// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    // List all colleges that have submitted a partnership URL
    const { data, error } = await supabase
      .from('colleges')
      .select('id, name, short_name, slug, neram_tier, partnership_page_url, partnership_page_status, partnership_page_notes, partnership_page_submitted_at')
      .not('partnership_page_url', 'is', null)
      .order('partnership_page_submitted_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ colleges: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { college_id, status, notes } = await request.json();

    if (!college_id || !status) {
      return NextResponse.json({ error: 'college_id and status required' }, { status: 400 });
    }
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('colleges')
      .update({
        partnership_page_status: status,
        partnership_page_notes: notes ?? null,
      })
      .eq('id', college_id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
