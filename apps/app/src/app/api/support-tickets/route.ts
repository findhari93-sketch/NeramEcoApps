export const dynamic = 'force-dynamic';

/**
 * Support Tickets API
 *
 * POST /api/support-tickets - Create a new support ticket (Firebase auth required)
 * GET  /api/support-tickets - List current user's tickets (Firebase auth required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  createSupportTicket,
  listUserTickets,
  createAdminNotification,
  sendTemplateEmail,
  isWhatsAppConfigured,
  sendWhatsAppTicketConfirmation,
} from '@neram/database';
import type { SupportTicketCategory } from '@neram/database';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAuth(
  req: NextRequest,
): Promise<{ userId: string; userName: string; userEmail: string | null; userPhone: string | null } | NextResponse> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = await verifyIdToken(token);
    const adminClient = getSupabaseAdminClient();
    const dbUser = await getUserByFirebaseUid(decoded.uid, adminClient);
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return {
      userId: dbUser.id,
      userName: dbUser.name || dbUser.first_name || 'Unknown',
      userEmail: dbUser.email || null,
      userPhone: dbUser.phone || null,
    };
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/support-tickets
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { category, subject, description, page_url, source_app, enrollment_link_id, screenshot_urls } = body;

    // Validate required fields
    if (!category || typeof category !== 'string') {
      return NextResponse.json({ error: 'category is required' }, { status: 400 });
    }
    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      return NextResponse.json({ error: 'subject is required' }, { status: 400 });
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Create the support ticket
    const ticket = await createSupportTicket(
      {
        user_id: auth.userId,
        user_name: auth.userName,
        user_email: auth.userEmail || undefined,
        user_phone: auth.userPhone || undefined,
        category: category as SupportTicketCategory,
        subject: subject.trim(),
        description: description.trim(),
        page_url: page_url || undefined,
        source_app: source_app || 'app',
        enrollment_link_id: enrollment_link_id || undefined,
        screenshot_urls: screenshot_urls || [],
      },
      supabase,
    );

    // Create admin notification for the new ticket
    try {
      await createAdminNotification({
        event_type: 'ticket_created' as any,
        title: 'New Support Ticket',
        message: `${auth.userName} created ticket: ${ticket.subject}`,
        metadata: {
          ticket_id: ticket.id,
          ticket_number: ticket.ticket_number,
          user_name: auth.userName,
          category: ticket.category,
          subject: ticket.subject,
        },
      });
    } catch (notifError) {
      // Non-blocking: log but don't fail the request
      console.error('Failed to create admin notification for ticket:', notifError);
    }

    // Send email confirmation to user (non-blocking)
    if (auth.userEmail) {
      const CATEGORY_LABELS: Record<string, string> = {
        enrollment_issue: 'Enrollment Issue',
        payment_issue: 'Payment Issue',
        technical_issue: 'Technical Issue',
        account_issue: 'Account Issue',
        course_question: 'Course Question',
        other: 'Other',
      };
      sendTemplateEmail(auth.userEmail, 'ticket-confirmation', {
        userName: auth.userName,
        ticketNumber: ticket.ticket_number,
        subject: subject.trim(),
        category: CATEGORY_LABELS[category] || category,
        description: description.trim(),
      }).catch((err) => console.error('Failed to send ticket confirmation email:', err));
    }

    // Send WhatsApp confirmation to user (non-blocking)
    if (auth.userPhone && isWhatsAppConfigured()) {
      sendWhatsAppTicketConfirmation(auth.userPhone, {
        userName: auth.userName,
        ticketNumber: ticket.ticket_number,
        subject: subject.trim(),
      }).catch((err) => console.error('Failed to send ticket WhatsApp notification:', err));
    }

    return NextResponse.json(
      {
        ticketNumber: ticket.ticket_number,
        ticketId: ticket.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Error creating support ticket:', error);
    return NextResponse.json({ error: 'Failed to create support ticket' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/support-tickets
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const supabase = getSupabaseAdminClient();

    const { data: tickets, total } = await listUserTickets(
      auth.userId,
      {
        status: status as any,
        page,
        limit,
      },
      supabase,
    );

    return NextResponse.json({
      tickets,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error listing support tickets:', error);
    return NextResponse.json({ error: 'Failed to list support tickets' }, { status: 500 });
  }
}
