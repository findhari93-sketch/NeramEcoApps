/**
 * Demo Class v2 scheduling rules.
 *
 * Pure functions shared by the marketing booking card (browser), the marketing
 * request API and the admin request desk. Every date here is India wall-clock
 * time: a student in Chennai picks "Tue 14 Oct, Evening", and that must mean
 * the same instant on a UTC server. Never format with the host's timezone.
 *
 * Client-safe: no Supabase, no Node APIs. Import through
 * `@neram/database/demo-schedule` from client components.
 */

export type DemoWindowId = 'morning' | 'afternoon' | 'evening';
export type DemoWindow = DemoWindowId | 'anytime';

export interface DemoWindowDef {
  id: DemoWindowId;
  label: string;
  /** IST wall clock, HH:mm */
  start: string;
  /** IST wall clock, HH:mm (exclusive) */
  end: string;
}

export interface DemoScheduleSettings {
  windows: DemoWindowDef[];
  /** How many days, starting today, the booking card offers. */
  daysAhead: number;
  /** 0 = Sunday ... 6 = Saturday. Days with no demos. */
  closedWeekdays: number[];
  durationMinutes: number;
  /** A window is offered only if it starts at least this far from now. */
  leadMinutes: number;
}

export const DEFAULT_DEMO_WINDOWS: DemoWindowDef[] = [
  { id: 'morning', label: 'Morning', start: '10:00', end: '12:00' },
  { id: 'afternoon', label: 'Afternoon', start: '14:00', end: '17:00' },
  { id: 'evening', label: 'Evening', start: '18:00', end: '20:30' },
];

export const DEFAULT_DEMO_SCHEDULE: DemoScheduleSettings = {
  windows: DEFAULT_DEMO_WINDOWS,
  daysAhead: 7,
  closedWeekdays: [],
  durationMinutes: 45,
  leadMinutes: 60,
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Merge whatever is stored in site_settings.demo_class over the defaults,
 * dropping anything malformed so a bad admin edit can never break booking.
 */
export function resolveDemoSchedule(raw: unknown): DemoScheduleSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const windows = Array.isArray(r.windows)
    ? (r.windows as unknown[])
        .map((w) => w as Partial<DemoWindowDef>)
        .filter(
          (w): w is DemoWindowDef =>
            !!w &&
            (w.id === 'morning' || w.id === 'afternoon' || w.id === 'evening') &&
            typeof w.start === 'string' &&
            typeof w.end === 'string' &&
            HHMM.test(w.start) &&
            HHMM.test(w.end) &&
            w.start < w.end,
        )
        .map((w) => ({ id: w.id, label: w.label?.trim() || labelFor(w.id), start: w.start, end: w.end }))
    : [];
  const int = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
  return {
    windows: windows.length ? windows : DEFAULT_DEMO_WINDOWS,
    daysAhead: int(r.daysAhead, 1, 21, DEFAULT_DEMO_SCHEDULE.daysAhead),
    closedWeekdays: Array.isArray(r.closedWeekdays)
      ? (r.closedWeekdays as unknown[]).filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)
      : [],
    durationMinutes: int(r.durationMinutes, 15, 180, DEFAULT_DEMO_SCHEDULE.durationMinutes),
    leadMinutes: int(r.leadMinutes, 0, 24 * 60, DEFAULT_DEMO_SCHEDULE.leadMinutes),
  };
}

function labelFor(id: DemoWindowId): string {
  return DEFAULT_DEMO_WINDOWS.find((w) => w.id === id)?.label ?? id;
}

/** YYYY-MM-DD of the IST calendar day containing `d`. */
export function istDateKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant at which IST wall clock reads `dateKey` `hhmm`. */
export function istDateTime(dateKey: string, hhmm: string): Date {
  const [y, m, day] = dateKey.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, day, h, min) - IST_OFFSET_MS);
}

/** IST weekday (0 = Sunday) of a YYYY-MM-DD key. */
function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

export interface DemoDayOption {
  /** YYYY-MM-DD (IST) */
  date: string;
  /** "Today", "Tomorrow" or "Sat" */
  label: string;
  /** "11 Oct" */
  sub: string;
  windows: DemoWindowId[];
}

/**
 * The days and windows the booking card offers. Today's windows disappear
 * once they start within `leadMinutes`; a day with nothing left is dropped.
 */
