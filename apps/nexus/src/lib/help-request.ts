/**
 * The server side of /help: a request for help from someone who may not be able
 * to sign in to Nexus at all.
 *
 * Public by design, so it carries its own abuse controls: a honeypot field, strict
 * lengths, screenshots accepted only as paths inside our own upload folder, and a
 * per-IP ceiling counted in the database (serverless functions share no memory,
 * the same reasoning as /api/auth/parent/login).
 *
 * The request is saved in support_tickets (user_id may be null, and the Admin
 * Support tickets page already lists them), then posted to the staff Help Desk
 * chat in Teams. Saving is the part that must not fail; the Teams post and the
 * in-app notification are best effort.
 *
 * Everything the route needs is injected, so this is unit tested without Next,
 * Supabase or Teams (help-request.test.ts).
 */

import { createHmac } from 'crypto';
import { scrubSecrets } from '@/lib/issue-report-bundle';
import { helpProblemLabel, isHelpProblem, normalizePhone, type HelpProblem } from '@/lib/support-contact';
import type { HelpDeskCardInput, HelpDeskPost } from '@/lib/help-desk-teams';

export const HELP_BUCKET = 'support-ticket-attachments';
export const HELP_UPLOAD_PREFIX = 'nexus-help';

/** Requests allowed from one network inside the window before a 429. */
export const HELP_REQUEST_LIMIT = 5;
export const HELP_WINDOW_MINUTES = 60;

/** Uploads allowed from one network inside the same window. */
export const HELP_UPLOAD_LIMIT = 10;

const MAX_NAME = 80;
const MAX_DETAILS = 2000;
const MAX_EMAIL = 200;
const MAX_PAGE = 500;
const MAX_DEVICE_JSON = 4000;
const MAX_LOG_ENTRIES = 20;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UPLOAD_PATH = new RegExp(`^${HELP_UPLOAD_PREFIX}/[A-Za-z0-9_-]{8,64}/[A-Za-z0-9_.-]{1,80}$`);

/**
 * A network's key for the rate limit. Keyed with a server secret, because this
 * value also names the upload folder, which is publicly readable: a plain SHA of
 * an IPv4 address can be reversed by trying all four billion of them.
 */
export function requesterKey(ip: string | null, secret: string | undefined): string | null {
  if (!ip) return null;
  return createHmac('sha256', secret || 'nexus-help').update(ip).digest('base64url').slice(0, 32);
}

export function clientIp(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || headers.get('x-real-ip') || null;
}

export interface HelpRequestInput {
  name: string;
  phone: string;
  email: string | null;
  problem: HelpProblem;
  details: string | null;
  screenshotPath: string | null;
  pageUrl: string | null;
  device: string | null;
  appVersion: string | null;
  online: boolean | null;
  deviceInfo: Record<string, unknown> | null;
  consoleLogs: unknown[] | null;
}

export type Parsed =
  | { kind: 'ok'; value: HelpRequestInput }
  | { kind: 'bot' }
  | { kind: 'invalid'; field: string; error: string };

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Validate a request body. Messages are written for the student, not a developer. */
export function parseHelpRequest(body: unknown): Parsed {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  // A field a person never sees. Anything that fills it in is a script.
  if (typeof b.website === 'string' && b.website.trim()) return { kind: 'bot' };

  const name = text(b.name, MAX_NAME);
  if (!name || name.length < 2) return { kind: 'invalid', field: 'name', error: 'Please enter your name.' };

  const phone = normalizePhone(b.phone);
  if (!phone) return { kind: 'invalid', field: 'phone', error: 'Please enter a 10 digit mobile number we can call.' };

  const email = text(b.email, MAX_EMAIL);
  if (email && !EMAIL.test(email)) return { kind: 'invalid', field: 'email', error: 'That email address does not look right.' };

  if (!isHelpProblem(b.problem)) return { kind: 'invalid', field: 'problem', error: 'Please choose what is wrong.' };

  const screenshotPath = text(b.screenshotPath, 200);
  if (screenshotPath && !UPLOAD_PATH.test(screenshotPath)) {
    return { kind: 'invalid', field: 'screenshot', error: 'The screenshot did not upload. Please add it again.' };
  }

  const pageUrl = text(b.pageUrl, MAX_PAGE);

  let deviceInfo: Record<string, unknown> | null = null;
  if (b.deviceInfo && typeof b.deviceInfo === 'object' && !Array.isArray(b.deviceInfo)) {
    const json = JSON.stringify(b.deviceInfo);
    if (json.length <= MAX_DEVICE_JSON) deviceInfo = b.deviceInfo as Record<string, unknown>;
  }

  let consoleLogs: unknown[] | null = null;
  if (Array.isArray(b.consoleLogs) && b.consoleLogs.length) {
    try {
      consoleLogs = JSON.parse(scrubSecrets(JSON.stringify(b.consoleLogs.slice(0, MAX_LOG_ENTRIES))));
    } catch {
      consoleLogs = null;
    }
  }

  return {
    kind: 'ok',
    value: {
      name,
      phone,
      email,
      problem: b.problem,
      details: text(b.details, MAX_DETAILS),
      screenshotPath,
      pageUrl: pageUrl && pageUrl.startsWith('/') ? pageUrl : null,
      device: text(b.device, 200),
      appVersion: text(b.appVersion, 40),
      online: typeof b.online === 'boolean' ? b.online : null,
      deviceInfo,
      consoleLogs,
    },
  };
}

