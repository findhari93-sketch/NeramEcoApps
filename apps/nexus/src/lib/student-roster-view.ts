/**
 * How the Students screen orders, narrows and describes its roster.
 *
 * Pure TypeScript with no JSX and no server imports, so the rules are unit tested
 * once and the page, the rows and the API counts all agree. "Signed in" here
 * means users.nexus_first_login_at / nexus_last_login_at, which only a real Nexus
 * session writes (api/auth/me). users.last_login_at is useless for this: the
 * Tools app and signup stamp it too.
 */

export type RosterSort =
  | 'name'
  | 'joined_newest'
  | 'joined_oldest'
  | 'seen_recent'
  | 'seen_longest'
  | 'attendance_low';

export const ROSTER_SORTS: readonly RosterSort[] = [
  'name',
  'joined_newest',
  'joined_oldest',
  'seen_recent',
  'seen_longest',
  'attendance_low',
];

export const ROSTER_SORT_LABEL: Record<RosterSort, string> = {
  name: 'Name A to Z',
  joined_newest: 'Newest joined',
  joined_oldest: 'Oldest joined',
  seen_recent: 'Recently seen',
  seen_longest: 'Longest unseen',
  attendance_low: 'Lowest attendance',
};

export const DEFAULT_SORT: RosterSort = 'name';

export type SignInFilter = 'any' | 'never' | 'inactive' | 'active_week';
export type AccountFilter = 'any' | 'no_microsoft' | 'possible_duplicate';

export interface RosterFilters {
  signIn: SignInFilter;
  account: AccountFilter;
}

export const DEFAULT_FILTERS: RosterFilters = { signIn: 'any', account: 'any' };

export const SIGN_IN_FILTER_LABEL: Record<SignInFilter, string> = {
  any: 'Any',
  never: 'Never signed in',
  inactive: 'Not seen in 14+ days',
  active_week: 'Active this week',
};

export const ACCOUNT_FILTER_LABEL: Record<AccountFilter, string> = {
  any: 'Any',
  no_microsoft: 'No Microsoft account',
  possible_duplicate: 'May have two records',
};

export const SORT_STORAGE_KEY = 'nexus:students:sort';
export const FILTERS_STORAGE_KEY = 'nexus:students:filters';

/** Days without a Nexus visit before a student reads as inactive. */
export const INACTIVE_AFTER_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;
const IST = 'Asia/Kolkata';

/**
 * Fixed month names rather than the locale's: ICU versions disagree on "Sep"
 * versus "Sept", and a server-rendered count must read the same as the browser.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The fields these rules read. EnrolledStudent satisfies it. */
export interface RosterStudent {
  name: string;
  ms_oid: string | null;
  enrolled_at?: string | null;
  first_signed_in_at?: string | null;
  last_seen_at?: string | null;
  attendance: { percentage: number; total: number };
  possible_duplicate_of?: { id: string; name: string } | null;
}

export type StudentActivity = 'no_microsoft' | 'never_signed_in' | 'inactive' | 'active';

export type StatusTone = 'neutral' | 'warning' | 'error';

export interface StatusLine {
  joined: string | null;
  activity: { key: StudentActivity; text: string; tone: StatusTone };
}

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
}

export function activityOf(student: RosterStudent, now: number): StudentActivity {
  if (!student.ms_oid) return 'no_microsoft';
  const lastSeen = timeOf(student.last_seen_at) ?? timeOf(student.first_signed_in_at);
  if (lastSeen === null) return 'never_signed_in';
  return now - lastSeen >= INACTIVE_AFTER_DAYS * DAY_MS ? 'inactive' : 'active';
}

export function matchesFilters(student: RosterStudent, filters: RosterFilters, now: number): boolean {
  if (filters.signIn === 'never' && activityOf(student, now) !== 'never_signed_in') return false;
  if (filters.signIn === 'inactive' && activityOf(student, now) !== 'inactive') return false;
  if (filters.signIn === 'active_week') {
    const seen = timeOf(student.last_seen_at);
    if (seen === null || now - seen > 7 * DAY_MS) return false;
  }
  if (filters.account === 'no_microsoft') return !student.ms_oid;
  if (filters.account === 'possible_duplicate') return !!student.possible_duplicate_of;
  return true;
}

