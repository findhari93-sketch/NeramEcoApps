import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getDemoSlotStats, getDemoSlotById } from '@neram/database';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    // Check if slot exists
    const existingSlot = await getDemoSlotById(id, supabase);
    if (!existingSlot) {
      return NextResponse.json(
        { error: 'Demo slot not found' },
        { status: 404 }
      );
    }

    const stats = await getDemoSlotStats(id, supabase);

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Error fetching demo slot stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
