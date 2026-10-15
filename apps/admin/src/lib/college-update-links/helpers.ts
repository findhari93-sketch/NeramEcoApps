/**
 * College update links: pure helpers shared by the API route and the Admin page.
 * Client safe (no node imports). Tokens live in ./tokens.ts.
 *
 * Staff make a no-login link for one college and send it by hand on WhatsApp.
 * The college person opens <marketing>/college-update/<token>, and each changed
 * section becomes a pending college_content_submissions row (source 'link').
 */

export const UPDATE_LINK_SECTIONS = ['profile', 'fees', 'admissions', 'facilities', 'location', 'photos'] as const;
export type UpdateLinkSection = (typeof UPDATE_LINK_SECTIONS)[number];

export const UPDATE_LINK_SECTION_LABEL: Record<UpdateLinkSection, string> = {
  profile: 'About and contacts',
  fees: 'Fees',
  admissions: 'Admissions',
  facilities: 'Campus and facilities',
  location: 'Location and map',
  photos: 'Photos',
};

/** Ticked by default: everything except facilities (the longest form). */
export const DEFAULT_UPDATE_LINK_SECTIONS: UpdateLinkSection[] = ['profile', 'fees', 'admissions', 'location', 'photos'];

export const UPDATE_LINK_DAYS = [7, 14, 30] as const;
export type UpdateLinkDays = (typeof UPDATE_LINK_DAYS)[number];
export const DEFAULT_UPDATE_LINK_DAYS: UpdateLinkDays = 14;
export const EXTEND_DAYS = 14;

/** How each section reads inside the WhatsApp message, in the order it is listed. */
const SECTION_WORDS: [UpdateLinkSection, string][] = [
  ['fees', 'fees'],
  ['admissions', 'admission dates'],
  ['profile', 'contacts'],
  ['facilities', 'facilities'],
  ['location', 'map location'],
  ['photos', 'photos'],
];

export function isUpdateLinkSection(v: unknown): v is UpdateLinkSection {
  return typeof v === 'string' && (UPDATE_LINK_SECTIONS as readonly string[]).includes(v);
}

/** Known sections only, deduplicated, in canonical order. */
export function cleanSections(input: unknown): UpdateLinkSection[] {
  if (!Array.isArray(input)) return [];
  const set = new Set(input.filter(isUpdateLinkSection));
  return UPDATE_LINK_SECTIONS.filter((s) => set.has(s));
}

/** "fees, admission dates, contacts and photos" */
export function sectionsInWords(sections: readonly string[]): string {
  const words = SECTION_WORDS.filter(([key]) => sections.includes(key)).map(([, w]) => w);
  if (words.length === 0) return 'all sections';
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * An Indian mobile number as '91XXXXXXXXXX' (the form wa.me wants), or null.
 * Accepts +91, 0091 or 0 prefixes, spaces, dashes and brackets. The 10 digit
 * number must start with 6, 7, 8 or 9.
 */
export function normaliseIndianMobile(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/\D/g, '');
  if (digits.length === 14 && digits.startsWith('0091')) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `91${digits}`;
}

