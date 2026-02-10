import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { createVisitBooking, getCenterById } from '@neram/database/queries';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp, cert } from 'firebase-admin/app';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch {
    // App might already be initialized
  }
}

interface VisitResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Try to get user ID from auth token (optional)
 */
async function tryGetUserId(request: NextRequest): Promise<string | undefined> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return undefined;
  }

  try {
    const token = authHeader.substring(7);
    const decodedToken = await getAuth().verifyIdToken(token);

    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', decodedToken.uid)
      .single();

    return user?.id;
  } catch {
    return undefined;
  }
}

/**
 * Validate Indian phone number
 */
function isValidIndianPhone(phone: string): boolean {
  const cleanPhone = phone.replace(/^\+91/, '').replace(/\s/g, '');
  return /^[6-9]\d{9}$/.test(cleanPhone);
}

/**
 * POST /api/centers/visit
 *
 * Create a center visit booking.
 * Authentication is optional.
 *
 * Request body:
 * - center_id: string (required)
 * - visitor_name: string (required)
 * - visitor_phone: string (required)
 * - visitor_email: string (optional)
 * - visit_date: string (required, ISO date)
 * - visit_time_slot: string (required)
 * - purpose: string (optional)
 *
 * Response:
 * - 201: { success: true, data: CenterVisitBooking }
 * - 400: { success: false, error: 'Validation error' }
 * - 404: { success: false, error: 'Center not found' }
 * - 500: { success: false, error: 'Internal error' }
 */
export async function POST(request: NextRequest): Promise<NextResponse<VisitResponse>> {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.center_id) {
      return NextResponse.json(
        { success: false, error: 'Center ID is required' },
        { status: 400 }
      );
    }

    if (!body.visitor_name || body.visitor_name.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'Name is required (minimum 2 characters)' },
        { status: 400 }
      );
    }

    if (!body.visitor_phone) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400 }
      );
    }

    if (!isValidIndianPhone(body.visitor_phone)) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid 10-digit Indian mobile number' },
        { status: 400 }
      );
    }

    if (!body.visit_date) {
      return NextResponse.json(
        { success: false, error: 'Visit date is required' },
        { status: 400 }
      );
    }

    // Validate date is in future
    const visitDate = new Date(body.visit_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (visitDate <= today) {
      return NextResponse.json(
        { success: false, error: 'Visit date must be in the future' },
        { status: 400 }
      );
    }

    if (!body.visit_time_slot) {
      return NextResponse.json(
        { success: false, error: 'Visit time slot is required' },
        { status: 400 }
      );
    }

    // Validate email if provided
    if (body.visitor_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.visitor_email)) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify center exists and is active
    const center = await getCenterById(supabase, body.center_id);
    if (!center || !center.is_active) {
      return NextResponse.json(
        { success: false, error: 'Learning center not found or not available' },
        { status: 404 }
      );
    }

    // Check for duplicate bookings (same phone, same center, same date)
    const cleanPhone = body.visitor_phone.replace(/^\+91/, '').replace(/\s/g, '');
    const { count } = await supabase
      .from('center_visit_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('center_id', body.center_id)
      .eq('visitor_phone', cleanPhone)
      .eq('visit_date', body.visit_date)
      .neq('status', 'cancelled');

    if ((count || 0) > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'You already have a visit scheduled for this date at this center',
        },
        { status: 400 }
      );
    }

    // Get user ID if authenticated
    const userId = await tryGetUserId(request);

    // Create booking
    const booking = await createVisitBooking(supabase, {
      center_id: body.center_id,
      user_id: userId,
      visitor_name: body.visitor_name.trim(),
      visitor_phone: cleanPhone,
      visitor_email: body.visitor_email?.trim(),
      visit_date: body.visit_date,
      visit_time_slot: body.visit_time_slot,
      purpose: body.purpose,
    });

    // TODO: Send confirmation email/SMS to visitor
    // TODO: Send notification to center admin

    return NextResponse.json(
      { success: true, data: booking },
      { status: 201 }
    );
  } catch (error) {
    console.error('Visit booking error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to book visit. Please try again.' },
      { status: 500 }
    );
  }
}
