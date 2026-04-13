export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  const collegeId = new URL(request.url).searchParams.get('college_id');
  if (!collegeId) {
    return NextResponse.json({ active: false }, { status: 400 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Get the college's tier and counseling systems
  const { data: college } = await supabase
    .from('colleges')
    .select('neram_tier, counseling_systems')
    .eq('id', collegeId)
    .single();

  if (!college) {
    return NextResponse.json({ active: false });
  }

  const tier = college.neram_tier ?? 'free';
  const counselingSystems: string[] = college.counseling_systems ?? [];

  // Find an active lead window that covers today and applies to this college
  const { data: windows } = await supabase
    .from('lead_windows')
    .select('id, name, applies_to, eligible_tiers')
    .eq('is_active', true)
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1);

  if (!windows || windows.length === 0) {
    return NextResponse.json({ active: false });
  }

  const win = windows[0];

  // Check applies_to: 'all' means all colleges, 'tnea' means TNEA counseling, 'josaa' means JoSAA
  if (win.applies_to !== 'all') {
    const counselingMatch = counselingSystems.some(
      (cs) => cs.toLowerCase() === win.applies_to.toLowerCase()
    );
    if (!counselingMatch) {
      return NextResponse.json({ active: false });
    }
  }

  // Check eligible_tiers
  const eligibleTiers: string[] = win.eligible_tiers ?? [];
  if (!eligibleTiers.includes(tier)) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({ active: true, window_name: win.name });
}
