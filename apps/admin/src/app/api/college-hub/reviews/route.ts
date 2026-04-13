export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  const status = new URL(request.url).searchParams.get('status') ?? 'pending';
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('college_reviews')
    .select('*, colleges(name, slug)')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const { id, status, rejected_reason } = await request.json();
  if (!id || !status) {
    return NextResponse.json({ error: 'id and status required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('college_reviews')
    .update({
      status,
      rejected_reason: rejected_reason ?? null,
      moderated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
