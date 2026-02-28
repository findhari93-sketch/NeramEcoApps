import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getActiveRegistrationByPhone } from '@neram/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const phone = request.nextUrl.searchParams.get('phone');

    if (!phone) {
      return NextResponse.json({ registration: null });
    }

    const normalizedPhone = phone.replace(/\D/g, '');
    if (normalizedPhone.length !== 10) {
      return NextResponse.json({ registration: null });
    }

    const supabase = getSupabaseAdminClient();
    const registration = await getActiveRegistrationByPhone(normalizedPhone, supabase);

    if (!registration) {
      return NextResponse.json({ registration: null });
    }

    return NextResponse.json({
      registration: {
        id: registration.id,
        status: registration.status,
        slotDate: registration.slot?.slot_date,
        slotTime: registration.slot?.slot_time,
        slotTitle: registration.slot?.title,
        createdAt: registration.created_at,
      },
    });
  } catch (error) {
    console.error('Error checking demo status:', error);
    return NextResponse.json({ registration: null });
  }
}