export function availableDemoDays(now: Date, settings: DemoScheduleSettings = DEFAULT_DEMO_SCHEDULE): DemoDayOption[] {
  const today = istDateKey(now);
  const days: DemoDayOption[] = [];
  for (let i = 0; i < settings.daysAhead; i++) {
    const date = addDays(today, i);
    if (settings.closedWeekdays.includes(weekdayOf(date))) continue;
    const windows = settings.windows
      .filter((w) => istDateTime(date, w.start).getTime() - now.getTime() >= settings.leadMinutes * 60_000)
      .map((w) => w.id);
    if (!windows.length) continue;
    days.push({
      date,
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : formatIst(istDateTime(date, '12:00'), { weekday: 'short' }),
      sub: formatIst(istDateTime(date, '12:00'), { day: 'numeric', month: 'short' }),
      windows,
    });
  }
  return days;
}

/** Is this (date, window) a choice the booking card would offer right now? */
export function isOfferedPreference(
  now: Date,
  date: string | null | undefined,
  window: DemoWindow,
  settings: DemoScheduleSettings = DEFAULT_DEMO_SCHEDULE,
): boolean {
  if (window === 'anytime') return !date;
  if (!date) return false;
  return availableDemoDays(now, settings).some((d) => d.date === date && d.windows.includes(window));
}

/** Where admin's Confirm form starts: the window's opening time. */
export function defaultStartFor(
  date: string | null | undefined,
  window: DemoWindow | null | undefined,
  settings: DemoScheduleSettings = DEFAULT_DEMO_SCHEDULE,
): Date | null {
  if (!date || !window || window === 'anytime') return null;
  const w = settings.windows.find((x) => x.id === window);
  return w ? istDateTime(date, w.start) : null;
}

/**
 * True when staff confirm a time the student did not ask for, which is when
 * the Confirm form requires a reason. "Any time" never counts as outside.
 */
export function isOutsidePreference(
  start: Date,
  pref: { date: string | null | undefined; window: DemoWindow | null | undefined },
  settings: DemoScheduleSettings = DEFAULT_DEMO_SCHEDULE,
): boolean {
  if (!pref.window || pref.window === 'anytime' || !pref.date) return false;
  if (istDateKey(start) !== pref.date) return true;
  const w = settings.windows.find((x) => x.id === pref.window);
  if (!w) return false;
  const t = start.getTime();
  return t < istDateTime(pref.date, w.start).getTime() || t >= istDateTime(pref.date, w.end).getTime();
}

export type DemoMessageKind =
  | 'received'
  | 'confirmed'
  | 'reminder_day'
  | 'reminder_soon'
  | 'rescheduled'
  | 'cancelled'
  | 'thanks'
  | 'missed'
  // Neram Assistant reminders to the demo team (channel 'assistant').
  | 'staff_new_request'
  | 'staff_callback'
  | 'staff_day'
  | 'staff_soon';

/**
 * WhatsApp sends for a confirmed (or rescheduled) demo. The day-of reminder
 * goes at 08:00 IST and is skipped when the demo was confirmed after that or
 * starts within the hour anyway; the "starting soon" one goes 30 minutes
 * before and is skipped when that moment has already passed.
 */
export function demoReminderPlan(
  start: Date,
  now: Date,
  firstKind: 'confirmed' | 'rescheduled' = 'confirmed',
): Array<{ kind: DemoMessageKind; sendAfter: Date }> {
  const plan: Array<{ kind: DemoMessageKind; sendAfter: Date }> = [{ kind: firstKind, sendAfter: now }];
  const morning = istDateTime(istDateKey(start), '08:00');
  if (morning.getTime() > now.getTime() && start.getTime() - morning.getTime() >= 60 * 60_000) {
    plan.push({ kind: 'reminder_day', sendAfter: morning });
  }
  const soon = new Date(start.getTime() - 30 * 60_000);
  if (soon.getTime() > now.getTime()) {
    plan.push({ kind: 'reminder_soon', sendAfter: soon });
  }
  return plan;
}

/**
 * Neram Assistant reminders for a confirmed demo: everyone on it gets the 8 AM
 * "today's demo" (skipped when it is already past, or the demo is within the
 * hour); the tutor alone gets "starts in 15 minutes".
 */
