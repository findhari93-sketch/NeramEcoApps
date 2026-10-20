/**
 * Aintra doing the booking for the visitor (2026-10-20). The model gathers the
 * day, time, student name and exam year in the conversation and calls one of
 * these tools; the tool checks every value against what is really open and
 * returns a [[book:...]] card filled in with it. The visitor checks the card
 * and taps Confirm, which posts to the same routes the site's own forms use.
 *
 * Nothing here writes. Pure functions over facts the caller loaded
 * (booking-tools.ts), so every rule is unit tested without a database.
 */
import {
  availableDemoDays,
  formatDemoPreference,
  isOfferedPreference,
  type DemoScheduleSettings,
  type DemoWindow,
} from '@neram/database/demo-schedule';
import { isPlausibleStatedExamYear } from '@neram/database/academic-year';
import {
  addDays,
  callbackDays,
  cleanDraftText,
  describeCallbackTime,
  formatBookMarker,
  istToday,
  type CallbackSlot,
} from '../booking';
import type { PrepareCallbackArgs, PrepareDemoBookingArgs, PrepareDemoCancelArgs, ToolResult } from './types';

export interface ActiveDemo {
  ref: string;
  status: string;
  preferredDate: string | null;
  preferredWindow: string | null;
}

export interface DemoFacts {
  schedule: DemoScheduleSettings;
  signedIn: boolean;
  phoneVerified: boolean;
  /** The account's own name, used when the model was not told one. */
  accountName: string | null;
  /** A stated or batch exam year already on file. */
  knownExamYear: number | null;
  existing: ActiveDemo | null;
}

const DEMO_STATUS: Record<string, string> = {
  pending: 'waiting for our call to fix the exact time',
  contacted: 'our team has called them',
  approved: 'confirmed, the Teams link is on WhatsApp',
};

/** "today", "tomorrow" or YYYY-MM-DD, as a date in India; anything else is null. */
export function resolveDay(value: unknown, now: Date): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'today') return istToday(now);
  if (v === 'tomorrow') return addDays(istToday(now), 1);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null;
}

/** morning, afternoon, evening or anytime ("any time" too); anything else is null. */
export function resolveDemoWindow(value: unknown): DemoWindow | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase().replace(/\s+/g, '');
  return v === 'morning' || v === 'afternoon' || v === 'evening' || v === 'anytime' ? v : null;
}

/** "Tomorrow 21 Oct (2026-10-21): Morning, Evening", for the model to offer. */
export function openDemoSlots(now: Date, schedule: DemoScheduleSettings): string[] {
  const label = (id: string) => schedule.windows.find((w) => w.id === id)?.label ?? id;
  return availableDemoDays(now, schedule)
    .slice(0, 5)
    .map((d) => `${d.label} ${d.sub} (${d.date}): ${d.windows.map(label).join(', ')}`);
}

function nextStep(f: Pick<DemoFacts, 'signedIn' | 'phoneVerified'>): string {
  if (!f.signedIn) return 'The visitor signs in on the card (Google or phone, a few seconds), then taps Confirm.';
  if (!f.phoneVerified) return 'The visitor verifies their phone on the card with a one-time code, then taps Confirm.';
  return 'The visitor taps Confirm on the card.';
}

