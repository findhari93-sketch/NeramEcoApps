/**
 * The site's short public forms, filled in by Aintra (2026-10-20): a centre
 * visit, an admission enquiry to a college, a message to our team. Each tool
 * checks what it can (the centre, the college, the date) and returns a card
 * with those values; the visitor adds their own contact details on the card
 * and taps the button, which posts to the form's usual route. Nothing here
 * writes.
 */
import { createAdminClient } from '@neram/database';
import { getActiveCenters } from '@neram/database/queries';
import { getCollegeBySlug } from '@/lib/college-hub/queries';
import { addDays, cleanDraftText, formatBookMarker, istToday } from '../booking';
import { resolveDay } from './booking-plan';
import type { PrepareCentreVisitArgs, PrepareCollegeEnquiryArgs, PrepareMessageArgs, PrepareTicketArgs, ToolContext, ToolResult } from './types';

/** The visit slots the centre pages offer when a centre lists none of its own. */
export const DEFAULT_VISIT_SLOTS = ['10:00 AM - 12:00 PM', '2:00 PM - 5:00 PM'];

export interface CentreRow {
  id: string;
  name: string;
  city: string;
  preferred_visit_times?: string[] | null;
}

let centresCache: { value: CentreRow[]; fetchedAt: number } | null = null;

async function activeCentres(): Promise<CentreRow[]> {
  if (centresCache && Date.now() - centresCache.fetchedAt < 5 * 60 * 1000) return centresCache.value;
  const value = ((await getActiveCenters(createAdminClient() as any)) as any[]).map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    preferred_visit_times: c.preferred_visit_times,
  }));
  centresCache = { value, fetchedAt: Date.now() };
  return value;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The one centre a name or place points at ("Tambaram", "chennai ashok nagar"), or every candidate. */