export function staffReminderPlan(
  start: Date,
  now: Date,
  staffUpns: string[],
  tutorUpn: string | null,
): Array<{ kind: DemoMessageKind; sendAfter: Date; upn: string }> {
  const plan: Array<{ kind: DemoMessageKind; sendAfter: Date; upn: string }> = [];
  const morning = istDateTime(istDateKey(start), '08:00');
  if (morning.getTime() > now.getTime() && start.getTime() - morning.getTime() >= 60 * 60_000) {
    for (const upn of staffUpns) plan.push({ kind: 'staff_day', sendAfter: morning, upn });
  }
  const soon = new Date(start.getTime() - 15 * 60_000);
  if (tutorUpn && soon.getTime() > now.getTime()) plan.push({ kind: 'staff_soon', sendAfter: soon, upn: tutorUpn });
  return plan;
}

/** When the thank-you goes after a demo marked attended: 30 minutes after it ends. */
export function thanksSendAfter(start: Date, minutes: number, now: Date): Date {
  const t = start.getTime() + (minutes + 30) * 60_000;
  return new Date(Math.max(t, now.getTime()));
}

// No 0/O, 1/I/L: a parent reads this code aloud on a call.
const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const TOKEN_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomIndexes(count: number, size: number): number[] {
  const bytes = new Uint32Array(count);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b % size);
}

/** "DEMO-4K7Q": short, readable, matched by staff against WhatsApp drawings. */
export function makeDemoRefCode(): string {
  return 'DEMO-' + randomIndexes(4, REF_ALPHABET.length).map((i) => REF_ALPHABET[i]).join('');
}

/** Unguessable token for the /d/{token} join link. */
export function makeDemoJoinToken(): string {
  return randomIndexes(24, TOKEN_ALPHABET.length).map((i) => TOKEN_ALPHABET[i]).join('');
}

export function isDemoRefCode(v: string): boolean {
  return /^DEMO-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/.test(v);
}

function formatIst(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...opts }).format(d);
}

