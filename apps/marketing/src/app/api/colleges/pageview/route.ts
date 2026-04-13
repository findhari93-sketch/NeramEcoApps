// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const { college_id } = await request.json();
    if (!college_id) {
      return NextResponse.json({ error: 'college_id required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('college_page_views')
      .insert({
        college_id,
        country: 'IN',
      });

    if (error) {
      // Fail silently — pageview tracking should never break the user experience
      return NextResponse.json({ ok: false });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