/** '919876543210' -> '+91 98765 43210' for display. */
export function formatIndianMobile(phone91: string | null | undefined): string {
  if (!phone91) return '';
  const m = /^91(\d{5})(\d{5})$/.exec(phone91);
  return m ? `+91 ${m[1]} ${m[2]}` : phone91;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * "15 Oct 2026", in India time. Built by hand because en-GB and en-IN month
 * names change between ICU versions ("Sep" vs "Sept").
 */
export function formatLinkDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

export interface MessageInput {
  recipientName?: string | null;
  collegeName: string;
  url: string;
  expiresAt: string | Date;
  sections: readonly string[];
}

/**
 * The message staff paste into WhatsApp. Says who it is from and why first.
 * A space sits before the full stop after the URL so WhatsApp does not take the
 * dot into the link. No em dashes: this is user-visible copy.
 */
export function buildMessage({ recipientName, collegeName, url, expiresAt, sections }: MessageInput): string {
  const name = (recipientName || '').trim();
  const greeting = name ? `Hello ${name},` : 'Hello,';
  const college = collegeName.trim() || 'your college';
  return (
    `${greeting} this is Neram Classes. Please check ${college}'s details on our website (${sectionsInWords(sections)}) ` +
    `and correct anything that is out of date. It takes about 5 minutes and needs no login: ${url} . ` +
    `Our team reviews every change before it goes live. The link works until ${formatLinkDate(expiresAt)}.`
  );
}

export function whatsappUrl(phone91: string | null | undefined, message: string): string {
  const text = encodeURIComponent(message);
  return phone91 ? `https://wa.me/${phone91}?text=${text}` : `https://wa.me/?text=${text}`;
}

export type LinkStatus = 'cancelled' | 'expired' | 'submitted' | 'opened' | 'not_opened';

export interface LinkStatusInput {
  revoked_at: string | null;
  expires_at: string;
  submitted_at: string | null;
  first_opened_at: string | null;
  open_count?: number | null;
}

/**
 * Cancelled wins, then Submitted (the link did its job, even if it has since
 * run out), then Expired, then Opened or Not opened.
 */
export function linkStatus(link: LinkStatusInput, now: Date = new Date()): LinkStatus {
  if (link.revoked_at) return 'cancelled';
  if (link.submitted_at) return 'submitted';
  if (new Date(link.expires_at).getTime() <= now.getTime()) return 'expired';
  if (link.first_opened_at || (link.open_count ?? 0) > 0) return 'opened';
  return 'not_opened';
}

export const LINK_STATUS_LABEL: Record<LinkStatus, string> = {
  cancelled: 'Cancelled',
  expired: 'Expired',
  submitted: 'Submitted',
  opened: 'Opened',
  not_opened: 'Not opened',
};

/** New expiry for "Extend": 14 days on from today or from the current expiry, whichever is later. */
export function extendedExpiry(expiresAt: string, now: Date = new Date(), days: number = EXTEND_DAYS): string {
  const base = Math.max(now.getTime(), new Date(expiresAt).getTime() || 0);
  return new Date(base + days * 86_400_000).toISOString();
}

export interface CreateLinkInput {
  college_id: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  sections: UpdateLinkSection[];
  expires_in_days: UpdateLinkDays;
  note: string | null;
  replace_link_id: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

/** Checks a POST body. Phone is optional but, when given, must be a valid Indian mobile. */
export function validateCreateLink(
  body: Record<string, unknown> | null,
): { ok: true; value: CreateLinkInput } | { ok: false; error: string } {
  if (!body) return { ok: false, error: 'Send a JSON body.' };
  const collegeId = typeof body.college_id === 'string' ? body.college_id.trim() : '';
  if (!UUID_RE.test(collegeId)) return { ok: false, error: 'Choose a college.' };

  const rawPhone = text(body.recipient_phone, 40);
  const phone = rawPhone ? normaliseIndianMobile(rawPhone) : null;
  if (rawPhone && !phone) return { ok: false, error: 'Enter a 10 digit Indian mobile number, or leave it empty.' };

  let sections: UpdateLinkSection[] = DEFAULT_UPDATE_LINK_SECTIONS;
  if (body.sections !== undefined) {
    if (!Array.isArray(body.sections) || body.sections.some((s) => !isUpdateLinkSection(s))) {
      return { ok: false, error: 'Unknown section in the list.' };
    }
    sections = cleanSections(body.sections);
    if (sections.length === 0) return { ok: false, error: 'Pick at least one section.' };
  }

  let days: UpdateLinkDays = DEFAULT_UPDATE_LINK_DAYS;
  if (body.expires_in_days !== undefined && body.expires_in_days !== null) {
    const n = Number(body.expires_in_days);
    if (!(UPDATE_LINK_DAYS as readonly number[]).includes(n)) return { ok: false, error: 'The link can work for 7, 14 or 30 days.' };
    days = n as UpdateLinkDays;
  }

  const replace = typeof body.replace_link_id === 'string' ? body.replace_link_id.trim() : '';
  if (replace && !UUID_RE.test(replace)) return { ok: false, error: 'Unknown link to replace.' };

  return {
    ok: true,
    value: {
      college_id: collegeId,
      recipient_name: text(body.recipient_name, 120),
      recipient_phone: phone,
      sections,
      expires_in_days: days,
      note: text(body.note, 1000),
      replace_link_id: replace || null,
    },
  };
}

/**
 * A tel: link and a display form for whatever phone a college person typed.
 * Indian mobiles become +91 numbers; anything else is dialled as typed.
 */
export function phoneForCall(input: string | null | undefined): { href: string; display: string } | null {
  if (!input || !input.trim()) return null;
  const mobile = normaliseIndianMobile(input);
  if (mobile) return { href: `tel:+${mobile}`, display: formatIndianMobile(mobile) };
  const dial = input.replace(/[^\d+]/g, '');
  if (!dial) return null;
  return { href: `tel:${dial}`, display: input.trim() };
}
