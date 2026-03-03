export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRegistrationsBySlot, getDemoSlotById } from '@neram/database';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = getSupabaseAdminClient();

    // Check if slot exists
    const existingSlot = await getDemoSlotById(id, supabase);
    if (!existingSlot) {
      return NextResponse.json(
        { error: 'Demo slot not found' },
        { status: 404 }
      );
    }

    const status = statusParam ? statusParam.split(',') as any[] : undefined;

    const { registrations, count } = await getRegistrationsBySlot(
      id,
      { status, limit, offset },
      supabase
    );

    return NextResponse.json({ registrations, count });
  } catch (error) {
    console.error('Error fetching registrations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch registrations' },
      { status: 500 }
    );
  }
}