/** The phone number the way users.phone may hold it: bare, with 91, or with +91. */
export function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    const local = digits.slice(2);
    return [local, `91${local}`, `+91${local}`];
  }
  return [phone, digits];
}

export interface MatchedUser {
  id: string;
  name: string | null;
  email: string | null;
}

export interface HelpRequestDeps {
  supabase: any;
  /** The signed-in account behind an optional Authorization header, or null. */
  signedInUser: () => Promise<MatchedUser | null>;
  postCard: (input: HelpDeskCardInput) => Promise<HelpDeskPost>;
  notifyAdmins: (ticket: { id: string; ticket_number: string; name: string; subject: string; category: string }) => Promise<void>;
  /** Link to the ticket in Admin. */
  ticketUrl: (ticketId: string) => string;
  publicUrl: (path: string) => string;
  now: () => Date;
}

export type HelpResult =
  | { status: 200; body: { ok: true; ticketNumber: string | null; teams: HelpDeskPost | 'skipped' } }
  | { status: 400; body: { ok: false; field: string; error: string } }
  | { status: 429; body: { ok: false; error: string; retryAfter: number } }
  | { status: 500; body: { ok: false; error: string } };

/** How many requests this network sent inside the window. */
async function recentFrom(supabase: any, key: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - HELP_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('requester_ip_hash', key)
    .gte('created_at', since);
  return count ?? 0;
}

async function matchByPhoneOrEmail(supabase: any, input: HelpRequestInput): Promise<MatchedUser | null> {
  try {
    const { data: byPhone } = await supabase
      .from('users')
      .select('id, name, email')
      .in('phone', phoneVariants(input.phone))
      .limit(1);
    if (byPhone?.[0]) return byPhone[0];

    if (input.email) {
      // ILIKE, not eq: a Microsoft UPN arrives in whatever case the student typed.
      const escaped = input.email.replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data: byEmail } = await supabase.from('users').select('id, name, email').ilike('email', escaped).limit(1);
      if (byEmail?.[0]) return byEmail[0];
    }
  } catch {
    // A match is a courtesy for staff. Never let it stop a request.
  }
  return null;
}

export const TOO_MANY = `You have sent a few requests already. We have them and will contact you soon. If it is urgent, please WhatsApp or call us.`;

export async function handleHelpRequest(body: unknown, key: string | null, deps: HelpRequestDeps): Promise<HelpResult> {
  const parsed = parseHelpRequest(body);
  // Answer a bot exactly as a person would be answered, so it learns nothing.
  if (parsed.kind === 'bot') return { status: 200, body: { ok: true, ticketNumber: null, teams: 'skipped' } };
  if (parsed.kind === 'invalid') return { status: 400, body: { ok: false, field: parsed.field, error: parsed.error } };
  const input = parsed.value;
  const now = deps.now();

  if (key && (await recentFrom(deps.supabase, key, now)) >= HELP_REQUEST_LIMIT) {
    return { status: 429, body: { ok: false, error: TOO_MANY, retryAfter: HELP_WINDOW_MINUTES * 60 } };
  }

  let signedIn: MatchedUser | null = null;
  try {
    signedIn = await deps.signedInUser();
  } catch {
    signedIn = null;
  }
  const matched = signedIn ?? (await matchByPhoneOrEmail(deps.supabase, input));

  const problemLabel = helpProblemLabel(input.problem);
  const subject = `Nexus: ${problemLabel}`;
  const category = input.problem === 'cant_sign_in' ? 'account' : 'technical';
  const screenshotUrl = input.screenshotPath ? deps.publicUrl(input.screenshotPath) : null;

  const { data: ticket, error } = await deps.supabase
    .from('support_tickets')
    .insert({
      user_id: signedIn?.id ?? null,
      user_name: input.name,
      user_email: input.email ?? signedIn?.email ?? null,
      user_phone: input.phone,
      category,
      subject,
      description: input.details || problemLabel,
      page_url: input.pageUrl,
      source_app: 'nexus',
      screenshot_urls: screenshotUrl ? [screenshotUrl] : null,
      device_info: { ...(input.deviceInfo ?? {}), summary: input.device, app_version: input.appVersion, online: input.online },
      console_logs: input.consoleLogs,
      requester_ip_hash: key,
    })
    .select('id, ticket_number')
    .single();

  if (error || !ticket) {
    console.error(`[help] could not save a request: ${error?.code || error?.message || 'no row'}`);
    return { status: 500, body: { ok: false, error: 'We could not send that. Please WhatsApp or call us instead.' } };
  }

  const matchedAccount = matched
    ? `${signedIn ? 'Signed in as' : 'Matches'} ${matched.name || 'a Nexus user'}${matched.email ? ` (${matched.email})` : ''}`
    : null;

  const [teams] = await Promise.all([
    deps
      .postCard({
        ticketNumber: ticket.ticket_number,
        problemLabel,
        name: input.name,
        phone: input.phone,
        email: input.email,
        details: input.details,
        matchedAccount,
        device: input.device,
        appVersion: input.appVersion,
        pageUrl: input.pageUrl,
        online: input.online,
        screenshotUrl,
        ticketUrl: deps.ticketUrl(ticket.id),
      })
      .catch(() => 'failed' as const),
    deps
      .notifyAdmins({ id: ticket.id, ticket_number: ticket.ticket_number, name: input.name, subject, category })
      .catch(() => undefined),
  ]);

  return { status: 200, body: { ok: true, ticketNumber: ticket.ticket_number, teams } };
}
