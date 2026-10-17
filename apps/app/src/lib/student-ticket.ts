/**
 * Server-side ticket helpers for the Tools App (student PWA, Firebase auth).
 *
 * Both ways a signed-in person raises a ticket go through createStudentTicket:
 *   POST /api/error-reports   the floating "Report a problem" button
 *   POST /api/support-tickets the "New request" button on /support
 * so the rate limit, the requester tag, the Admin bell and the confirmation
 * email are the same for both.
 *
 * Rules this file holds:
 *   - Anyone signed in may file, enrolled or not. The ticket says which:
 *     requester_segment 'enrolled' (an active nexus_enrollments student row) or
 *     'lead' (everyone else). That table is only ever READ here.
 *   - Tickets go to support_tickets (source_app 'app') and nowhere else. They
 *     must never reach nexus_foundation_issues, the Nexus teacher inbox: a lead
 *     once filed a counseling question that surfaced there as NXS-0110.
 *   - Five tickets per person per 24 hours. Past that, a friendly 429.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  createAdminNotification,
  createSupportTicket,
  countRecentTicketsByUser,
  sendTemplateEmail,
  isWhatsAppConfigured,
  sendWhatsAppTicketConfirmation,
} from '@neram/database';
import type { SupportTicket, SupportTicketCategory, SupportTicketRequesterSegment } from '@neram/database';
import { verifyIdToken } from '@/lib/firebase-admin';
import { isEnrolledStudent } from '@/lib/enrollment';

export interface SignedInRequester {
  userId: string;
  userName: string;
  userEmail: string | null;
  userPhone: string | null;
}

/**
 * The signed-in person behind a request, or the response to send instead
 * (401 without or with a bad token, 404 when the account has no users row).
 */
export async function requireSignedInRequester(
  req: NextRequest,
): Promise<SignedInRequester | NextResponse> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = await verifyIdToken(token);
    const dbUser = await getUserByFirebaseUid(decoded.uid, getSupabaseAdminClient());
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
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

export const VALID_TICKET_CATEGORIES: SupportTicketCategory[] = [
  'enrollment_issue',
  'payment_issue',
  'technical_issue',
  'account_issue',
  'course_question',
  'other',
];

export function parseTicketCategory(value: unknown, fallback: SupportTicketCategory): SupportTicketCategory {
  return VALID_TICKET_CATEGORIES.includes(value as SupportTicketCategory)
    ? (value as SupportTicketCategory)
    : fallback;
}

const CATEGORY_EMAIL_LABELS: Record<string, string> = {
  enrollment_issue: 'Enrollment Issue',
  payment_issue: 'Payment Issue',
  technical_issue: 'Technical Issue',
  account_issue: 'Account Issue',
  course_question: 'Course Question',
  other: 'Other',
};

export const TICKET_DAILY_LIMIT = 5;
export const TICKET_RATE_LIMIT_MESSAGE = 'You have sent a few reports today. We will reply on the ones we have.';

const SCREENSHOT_BUCKET = 'issue-screenshots';
const MAX_SCREENSHOTS = 5;
const MAX_LOG_ENTRIES = 50;
const MAX_DEVICE_INFO_CHARS = 20000;

/**
 * The uploader returns a storage path. The Admin support view renders
 * src={url} directly, so absolutise here or every screenshot is a broken image.
 */
export function toScreenshotUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return `${base}/storage/v1/object/public/${SCREENSHOT_BUCKET}/${pathOrUrl.replace(/^\/+/, '')}`;
}

/** Screenshot paths or URLs from a request body, capped and absolutised. */
export function normalizeScreenshots(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .slice(0, MAX_SCREENSHOTS)
    .map((v) => toScreenshotUrl(v.trim()));
}

/** Console entries from a request body: plain objects only, newest 50. */
export function normalizeConsoleLogs(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v))
    .slice(0, MAX_LOG_ENTRIES);
  return rows.length > 0 ? rows : undefined;
}