export function matchCentre(centres: CentreRow[], query: string): { centre: CentreRow | null; candidates: CentreRow[] } {
  const q = norm(query);
  if (!q) return { centre: null, candidates: centres };
  const words = q.split(' ');
  const scored = centres
    .map((c) => {
      const hay = norm(`${c.name} ${c.city}`);
      const hits = words.filter((w) => w.length > 2 && hay.includes(w)).length;
      return { c, hits };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  if (!scored.length) return { centre: null, candidates: centres };
  const top = scored.filter((s) => s.hits === scored[0].hits).map((s) => s.c);
  return top.length === 1 ? { centre: top[0], candidates: top } : { centre: null, candidates: top };
}

/** A slot from the centre's own list: the exact one, or the first in the morning / afternoon. */
export function pickVisitSlot(slots: string[], wanted: string | undefined): string | null {
  if (!wanted) return null;
  const w = wanted.trim().toLowerCase();
  const exact = slots.find((s) => s.toLowerCase() === w);
  if (exact) return exact;
  if (/morning|forenoon|\bam\b/.test(w)) return slots.find((s) => /^\s*\d{1,2}(:\d{2})?\s*am/i.test(s)) ?? null;
  if (/afternoon|evening|\bpm\b/.test(w)) return slots.find((s) => /^\s*\d{1,2}(:\d{2})?\s*pm/i.test(s)) ?? null;
  return null;
}

export function planCentreVisit(args: PrepareCentreVisitArgs, centres: CentreRow[], signedIn: boolean, now: Date): ToolResult {
  const list = centres.map((c) => `${c.name} (${c.city})`);
  const { centre, candidates } = matchCentre(centres, args?.centre ?? '');
  if (!centre) {
    return {
      ok: false,
      error: args?.centre ? 'centre_not_clear' : 'which_centre',
      centres: (candidates.length ? candidates : centres).map((c) => `${c.name} (${c.city})`),
      note: candidates.length > 1 && candidates.length < centres.length ? 'More than one centre matches; ask which.' : `Our centres: ${list.join(', ')}.`,
    };
  }
  const slots = centre.preferred_visit_times?.length ? centre.preferred_visit_times : DEFAULT_VISIT_SLOTS;
  const date = resolveDay(args?.date, now);
  const today = istToday(now);
  if (args?.date && (!date || date <= today || date > addDays(today, 30))) {
    return { ok: false, error: 'date_not_open', note: 'A visit can be booked from tomorrow, up to 30 days ahead.' };
  }
  const slot = pickVisitSlot(slots, args?.time);
  const purpose = cleanDraftText(args?.purpose, 300);
  return {
    ok: true,
    data: {
      centre: `${centre.name} (${centre.city})`,
      date,
      time: slot,
      visit_times: slots,
      next_step: signedIn
        ? 'The visitor checks the card and taps "Book my visit". Our team calls to confirm.'
        : 'The visitor types their name and mobile number on the card (never in the chat) and taps "Book my visit".',
    },
    card: formatBookMarker({
      kind: 'visit',
      date,
      window: null,
      draft: {
        fields: {
          centreId: centre.id,
          centreName: `${centre.name}, ${centre.city}`,
          ...(slot ? { slot } : {}),
          slots: slots.join('|'),
          ...(purpose ? { purpose } : {}),
        },
      },
    }),
  };
}

export async function prepareCentreVisitTool(args: PrepareCentreVisitArgs, ctx: ToolContext): Promise<ToolResult> {
  try {
    return planCentreVisit(args, await activeCentres(), !!ctx.userId, ctx.now ?? new Date());
  } catch (err) {
    console.error('[aintra/prepare-centre-visit]', err);
    return { ok: false, error: 'tool_error' };
  }
}

export async function prepareCollegeEnquiryTool(args: PrepareCollegeEnquiryArgs, ctx: ToolContext): Promise<ToolResult> {
  const slug = (args?.college_slug || '').trim();
  if (!slug) return { ok: false, error: 'which_college', note: 'Find the college first (search_colleges), then pass its slug.' };
  try {
    const college: any = await getCollegeBySlug(slug);
    if (!college || (college.status && college.status !== 'active')) return { ok: false, error: 'college_not_found', slug };
    const message = cleanDraftText(args?.message, 500);
    return {
      ok: true,
      data: {
        college: college.name,
        next_step: ctx.userId
          ? `The visitor ticks "I agree to share my details with ${college.name}" on the card and taps Send.`
          : `The visitor types their name and mobile number on the card, ticks the consent to share them with ${college.name}, and taps Send.`,
      },
      card: formatBookMarker({
        kind: 'college-enquiry',
        date: null,
        window: null,
        draft: { fields: { collegeId: college.id, collegeName: college.name, ...(message ? { message } : {}) } },
      }),
    };
  } catch (err) {
    console.error('[aintra/prepare-college-enquiry]', err);
    return { ok: false, error: 'tool_error' };
  }
}

export function planMessage(args: PrepareMessageArgs): ToolResult {
  const message = cleanDraftText(args?.message, 1000);
  if (!message || message.length < 10) {
    return { ok: false, error: 'message_too_short', note: 'Ask what they want to tell our team, in a sentence or two.' };
  }
  const subject = cleanDraftText(args?.subject, 120) ?? 'Message from the Aintra chat';
  return {
    ok: true,
    data: { subject, next_step: 'The visitor adds their name and email on the card and taps Send. Our team replies by email.' },
    card: formatBookMarker({ kind: 'message', date: null, window: null, draft: { fields: { subject, message } } }),
  };
}

export async function prepareMessageTool(args: PrepareMessageArgs): Promise<ToolResult> {
  return planMessage(args);
}

/** The support ticket categories (SupportTicketCategory in @neram/database). */
export const TICKET_CATEGORIES = ['enrollment_issue', 'payment_issue', 'technical_issue', 'account_issue', 'course_question', 'other'] as const;

/** A problem that needs our team and should be tracked: a ticket with a number they can follow at /support/track. */
export function planTicket(args: PrepareTicketArgs): ToolResult {
  // 1000: what a card field carries (parseBookArgs caps it there).
  const description = cleanDraftText(args?.description, 1000);
  if (!description || description.length < 10) {
    return { ok: false, error: 'describe_the_problem', note: 'Ask what went wrong, in a sentence or two.' };
  }
  const category = (TICKET_CATEGORIES as readonly string[]).includes(String(args?.category)) ? String(args?.category) : 'other';
  const subject = cleanDraftText(args?.subject, 120) ?? description.slice(0, 80);
  return {
    ok: true,
    data: {
      subject,
      category,
      next_step: 'The visitor adds their name and number (and email if they like) on the card and taps "Raise ticket". They get a ticket number to track it.',
    },
    card: formatBookMarker({ kind: 'ticket', date: null, window: null, draft: { fields: { category, subject, message: description } } }),
  };
}

export async function prepareTicketTool(args: PrepareTicketArgs): Promise<ToolResult> {
  return planTicket(args);
}

export async function prepareSaveCollegeTool(args: { college_slug?: string }): Promise<ToolResult> {
  const slug = (args?.college_slug || '').trim();
  if (!slug) return { ok: false, error: 'which_college', note: 'Find the college first (search_colleges), then pass its slug.' };
  try {
    const college: any = await getCollegeBySlug(slug);
    if (!college || (college.status && college.status !== 'active')) return { ok: false, error: 'college_not_found', slug };
    return {
      ok: true,
      data: { college: college.name, next_step: 'The visitor taps "Save to my list" on the card. Their list is at neramclasses.com/colleges/saved.' },
      card: formatBookMarker({
        kind: 'save-college',
        date: null,
        window: null,
        draft: { fields: { collegeId: college.id, collegeName: college.name, slug: college.slug } },
      }),
    };
  } catch (err) {
    console.error('[aintra/prepare-save-college]', err);
    return { ok: false, error: 'tool_error' };
  }
}
