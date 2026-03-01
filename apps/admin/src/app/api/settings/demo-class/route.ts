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
    const supabase = getSupabaseAdminClient();

    const { error } = await (supabase as any)
      .from('site_settings')
      .upsert({
        key: 'demo_class',
        value: body,
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
