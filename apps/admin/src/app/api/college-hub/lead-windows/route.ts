// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('lead_windows')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { name, description, start_date, end_date, applies_to, eligible_tiers } = await request.json();

  if (!name || !start_date || !end_date) {
    return NextResponse.json({ error: 'name, start_date, and end_date are required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('lead_windows')
    .insert({
      name,
      description: description || null,
      start_date,
      end_date,
      applies_to: applies_to ?? 'all',
      eligible_tiers: eligible_tiers ?? ['silver', 'gold', 'platinum'],
      is_active: false,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}

export async function PATCH(request: NextRequest) {
  const { id, is_active } = await request.json();

  if (!id || typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'id and is_active required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // If activating, deactivate all other windows first (only one active at a time)
  if (is_active) {
    await supabase
      .from('lead_windows')
      .update({ is_active: false })
      .neq('id', id);
  }

  const { error } = await supabase
    .from('lead_windows')
    .update({ is_active })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
