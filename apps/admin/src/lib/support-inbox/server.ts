/**
 * Server-side helpers shared by the Admin support ticket routes and the
 * auto-close cron: the 401/404/409 answers, telling the requester about a move
 * (bell in the Tools App plus one email), and the requester card.
 *
 * Never import this from a client component: it pulls the service-role client.
 */
import { NextResponse } from 'next/server';
import {
  createUserNotification,
  listOtherTicketsByRequester,
  sendTicketUpdateEmail,
} from '@neram/database';
import type {
  NotificationEventType,
  SupportTicket,
  SupportTicketRequesterSegment,
  SupportTicketResolutionCode,
} from '@neram/database';
import { TICKET_OUTCOME_LABEL } from '@neram/database/support-ticket-status';

/** The same words for both kinds of 409: the screen reloads either way. */
export const TICKET_CHANGED_MESSAGE = 'This ticket changed. Refresh to see its latest state.';

/** A resolve or close note shorter than this is refused. */
export const MIN_NOTE_LENGTH = 10;
/** Longest message, note or reason accepted. */
export const MAX_MESSAGE_LENGTH = 5000;

export function unauthorized() {
  return NextResponse.json({ error: 'Sign in again to work on support tickets.' }, { status: 401 });
}

export function notFound() {
  return NextResponse.json({ error: 'Support ticket not found' }, { status: 404 });
}

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/** 409. `code` tells a test (or a curious caller) which kind it was. */
export function ticketChanged(code: 'not_allowed' | 'stale') {
  return NextResponse.json({ error: TICKET_CHANGED_MESSAGE, code }, { status: 409 });
}

export function cleanText(value: unknown, max = MAX_MESSAGE_LENGTH): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** The Tools App page for a ticket. Null for requesters with no account. */
export function ticketUrlFor(ticket: Pick<SupportTicket, 'id' | 'user_id'>): string | null {
  if (!ticket.user_id) return null;
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com').replace(/\/+$/, '');
  return `${base}/support/${ticket.id}`;
}

export type RequesterNews = 'started' | 'reply' | 'info_requested' | 'resolved' | 'closed' | 'auto_closed';

const BELL: Record<RequesterNews, { event: NotificationEventType; title: string; message: (n: string) => string }> = {
  started: {
    event: 'ticket_reply',
    title: 'We are on it',
    message: (n) => `Someone from Neram is now working on your ticket ${n}.`,
  },
  reply: {
    event: 'ticket_reply',
    title: 'New reply on your ticket',
    message: (n) => `We replied to your support ticket ${n}.`,
  },
  info_requested: {
    event: 'ticket_info_requested',
    title: 'We need a reply from you',
    message: (n) => `To keep working on ${n}, we need a little more from you.`,
  },
  resolved: {
    event: 'ticket_resolved',
    title: 'Is it fixed?',
    message: (n) => `We think ticket ${n} is fixed. Please check and confirm.`,
  },
  closed: {
    event: 'ticket_closed',
    title: 'Ticket closed',
    message: (n) => `Your support ticket ${n} is closed.`,
  },
  auto_closed: {
    event: 'ticket_closed',
    title: 'Ticket closed',
    message: (n) => `Your support ticket ${n} closed on its own because we did not hear back.`,
  },
};

/** started gets a bell only; every other move also sends one email. */
const EMAIL_KIND: Partial<Record<RequesterNews, 'reply' | 'info_requested' | 'resolved' | 'closed' | 'auto_closed'>> = {
  reply: 'reply',
  info_requested: 'info_requested',
  resolved: 'resolved',
  closed: 'closed',
  auto_closed: 'auto_closed',
};

export interface TellRequesterDeps {
  notify: typeof createUserNotification;
  email: typeof sendTicketUpdateEmail;
}

const DEFAULT_DEPS: TellRequesterDeps = { notify: createUserNotification, email: sendTicketUpdateEmail };

/**
 * Tell the requester their ticket moved: a bell entry in the Tools App (only
 * when the ticket belongs to an account) and one email (only when there is an
 * address). Never throws: a failed notice must not fail the move.
 *
 * Internal notes never come here.
 */
