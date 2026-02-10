import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { markAttendance, getRegistrationById } from '@neram/database';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; regId: string }> }
) {
  try {
    const { id, regId } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    // Validate body
    if (typeof body.attended !== 'boolean') {
      return NextResponse.json(
        { error: 'attended field must be a boolean' },
        { status: 400 }
      );
    }

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

    // Check if registration is approved
    if (!['approved', 'attended', 'no_show'].includes(existingReg.status)) {
      return NextResponse.json(
        { error: 'Can only mark attendance for approved registrations' },
        { status: 400 }
      );
    }

    // TODO: Get admin ID from session
    const adminId = 'admin'; // Placeholder

    const registration = await markAttendance(regId, body.attended, adminId, supabase);

    return NextResponse.json({ registration });
  } catch (error) {
    console.error('Error marking attendance:', error);
    return NextResponse.json(
      { error: 'Failed to mark attendance' },
      { status: 500 }
    );
  }
}
