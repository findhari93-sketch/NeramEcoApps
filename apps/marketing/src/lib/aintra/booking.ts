/**
 * Booking inside the Aintra chat (2026-10-19): a callback or a demo class,
 * confirmed by the visitor on a card that Aintra places in its answer with
 * [[book:callback]] or [[book:demo]].
 *
 * The model only suggests. The card checks every value against what is really
 * offered, and the visitor taps Confirm, which posts to the same routes the
 * site's own forms use (/api/callback, /api/demo-class/request). Phone numbers
 * are typed into the card, never into the chat, so they are not sent to the AI.
 */

export type BookKind = 'callback' | 'demo';
export type CallbackSlot = 'morning' | 'afternoon' | 'evening';
export type BookWindow = CallbackSlot | 'anytime';

export interface BookSuggestion {
  kind: BookKind;
  /** YYYY-MM-DD, already resolved from "today" / "tomorrow". Only a suggestion. */
  date: string | null;
  window: BookWindow | null;
}

const IST_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;
const WINDOWS: BookWindow[] = ['morning', 'afternoon', 'evening', 'anytime'];

/** Today's date in India, YYYY-MM-DD. */
export function istToday(now = new Date()): string {
  return new Date(now.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD plus n days (calendar arithmetic, no time zone involved). */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * "[[book:demo,2026-10-21,evening]]" -> the arg "demo,2026-10-21,evening".
 * Order does not matter after the kind; unknown parts are ignored.
 */
export function parseBookArgs(arg: string, now = new Date()): BookSuggestion | null {
  const parts = arg
    .split(/[,|]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const kind = parts.shift();
  if (kind !== 'callback' && kind !== 'demo') return null;
  let date: string | null = null;
  let window: BookWindow | null = null;
  for (const p of parts) {
    if ((WINDOWS as string[]).includes(p)) window = p as BookWindow;
    else if (p === 'today') date = istToday(now);
    else if (p === 'tomorrow') date = addDays(istToday(now), 1);
    else if (/^\d{4}-\d{2}-\d{2}$/.test(p) && !Number.isNaN(Date.parse(`${p}T00:00:00Z`))) date = p;
  }
  // A callback has no "anytime" choice: any time of day is no preference.
  if (kind === 'callback' && window === 'anytime') window = null;
  return { kind, date, window };
}

/** "YYYY-MM-DD" from today (India time) up to 14 days ahead, else null. */
export function cleanPreferredDate(value: unknown, now = new Date()): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const today = istToday(now);
  return value >= today && value <= addDays(today, 14) ? value : null;
}

/** When each callback slot ends, in India time (hour). After that, today is no longer offered for it. */
const SLOT_END_HOUR: Record<CallbackSlot, number> = { morning: 12, afternoon: 17, evening: 20 };

export const CALLBACK_SLOT_LABELS: Record<CallbackSlot, { label: string; range: string }> = {
  morning: { label: 'Morning', range: '10 am to 12 pm' },
  afternoon: { label: 'Afternoon', range: '2 pm to 5 pm' },
  evening: { label: 'Evening', range: '6 pm to 8 pm' },
};

export interface CallbackDay {
  date: string;
  /** "Today", "Tomorrow", "Wed 22 Oct". */
  label: string;
  slots: CallbackSlot[];
}

/** The next four days a callback can be asked for, each with the slots still open. */
export function callbackDays(now = new Date()): CallbackDay[] {
  const today = istToday(now);
  const istHour = new Date(now.getTime() + IST_MS).getUTCHours();
  const all: CallbackSlot[] = ['morning', 'afternoon', 'evening'];
  const days: CallbackDay[] = [];
  for (let i = 0; days.length < 4 && i < 6; i++) {
    const date = addDays(today, i);
    const slots = i === 0 ? all.filter((s) => istHour < SLOT_END_HOUR[s] - 1) : all;
    if (!slots.length) continue;
    days.push({ date, label: dayLabel(date, today), slots });
  }
  return days;
}

/** The card's starting choice: the suggestion when it is really offered, else the first open slot. */
export function pickCallbackDefault(days: CallbackDay[], suggestion: Pick<BookSuggestion, 'date' | 'window'>): { date: string; slot: CallbackSlot } | null {
  if (!days.length) return null;
  const day = days.find((d) => d.date === suggestion.date) ?? null;
  const slot = suggestion.window && suggestion.window !== 'anytime' ? suggestion.window : null;
  if (day && slot && day.slots.includes(slot)) return { date: day.date, slot };
  if (day) return { date: day.date, slot: day.slots[0] };
  if (slot) {
    const withSlot = days.find((d) => d.slots.includes(slot));
    if (withSlot) return { date: withSlot.date, slot };
  }
  return { date: days[0].date, slot: days[0].slots[0] };
}

export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "tomorrow evening", "Wed 22 Oct in the morning". */
export function describeCallbackTime(date: string, slot: CallbackSlot, now = new Date()): string {
  const label = dayLabel(date, istToday(now));
  if (label === 'Today' || label === 'Tomorrow') {
    const day = label.toLowerCase();
    return slot === 'evening' && day === 'today' ? 'this evening' : `${day} ${slot}`;
  }
  return `${label} in the ${slot}`;
}

/** Ten digits, or null: the Indian mobile rule the callback route uses. */
export function cleanIndianMobile(value: string): string | null {
  const d = value.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** "+91 98xxx xx210": enough to recognise the number, not enough to copy it. */
export function maskPhone(phone: string | null | undefined): string {
  const d = (phone || '').replace(/\D/g, '').slice(-10);
  if (d.length !== 10) return phone || '';
  return `+91 ${d.slice(0, 2)}xxx xx${d.slice(7)}`;
}

/** The note an Aintra callback carries, so staff can open the chat it came from. */
export function aintraCallbackNote(sessionId: string | null, topic: string): string {
  const parts = [sessionId ? `Aintra chat: ${sessionId}` : 'Aintra chat', topic.trim() || null].filter(Boolean);
  return parts.join('. ').slice(0, 1000);
}
