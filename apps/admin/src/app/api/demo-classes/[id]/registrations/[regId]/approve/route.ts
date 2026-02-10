import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { approveRegistration, getRegistrationById } from '@neram/database';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; regId: string }> }
) {
  try {
    const { id, regId } = await params;
    const supabase = getSupabaseAdminClient();

    // Check if registration exists
    const existingReg = await getRegistrationById(regId, supabase);
    if (!existingReg) {
      return NextResponse.json(
        { error: 'Registration not found' },
        { status: 404 }
      );
    }

    // Verify registration belongs to this slot
    if (existingReg.slot_id !== id) {
      return NextResponse.json(
        { error: 'Registration does not belong to this slot' },
        { status: 400 }
      );
    }

    // Check if already processed
    if (existingReg.status !== 'pending') {
      return NextResponse.json(
        { error: 'Registration already processed' },
        { status: 400 }
      );
    }

    // TODO: Get admin ID from session
    const adminId = 'admin'; // Placeholder

    const registration = await approveRegistration(regId, adminId, supabase);

    return NextResponse.json({ registration });
  } catch (error) {
    console.error('Error approving registration:', error);
    return NextResponse.json(
      { error: 'Failed to approve registration' },
      { status: 500 }
    );
  }
}