export function planDemoBooking(args: PrepareDemoBookingArgs, f: DemoFacts, now: Date): ToolResult {
  const window = resolveDemoWindow(args?.window);
  const date = window === 'anytime' ? null : resolveDay(args?.date, now);
  const askedForTime = window !== null || date !== null;
  const offered = window !== null && isOfferedPreference(now, date, window, f.schedule);
  const dayOpen = date === null || availableDemoDays(now, f.schedule).some((d) => d.date === date);
  const timeText = window ? formatDemoPreference(date, window, f.schedule) : null;

  if (f.existing) {
    const booked = {
      ref: f.existing.ref,
      current_booking: formatDemoPreference(f.existing.preferredDate, f.existing.preferredWindow as DemoWindow, f.schedule),
      status: DEMO_STATUS[f.existing.status] ?? f.existing.status,
    };
    if (!askedForTime) {
      return {
        ok: true,
        data: { mode: 'already_booked', ...booked, note: 'They already have a demo. Never book a second one. The card shows it, with Change time.' },
        card: formatBookMarker({ kind: 'demo', date: null, window: null }),
      };
    }
    if (f.existing.status === 'approved') {
      return {
        ok: false,
        error: 'demo_already_confirmed',
        ...booked,
        note: 'A confirmed demo cannot be moved in the chat. They can cancel it (prepare_demo_cancel) and book again, or call +91 91761 37043.',
      };
    }
    if (!window || !offered) {
      return { ok: false, error: 'slot_not_open', ...booked, open_slots: openDemoSlots(now, f.schedule) };
    }
    return {
      ok: true,
      data: { mode: 'change_time', ...booked, new_time: timeText, next_step: 'The visitor taps Change on the card.' },
      card: formatBookMarker({ kind: 'demo', date, window, change: true }),
    };
  }

  if ((window && !offered) || !dayOpen) {
    return { ok: false, error: 'slot_not_open', open_slots: openDemoSlots(now, f.schedule) };
  }

  const typedName = cleanDraftText(args?.student_name, 100);
  const name = typedName && typedName.length >= 2 ? typedName : f.accountName ?? undefined;
  const statedYear = Number(args?.exam_year);
  const examYear = isPlausibleStatedExamYear(statedYear, now)
    ? statedYear
    : f.knownExamYear !== null && isPlausibleStatedExamYear(f.knownExamYear, now)
      ? f.knownExamYear
      : undefined;
  const parentJoining = typeof args?.parent_joining === 'boolean' ? args.parent_joining : undefined;

  const stillNeeded: string[] = [];
  if (!window) stillNeeded.push('day and time');
  if (!name) stillNeeded.push('student name');
  if (!examYear) stillNeeded.push('exam year');

  return {
    ok: true,
    data: {
      mode: 'new_booking',
      time: timeText,
      student_name: name ?? null,
      exam_year: examYear ?? null,
      parent_joining: parentJoining ?? null,
      card_still_asks_for: stillNeeded,
      next_step: nextStep(f),
      ...(window ? {} : { open_slots: openDemoSlots(now, f.schedule) }),
    },
    card: formatBookMarker({ kind: 'demo', date, window, draft: { name, examYear, parentJoining } }),
  };
}

export function planDemoCancel(args: PrepareDemoCancelArgs, f: Pick<DemoFacts, 'signedIn' | 'existing' | 'schedule'>): ToolResult {
  if (!f.signedIn) {
    return {
      ok: false,
      error: 'not_signed_in',
      note: 'A demo belongs to a signed-in account. They sign in with the same Google account or phone they booked with, or call +91 91761 37043.',
    };
  }
  if (!f.existing) return { ok: false, error: 'no_active_demo', note: 'They have no open demo class to cancel.' };
  const reason = cleanDraftText(args?.reason, 300);
  return {
    ok: true,
    data: {
      ref: f.existing.ref,
      booking: formatDemoPreference(f.existing.preferredDate, f.existing.preferredWindow as DemoWindow, f.schedule),
      next_step: 'The visitor taps "Yes, cancel" on the card. Nothing is cancelled until they do.',
    },
    card: formatBookMarker({ kind: 'cancel-demo', date: null, window: null, draft: reason ? { reason } : undefined }),
  };
}

const CALLBACK_SLOTS: CallbackSlot[] = ['morning', 'afternoon', 'evening'];

