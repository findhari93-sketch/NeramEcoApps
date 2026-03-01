import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'demo_class')
      .single();

    if (error) throw error;

    return NextResponse.json({ settings: (data as { value?: unknown } | null)?.value || {} });
  } catch {
    return NextResponse.json({ settings: {} });
  }
}
