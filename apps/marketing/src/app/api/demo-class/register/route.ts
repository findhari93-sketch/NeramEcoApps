import { NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  notifyDemoRegistration,
  createDemoRegistration,
  getDemoSlotById,
  getRegistrationByPhone,
  getUserByPhone,
} from '@neram/database';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    // Validate required fields
    if (!body.slotId) {
      return NextResponse.json(
        { error: 'Please select a demo class slot' },
        { status: 400 }
      );
    }

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: 'Please enter your name' },
        { status: 400 }
      );
    }

    if (!body.phone) {
      return NextResponse.json(
        { error: 'Please verify your phone number' },
        { status: 400 }
      );
    }

    // Normalize phone number
    const phone = body.phone.replace(/\D/g, '');
    if (phone.length !== 10) {
      return NextResponse.json(
        { error: 'Please enter a valid 10-digit phone number' },
        { status: 400 }
      );
    }

    // Check if slot exists and is available
    const slot = await getDemoSlotById(body.slotId, supabase);
    if (!slot) {
      return NextResponse.json(
        { error: 'Demo class slot not found' },
        { status: 404 }
      );
    }

    if (!['scheduled', 'confirmed'].includes(slot.status)) {
      return NextResponse.json(
        { error: 'This demo class is no longer accepting registrations' },
        { status: 400 }
      );
    }

    if (slot.current_registrations >= slot.max_registrations) {
      return NextResponse.json(
        { error: 'This demo class is full. Please select another slot.' },
        { status: 400 }
      );
    }

    // Check for duplicate registration
    const existingRegistration = await getRegistrationByPhone(body.slotId, phone, supabase);
    if (existingRegistration) {
      return NextResponse.json(
        { error: 'You have already registered for this demo class' },
        { status: 400 }
      );
    }

    // Find or create user
    let userId: string | undefined;
    const existingUser = await getUserByPhone(phone, supabase);
    if (existingUser) {
      userId = existingUser.id;
    }

    // Create registration
    const registration = await createDemoRegistration(
      {
        slot_id: body.slotId,
        user_id: userId,
        name: body.name.trim(),
        email: body.email?.trim() || undefined,
        phone,
        current_class: body.currentClass || undefined,
        interest_course: body.interestCourse || undefined,
        city: body.city || undefined,
        utm_source: body.utmSource || undefined,
        utm_medium: body.utmMedium || undefined,
        utm_campaign: body.utmCampaign || undefined,
        referral_code: body.referralCode || undefined,
      },
      supabase
    );

    // Dispatch notifications (non-blocking)
    notifyDemoRegistration({
      userName: body.name.trim(),
      phone,
      email: body.email?.trim(),
      slotDate: slot.slot_date,
      slotTime: slot.slot_time,
      slotTitle: slot.title,
      currentClass: body.currentClass,
      interestCourse: body.interestCourse,
      registrationId: registration.id,
    }).catch((err) => {
      console.error('Demo registration notification dispatch failed:', err);
    });

    return NextResponse.json({
      success: true,
      registrationId: registration.id,
      slotDetails: {
        date: slot.slot_date,
        time: slot.slot_time,
        title: slot.title,
      },
    });
  } catch (error) {
    console.error('Error creating demo registration:', error);

    // Handle unique constraint violation
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { error: 'You have already registered for this demo class' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to register. Please try again.' },
      { status: 500 }
    );
  }
}
