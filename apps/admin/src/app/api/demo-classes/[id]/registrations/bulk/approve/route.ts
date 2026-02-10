import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { bulkApproveRegistrations, getDemoSlotById } from '@neram/database';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    // Validate body
    if (!Array.isArray(body.registrationIds) || body.registrationIds.length === 0) {
      return NextResponse.json(
        { error: 'registrationIds must be a non-empty array' },
        { status: 400 }
      );
    }

    // Check if slot exists
    const existingSlot = await getDemoSlotById(id, supabase);
    if (!existingSlot) {
      return NextResponse.json(
        { error: 'Demo slot not found' },
        { status: 404 }
      );
    }

    // TODO: Get admin ID from session
    const adminId = 'admin'; // Placeholder

    const registrations = await bulkApproveRegistrations(
      body.registrationIds,
      adminId,
      supabase
    );

    return NextResponse.json({
      success: true,
      approvedCount: registrations.length,
      registrations,
    });
  } catch (error) {
    console.error('Error bulk approving registrations:', error);
    return NextResponse.json(
      { error: 'Failed to approve registrations' },
      { status: 500 }
    );
  }
}
