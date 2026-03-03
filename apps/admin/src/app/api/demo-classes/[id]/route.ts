export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getDemoSlotById,
  updateDemoSlot,
  deleteDemoSlot,
} from '@neram/database';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const slot = await getDemoSlotById(id, supabase);

    if (!slot) {
      return NextResponse.json(
        { error: 'Demo slot not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ slot });
  } catch (error) {
    console.error('Error fetching demo slot:', error);
    return NextResponse.json(
      { error: 'Failed to fetch demo slot' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    const slot = await updateDemoSlot(id, body, supabase);

    return NextResponse.json({ slot });
  } catch (error) {
    console.error('Error updating demo slot:', error);
    return NextResponse.json(
      { error: 'Failed to update demo slot' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    await deleteDemoSlot(id, supabase);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting demo slot:', error);

    if (error instanceof Error && error.message.includes('existing registrations')) {
      return NextResponse.json(
        { error: 'Cannot delete slot with existing registrations' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete demo slot' },
      { status: 500 }
    );
  }
}