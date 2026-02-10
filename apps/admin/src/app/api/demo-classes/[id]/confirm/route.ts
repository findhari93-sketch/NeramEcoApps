import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { confirmDemoSlot, getDemoSlotById } from '@neram/database';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    // Check if slot exists
    const existingSlot = await getDemoSlotById(id, supabase);
    if (!existingSlot) {
      return NextResponse.json(
        { error: 'Demo slot not found' },
        { status: 404 }
      );
    }

    // Check if slot can be confirmed
    if (existingSlot.status !== 'scheduled') {
      return NextResponse.json(
        { error: 'Only scheduled slots can be confirmed' },
        { status: 400 }
      );
    }

    const slot = await confirmDemoSlot(
      id,
      {
        meeting_link: body.meeting_link,
        meeting_password: body.meeting_password,
        venue_address: body.venue_address,
      },
      supabase
    );

    return NextResponse.json({ slot });
  } catch (error) {
    console.error('Error confirming demo slot:', error);
    return NextResponse.json(
      { error: 'Failed to confirm demo slot' },
      { status: 500 }
    );
  }
}
