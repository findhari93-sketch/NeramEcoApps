export const dynamic = 'force-dynamic';

/**
 * Student PWA problem report (Firebase auth) → the Admin support queue.
 *
 * POST /api/error-reports
 *
 * Two rules this route exists to enforce:
 *
 * 1. Only students who are part of a class may file one. The button is hidden
 *    for everyone else, but hiding a button is not a gate, so the check lives
 *    here where it cannot be bypassed.
 * 2. Reports from this app write `support_tickets` (source_app='app'), never
 *    `nexus_foundation_issues`. That table is the Nexus teacher inbox and must
 *    contain only reports filed inside Nexus. A lead once filed a counseling
 *    question through this route and it surfaced as a Nexus ticket (NXS-0110),
 *    which is what these two rules prevent.
 *
 * Body: { title, description?, category?, page_url?, screenshot_urls?,
 *         device_info?, console_logs? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  createAdminNotification,
  createSupportTicket,
  sendTemplateEmail,
  isWhatsAppConfigured,
  sendWhatsAppTicketConfirmation,
} from '@neram/database';
import type { SupportTicketCategory } from '@neram/database';
import { isEnrolledStudent } from '@/lib/enrollment';

interface AuthedReporter {
  userId: string;
  userName: string;
  userEmail: string | null;
  userPhone: string | null;
}

async function requireEnrolledStudent(
  req: NextRequest,
): Promise<AuthedReporter | NextResponse> {
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

    if (!(await isEnrolledStudent(dbUser.id, adminClient))) {
      return NextResponse.json(
        {
          error: 'not_enrolled',
          message: 'Problem reports are for enrolled students. Please use Support to reach us.',
        },
        { status: 403 },
      );
    }

    return {
      userId: dbUser.id,
      userName: dbUser.name || dbUser.first_name || 'Student',
      userEmail: dbUser.email || null,
      userPhone: dbUser.phone || null,
    };
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

const VALID_CATEGORIES: SupportTicketCategory[] = [
  'enrollment_issue',
  'payment_issue',
  'technical_issue',
  'account_issue',
  'course_question',
  'other',
];

const CATEGORY_LABELS: Record<string, string> = {
  enrollment_issue: 'Enrollment Issue',
  payment_issue: 'Payment Issue',
  technical_issue: 'Technical Issue',
  account_issue: 'Account Issue',
  course_question: 'Course Question',
  other: 'Other',
};

const SCREENSHOT_BUCKET = 'issue-screenshots';

/**
 * The uploader returns a storage path, and the Nexus issue view used to prefix
 * the bucket URL when rendering. The Admin support view renders src={url}
 * directly, so absolutise here or every screenshot lands as a broken image.
 */
function toPublicUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return `${base}/storage/v1/object/public/${SCREENSHOT_BUCKET}/${pathOrUrl}`;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireEnrolledStudent(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    if (!body?.title || typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    const title = body.title.trim();
    const description = (body.description || '').trim();
    const category: SupportTicketCategory = VALID_CATEGORIES.includes(body.category)
      ? body.category
      : 'technical_issue';

    const supabase = getSupabaseAdminClient();

    const ticket = await createSupportTicket(
      {
        user_id: auth.userId,
        user_name: auth.userName,
        user_email: auth.userEmail || undefined,
        user_phone: auth.userPhone || undefined,
        category,
        subject: title,
        // The reporter's "Details" box is optional, but description is NOT
        // nullable on support_tickets, so fall back to the subject.
        description: description || title,
        page_url: body.page_url || undefined,
        source_app: 'app',
        screenshot_urls: Array.isArray(body.screenshot_urls)
          ? body.screenshot_urls.map(toPublicUrl)
          : undefined,
        console_logs: Array.isArray(body.console_logs) ? body.console_logs : undefined,
        device_info:
          body.device_info && typeof body.device_info === 'object' ? body.device_info : undefined,
      },
      supabase,
    );

    // Same notification event the /support flow emits, so the Admin sidebar
    // badge counts this ticket like any other.
    try {
      await createAdminNotification({
        event_type: 'ticket_created' as never,
        title: 'New Support Ticket',
        message: `${auth.userName} (app) reported: "${title}"`,
        metadata: {
          ticket_id: ticket.id,
          ticket_number: ticket.ticket_number,
          user_name: auth.userName,
          category,
          subject: title,
          source_app: 'app',
        },
      });
    } catch (notifErr) {
      console.error('[error-reports] notification failed:', notifErr);
    }

    // Confirmations, both non-blocking and both already fail soft.
    if (auth.userEmail) {
      sendTemplateEmail(auth.userEmail, 'ticket-confirmation', {
        userName: auth.userName,
        ticketNumber: ticket.ticket_number,
        subject: title,
        category: CATEGORY_LABELS[category] || category,
        description: description || title,
      }).catch((err) => console.error('[error-reports] confirmation email failed:', err));
    }
    if (auth.userPhone && isWhatsAppConfigured()) {
      sendWhatsAppTicketConfirmation(auth.userPhone, {
        userName: auth.userName,
        ticketNumber: ticket.ticket_number,
        subject: title,
      }).catch((err) => console.error('[error-reports] confirmation WhatsApp failed:', err));
    }

    return NextResponse.json(
      { ticket_number: ticket.ticket_number, issue_id: ticket.id },
      { status: 201 },
    );
  } catch (error) {
    console.error('[error-reports] failed to create report:', error);
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
  }
}
