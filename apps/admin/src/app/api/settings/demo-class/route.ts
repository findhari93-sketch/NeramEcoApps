export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await (supabase as any)
      .from('site_settings')
      .select('value')
      .eq('key', 'demo_class')
      .single();

    if (error) throw error;

    return NextResponse.json({ settings: (data as { value?: unknown } | null)?.value || {} });
  } catch (error) {
    console.error('Error fetching demo class settings:', error);
    return NextResponse.json({ settings: {} });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    }
    const supabase = getSupabaseAdminClient();

    // Merge, so the video URL editor and the request desk's settings dialog
    // (hosts, windows, drawing number) never overwrite each other's keys.
    const { data: current } = await (supabase as any)
      .from('site_settings')
      .select('value')
      .eq('key', 'demo_class')
      .maybeSingle();

    const { error } = await (supabase as any)
      .from('site_settings')
      .upsert({
        key: 'demo_class',
        value: { ...((current?.value as Record<string, unknown>) || {}), ...body },
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating demo class settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}