/** Device info from a request body: a plain object of sane size. */
export function normalizeDeviceInfo(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  try {
    if (JSON.stringify(value).length > MAX_DEVICE_INFO_CHARS) return undefined;
  } catch {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function cleanPageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim().slice(0, 500);
}

/** 'enrolled' for an active class student, otherwise 'lead'. A lookup error reads as lead. */
export async function requesterSegmentOf(
  userId: string,
  supabase: SupabaseClient,
): Promise<SupportTicketRequesterSegment> {
  return (await isEnrolledStudent(userId, supabase)) ? 'enrolled' : 'lead';
}

export interface StudentTicketInput {
  /** 'report' is the floating button, 'request' the /support form. Only shapes the Admin bell line. */
  kind: 'report' | 'request';
  category: SupportTicketCategory;
  subject: string;
  description: string;
  page_url?: unknown;
  screenshot_urls?: unknown;
  console_logs?: unknown;
  device_info?: unknown;
  enrollment_link_id?: string | null;
}

export type StudentTicketResult =
  | { ok: true; ticket: SupportTicket; segment: SupportTicketRequesterSegment }
  | { ok: false; status: 429; error: 'rate_limited'; message: string };

/**
 * Raise a ticket for a signed-in person: rate limit, tag, insert (which also
 * logs the 'created' activity row), Admin bell, confirmation email. Throws only
 * when the insert itself fails.
 */
export async function createStudentTicket(
  requester: SignedInRequester,
  input: StudentTicketInput,
  supabase: SupabaseClient,
): Promise<StudentTicketResult> {
  // Fails open: a broken count must not stop a real problem being reported.
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recent = await countRecentTicketsByUser(requester.userId, since, supabase);
    if (recent >= TICKET_DAILY_LIMIT) {
      return { ok: false, status: 429, error: 'rate_limited', message: TICKET_RATE_LIMIT_MESSAGE };
    }
  } catch (err) {
    console.error('[student-ticket] rate limit count failed:', err);
  }

  const segment = await requesterSegmentOf(requester.userId, supabase);
  const subject = input.subject.trim().slice(0, 200);
  // description is NOT nullable on support_tickets, so fall back to the subject.
  const description = input.description.trim().slice(0, 5000) || subject;
  const screenshots = normalizeScreenshots(input.screenshot_urls);

  const ticket = await createSupportTicket(
    {
      user_id: requester.userId,
      user_name: requester.userName,
      user_email: requester.userEmail || undefined,
      user_phone: requester.userPhone || undefined,
      category: input.category,
      subject,
      description,
      page_url: cleanPageUrl(input.page_url),
      source_app: 'app',
      enrollment_link_id: input.enrollment_link_id || undefined,
      screenshot_urls: screenshots,
      console_logs: normalizeConsoleLogs(input.console_logs),
      device_info: normalizeDeviceInfo(input.device_info),
      requester_segment: segment,
    },
    supabase,
  );

  // Same event every ticket source emits, so the Admin sidebar badge counts it.
  try {
    const who = segment === 'enrolled' ? 'student' : 'lead';
    await createAdminNotification({
      event_type: 'ticket_created',
      title: 'New Support Ticket',
      message:
        input.kind === 'report'
          ? `${requester.userName} (${who}, Tools App) reported: "${subject}"`
          : `${requester.userName} (${who}, Tools App) asked: "${subject}"`,
      metadata: {
        ticket_id: ticket.id,
        ticket_number: ticket.ticket_number,
        user_name: requester.userName,
        category: input.category,
        subject,
        source_app: 'app',
        requester_segment: segment,
      },
    });
  } catch (err) {
    console.error('[student-ticket] admin notification failed:', err);
  }

  // Confirmations, both non-blocking and both already fail soft.
  if (requester.userEmail) {
    sendTemplateEmail(requester.userEmail, 'ticket-confirmation', {
      userName: requester.userName,
      ticketNumber: ticket.ticket_number,
      subject,
      category: CATEGORY_EMAIL_LABELS[input.category] || input.category,
      description,
    }).catch((err: unknown) => console.error('[student-ticket] confirmation email failed:', err));
  }
  if (requester.userPhone && isWhatsAppConfigured()) {
    sendWhatsAppTicketConfirmation(requester.userPhone, {
      userName: requester.userName,
      ticketNumber: ticket.ticket_number,
      subject,
    }).catch((err: unknown) => console.error('[student-ticket] confirmation WhatsApp failed:', err));
  }

  return { ok: true, ticket, segment };
}

/** The response for a rate-limited create. */
export function rateLimitedResponse(result: { message: string }): NextResponse {
  return NextResponse.json({ error: 'rate_limited', message: result.message }, { status: 429 });
}