/** "Tue, 14 Oct" */
export function formatDemoDate(d: Date): string {
  return formatIst(d, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "6:30 pm" rendered as "6:30 PM" */
export function formatDemoTime(d: Date): string {
  return formatIst(d, { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
}

/** "Tue, 14 Oct at 6:30 PM" */
export function formatDemoDateTime(d: Date): string {
  return `${formatDemoDate(d)} at ${formatDemoTime(d)}`;
}

function formatHhmm(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

/** "10 AM to 12 PM" */
export function formatWindowRange(w: DemoWindowDef): string {
  return `${formatHhmm(w.start)} to ${formatHhmm(w.end)}`;
}

/** "Tue, 14 Oct, Evening (6 PM to 8:30 PM)" or "Any time, call me" */
export function formatDemoPreference(
  date: string | null | undefined,
  window: DemoWindow | null | undefined,
  settings: DemoScheduleSettings = DEFAULT_DEMO_SCHEDULE,
): string {
  if (!window || window === 'anytime' || !date) return 'Any time, call me';
  const w = settings.windows.find((x) => x.id === window);
  const day = formatDemoDate(istDateTime(date, '12:00'));
  return w ? `${day}, ${w.label} (${formatWindowRange(w)})` : day;
}

export type DemoRequestStatus =
  | 'pending'
  | 'contacted'
  | 'approved'
  | 'attended'
  | 'no_show'
  | 'rejected'
  | 'cancelled';

export const DEMO_STATUS_LABELS: Record<DemoRequestStatus, string> = {
  pending: 'New request',
  contacted: 'Called',
  approved: 'Confirmed',
  attended: 'Attended',
  no_show: 'No-show',
  rejected: 'Not interested',
  cancelled: 'Cancelled',
};

export const ACTIVE_DEMO_STATUSES: DemoRequestStatus[] = ['pending', 'contacted', 'approved'];

/** The Join button opens this long before the start and stays for the demo. */
export function isJoinOpen(start: Date, minutes: number, now: Date): boolean {
  const t = now.getTime();
  return t >= start.getTime() - 15 * 60_000 && t <= start.getTime() + minutes * 60_000;
}

// ============================================
// Calendar links (Add to Google Calendar, .ics)
// ============================================

export interface DemoCalendarEvent {
  title: string;
  start: Date;
  minutes: number;
  details: string;
  /** Join link, used as the location and the ICS URL. */
  url: string;
  uid: string;
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Google Calendar "add event" link with exact UTC instants. */
export function googleCalendarUrl(e: DemoCalendarEvent): string {
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${utcStamp(e.start)}/${utcStamp(end)}`,
    details: `${e.details}\n\nJoin: ${e.url}`,
    location: e.url,
    ctz: 'Asia/Kolkata',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function icsText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsFold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  out.push(rest);
  return out.join('\r\n');
}

/**
 * A PUBLISH-method .ics (Apple Calendar, Outlook). PUBLISH, not REQUEST: the
 * real invite comes from the organizer's Exchange calendar, and a second
 * REQUEST would look like a separate meeting.
 */
export function demoIcs(e: DemoCalendarEvent, now: Date = new Date()): string {
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Neram Classes//Demo Class//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}@neramclasses.com`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(e.start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(`${e.details}\n\nJoin: ${e.url}`)}`,
    `LOCATION:${icsText(e.url)}`,
    `URL:${e.url}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Neram demo class starts in 30 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .map(icsFold)
    .join('\r\n');
}

// ============================================
// site_settings.demo_class
// ============================================

/** A member of the demo team (Settings > Demo team). */
export interface DemoHost {
  /** Microsoft UPN: their calendar can own the meeting, and they can be invited. */
  upn: string;
  /** Shown to students as the tutor: "with {name}". */
  name: string;
  /** Neram Assistant pings them when a new request comes in (the caller). */
  notifyNewRequests: boolean;
}

export interface DemoSettings {
  schedule: DemoScheduleSettings;
  /** The demo team. Every demo includes any of them, picked at Confirm. */
  hosts: DemoHost[];
  /** Who teaches unless changed at Confirm (one of `hosts`). */
  defaultTutorUpn: string | null;
  /** Digits with country code, for wa.me links: where students send drawings. */
  drawingWhatsApp: string;
  /** "within 2 working hours" */
  callbackPromise: string;
  youtubeUrl: string | null;
}

export const DEFAULT_DRAWING_WHATSAPP = '919176137043';

/** The whole demo_class settings value, with junk dropped and defaults filled. */
export function resolveDemoSettings(raw: unknown): DemoSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const hosts = Array.isArray(r.hosts)
    ? (r.hosts as unknown[])
        .map((h) => h as Partial<DemoHost>)
        .filter((h): h is DemoHost => !!h && typeof h.upn === 'string' && /^[^@\s]+@[^@\s]+$/.test(h.upn.trim()))
        .map((h) => ({
          upn: h.upn.trim().toLowerCase(),
          name: (typeof h.name === 'string' && h.name.trim()) || h.upn.split('@')[0],
          notifyNewRequests: h.notifyNewRequests !== false,
        }))
    : [];
  const tutor = typeof r.defaultTutorUpn === 'string' ? r.defaultTutorUpn.trim().toLowerCase() : '';
  const wa = typeof r.drawingWhatsApp === 'string' ? r.drawingWhatsApp.replace(/\D/g, '') : '';
  return {
    schedule: resolveDemoSchedule(r),
    hosts,
    defaultTutorUpn: hosts.find((h) => h.upn === tutor)?.upn ?? hosts[0]?.upn ?? null,
    drawingWhatsApp: /^\d{11,13}$/.test(wa) ? wa : DEFAULT_DRAWING_WHATSAPP,
    callbackPromise:
      typeof r.callbackPromise === 'string' && r.callbackPromise.trim() ? r.callbackPromise.trim() : 'within 2 working hours',
    youtubeUrl: typeof r.youtube_video_url === 'string' && r.youtube_video_url.trim() ? r.youtube_video_url.trim() : null,
  };
}

/** The settings a public page may see (no staff mailboxes). */
export function publicDemoSettings(s: DemoSettings): Omit<DemoSettings, 'hosts' | 'defaultTutorUpn'> {
  const { hosts: _hosts, defaultTutorUpn: _tutor, ...rest } = s;
  return rest;
}

/** The name students see for a demo's tutor, or null when unknown. */
export function demoTutorName(
  s: Pick<DemoSettings, 'hosts'>,
  r: { tutor_upn?: string | null; organizer_upn?: string | null },
): string | null {
  const upn = (r.tutor_upn || r.organizer_upn || '').toLowerCase();
  return upn ? s.hosts.find((h) => h.upn === upn)?.name ?? null : null;
}

/** wa.me link a student uses to send a drawing, tagged with their demo ref. */
export function drawingWhatsAppLink(number: string, ref: string | null): string {
  const text = ref
    ? `Hi Neram, here is my drawing for feedback. My demo ref is ${ref}.`
    : 'Hi Neram, here is my drawing for feedback.';
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
