export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  createSupportTicket,
  createAdminNotification,
  getDirectEnrollmentLinkByToken,
  sendTemplateEmail,
  isWhatsAppConfigured,
  sendWhatsAppTicketConfirmation,
} from '@neram/database';

// POST /api/support-tickets - Create a ticket (no auth required for marketing app)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userName,
      userEmail,
      userPhone,
      category,
      subject,
      description,
      pageUrl,
      sourceApp,
      enrollmentLinkToken,
      screenshotUrls,
    } = body;

    if (!userName || !subject || !description) {
      return NextResponse.json(
        { error: 'Name, subject, and description are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // Resolve enrollment link ID from token if provided
    let enrollmentLinkId: string | undefined;
    if (enrollmentLinkToken) {
      const link = await getDirectEnrollmentLinkByToken(enrollmentLinkToken, supabase);
      if (link) {
        enrollmentLinkId = link.id;
      }
    }

    const ticket = await createSupportTicket(
      {
        user_name: userName,
        user_email: userEmail || undefined,
        user_phone: userPhone || undefined,
        category: category || 'other',
        subject,
        description,
        page_url: pageUrl || undefined,
        source_app: sourceApp || 'marketing',
        enrollment_link_id: enrollmentLinkId,
        screenshot_urls: screenshotUrls || [],
      },
      supabase
    );

    // Notify admin
    await createAdminNotification(
      {
        event_type: 'ticket_created',
        title: 'New Support Ticket',
        message: `${userName}: ${subject}`,
        metadata: {
          ticket_id: ticket.id,
          ticket_number: ticket.ticket_number,
          category: ticket.category,
        },
      },
      supabase
    );

    // Send email confirmation to user (non-blocking)
    if (userEmail) {
      const CATEGORY_LABELS: Record<string, string> = {
        enrollment_issue: 'Enrollment Issue',
        payment_issue: 'Payment Issue',
        technical_issue: 'Technical Issue',
        other: 'Other',
      };
      sendTemplateEmail(userEmail, 'ticket-confirmation', {
        userName,
        ticketNumber: ticket.ticket_number,
        subject,
        category: CATEGORY_LABELS[category || 'other'] || category || 'Other',
        description,
      }).catch((err) => console.error('Failed to send ticket confirmation email:', err));
    }

    // Send WhatsApp confirmation to user (non-blocking)
    if (userPhone && isWhatsAppConfigured()) {
      sendWhatsAppTicketConfirmation(userPhone, {
        userName,
        ticketNumber: ticket.ticket_number,
        subject,
      }).catch((err) => console.error('Failed to send ticket WhatsApp notification:', err));
    }

    return NextResponse.json({
      success: true,
      ticketNumber: ticket.ticket_number,
      ticketId: ticket.id,
    });
  } catch (error: any) {
    console.error('Error creating support ticket:', error);
    return NextResponse.json(
      { error: 'Failed to create ticket. Please try again.' },
      { status: 500 }
    );
  }
}
