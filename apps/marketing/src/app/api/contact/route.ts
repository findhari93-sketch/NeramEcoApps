export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, notifyContactMessageReceived } from '@neram/database';
import { createContactMessage } from '@neram/database/queries';

interface ContactResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * POST /api/contact
 *
 * Submit a contact form message.
 * Public endpoint - no authentication required.
 *
 * Request body:
 * - name: string (required)
 * - email: string (required)
 * - phone: string (optional)
 * - subject: string (required)
 * - message: string (required)
 * - center_id: string (optional, pre-selected center)
 * - source: string (optional, defaults to 'contact_page')
 *
 * Response:
 * - 201: { success: true, data: ContactMessage }
 * - 400: { success: false, error: 'Validation error' }
 * - 500: { success: false, error: 'Internal error' }
 */
export async function POST(request: NextRequest): Promise<NextResponse<ContactResponse>> {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || body.name.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'Name is required (minimum 2 characters)' },
        { status: 400 }
      );
    }

    if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return NextResponse.json(
        { success: false, error: 'A valid email address is required' },
        { status: 400 }
      );
    }

    if (!body.subject || body.subject.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'Subject is required' },
        { status: 400 }
      );
    }

    if (!body.message || body.message.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'Message is required (minimum 10 characters)' },
        { status: 400 }
      );
    }

    // Extract IP and user-agent from request headers
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;
    const userAgent = request.headers.get('user-agent') || null;

    const supabase = createAdminClient();

    // Save the contact message
    const contactMessage = await createContactMessage(
      {
        name: body.name.trim(),
        email: body.email.trim().toLowerCase(),
        phone: body.phone?.trim() || undefined,
        subject: body.subject.trim(),
        message: body.message.trim(),
        center_id: body.center_id || undefined,
        source: body.source || 'contact_page',
        ip_address: ip || undefined,
        user_agent: userAgent || undefined,
      },
      supabase
    );

    // Dispatch notifications
    try {
      await notifyContactMessageReceived({
        name: body.name.trim(),
        email: body.email.trim().toLowerCase(),
        phone: body.phone?.trim(),
        subject: body.subject.trim(),
        message: body.message.trim(),
        source: body.source || 'contact_page',
        centerId: body.center_id || undefined,
      });
    } catch (err) {
      console.error('Contact message notification dispatch failed:', err);
    }

    return NextResponse.json(
      { success: true, data: contactMessage },
      { status: 201 }
    );
  } catch (error) {
    console.error('Contact form submission error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit your message. Please try again.' },
      { status: 500 }
    );
  }
}