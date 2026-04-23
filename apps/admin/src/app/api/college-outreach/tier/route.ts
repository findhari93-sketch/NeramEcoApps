// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_TIERS = ['free', 'silver', 'gold', 'platinum'] as const;
type Tier = (typeof VALID_TIERS)[number];

export async function PATCH(req: NextRequest) {
  let body: { college_id?: string; tier?: Tier; tier_amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.college_id) return NextResponse.json({ error: 'college_id required' }, { status: 400 });
  if (!body.tier || !VALID_TIERS.includes(body.tier)) {
    return NextResponse.json({ error: `tier must be one of ${VALID_TIERS.join(', ')}` }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const updates: Record<string, unknown> = {
    neram_tier: body.tier,
    tier_start_date: new Date().toISOString().slice(0, 10),
    tier_end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
  if (typeof body.tier_amount === 'number') updates.tier_amount = body.tier_amount;

  const { data, error } = await supabase
    .from('colleges')
    .update(updates)
    .eq('id', body.college_id)
    .select('id, name, neram_tier, tier_start_date, tier_end_date, tier_amount')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, college: data });
}