export function activeFilterCount(filters: RosterFilters): number {
  return (filters.signIn !== 'any' ? 1 : 0) + (filters.account !== 'any' ? 1 : 0);
}

/** Unknown times always sort last, whichever the direction. */
function compareKnownFirst(a: number | null, b: number | null, newestFirst: boolean): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return newestFirst ? b - a : a - b;
}

export function sortStudents<T extends RosterStudent>(students: readonly T[], sort: RosterSort): T[] {
  const rows = [...students];
  rows.sort((a, b) => {
    let order = 0;
    switch (sort) {
      case 'joined_newest':
        order = compareKnownFirst(timeOf(a.enrolled_at), timeOf(b.enrolled_at), true);
        break;
      case 'joined_oldest':
        order = compareKnownFirst(timeOf(a.enrolled_at), timeOf(b.enrolled_at), false);
        break;
      case 'seen_recent':
        order = compareKnownFirst(timeOf(a.last_seen_at), timeOf(b.last_seen_at), true);
        break;
      case 'seen_longest': {
        // Never seen is the longest unseen of all, so it leads here.
        const seenA = timeOf(a.last_seen_at);
        const seenB = timeOf(b.last_seen_at);
        if (seenA === null && seenB !== null) order = -1;
        else if (seenB === null && seenA !== null) order = 1;
        else if (seenA !== null && seenB !== null) order = seenA - seenB;
        break;
      }
      case 'attendance_low':
        order = a.attendance.percentage - b.attendance.percentage;
        break;
      default:
        order = 0;
    }
    return order !== 0 ? order : (a.name || '').localeCompare(b.name || '');
  });
  return rows;
}

function istParts(time: number): { day: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(time);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { day: part('day'), month: part('month'), year: part('year') };
}

/** "18 Aug" in Indian time, with the year only when it is not the current one. */
export function shortDate(iso: string | null | undefined, now: number): string | null {
  const time = timeOf(iso);
  if (time === null) return null;
  const { day, month, year } = istParts(time);
  const label = `${day} ${MONTHS[month - 1]}`;
  return year === istParts(now).year ? label : `${label} ${year}`;
}

/** Coarse on purpose: a teacher scanning a list needs "yesterday", not "19 hours ago". */
export function seenAgo(iso: string | null | undefined, now: number): string | null {
  const time = timeOf(iso);
  if (time === null) return null;
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return `on ${shortDate(iso, now)}`;
}

export function statusLineOf(student: RosterStudent, now: number): StatusLine {
  const joinedOn = shortDate(student.enrolled_at, now);
  const key = activityOf(student, now);
  const text =
    key === 'no_microsoft'
      ? 'No Microsoft account'
      : key === 'never_signed_in'
        ? 'Never signed in'
        : `Seen ${seenAgo(student.last_seen_at ?? student.first_signed_in_at, now)}`;
  const tone: StatusTone = key === 'no_microsoft' ? 'error' : key === 'active' ? 'neutral' : 'warning';
  return { joined: joinedOn ? `Joined ${joinedOn}` : null, activity: { key, text, tone } };
}

export function parseStoredSort(raw: string | null): RosterSort {
  return raw && (ROSTER_SORTS as readonly string[]).includes(raw) ? (raw as RosterSort) : DEFAULT_SORT;
}

function ownKey<K extends string>(labels: Record<K, string>, value: unknown): value is K {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(labels, value);
}

export function parseStoredFilters(raw: string | null): RosterFilters {
  if (!raw) return { ...DEFAULT_FILTERS };
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    return {
      signIn: ownKey(SIGN_IN_FILTER_LABEL, value?.signIn) ? value!.signIn as SignInFilter : 'any',
      account: ownKey(ACCOUNT_FILTER_LABEL, value?.account) ? value!.account as AccountFilter : 'any',
    };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}
