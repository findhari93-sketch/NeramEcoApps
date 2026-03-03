export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, notifyNewCallback } from '@neram/database';
import {
  createCallbackRequest,
  getCallbackRequestsByUserId,
  type CreateCallbackInput,
} from '@neram/database/queries';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

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

interface CallbackResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Try to verify Firebase ID token and get user ID
 * Returns null if not authenticated (which is OK for callback requests)
 */
async function tryVerifyToken(request: NextRequest): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const decodedToken = await getAuth().verifyIdToken(token);

    const supabase = createAdminClient();
    const { data: user } = await (supabase
      .from('users') as any)
      .select('id')
      .eq('firebase_uid', decodedToken.uid)
      .single();

    if (!user) {
      return null;
    }

    return { userId: user.id };
  } catch {
    return null;
  }
}

/**
 * Validate Indian phone number
 */
function isValidIndianPhone(phone: string): boolean {
  // Remove country code if present
  const cleanPhone = phone.replace(/^\+91/, '').replace(/\s/g, '');
  // Indian mobile numbers start with 6, 7, 8, or 9 and are 10 digits
  return /^[6-9]\d{9}$/.test(cleanPhone);
}

/**
 * POST /api/callback
 *
 * Create a callback request.
 * Authentication is optional - non-logged-in users can also request callbacks.
 *
 * Request body:
 * - name: string (required)
 * - phone: string (required)
 * - email: string (optional)
 * - preferred_date: string (optional, ISO date)
 * - preferred_slot: 'morning' | 'afternoon' | 'evening' (optional)
 * - course_interest: CourseType (optional)
 * - query_type: string (optional)
 * - notes: string (optional)
 *
 * Response:
 * - 201: { success: true, data: CallbackRequest }
 * - 400: { success: false, error: 'Validation error' }
 * - 500: { success: false, error: 'Internal error' }
 */
export async function POST(request: NextRequest): Promise<NextResponse<CallbackResponse>> {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || body.name.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'Name is required (minimum 2 characters)' },
        { status: 400 }
      );
    }

    if (!body.phone) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400 }
      );
    }

    if (!isValidIndianPhone(body.phone)) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid 10-digit Indian mobile number' },
        { status: 400 }
      );
    }

    // Validate email if provided
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    // Validate preferred_slot if provided
    const validSlots = ['morning', 'afternoon', 'evening'];
    if (body.preferred_slot && !validSlots.includes(body.preferred_slot)) {
      return NextResponse.json(
        { success: false, error: 'Invalid preferred time slot' },
        { status: 400 }
      );
    }

    // Try to get user ID if authenticated
    const auth = await tryVerifyToken(request);

    const supabase = createAdminClient();

    // Check for duplicate recent callback requests (within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const cleanPhone = body.phone.replace(/^\+91/, '').replace(/\s/g, '');

    const { count } = await supabase
      .from('callback_requests' as any)
      .select('*', { count: 'exact', head: true })
      .eq('phone', cleanPhone)
      .gte('created_at', oneHourAgo);

    if ((count || 0) > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'You have already requested a callback recently. Our team will contact you soon.',
        },
        { status: 400 }
      );
    }

    // Create callback request
    const callbackData: CreateCallbackInput = {
      user_id: auth?.userId,
      name: body.name.trim(),
      phone: cleanPhone,
      email: body.email?.trim(),
      preferred_date: body.preferred_date,
      preferred_slot: body.preferred_slot,
      course_interest: body.course_interest,
      query_type: body.query_type,
      notes: body.notes?.trim(),
    };

    const callback = await createCallbackRequest(supabase, callbackData);

    // Notify admin via Telegram, email, and in-app bell
    try {
      await notifyNewCallback({
        userId: auth?.userId,
        userName: callbackData.name,
        phone: callbackData.phone,
        preferredSlot: callbackData.preferred_slot,
        preferredDate: callbackData.preferred_date,
        courseInterest: callbackData.course_interest,
        queryType: callbackData.query_type,
        notes: callbackData.notes,
      });
    } catch (err) {
      console.error('Callback notification dispatch failed:', err);
    }

    return NextResponse.json(
      { success: true, data: callback },
      { status: 201 }
    );
  } catch (error) {
    console.error('Callback request error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit callback request. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/callback
 *
 * Get callback requests for the authenticated user.
 * Requires authentication.
 *
 * Response:
 * - 200: { success: true, data: CallbackRequest[] }
 * - 401: { success: false, error: 'Unauthorized' }
 * - 500: { success: false, error: 'Internal error' }
 */
export async function GET(request: NextRequest): Promise<NextResponse<CallbackResponse>> {
  const auth = await tryVerifyToken(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Please log in to view your callback requests' },
      { status: 401 }
    );
  }

  try {
    const supabase = createAdminClient();
    const callbacks = await getCallbackRequestsByUserId(supabase, auth.userId);

    return NextResponse.json({ success: true, data: callbacks });
  } catch (error) {
    console.error('Get callbacks error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch callback requests' },
      { status: 500 }
    );
  }
}