export function planCallback(args: PrepareCallbackArgs, signedIn: boolean, now: Date): ToolResult {
  const raw = typeof args?.slot === 'string' ? args.slot.trim().toLowerCase() : '';
  const slot = (CALLBACK_SLOTS as string[]).includes(raw) ? (raw as CallbackSlot) : null;
  const date = resolveDay(args?.date, now);
  const days = callbackDays(now);
  const open = days.map((d) => `${d.label} (${d.date}): ${d.slots.join(', ')}`);
  const day = date ? days.find((d) => d.date === date) : null;
  if (date && !day) return { ok: false, error: 'day_not_open', open_times: open };
  if (day && slot && !day.slots.includes(slot)) return { ok: false, error: 'slot_not_open', open_times: open };
  const topic = cleanDraftText(args?.topic, 300);
  return {
    ok: true,
    data: {
      time: date && slot ? describeCallbackTime(date, slot, now) : null,
      topic: topic ?? null,
      next_step: signedIn
        ? 'The visitor taps "Call me" on the card. It uses the number on their account.'
        : 'The visitor types their name and mobile number on the card (never in the chat), then taps "Call me".',
    },
    card: formatBookMarker({ kind: 'callback', date, window: slot, draft: topic ? { topic } : undefined }),
  };
}

/**
 * The plain card for a message that plainly asks to book, cancel or be called,
 * for when the backup model answered (it cannot call the tools) and left no
 * card to tap. Deliberately narrow: a question ABOUT demos gets no card.
 */
export function intentCard(message: string): string | null {
  const m = message.toLowerCase();
  if (/\bcancel\b/.test(m) && /\bdemo\b/.test(m)) return formatBookMarker({ kind: 'cancel-demo', date: null, window: null });
  if (/\bdemo\b/.test(m) && /\b(book|schedule|reserve|register|attend|fix|arrange)\b/.test(m)) {
    return formatBookMarker({ kind: 'demo', date: null, window: null });
  }
  if (/\b(call me|call back|callback|ring me|give me a call)\b/.test(m)) return formatBookMarker({ kind: 'callback', date: null, window: null });
  if (/\b(apply|application|admission form)\b/.test(m) && /\b(help|complete|fill|start|finish|submit|want)\b/.test(m)) {
    return formatBookMarker({ kind: 'apply', date: null, window: null });
  }
  return null;
}

export interface MyStatusFacts {
  signedIn: boolean;
  schedule: DemoScheduleSettings;
  demo: ActiveDemo | null;
  callback: { preferredDate: string | null; preferredSlot: string | null } | null;
  application: { status: string; applicationNumber: string | null } | null;
}

const APPLICATION_STATUS: Record<string, string> = {
  draft: 'started but not submitted yet; they can finish it at neramclasses.com/apply',
  pending_verification: 'submitted, waiting for their phone to be verified',
  submitted: 'submitted; our team is reviewing it',
  under_review: 'submitted; our team is reviewing it',
  approved: 'approved; the next step is paying the fee',
  partial_payment: 'enrolled, with part of the fee paid',
  enrolled: 'enrolled',
  rejected: 'not accepted; they can call +91 91761 37043 to talk about it',
};

export function describeMyStatus(f: MyStatusFacts): ToolResult {
  if (!f.signedIn) {
    return {
      ok: false,
      error: 'not_signed_in',
      note: 'Their bookings and application are shown only after they sign in (Google or phone).',
    };
  }
  return {
    ok: true,
    data: {
      demo_class: f.demo
        ? {
            ref: f.demo.ref,
            time: formatDemoPreference(f.demo.preferredDate, f.demo.preferredWindow as DemoWindow, f.schedule),
            status: DEMO_STATUS[f.demo.status] ?? f.demo.status,
          }
        : 'none',
      callback: f.callback ? { requested_for: [f.callback.preferredDate, f.callback.preferredSlot].filter(Boolean).join(' ') || 'any time' } : 'none',
      application: f.application
        ? { number: f.application.applicationNumber, status: APPLICATION_STATUS[f.application.status] ?? f.application.status }
        : 'not started; they can apply at neramclasses.com/apply',
    },
  };
}
