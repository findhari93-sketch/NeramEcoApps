// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  const status = new URL(request.url).searchParams.get('status') ?? 'approved';
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('college_comments')
    .select('id, author_name, body, status, created_at, colleges(name, slug)')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const { id, status } = await request.json();
  if (!id || !status) {
    return NextResponse.json({ error: 'id and status required' }, { status: 400 });
  }

  const allowed = ['approved', 'removed'];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${allowed.join(', ')}` }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('college_comments')
    .update({ status })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