export async function tellRequester(
  ticket: SupportTicket,
  news: RequesterNews,
  opts: {
    message?: string | null;
    staffName?: string | null;
    outcome?: SupportTicketResolutionCode | null;
    supabase?: unknown;
  } = {},
  deps: TellRequesterDeps = DEFAULT_DEPS
): Promise<{ bell: boolean; email: boolean }> {
  const sent = { bell: false, email: false };
  const bell = BELL[news];

  if (ticket.user_id) {
    try {
      await deps.notify(
        {
          user_id: ticket.user_id,
          event_type: bell.event,
          title: bell.title,
          message: bell.message(ticket.ticket_number),
          metadata: {
            ticket_id: ticket.id,
            ticket_number: ticket.ticket_number,
            href: `/support/${ticket.id}`,
          },
        },
        opts.supabase
      );
      sent.bell = true;
    } catch (err) {
      console.error('[support-tickets] requester bell failed:', err);
    }
  }

  const kind = EMAIL_KIND[news];
  if (kind && ticket.user_email) {
    try {
      sent.email = await deps.email({
        kind,
        to: ticket.user_email,
        name: ticket.user_name,
        ticketNumber: ticket.ticket_number,
        subject: ticket.subject,
        message: opts.message ?? null,
        staffName: opts.staffName ?? null,
        outcomeLabel: opts.outcome ? TICKET_OUTCOME_LABEL[opts.outcome] ?? null : null,
        ticketUrl: ticketUrlFor(ticket),
      });
    } catch (err) {
      console.error('[support-tickets] requester email failed:', err);
    }
  }
  return sent;
}

export interface TicketRequesterSummary {
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  user_type: string | null;
  segment: SupportTicketRequesterSegment;
  enrolled: boolean;
  avatar_url: string | null;
  other_tickets: Pick<SupportTicket, 'id' | 'ticket_number' | 'subject' | 'status' | 'created_at'>[];
}

/** Who raised the ticket, for the requester card. Fails soft to what the ticket row knows. */
export async function getRequesterSummary(ticket: SupportTicket, supabase: any): Promise<TicketRequesterSummary> {
  type UserRow = { id: string; name: string | null; email: string | null; phone: string | null; user_type: string | null; avatar_url: string | null };
  let user = null as UserRow | null;
  let enrolled = false;

  if (ticket.user_id) {
    const [userRes, enrolRes] = await Promise.all([
      supabase.from('users').select('id, name, email, phone, user_type, avatar_url').eq('id', ticket.user_id).maybeSingle(),
      supabase
        .from('nexus_enrollments')
        .select('id')
        .eq('user_id', ticket.user_id)
        .eq('role', 'student')
        .eq('is_active', true)
        .limit(1),
    ]).catch(() => [{ data: null }, { data: null }]);
    user = (userRes?.data as UserRow | null) ?? null;
    enrolled = Array.isArray(enrolRes?.data) && enrolRes.data.length > 0;
  }

  const userType = user?.user_type ?? null;
  const segment: SupportTicketRequesterSegment =
    ticket.requester_segment ??
    (enrolled
      ? 'enrolled'
      : userType === 'admin' || userType === 'teacher'
        ? 'staff'
        : ticket.user_id
          ? 'lead'
          : 'guest');

  const other_tickets = await listOtherTicketsByRequester(ticket, supabase).catch(() => []);

  return {
    user_id: ticket.user_id,
    name: user?.name?.trim() || ticket.user_name,
    email: ticket.user_email || user?.email || null,
    phone: ticket.user_phone || user?.phone || null,
    user_type: userType,
    segment,
    enrolled: enrolled || segment === 'enrolled',
    avatar_url: user?.avatar_url ?? null,
    other_tickets,
  };
}

export const STAFF_TYPES = ['admin', 'teacher'] as const;

/** Is this users.id a staff member who may own a ticket? */
export async function isStaffUser(id: string, supabase: any): Promise<boolean> {
  const { data } = await supabase.from('users').select('id, user_type').eq('id', id).maybeSingle();
  return !!data && (STAFF_TYPES as readonly string[]).includes(data.user_type);
}
