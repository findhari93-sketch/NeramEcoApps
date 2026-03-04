export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getDirectEnrollmentLinkByToken,
  createSupportTicket,
  createAdminNotification,
} from '@neram/database';

// POST /api/enroll/request-regeneration
// No auth required - student may not be logged in
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, studentName, studentEmail, studentPhone, reason } = body;

    if (!token || !studentName) {
      return NextResponse.json(
        { error: 'Token and student name are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // Look up the enrollment link by token (even if expired/cancelled)
    const link = await getDirectEnrollmentLinkByToken(token, supabase);

    // Create a support ticket
    const ticketSubject = link
      ? `Link Regeneration Request - ${link.student_name}`
      : `Enrollment Link Issue - ${studentName}`;

    const ticketDescription = reason
      || `Student requested a new enrollment link. Original link status: ${link?.status || 'unknown'}.`;

    const ticket = await createSupportTicket(
      {
        user_name: studentName,
        user_email: studentEmail || undefined,
        user_phone: studentPhone || undefined,
        category: 'enrollment_issue',
        subject: ticketSubject,
        description: ticketDescription,
        page_url: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/en/enroll?token=${token}`,
        source_app: 'marketing',
        enrollment_link_id: link?.id || undefined,
      },
      supabase
    );

    // Create admin notification
    await createAdminNotification(
      {
        event_type: 'link_regeneration_requested',
        title: 'Link Regeneration Requested',
        message: `${studentName} needs a new enrollment link`,
        metadata: {
          enrollment_link_id: link?.id || null,
          student_name: studentName,
          student_email: studentEmail || null,
          student_phone: studentPhone || null,
          ticket_number: ticket.ticket_number,
          token,
        },
      },
      supabase
    );

    return NextResponse.json({
      success: true,
      ticketNumber: ticket.ticket_number,
      message: 'Your request has been sent to the admin. They will share a new link with you shortly.',
    });
  } catch (error: any) {
    console.error('Error requesting link regeneration:', error);
    return NextResponse.json(
      { error: 'Failed to submit your request. Please try again or contact support@neramclasses.com.' },
      { status: 500 }
    );
  }
}
