import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getUpcomingDemoSlots } from '@neram/database';

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();

    const slots = await getUpcomingDemoSlots(
      { limit: 20, status: ['scheduled', 'confirmed'] },
      supabase
    );

    return NextResponse.json({ slots });
  } catch (error) {
    console.error('Error fetching demo slots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch demo slots' },
      { status: 500 }
    );
  }
}
