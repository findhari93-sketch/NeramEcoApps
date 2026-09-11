# Nexus Students Phase 2 (roster redesign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Nexus Students roster so a teacher sees who joined when and who actually uses Nexus, can sort and filter by that, can act on one student from a row menu (including Mark dormant), and adds students from one sheet instead of a panel buried under the list.

**Architecture:** Ordering, filtering, activity and status-line copy live in one pure module (`lib/student-roster-view.ts`), duplicate flags and the attention list in two more, all unit tested. `/api/students` gains sign-in dates, the enrollment id and a duplicate flag. Small presentational components (status line, row menu, sort menu, filter sheet, attention card, add sheet) are composed by the page, which keeps its existing data flow.

**Tech Stack:** Next.js 14 App Router, MUI via `@neram/ui`, Vitest + React Testing Library 14 (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-nexus-students-management-design.md` (Phase 2, sections 2.1 to 2.6)

## Global Constraints

- User-visible strings never contain em dashes, double dashes or `&mdash;`.
- Scope: `apps/nexus/**` and `tests/e2e/**` only. No edits under `packages/`. No new API routes, no migration.
- Every new tap target is at least 48px tall (Nexus mandate). No horizontal overflow at 375px.
- UI primitives from `@neram/ui` (it exports `Fab`, `Tabs`, `Tab`, `Radio`, `RadioGroup`, `FormControlLabel`, `Badge`, `ListItemIcon`, `ListItemText`, `Drawer`, `Menu`); icons from `@mui/icons-material/<Name>`; never `@mui/material` directly.
- Status is shown as text plus an icon, never colour alone. Body text is never smaller than 0.75rem (12px).
- The faceless-name guard (`components/students/student-name-face.test.ts`) must stay green: any file that renders `{student.name}` as text must import `StudentStageAvatar`, `StudentAvatar` or `StudentIdentityLine`. Passing a name as a prop (`title={student.name}`) is fine.
- Unit tests: `pnpm test:run <path>` from the repo root. Never bare `pnpm test`.
- Type-check and lint without pipes: `pnpm --filter @neram/nexus type-check`, `pnpm --filter @neram/nexus lint`.
- Re-read a file immediately before editing it; other sessions share this tree. Never `git stash`.
- Commit only when the user asks. Never push or deploy.
- Local Nexus dev writes to the production database: E2E and manual checks never add, remove, reclassify or mark anyone dormant.
- E2E runs one app: `PW_APPS=nexus pnpm test:e2e <spec> --project=nexus-chrome --no-deps`, with `test.describe.configure({ timeout: 120_000 })` and a route warm-up, because a cold `/teacher/*` page takes 26 to 36s.

### Deviations from the spec, decided while planning

1. **No dashed avatar ring for "never signed in".** `StudentStageAvatar` already uses solid (stage), dotted (not set) and dashed (dormant). A fourth meaning would make all of them ambiguous, so sign-in state is a text-and-icon status line instead.
2. **"Never signed in" attention row says "Show them"** (filters the list). Phase 3 turns it into "Send login".
3. **Add student** is a contained header button from `sm` up and a floating button only at `xs`, placed above the mobile `BottomNav`.

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/nexus/src/lib/student-roster-view.ts` | Create | Sort, filters, activity, status-line copy, stored-preference parsing |
| `apps/nexus/src/lib/student-roster-view.test.ts` | Create | Tests |
| `apps/nexus/src/lib/roster-duplicates.ts` | Create | Flag roster rows that may be one person twice |
| `apps/nexus/src/lib/roster-duplicates.test.ts` | Create | Tests |
| `apps/nexus/src/lib/student-attention.ts` | Create | Rows and actions of the Needs attention card |
| `apps/nexus/src/lib/student-attention.test.ts` | Create | Tests |
| `apps/nexus/src/app/api/students/route.ts` | Modify | Sign-in dates, enrollment id, duplicate flag, new counts |
| `apps/nexus/src/components/students/studentRow.types.ts` | Modify | New row fields and row props |
| `apps/nexus/src/components/students/StudentStatusLine.tsx` | Create | Joined, sign-in state, attendance, duplicate hint |
| `apps/nexus/src/components/students/StudentRowMenu.tsx` | Create | The per-row actions menu (sheet on phones) |
| `apps/nexus/src/components/students/StudentRowMenu.test.tsx` | Create | Tests |
| `apps/nexus/src/components/students/StudentRows.tsx` | Modify | Status line, conditional meters, actions slot |
| `apps/nexus/src/components/students/NeedsAttentionCard.tsx` | Create | Collapsible attention card |
| `apps/nexus/src/components/students/NeedsAttentionCard.test.tsx` | Create | Tests |
| `apps/nexus/src/components/students/ClassYearIssues.tsx` | Delete | Replaced by NeedsAttentionCard |
| `apps/nexus/src/components/students/StudentSortMenu.tsx` | Create | Sort control |
| `apps/nexus/src/components/students/StudentSortMenu.test.tsx` | Create | Tests |
| `apps/nexus/src/components/students/StudentFilterSheet.tsx` | Create | Filter sheet and active filter chips |
| `apps/nexus/src/components/students/StudentFilterSheet.test.tsx` | Create | Tests |
| `apps/nexus/src/components/students/AddStudentSheet.tsx` | Create | Add student sheet with Create and Existing tabs |
| `apps/nexus/src/components/students/AddStudentSheet.test.tsx` | Create | Tests |
| `apps/nexus/src/components/AvailableStudentsSection.tsx` | Modify | `embedded` mode for the sheet |
| `apps/nexus/src/app/(teacher)/teacher/students/page.tsx` | Modify | Compose everything |
| `tests/e2e/student-stage-nexus-mobile.spec.ts` | Modify | Banner test finds the attention card |
| `tests/e2e/students-roster-nexus.spec.ts` | Create | Roster API fields, sort, filters, row menu, overflow |

---

### Task 1: Roster view rules

**Files:**
- Create: `apps/nexus/src/lib/student-roster-view.ts`
- Test: `apps/nexus/src/lib/student-roster-view.test.ts`

**Interfaces:**
- Produces:

```ts
export type RosterSort = 'name' | 'joined_newest' | 'joined_oldest' | 'seen_recent' | 'seen_longest' | 'attendance_low';
export const ROSTER_SORTS: readonly RosterSort[];
export const ROSTER_SORT_LABEL: Record<RosterSort, string>;
export const DEFAULT_SORT: RosterSort; // 'name'
export type SignInFilter = 'any' | 'never' | 'inactive' | 'active_week';
export type AccountFilter = 'any' | 'no_microsoft' | 'possible_duplicate';
export interface RosterFilters { signIn: SignInFilter; account: AccountFilter }
export const DEFAULT_FILTERS: RosterFilters;
export const SIGN_IN_FILTER_LABEL: Record<SignInFilter, string>;
export const ACCOUNT_FILTER_LABEL: Record<AccountFilter, string>;
export const SORT_STORAGE_KEY: string;
export const FILTERS_STORAGE_KEY: string;
export const INACTIVE_AFTER_DAYS: number; // 14
export interface RosterStudent {
  name: string; ms_oid: string | null; enrolled_at?: string | null;
  first_signed_in_at?: string | null; last_seen_at?: string | null;
  attendance: { percentage: number; total: number };
  possible_duplicate_of?: { id: string; name: string } | null;
}
export type StudentActivity = 'no_microsoft' | 'never_signed_in' | 'inactive' | 'active';
export type StatusTone = 'neutral' | 'warning' | 'error';
export interface StatusLine { joined: string | null; activity: { key: StudentActivity; text: string; tone: StatusTone } }
export function activityOf(student: RosterStudent, now: number): StudentActivity;
export function matchesFilters(student: RosterStudent, filters: RosterFilters, now: number): boolean;
export function activeFilterCount(filters: RosterFilters): number;
export function sortStudents<T extends RosterStudent>(students: readonly T[], sort: RosterSort): T[];
export function shortDate(iso: string | null | undefined, now: number): string | null;
export function seenAgo(iso: string | null | undefined, now: number): string | null;
export function statusLineOf(student: RosterStudent, now: number): StatusLine;
export function parseStoredSort(raw: string | null): RosterSort;
export function parseStoredFilters(raw: string | null): RosterFilters;
```

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/lib/student-roster-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  activityOf,
  matchesFilters,
  parseStoredFilters,
  parseStoredSort,
  seenAgo,
  shortDate,
  sortStudents,
  statusLineOf,
  type RosterFilters,
  type RosterSort,
  type RosterStudent,
} from './student-roster-view';

const NOW = Date.UTC(2026, 8, 11, 6, 0, 0); // 11 Sep 2026, 11:30 IST
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

function student(over: Partial<RosterStudent> = {}): RosterStudent {
  return {
    name: 'Student',
    ms_oid: 'oid',
    enrolled_at: iso(NOW - 30 * DAY),
    first_signed_in_at: iso(NOW - 20 * DAY),
    last_seen_at: iso(NOW - 2 * HOUR),
    attendance: { percentage: 80, total: 10 },
    possible_duplicate_of: null,
    ...over,
  };
}

describe('activityOf', () => {
  it('reads a missing Microsoft account before anything else', () => {
    expect(activityOf(student({ ms_oid: null }), NOW)).toBe('no_microsoft');
  });

  it('reads no sign-in at all as never signed in', () => {
    expect(activityOf(student({ first_signed_in_at: null, last_seen_at: null }), NOW)).toBe('never_signed_in');
  });

  it('reads a visit inside 14 days as active and an older one as inactive', () => {
    expect(activityOf(student({ last_seen_at: iso(NOW - 13 * DAY) }), NOW)).toBe('active');
    expect(activityOf(student({ last_seen_at: iso(NOW - 14 * DAY) }), NOW)).toBe('inactive');
  });

  it('falls back to the first sign-in when the last is missing', () => {
    expect(activityOf(student({ last_seen_at: null, first_signed_in_at: iso(NOW - 30 * DAY) }), NOW)).toBe('inactive');
  });
});

describe('matchesFilters', () => {
  const roster = [
    student({ name: 'Never', first_signed_in_at: null, last_seen_at: null }),
    student({ name: 'Stale', last_seen_at: iso(NOW - 20 * DAY) }),
    student({ name: 'Recent', last_seen_at: iso(NOW - 3 * DAY) }),
    student({ name: 'Last week', last_seen_at: iso(NOW - 9 * DAY) }),
    student({ name: 'Gmail', ms_oid: null, first_signed_in_at: null, last_seen_at: null }),
    student({ name: 'Twin', possible_duplicate_of: { id: 'x', name: 'Twin two' } }),
  ];
  const names = (filters: RosterFilters) =>
    roster.filter((s) => matchesFilters(s, filters, NOW)).map((s) => s.name);

  it('keeps everyone with the default filters', () => {
    expect(names(DEFAULT_FILTERS)).toHaveLength(6);
  });

  it('narrows by sign-in activity', () => {
    expect(names({ signIn: 'never', account: 'any' })).toEqual(['Never']);
    expect(names({ signIn: 'inactive', account: 'any' })).toEqual(['Stale']);
    expect(names({ signIn: 'active_week', account: 'any' })).toEqual(['Recent', 'Twin']);
  });

  it('narrows by account state', () => {
    expect(names({ signIn: 'any', account: 'no_microsoft' })).toEqual(['Gmail']);
    expect(names({ signIn: 'any', account: 'possible_duplicate' })).toEqual(['Twin']);
  });
});

describe('sortStudents', () => {
  const asha = student({
    name: 'Asha',
    enrolled_at: iso(NOW - 5 * DAY),
    last_seen_at: iso(NOW - 1 * DAY),
    attendance: { percentage: 90, total: 10 },
  });
  const bala = student({
    name: 'Bala',
    enrolled_at: iso(NOW - 50 * DAY),
    first_signed_in_at: null,
    last_seen_at: null,
    attendance: { percentage: 40, total: 10 },
  });
  const chitra = student({
    name: 'Chitra',
    enrolled_at: null,
    last_seen_at: iso(NOW - 9 * DAY),
    attendance: { percentage: 40, total: 10 },
  });
  const order = (sort: RosterSort) => sortStudents([chitra, bala, asha], sort).map((s) => s.name);

  it('orders by name', () => {
    expect(order('name')).toEqual(['Asha', 'Bala', 'Chitra']);
  });

  it('puts the newest join first and unknown dates last', () => {
    expect(order('joined_newest')).toEqual(['Asha', 'Bala', 'Chitra']);
  });

  it('puts the oldest join first and unknown dates last', () => {
    expect(order('joined_oldest')).toEqual(['Bala', 'Asha', 'Chitra']);
  });

  it('puts the most recent visit first and never seen last', () => {
    expect(order('seen_recent')).toEqual(['Asha', 'Chitra', 'Bala']);
  });

  it('puts never seen first when looking for the longest unseen', () => {
    expect(order('seen_longest')).toEqual(['Bala', 'Chitra', 'Asha']);
  });

  it('puts the lowest attendance first and breaks ties by name', () => {
    expect(order('attendance_low')).toEqual(['Bala', 'Chitra', 'Asha']);
  });

  it('never mutates the input', () => {
    const input = [chitra, bala, asha];
    sortStudents(input, 'name');
    expect(input.map((s) => s.name)).toEqual(['Chitra', 'Bala', 'Asha']);
  });
});

describe('seenAgo and shortDate', () => {
  it('speaks the way a person would', () => {
    expect(seenAgo(iso(NOW - 20 * 1000), NOW)).toBe('just now');
    expect(seenAgo(iso(NOW - 5 * 60 * 1000), NOW)).toBe('5 min ago');
    expect(seenAgo(iso(NOW - 3 * HOUR), NOW)).toBe('3h ago');
    expect(seenAgo(iso(NOW - 30 * HOUR), NOW)).toBe('yesterday');
    expect(seenAgo(iso(NOW - 12 * DAY), NOW)).toBe('12 days ago');
    expect(seenAgo('2026-07-03T06:00:00Z', NOW)).toBe('on 3 Jul');
    expect(seenAgo(null, NOW)).toBeNull();
  });

  it('adds the year only when it differs', () => {
    expect(shortDate('2026-08-18T13:46:23Z', NOW)).toBe('18 Aug');
    expect(shortDate('2025-12-31T10:00:00Z', NOW)).toBe('31 Dec 2025');
    expect(shortDate('not a date', NOW)).toBeNull();
  });
});

describe('statusLineOf', () => {
  it('names the join date and the sign-in state', () => {
    const line = statusLineOf(
      student({ enrolled_at: '2026-08-18T13:46:23Z', first_signed_in_at: null, last_seen_at: null }),
      NOW,
    );
    expect(line.joined).toBe('Joined 18 Aug');
    expect(line.activity).toEqual({ key: 'never_signed_in', text: 'Never signed in', tone: 'warning' });
  });

  it('shows a recent visit calmly and a missing account as an error', () => {
    expect(statusLineOf(student({ last_seen_at: iso(NOW - 2 * HOUR) }), NOW).activity).toEqual({
      key: 'active',
      text: 'Seen 2h ago',
      tone: 'neutral',
    });
    expect(statusLineOf(student({ ms_oid: null }), NOW).activity).toEqual({
      key: 'no_microsoft',
      text: 'No Microsoft account',
      tone: 'error',
    });
  });

  it('omits the join date when it is unknown', () => {
    expect(statusLineOf(student({ enrolled_at: null }), NOW).joined).toBeNull();
  });
});

describe('stored preferences', () => {
  it('falls back to defaults for anything unrecognised', () => {
    expect(parseStoredSort('joined_newest')).toBe('joined_newest');
    expect(parseStoredSort('bogus')).toBe('name');
    expect(parseStoredSort(null)).toBe('name');
    expect(parseStoredFilters('{"signIn":"never","account":"no_microsoft"}')).toEqual({
      signIn: 'never',
      account: 'no_microsoft',
    });
    expect(parseStoredFilters('{"signIn":"nope"}')).toEqual(DEFAULT_FILTERS);
    expect(parseStoredFilters('not json')).toEqual(DEFAULT_FILTERS);
  });

  it('counts only the facets that narrow', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ signIn: 'never', account: 'no_microsoft' })).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run apps/nexus/src/lib/student-roster-view.test.ts`
Expected: FAIL, cannot resolve `./student-roster-view`.

- [ ] **Step 3: Implement**

Create `apps/nexus/src/lib/student-roster-view.ts`:

```ts
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

function yearInIst(time: number): number {
  return Number(new Intl.DateTimeFormat('en-IN', { year: 'numeric', timeZone: IST }).format(time));
}

/** "18 Aug", with the year only when it is not the current one. */
export function shortDate(iso: string | null | undefined, now: number): string | null {
  const time = timeOf(iso);
  if (time === null) return null;
  const withYear = yearInIst(time) !== yearInIst(now);
  return new Date(time).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: IST,
  });
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

export function parseStoredFilters(raw: string | null): RosterFilters {
  if (!raw) return { ...DEFAULT_FILTERS };
  try {
    const value = JSON.parse(raw) as Partial<RosterFilters> | null;
    const signIn = value?.signIn && value.signIn in SIGN_IN_FILTER_LABEL ? value.signIn : 'any';
    const account = value?.account && value.account in ACCOUNT_FILTER_LABEL ? value.account : 'any';
    return { signIn, account };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run apps/nexus/src/lib/student-roster-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (only if the user has asked for commits)**

```bash
git add apps/nexus/src/lib/student-roster-view.ts apps/nexus/src/lib/student-roster-view.test.ts
git commit -m "feat(nexus): roster sort, filter and status rules"
```

---

### Task 2: Duplicate flags and the attention list

**Files:**
- Create: `apps/nexus/src/lib/roster-duplicates.ts`, `apps/nexus/src/lib/student-attention.ts`
- Test: `apps/nexus/src/lib/roster-duplicates.test.ts`, `apps/nexus/src/lib/student-attention.test.ts`

**Interfaces:**
- Consumes: `firstNameKey(nameOrAddress)` from `apps/nexus/src/lib/identity-candidates.ts` (Phase 1).
- Produces:

```ts
// roster-duplicates.ts
export interface DuplicateRosterRow { id: string; name: string | null; ms_oid: string | null }
export interface DuplicatePartner { id: string; name: string }
export function findRosterDuplicates(rows: DuplicateRosterRow[]): Map<string, DuplicatePartner>;

// student-attention.ts
export type AttentionKey = 'duplicates' | 'mismatch' | 'never_signed_in' | 'no_stage' | 'no_year';
export type AttentionActionKey = 'review_duplicates' | 'review_mismatches' | 'show_never_signed_in' | 'prefill' | 'fix_stages' | 'fix_years';
export interface AttentionAction { key: AttentionActionKey; label: string; primary?: boolean; requiresEdit?: boolean }
export interface AttentionRow { key: AttentionKey; message: string; actions: AttentionAction[] }
export interface AttentionInput { duplicateCount: number; mismatchCount: number; neverSignedInCount: number; noStageCount: number; noYearCount: number; suggestionCount: number }
export function buildAttentionRows(input: AttentionInput): AttentionRow[];
```

- [ ] **Step 1: Write the failing tests**

Create `apps/nexus/src/lib/roster-duplicates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findRosterDuplicates } from './roster-duplicates';

describe('findRosterDuplicates', () => {
  it('pairs a record with no Microsoft account and one with it, both ways (the Afrin shape)', () => {
    const flags = findRosterDuplicates([
      { id: 'gmail', name: 'Afrin', ms_oid: null },
      { id: 'org', name: 'Afrin banu', ms_oid: 'oid-1' },
      { id: 'other', name: 'Humaira safrin', ms_oid: 'oid-2' },
    ]);
    expect(flags.get('gmail')).toEqual({ id: 'org', name: 'Afrin banu' });
    expect(flags.get('org')).toEqual({ id: 'gmail', name: 'Afrin' });
    expect(flags.has('other')).toBe(false);
  });

  it('does not pair two Microsoft records that share a first name', () => {
    const flags = findRosterDuplicates([
      { id: 'a', name: 'Keerthana S', ms_oid: 'oid-a' },
      { id: 'b', name: 'Keerthana Suresh', ms_oid: 'oid-b' },
    ]);
    expect(flags.size).toBe(0);
  });

  it('ignores first names too short to mean anything', () => {
    const flags = findRosterDuplicates([
      { id: 'a', name: 'Al', ms_oid: null },
      { id: 'b', name: 'Al Khan', ms_oid: 'oid-b' },
    ]);
    expect(flags.size).toBe(0);
  });
});
```

Create `apps/nexus/src/lib/student-attention.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAttentionRows } from './student-attention';

const none = {
  duplicateCount: 0,
  mismatchCount: 0,
  neverSignedInCount: 0,
  noStageCount: 0,
  noYearCount: 0,
  suggestionCount: 0,
};

describe('buildAttentionRows', () => {
  it('lists nothing when nothing needs attention', () => {
    expect(buildAttentionRows(none)).toEqual([]);
  });

  it('orders the most damaging problem first', () => {
    const rows = buildAttentionRows({
      duplicateCount: 1,
      mismatchCount: 2,
      neverSignedInCount: 6,
      noStageCount: 14,
      noYearCount: 3,
      suggestionCount: 0,
    });
    expect(rows.map((r) => r.key)).toEqual(['duplicates', 'mismatch', 'never_signed_in', 'no_stage', 'no_year']);
  });

  it('uses singular and plural copy', () => {
    expect(buildAttentionRows({ ...none, neverSignedInCount: 1 })[0].message).toBe(
      '1 student has never signed in to Nexus.',
    );
    expect(buildAttentionRows({ ...none, neverSignedInCount: 6 })[0].message).toBe(
      '6 students have never signed in to Nexus.',
    );
    expect(buildAttentionRows({ ...none, noStageCount: 14 })[0].message).toBe(
      '14 students have no class set. Priority and reminders cannot be targeted until they do.',
    );
  });

  it('offers the application-form prefill only when there is something to fill', () => {
    expect(buildAttentionRows({ ...none, noStageCount: 2 })[0].actions.map((a) => a.key)).toEqual(['fix_stages']);
    const withPrefill = buildAttentionRows({ ...none, noStageCount: 2, suggestionCount: 5 })[0].actions;
    expect(withPrefill.map((a) => [a.key, !!a.primary])).toEqual([
      ['prefill', true],
      ['fix_stages', false],
    ]);
  });

  it('marks data-changing actions and leaves the list filters open to everyone', () => {
    const rows = buildAttentionRows({ ...none, duplicateCount: 1, neverSignedInCount: 1, noYearCount: 1 });
    expect(rows.flatMap((r) => r.actions).map((a) => [a.key, !!a.requiresEdit])).toEqual([
      ['review_duplicates', false],
      ['show_never_signed_in', false],
      ['fix_years', true],
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run apps/nexus/src/lib/roster-duplicates.test.ts apps/nexus/src/lib/student-attention.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

Create `apps/nexus/src/lib/roster-duplicates.ts`:

```ts
/**
 * Students on one roster who may be the same person twice.
 *
 * The shape this looks for is the one that actually happened: a paid Gmail signup
 * (no Microsoft account) and a hand-made @neramclasses.com account for the same
 * student, both enrolled. It flags a record with no Microsoft account and a record
 * with one that share a first name. It only flags; merging stays a human decision
 * in Admin, because first names collide between different students.
 */

import { firstNameKey } from './identity-candidates';

export interface DuplicateRosterRow {
  id: string;
  name: string | null;
  ms_oid: string | null;
}

export interface DuplicatePartner {
  id: string;
  name: string;
}

export function findRosterDuplicates(rows: DuplicateRosterRow[]): Map<string, DuplicatePartner> {
  const withMicrosoft = new Map<string, DuplicateRosterRow>();
  for (const row of rows || []) {
    if (!row.ms_oid) continue;
    const key = firstNameKey(row.name);
    if (key.length >= 3 && !withMicrosoft.has(key)) withMicrosoft.set(key, row);
  }

  const flags = new Map<string, DuplicatePartner>();
  for (const row of rows || []) {
    if (row.ms_oid) continue;
    const key = firstNameKey(row.name);
    if (key.length < 3) continue;
    const partner = withMicrosoft.get(key);
    if (!partner) continue;
    flags.set(row.id, { id: partner.id, name: partner.name || 'Unnamed student' });
    if (!flags.has(partner.id)) flags.set(partner.id, { id: row.id, name: row.name || 'Unnamed student' });
  }
  return flags;
}
```

Create `apps/nexus/src/lib/student-attention.ts`:

```ts
/**
 * What the "Needs attention" card on the Students screen lists, in order.
 *
 * Most damaging first: two records for one person split fees and attendance, a
 * class and exam year that disagree put a student in the wrong cohort, a student
 * who never signed in is being taught nothing, and the two missing-data rows are
 * housekeeping. Pure, so the order and the copy are unit tested.
 */

export type AttentionKey = 'duplicates' | 'mismatch' | 'never_signed_in' | 'no_stage' | 'no_year';

export type AttentionActionKey =
  | 'review_duplicates'
  | 'review_mismatches'
  | 'show_never_signed_in'
  | 'prefill'
  | 'fix_stages'
  | 'fix_years';

export interface AttentionAction {
  key: AttentionActionKey;
  label: string;
  primary?: boolean;
  /** Changes data, so a caller without edit rights must not be offered it. */
  requiresEdit?: boolean;
}

export interface AttentionRow {
  key: AttentionKey;
  message: string;
  actions: AttentionAction[];
}

export interface AttentionInput {
  duplicateCount: number;
  mismatchCount: number;
  neverSignedInCount: number;
  noStageCount: number;
  noYearCount: number;
  suggestionCount: number;
}

function studentHas(count: number): string {
  return count === 1 ? 'student has' : 'students have';
}

export function buildAttentionRows(input: AttentionInput): AttentionRow[] {
  const rows: AttentionRow[] = [];

  if (input.duplicateCount > 0) {
    rows.push({
      key: 'duplicates',
      message: `${input.duplicateCount} ${input.duplicateCount === 1 ? 'student may' : 'students may'} have two records here. Merge them in Admin so fees and attendance stay together.`,
      actions: [{ key: 'review_duplicates', label: 'Review', primary: true }],
    });
  }

  if (input.mismatchCount > 0) {
    rows.push({
      key: 'mismatch',
      message: `${input.mismatchCount} ${studentHas(input.mismatchCount)} a class and exam year that disagree.`,
      actions: [{ key: 'review_mismatches', label: 'Review', primary: true, requiresEdit: true }],
    });
  }

  if (input.neverSignedInCount > 0) {
    rows.push({
      key: 'never_signed_in',
      message: `${input.neverSignedInCount} ${studentHas(input.neverSignedInCount)} never signed in to Nexus.`,
      actions: [{ key: 'show_never_signed_in', label: 'Show them' }],
    });
  }

  if (input.noStageCount > 0) {
    const actions: AttentionAction[] = [];
    if (input.suggestionCount > 0) {
      actions.push({ key: 'prefill', label: 'Fill from application form', primary: true, requiresEdit: true });
    }
    actions.push({ key: 'fix_stages', label: 'Set classes', primary: input.suggestionCount === 0, requiresEdit: true });
    rows.push({
      key: 'no_stage',
      message: `${input.noStageCount} ${studentHas(input.noStageCount)} no class set. Priority and reminders cannot be targeted until they do.`,
      actions,
    });
  }

  if (input.noYearCount > 0) {
    rows.push({
      key: 'no_year',
      message: `${input.noYearCount} ${studentHas(input.noYearCount)} no exam year, so they belong to no cohort.`,
      actions: [{ key: 'fix_years', label: 'Set exam year', requiresEdit: true }],
    });
  }

  return rows;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run apps/nexus/src/lib/roster-duplicates.test.ts apps/nexus/src/lib/student-attention.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (only if the user has asked for commits)**

```bash
git add apps/nexus/src/lib/roster-duplicates.ts apps/nexus/src/lib/roster-duplicates.test.ts apps/nexus/src/lib/student-attention.ts apps/nexus/src/lib/student-attention.test.ts
git commit -m "feat(nexus): roster duplicate flags and attention rows"
```

---

### Task 3: Roster API fields

**Files:**
- Modify: `apps/nexus/src/app/api/students/route.ts`
- Modify: `apps/nexus/src/components/students/studentRow.types.ts`

**Interfaces:**
- Consumes: `findRosterDuplicates` (Task 2), `activityOf` (Task 1).
- Produces: each `GET /api/students` row gains `enrollment_id: string`, `first_signed_in_at: string | null`, `last_seen_at: string | null`, `possible_duplicate_of: { id: string; name: string } | null` (`enrolled_at` already existed). `counts` gains `neverSignedIn: number` and `notSeen14d: number` (non-dormant students only).
- `EnrolledStudent` gains the optional fields `enrollment_id?`, `enrolled_at?`, `first_signed_in_at?`, `last_seen_at?`, `possible_duplicate_of?`.

- [ ] **Step 1: Extend the row type**

In `studentRow.types.ts`, inside `EnrolledStudent`, directly after `awaiting_microsoft: boolean; // enrolled, but no Entra account yet: cannot sign in` add:

```ts

  /** nexus_enrollments.id, which removing a student from the class needs. */
  enrollment_id?: string;
  enrolled_at?: string | null;
  /**
   * users.nexus_first_login_at / nexus_last_login_at. Written only when the
   * student actually opens Nexus, unlike users.last_login_at.
   */
  first_signed_in_at?: string | null;
  last_seen_at?: string | null;
  /** Another row on this roster that may be the same person. See lib/roster-duplicates. */
  possible_duplicate_of?: { id: string; name: string } | null;
```

- [ ] **Step 2: Update the route**

In `apps/nexus/src/app/api/students/route.ts`:

1. After `import { isAwaitingMicrosoft } from '@/lib/microsoft-account';` add:

```ts
import { findRosterDuplicates } from '@/lib/roster-duplicates';
import { activityOf } from '@/lib/student-roster-view';
```

2. In the enrollment `.select(...)` string, change `academic_year, is_alumni)` to `academic_year, is_alumni, nexus_first_login_at, nexus_last_login_at)`.

3. In the empty-roster response `counts`, after `noYear: 0,` add:

```ts
          neverSignedIn: 0,
          notSeen14d: 0,
```

4. In the `students` map, extend the `user` cast: after `academic_year: string | null;` add:

```ts
        nexus_first_login_at: string | null;
        nexus_last_login_at: string | null;
```

5. In the returned row object, directly after `awaiting_microsoft: isAwaitingMicrosoft(user.ms_oid),` add:

```ts
        enrollment_id: enrollment.id,
        first_signed_in_at: user.nexus_first_login_at ?? null,
        last_seen_at: user.nexus_last_login_at ?? null,
        possible_duplicate_of: null as { id: string; name: string } | null,
```

6. Directly after the `students` map closes (`});` before `// Fetch batches for this classroom`), add:

```ts

    // A record with no Microsoft account beside one with it, under the same first
    // name, is the shape a paid Gmail signup plus a hand-made org account takes.
    const duplicates = findRosterDuplicates(
      students.map((s: any) => ({ id: s.id, name: s.name, ms_oid: s.ms_oid })),
    );
    for (const s of students) s.possible_duplicate_of = duplicates.get(s.id) ?? null;
```

7. After the `noYear` computation, add:

```ts
    // Over targetable students only: a dormant student is expected not to sign in.
    const nowMs = Date.now();
    const neverSignedIn = targetable.filter((s: any) => activityOf(s, nowMs) === 'never_signed_in').length;
    const notSeen14d = targetable.filter((s: any) => activityOf(s, nowMs) === 'inactive').length;
```

8. In the `counts` object, after `noYear,` add:

```ts
      neverSignedIn,
      notSeen14d,
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @neram/nexus type-check`
Expected: exit code 0.

- [ ] **Step 4: Commit (only if the user has asked for commits)**

```bash
git add apps/nexus/src/app/api/students/route.ts apps/nexus/src/components/students/studentRow.types.ts
git commit -m "feat(nexus): students API returns sign-in dates, enrollment id and duplicate flags"
```

---

### Task 4: Status line and row menu

**Files:**
- Create: `apps/nexus/src/components/students/StudentStatusLine.tsx`
- Create: `apps/nexus/src/components/students/StudentRowMenu.tsx`
- Test: `apps/nexus/src/components/students/StudentRowMenu.test.tsx`

**Interfaces:**
- Consumes: `statusLineOf`, `RosterStudent`, `StudentActivity` (Task 1).
- Produces:

```ts
export default function StudentStatusLine(props: { student: RosterStudent; now: number; attendance?: number | null }): JSX.Element;
export interface RowMenuItem { key: string; label: string; icon: React.ReactNode; onClick: () => void; tone?: 'default' | 'warning' | 'error'; dividerBefore?: boolean }
export default function StudentRowMenu(props: { title: string; items: RowMenuItem[] }): JSX.Element | null;
```
- Accessible names: the menu button is `Actions for <title>`; every item is a `menuitem` named by its label.

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/components/students/StudentRowMenu.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StudentRowMenu from './StudentRowMenu';

describe('StudentRowMenu', () => {
  it('lists the actions it is given and runs the chosen one', () => {
    const onCopy = vi.fn();
    render(
      <StudentRowMenu
        title="Dhisha Haribabu"
        items={[
          { key: 'open', label: 'Open profile', icon: <span />, onClick: vi.fn() },
          { key: 'copy', label: 'Copy email', icon: <span />, onClick: onCopy },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Dhisha Haribabu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy email' }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('does not let a click reach the row underneath', () => {
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <StudentRowMenu
          title="Asha"
          items={[{ key: 'open', label: 'Open profile', icon: <span />, onClick: vi.fn() }]}
        />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Asha' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open profile' }));
    expect(onRow).not.toHaveBeenCalled();
  });

  it('renders nothing without actions', () => {
    const { container } = render(<StudentRowMenu title="Asha" items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run apps/nexus/src/components/students/StudentRowMenu.test.tsx`
Expected: FAIL, cannot resolve `./StudentRowMenu`.

- [ ] **Step 3: Implement the status line**

Create `apps/nexus/src/components/students/StudentStatusLine.tsx`:

```tsx
'use client';

import { Box, Typography } from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import NoAccountsOutlinedIcon from '@mui/icons-material/NoAccountsOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import { statusLineOf, type RosterStudent, type StudentActivity } from '@/lib/student-roster-view';

const ICON: Record<StudentActivity, React.ElementType> = {
  active: CheckCircleOutlineIcon,
  inactive: ScheduleOutlinedIcon,
  never_signed_in: PersonOffOutlinedIcon,
  no_microsoft: NoAccountsOutlinedIcon,
};

const TONE_COLOR = {
  neutral: 'text.secondary',
  warning: 'warning.dark',
  error: 'error.main',
} as const;

const TEXT = { fontSize: '0.75rem', lineHeight: 1.4 } as const;

/**
 * One line under a student's name: when they joined and whether they actually use
 * Nexus. Text plus an icon, never colour alone.
 *
 * Deliberately not an avatar ring. The ring already carries the study stage
 * (solid), "not set" (dotted) and dormant (dashed); a fourth meaning would make
 * every one of them ambiguous.
 */
export default function StudentStatusLine({
  student,
  now,
  attendance,
}: {
  student: RosterStudent;
  now: number;
  /** Shown only when the classroom has completed classes; pass null otherwise. */
  attendance?: number | null;
}) {
  const { joined, activity } = statusLineOf(student, now);
  const Icon = ICON[activity.key];

  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', columnGap: 1, rowGap: 0.25, flexWrap: 'wrap', minWidth: 0, mt: 0.25 }}
    >
      {joined && (
        <Typography component="span" sx={{ ...TEXT, color: 'text.secondary' }}>
          {joined}
        </Typography>
      )}
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: TONE_COLOR[activity.tone] }}>
        <Icon aria-hidden sx={{ fontSize: '0.95rem' }} />
        <Typography
          component="span"
          sx={{ ...TEXT, color: 'inherit', fontWeight: activity.tone === 'neutral' ? 500 : 700 }}
        >
          {activity.text}
        </Typography>
      </Box>
      {typeof attendance === 'number' && (
        <Typography component="span" sx={{ ...TEXT, color: 'text.secondary' }}>
          Att {attendance}%
        </Typography>
      )}
      {student.possible_duplicate_of && (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: 'warning.dark' }}>
          <PeopleAltOutlinedIcon aria-hidden sx={{ fontSize: '0.95rem' }} />
          <Typography component="span" sx={{ ...TEXT, color: 'inherit', fontWeight: 700 }}>
            May have two records
          </Typography>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Implement the row menu**

Create `apps/nexus/src/components/students/StudentRowMenu.tsx`:

```tsx
'use client';

import { useState } from 'react';
import {
  Box,
  Divider,
  Drawer,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import MoreVertIcon from '@mui/icons-material/MoreVert';

export interface RowMenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'warning' | 'error';
  dividerBefore?: boolean;
}

const TONE_COLOR = { default: 'text.primary', warning: 'warning.dark', error: 'error.main' } as const;

/**
 * The actions for one student, behind a single 48px button on the row.
 *
 * A menu on a pointer screen, a bottom sheet on a phone, so every action stays in
 * the thumb zone. Clicks and key presses are stopped here: the row underneath is a
 * button that opens the profile, and choosing "Mark dormant" must not also
 * navigate away.
 */
export default function StudentRowMenu({ title, items }: { title: string; items: RowMenuItem[] }) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (!items.length) return null;

  const open = !!anchor;
  const close = () => setAnchor(null);

  const entries = items.flatMap((item) => [
    ...(item.dividerBefore ? [<Divider key={`${item.key}-divider`} />] : []),
    <MenuItem
      key={item.key}
      onClick={() => {
        close();
        item.onClick();
      }}
      sx={{ minHeight: 48, color: TONE_COLOR[item.tone ?? 'default'] }}
    >
      <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>{item.icon}</ListItemIcon>
      <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600 }} />
    </MenuItem>,
  ]);

  return (
    <Box
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      sx={{ display: 'flex', flexShrink: 0 }}
    >
      <IconButton
        aria-label={`Actions for ${title}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ width: 48, height: 48 }}
      >
        <MoreVertIcon />
      </IconButton>
      {isPhone ? (
        <Drawer
          anchor="bottom"
          open={open}
          onClose={close}
          PaperProps={{
            sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, pb: 'calc(8px + env(safe-area-inset-bottom))' },
          }}
        >
          <Typography noWrap sx={{ px: 2, pt: 2, pb: 1, fontWeight: 800 }}>
            {title}
          </Typography>
          <Box role="menu" aria-label={`Actions for ${title}`}>
            {entries}
          </Box>
        </Drawer>
      ) : (
        <Menu
          anchorEl={anchor}
          open={open}
          onClose={close}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {entries}
        </Menu>
      )}
    </Box>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:run apps/nexus/src/components/students/StudentRowMenu.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit (only if the user has asked for commits)**

```bash
git add apps/nexus/src/components/students/StudentStatusLine.tsx apps/nexus/src/components/students/StudentRowMenu.tsx apps/nexus/src/components/students/StudentRowMenu.test.tsx
git commit -m "feat(nexus): student status line and row actions menu"
```

---

### Task 5: Rows show status and carry the menu

**Files:**
- Modify: `apps/nexus/src/components/students/StudentRows.tsx` (replace file)
- Modify: `apps/nexus/src/components/students/studentRow.types.ts` (`StudentRowProps`)
- Modify: `apps/nexus/src/app/(teacher)/teacher/students/page.tsx` (two-line interim edit so the page still compiles; Task 9 replaces the page)

**Interfaces:**
- Consumes: `StudentStatusLine` (Task 4).
- Produces: `StudentRowProps` without `onCopy`, with `now: number` and `actions?: React.ReactNode`.

- [ ] **Step 1: Change the row props**

In `studentRow.types.ts`, replace the whole `StudentRowProps` interface with:

```ts
export interface StudentRowProps {
  student: EnrolledStudent;
  /** Current exam-year cohort, so a mismatch tooltip can name the expected year. */
  currentBatch?: string | null;
  checklistPct: number;
  attColor: string;
  doneColor: string;
  presenceStatus?: string | null;
  isMobile: boolean;
  /** One clock for every row, so "Seen 2h ago" agrees down the list. */
  now: number;
  /** Select mode turns row taps into selection toggles instead of navigation. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen: () => void;
  /** The row's actions menu. Hidden in select mode, where a tap means "select". */
  actions?: React.ReactNode;
}
```

- [ ] **Step 2: Replace the rows**

Replace `apps/nexus/src/components/students/StudentRows.tsx` with:

```tsx
'use client';

import { Box, Typography } from '@neram/ui';
import StudentRowShell from './StudentRowShell';
import StudentRowChips from './StudentRowChips';
import StudentStageAvatar from './StudentStageAvatar';
import StudentStatusLine from './StudentStatusLine';
import { Meter } from './StudentStatMeters';
import { stageKeyOf } from '@/lib/student-stage';
import type { StudentRowProps } from './studentRow.types';

/**
 * The three row densities.
 *
 * They share StudentRowShell (container, tap behaviour, select checkbox),
 * StudentRowChips (the badge row) and StudentStatusLine (joined and sign-in), so a
 * student reads the same in all three. Only the layout differs.
 *
 * Progress meters appear only when there is something to measure. A classroom with
 * no completed classes used to give every student two empty 0% bars, which read as
 * "everyone is failing" rather than "nothing has happened yet".
 *
 * The chips no longer carry "No Microsoft account": the status line says it once.
 */

function stageOf(student: StudentRowProps['student']) {
  return {
    stage: stageKeyOf(student.study_stage),
    dormant: student.participation_status === 'dormant',
  };
}

/** Compact: the default. Name and chips, email, then the status line. */
export function CompactRow(props: StudentRowProps) {
  const { student, presenceStatus, now, actions, selectMode } = props;
  const { stage, dormant } = stageOf(student);
  const attendance = student.attendance.total > 0 ? student.attendance.percentage : null;

  return (
    <StudentRowShell
      selectMode={selectMode}
      selected={props.selected}
      onToggleSelect={props.onToggleSelect}
      onOpen={props.onOpen}
      dormant={dormant}
      sx={{ px: 1.5, py: 1, minHeight: 64, display: 'flex', alignItems: 'center', gap: 1.25 }}
    >
      <StudentStageAvatar
        stage={stage}
        dormant={dormant}
        msOid={student.ms_oid}
        fallbackSrc={student.avatar_url}
        name={student.name}
        size={36}
        tapToView={false}
        presenceStatus={presenceStatus}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flexWrap: 'wrap' }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.95rem', maxWidth: '100%' }}>
            {student.name}
          </Typography>
          <StudentRowChips
            studyStage={student.study_stage}
            participationStatus={student.participation_status}
            dormantSince={student.dormant_since}
            dormantReason={student.dormant_reason}
            examBatch={student.exam_batch}
            pairStatus={student.pair_status}
            currentBatch={props.currentBatch}
            emailStatus={student.email_status}
            density="compact"
            showSection={false}
          />
        </Box>
        {student.email && (
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: 'block', fontSize: '0.75rem', lineHeight: 1.35 }}
          >
            {student.email}
          </Typography>
        )}
        <StudentStatusLine student={student} now={now} attendance={attendance} />
      </Box>
      {!selectMode && actions}
    </StudentRowShell>
  );
}

/** Cards: avatar tile with chips and status, meters only when there is data. */
export function StudentCard(props: StudentRowProps) {
  const { student, checklistPct, attColor, doneColor, presenceStatus, now, actions, selectMode } = props;
  const { stage, dormant } = stageOf(student);
  const showAttendance = student.attendance.total > 0;
  const showChecklist = student.checklist.total > 0;

  return (
    <StudentRowShell
      selectMode={selectMode}
      selected={props.selected}
      onToggleSelect={props.onToggleSelect}
      onOpen={props.onOpen}
      dormant={dormant}
      sx={{ p: 2, borderRadius: 2.5, height: '100%', display: 'flex', flexDirection: 'column', gap: 1.25 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <StudentStageAvatar
          stage={stage}
          dormant={dormant}
          msOid={student.ms_oid}
          fallbackSrc={student.avatar_url}
          name={student.name}
          size={48}
          tapToView={false}
          presenceStatus={presenceStatus}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {student.name}
          </Typography>
          {student.email && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {student.email}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            <StudentRowChips
              studyStage={student.study_stage}
              participationStatus={student.participation_status}
              dormantSince={student.dormant_since}
              dormantReason={student.dormant_reason}
              examBatch={student.exam_batch}
              pairStatus={student.pair_status}
              currentBatch={props.currentBatch}
              batchName={student.batch?.name}
              emailStatus={student.email_status}
              density="card"
            />
          </Box>
          <StudentStatusLine student={student} now={now} />
        </Box>
        {!selectMode && actions}
      </Box>
      {(showAttendance || showChecklist) && (
        <Box sx={{ display: 'flex', gap: 2, mt: 'auto', pt: 0.5 }}>
          {showAttendance && <Meter label="Attendance" value={student.attendance.percentage} color={attColor} />}
          {showChecklist && <Meter label="Checklist" value={checklistPct} color={doneColor} />}
        </Box>
      )}
    </StudentRowShell>
  );
}

/** Detailed: roomy rows with full meters, again only when there is data. */
export function DetailedRow(props: StudentRowProps) {
  const { student, checklistPct, attColor, doneColor, presenceStatus, isMobile, now, actions, selectMode } = props;
  const { stage, dormant } = stageOf(student);
  const showAttendance = student.attendance.total > 0;
  const showChecklist = student.checklist.total > 0;

  return (
    <StudentRowShell
      selectMode={selectMode}
      selected={props.selected}
      onToggleSelect={props.onToggleSelect}
      onOpen={props.onOpen}
      dormant={dormant}
      sx={{ p: 2, minHeight: 48, display: 'block' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <StudentStageAvatar
          stage={stage}
          dormant={dormant}
          msOid={student.ms_oid}
          fallbackSrc={student.avatar_url}
          name={student.name}
          size={isMobile ? 44 : 48}
          tapToView={false}
          presenceStatus={presenceStatus}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="body1" sx={{ fontWeight: 700, fontSize: { xs: '0.95rem', sm: '1rem' } }} noWrap>
              {student.name}
            </Typography>
            <StudentRowChips
              studyStage={student.study_stage}
              participationStatus={student.participation_status}
              dormantSince={student.dormant_since}
              dormantReason={student.dormant_reason}
              examBatch={student.exam_batch}
              pairStatus={student.pair_status}
              currentBatch={props.currentBatch}
              batchName={student.batch?.name}
              emailStatus={student.email_status}
              density="detailed"
            />
          </Box>
          {student.email && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {student.email}
            </Typography>
          )}
          <StudentStatusLine student={student} now={now} />
        </Box>
        {!selectMode && actions}
      </Box>
      {(showAttendance || showChecklist) && (
        <Box sx={{ display: 'flex', gap: 2, mt: 1.25, ml: { xs: 0, sm: 7.5 }, alignItems: 'center', flexWrap: 'wrap' }}>
          {showAttendance && <Meter label="Attendance" value={student.attendance.percentage} color={attColor} />}
          {showChecklist && <Meter label="Checklist" value={checklistPct} color={doneColor} />}
        </Box>
      )}
    </StudentRowShell>
  );
}
```

- [ ] **Step 3: Interim page edit so it compiles**

In `page.tsx`, inside `rowProps`, replace `onCopy: handleCopyEmail,` with `now: Date.now(),`. (Task 9 replaces the whole page.)

- [ ] **Step 4: Type-check and the face guard**

Run: `pnpm --filter @neram/nexus type-check`
Expected: exit code 0.
Run: `pnpm test:run apps/nexus/src/components/students/student-name-face.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (only if the user has asked for commits)**

```bash
git add apps/nexus/src/components/students/StudentRows.tsx apps/nexus/src/components/students/studentRow.types.ts "apps/nexus/src/app/(teacher)/teacher/students/page.tsx"
git commit -m "feat(nexus): student rows show join and sign-in status, meters only with data"
```

---

### Task 6: Needs attention card

**Files:**
- Create: `apps/nexus/src/components/students/NeedsAttentionCard.tsx`
- Test: `apps/nexus/src/components/students/NeedsAttentionCard.test.tsx`

**Interfaces:**
- Consumes: `buildAttentionRows`, `AttentionInput`, `AttentionActionKey` (Task 2).
- Produces:

```ts
export const ATTENTION_COLLAPSED_KEY: string; // 'nexus:students:attention-collapsed'
export interface NeedsAttentionCardProps extends AttentionInput { canEdit: boolean; onAction: (key: AttentionActionKey) => void }
export default function NeedsAttentionCard(props: NeedsAttentionCardProps): JSX.Element | null;
```
- The collapse toggle is a button named `Needs attention (<row count>)` with `aria-expanded`.

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/components/students/NeedsAttentionCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import NeedsAttentionCard, { ATTENTION_COLLAPSED_KEY } from './NeedsAttentionCard';

const none = {
  duplicateCount: 0,
  mismatchCount: 0,
  neverSignedInCount: 0,
  noStageCount: 0,
  noYearCount: 0,
  suggestionCount: 0,
};

beforeEach(() => {
  localStorage.clear();
});

describe('NeedsAttentionCard', () => {
  it('renders nothing when nothing needs attention', () => {
    const { container } = render(<NeedsAttentionCard {...none} canEdit onAction={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('counts its rows in the heading and runs an action by key', () => {
    const onAction = vi.fn();
    render(<NeedsAttentionCard {...none} neverSignedInCount={6} noYearCount={2} canEdit onAction={onAction} />);
    expect(screen.getByRole('button', { name: 'Needs attention (2)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }));
    expect(onAction).toHaveBeenCalledWith('show_never_signed_in');
  });

  it('remembers being collapsed', () => {
    const { unmount } = render(<NeedsAttentionCard {...none} noYearCount={2} canEdit onAction={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Needs attention (1)' }));
    expect(screen.queryByText(/no exam year/)).toBeNull();
    expect(localStorage.getItem(ATTENTION_COLLAPSED_KEY)).toBe('1');
    unmount();

    render(<NeedsAttentionCard {...none} noYearCount={2} canEdit onAction={vi.fn()} />);
    expect(screen.queryByText(/no exam year/)).toBeNull();
  });

  it('hides data-changing actions from someone who cannot edit, and says why', () => {
    render(<NeedsAttentionCard {...none} noYearCount={2} neverSignedInCount={1} canEdit={false} onAction={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Set exam year' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show them' })).toBeTruthy();
    expect(screen.getByText(/Ask a manager/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run apps/nexus/src/components/students/NeedsAttentionCard.test.tsx`
Expected: FAIL, cannot resolve `./NeedsAttentionCard`.

- [ ] **Step 3: Implement**

Create `apps/nexus/src/components/students/NeedsAttentionCard.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Box, Button, Divider, Paper, Typography, alpha } from '@neram/ui';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { buildAttentionRows, type AttentionActionKey, type AttentionInput } from '@/lib/student-attention';

export const ATTENTION_COLLAPSED_KEY = 'nexus:students:attention-collapsed';

export interface NeedsAttentionCardProps extends AttentionInput {
  /** Holds coord.student.stage. Filters stay available without it. */
  canEdit: boolean;
  onAction: (key: AttentionActionKey) => void;
}

/**
 * Everything on this roster that needs a person to act, most damaging first.
 *
 * Replaces the class-and-year banner, and deliberately is not an ARIA alert: it is
 * present on most visits, and an alert would be announced every time the page
 * loads. One tap per problem to the fixed state, collapsible, and the collapsed
 * choice is remembered on this device.
 */
export default function NeedsAttentionCard({ canEdit, onAction, ...input }: NeedsAttentionCardProps) {
  const rows = buildAttentionRows(input);
  const [collapsed, setCollapsed] = useState(false);

  // Read after mount: reading localStorage during render breaks hydration.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(ATTENTION_COLLAPSED_KEY) === '1');
    } catch {
      /* storage unavailable, stay open */
    }
  }, []);

  if (!rows.length) return null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(ATTENTION_COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      /* non-fatal */
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={{ borderRadius: 2, overflow: 'hidden', borderColor: (t) => alpha(t.palette.warning.main, 0.5) }}
    >
      <Button
        fullWidth
        onClick={toggle}
        aria-expanded={!collapsed}
        startIcon={<ReportProblemOutlinedIcon />}
        endIcon={collapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
        sx={{
          justifyContent: 'flex-start',
          minHeight: 48,
          px: 1.5,
          textTransform: 'none',
          fontWeight: 700,
          color: 'text.primary',
          '& .MuiButton-startIcon': { color: 'warning.dark' },
          '& .MuiButton-endIcon': { ml: 'auto' },
        }}
      >
        Needs attention ({rows.length})
      </Button>

      {!collapsed && (
        <Box sx={{ px: 1.5, pb: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {rows.map((row, index) => {
            const actions = row.actions.filter((action) => canEdit || !action.requiresEdit);
            const hidden = actions.length < row.actions.length;
            return (
              <Box key={row.key}>
                {index > 0 && <Divider sx={{ mb: 1 }} />}
                <Box
                  sx={{
                    display: 'flex',
                    // Message above the buttons at 375px, side by side from sm.
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'stretch', sm: 'center' },
                    gap: 1,
                  }}
                >
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                    {row.message}
                    {hidden && ' Ask a manager or a teacher with edit access to fix this.'}
                  </Typography>
                  {actions.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.75, flexShrink: 0, flexWrap: 'wrap' }}>
                      {actions.map((action) => (
                        <Button
                          key={action.key}
                          size="small"
                          variant={action.primary ? 'contained' : 'outlined'}
                          color="warning"
                          onClick={() => onAction(action.key)}
                          sx={{ minHeight: 48, fontWeight: 700, whiteSpace: 'nowrap' }}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Paper>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run apps/nexus/src/components/students/NeedsAttentionCard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit (only if the user has asked for commits)**

```bash
git add apps/nexus/src/components/students/NeedsAttentionCard.tsx apps/nexus/src/components/students/NeedsAttentionCard.test.tsx
git commit -m "feat(nexus): needs attention card for the students roster"
```

---

### Task 7: Sort menu and filter sheet

**Files:**
- Create: `apps/nexus/src/components/students/StudentSortMenu.tsx`, `apps/nexus/src/components/students/StudentFilterSheet.tsx`
- Test: `apps/nexus/src/components/students/StudentSortMenu.test.tsx`, `apps/nexus/src/components/students/StudentFilterSheet.test.tsx`

**Interfaces:**
- Consumes: from Task 1 `ROSTER_SORTS`, `ROSTER_SORT_LABEL`, `RosterSort`, `RosterFilters`, `DEFAULT_FILTERS`, `SIGN_IN_FILTER_LABEL`, `ACCOUNT_FILTER_LABEL`, `activeFilterCount`, `SignInFilter`, `AccountFilter`; `StudentBatch` from `studentRow.types.ts`.
- Produces:

```ts
export default function StudentSortMenu(props: { value: RosterSort; onChange: (sort: RosterSort) => void }): JSX.Element;
export const DEFAULT_EXAM_BATCH_FILTER: 'current';
export interface RosterFilterState { filters: RosterFilters; examBatchFilter: string; batchFilter: string | null }
export interface StudentFilterSheetProps extends RosterFilterState {
  onFiltersChange: (filters: RosterFilters) => void;
  onExamBatchFilterChange: (value: string) => void;
  onBatchFilterChange: (value: string | null) => void;
  examBatches: { code: string }[];
  examYearLocked: boolean;
  batches: StudentBatch[];
}
export function narrowingCount(state: RosterFilterState): number;
export default function StudentFilterSheet(props: StudentFilterSheetProps): JSX.Element;
export function ActiveFilterChips(props: Omit<StudentFilterSheetProps, 'examBatches' | 'examYearLocked'>): JSX.Element | null;
```
- The sort button is named `Sort: <label>`. The filter button is named `Filters`.

- [ ] **Step 1: Write the failing tests**

Create `apps/nexus/src/components/students/StudentSortMenu.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StudentSortMenu from './StudentSortMenu';

describe('StudentSortMenu', () => {
  it('names the current order and reports a new choice', () => {
    const onChange = vi.fn();
    render(<StudentSortMenu value="name" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Name A to Z' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Newest joined' }));
    expect(onChange).toHaveBeenCalledWith('joined_newest');
  });
});
```

Create `apps/nexus/src/components/students/StudentFilterSheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StudentFilterSheet, { ActiveFilterChips, narrowingCount } from './StudentFilterSheet';
import { DEFAULT_FILTERS } from '@/lib/student-roster-view';

function baseProps() {
  return {
    filters: DEFAULT_FILTERS,
    examBatchFilter: 'current',
    batchFilter: null as string | null,
    onFiltersChange: vi.fn(),
    onExamBatchFilterChange: vi.fn(),
    onBatchFilterChange: vi.fn(),
    examBatches: [{ code: '2026-27' }],
    examYearLocked: false,
    batches: [],
  };
}

describe('StudentFilterSheet', () => {
  it('applies a sign-in filter the moment it is chosen', () => {
    const props = baseProps();
    render(<StudentFilterSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Never signed in' }));
    expect(props.onFiltersChange).toHaveBeenCalledWith({ signIn: 'never', account: 'any' });
  });

  it('clears every facet at once', () => {
    const props = {
      ...baseProps(),
      filters: { signIn: 'never' as const, account: 'no_microsoft' as const },
      examBatchFilter: 'all',
      batchFilter: 'unassigned',
    };
    render(<StudentFilterSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(props.onFiltersChange).toHaveBeenCalledWith(DEFAULT_FILTERS);
    expect(props.onExamBatchFilterChange).toHaveBeenCalledWith('current');
    expect(props.onBatchFilterChange).toHaveBeenCalledWith(null);
  });

  it('counts every narrowing facet', () => {
    expect(narrowingCount({ filters: DEFAULT_FILTERS, examBatchFilter: 'current', batchFilter: null })).toBe(0);
    expect(
      narrowingCount({ filters: { signIn: 'never', account: 'any' }, examBatchFilter: 'all', batchFilter: 'b1' }),
    ).toBe(3);
  });
});

describe('ActiveFilterChips', () => {
  it('shows a removable chip per facet and removes just that one', () => {
    const props = { ...baseProps(), filters: { signIn: 'never' as const, account: 'any' as const } };
    render(<ActiveFilterChips {...props} />);
    const chip = screen.getByRole('button', { name: /Never signed in/ });
    fireEvent.click(chip.querySelector('.MuiChip-deleteIcon') as Element);
    expect(props.onFiltersChange).toHaveBeenCalledWith({ signIn: 'any', account: 'any' });
  });

  it('renders nothing when nothing narrows', () => {
    const { container } = render(<ActiveFilterChips {...baseProps()} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run apps/nexus/src/components/students/StudentSortMenu.test.tsx apps/nexus/src/components/students/StudentFilterSheet.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the sort menu**

Create `apps/nexus/src/components/students/StudentSortMenu.tsx`:

```tsx
'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Drawer,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SortIcon from '@mui/icons-material/Sort';
import CheckIcon from '@mui/icons-material/Check';
import { ROSTER_SORTS, ROSTER_SORT_LABEL, type RosterSort } from '@/lib/student-roster-view';

/** How the roster is ordered. A menu on a pointer screen, a sheet on a phone. */
export default function StudentSortMenu({
  value,
  onChange,
}: {
  value: RosterSort;
  onChange: (sort: RosterSort) => void;
}) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = !!anchor;

  const options = ROSTER_SORTS.map((sort) => (
    <MenuItem
      key={sort}
      selected={sort === value}
      onClick={() => {
        setAnchor(null);
        onChange(sort);
      }}
      sx={{ minHeight: 48 }}
    >
      <ListItemIcon sx={{ minWidth: 32 }}>{sort === value ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
      <ListItemText primary={ROSTER_SORT_LABEL[sort]} />
    </MenuItem>
  ));

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<SortIcon />}
        aria-label={`Sort: ${ROSTER_SORT_LABEL[value]}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, borderRadius: 2, bgcolor: 'background.paper' }}
      >
        {ROSTER_SORT_LABEL[value]}
      </Button>
      {isPhone ? (
        <Drawer
          anchor="bottom"
          open={open}
          onClose={() => setAnchor(null)}
          PaperProps={{
            sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, pb: 'calc(8px + env(safe-area-inset-bottom))' },
          }}
        >
          <Typography sx={{ px: 2, pt: 2, pb: 1, fontWeight: 800 }}>Sort students</Typography>
          <Box role="menu" aria-label="Sort students">
            {options}
          </Box>
        </Drawer>
      ) : (
        <Menu anchorEl={anchor} open={open} onClose={() => setAnchor(null)}>
          {options}
        </Menu>
      )}
    </>
  );
}
```

- [ ] **Step 4: Implement the filter sheet**

Create `apps/nexus/src/components/students/StudentFilterSheet.tsx`:

```tsx
'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@neram/ui';
import TuneIcon from '@mui/icons-material/Tune';
import {
  ACCOUNT_FILTER_LABEL,
  DEFAULT_FILTERS,
  SIGN_IN_FILTER_LABEL,
  activeFilterCount,
  type AccountFilter,
  type RosterFilters,
  type SignInFilter,
} from '@/lib/student-roster-view';
import type { StudentBatch } from './studentRow.types';

export const DEFAULT_EXAM_BATCH_FILTER = 'current';

export interface RosterFilterState {
  filters: RosterFilters;
  examBatchFilter: string;
  batchFilter: string | null;
}

export interface StudentFilterSheetProps extends RosterFilterState {
  onFiltersChange: (filters: RosterFilters) => void;
  onExamBatchFilterChange: (value: string) => void;
  onBatchFilterChange: (value: string | null) => void;
  examBatches: { code: string }[];
  /** The Not set and Dormant views always show every exam year. */
  examYearLocked: boolean;
  batches: StudentBatch[];
}

/** How many facets narrow the list, the exam year and the section included. */
export function narrowingCount({ filters, examBatchFilter, batchFilter }: RosterFilterState): number {
  return (
    activeFilterCount(filters) +
    (examBatchFilter !== DEFAULT_EXAM_BATCH_FILTER ? 1 : 0) +
    (batchFilter ? 1 : 0)
  );
}

function examYearChipLabel(value: string): string {
  if (value === 'all') return 'All exam years';
  if (value === 'none') return 'No exam year';
  return `Exam year ${value}`;
}

/**
 * Every way to narrow the roster, in one bottom sheet.
 *
 * Choices apply the moment they are made, so there is no "Apply" to forget on a
 * phone. The exam year and section moved in here from the toolbar, where they cost
 * two rows of a 375px screen that the list needs more.
 */
export default function StudentFilterSheet(props: StudentFilterSheetProps) {
  const {
    filters,
    examBatchFilter,
    batchFilter,
    onFiltersChange,
    onExamBatchFilterChange,
    onBatchFilterChange,
    examBatches,
    examYearLocked,
    batches,
  } = props;
  const [open, setOpen] = useState(false);
  const count = narrowingCount(props);

  const clearAll = () => {
    onFiltersChange({ ...DEFAULT_FILTERS });
    onExamBatchFilterChange(DEFAULT_EXAM_BATCH_FILTER);
    onBatchFilterChange(null);
  };

  const sections: Array<{ id: string | null; name: string }> = [
    { id: null, name: 'All sections' },
    ...batches.map((b) => ({ id: b.id, name: b.name })),
    { id: 'unassigned', name: 'Unassigned' },
  ];

  return (
    <>
      <Badge badgeContent={count} color="primary" invisible={count === 0}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<TuneIcon />}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, borderRadius: 2, bgcolor: 'background.paper' }}
        >
          Filters
        </Button>
      </Badge>

      <Drawer
        anchor="bottom"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '88dvh', width: '100%', maxWidth: 640, mx: 'auto' },
        }}
      >
        <Box
          role="dialog"
          aria-labelledby="student-filters-title"
          sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1 }}
        >
          <Typography id="student-filters-title" sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
            Filter students
          </Typography>

          <TextField
            select
            label="Exam year"
            value={examBatchFilter}
            onChange={(e) => onExamBatchFilterChange(e.target.value)}
            disabled={examYearLocked}
            helperText={examYearLocked ? 'Not set and Dormant always show every exam year.' : undefined}
            sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
          >
            <MenuItem value="current">Current + upcoming</MenuItem>
            <MenuItem value="all">All with access</MenuItem>
            {examBatches.map((b) => (
              <MenuItem key={b.code} value={b.code}>
                {b.code}
              </MenuItem>
            ))}
            <MenuItem value="none">No exam year set</MenuItem>
          </TextField>

          {batches.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Section
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {sections.map((section) => (
                  <Chip
                    key={section.id ?? 'all'}
                    label={section.name}
                    clickable
                    onClick={() => onBatchFilterChange(section.id)}
                    color={batchFilter === section.id ? 'primary' : 'default'}
                    variant={batchFilter === section.id ? 'filled' : 'outlined'}
                    sx={{ height: 40 }}
                  />
                ))}
              </Box>
            </Box>
          )}

          <Divider />

          <FilterRadios<SignInFilter>
            title="Sign-in"
            name="sign-in"
            value={filters.signIn}
            labels={SIGN_IN_FILTER_LABEL}
            onChange={(signIn) => onFiltersChange({ ...filters, signIn })}
          />
          <FilterRadios<AccountFilter>
            title="Account"
            name="account"
            value={filters.account}
            labels={ACCOUNT_FILTER_LABEL}
            onChange={(account) => onFiltersChange({ ...filters, account })}
          />
        </Box>

        <Box
          sx={{
            p: 2,
            pt: 1,
            display: 'flex',
            gap: 1,
            borderTop: 1,
            borderColor: 'divider',
            pb: 'calc(16px + env(safe-area-inset-bottom))',
          }}
        >
          <Button onClick={clearAll} disabled={count === 0} sx={{ minHeight: 48, flex: 1 }}>
            Clear all
          </Button>
          <Button variant="contained" onClick={() => setOpen(false)} sx={{ minHeight: 48, flex: 2, fontWeight: 700 }}>
            Done
          </Button>
        </Box>
      </Drawer>
    </>
  );
}

function FilterRadios<T extends string>({
  title,
  name,
  value,
  labels,
  onChange,
}: {
  title: string;
  name: string;
  value: T;
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
      <Typography component="legend" variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
        {title}
      </Typography>
      <RadioGroup name={name} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {(Object.keys(labels) as T[]).map((key) => (
          <FormControlLabel
            key={key}
            value={key}
            control={<Radio />}
            label={labels[key]}
            sx={{ minHeight: 44, mr: 0 }}
          />
        ))}
      </RadioGroup>
    </Box>
  );
}

/** Removable chips for whatever narrows the list, so no filter is ever invisible. */
export function ActiveFilterChips(props: Omit<StudentFilterSheetProps, 'examBatches' | 'examYearLocked'>) {
  const {
    filters,
    examBatchFilter,
    batchFilter,
    onFiltersChange,
    onExamBatchFilterChange,
    onBatchFilterChange,
    batches,
  } = props;

  const chips: Array<{ key: string; label: string; onDelete: () => void }> = [];
  if (examBatchFilter !== DEFAULT_EXAM_BATCH_FILTER) {
    chips.push({
      key: 'exam',
      label: examYearChipLabel(examBatchFilter),
      onDelete: () => onExamBatchFilterChange(DEFAULT_EXAM_BATCH_FILTER),
    });
  }
  if (batchFilter) {
    chips.push({
      key: 'section',
      label:
        batchFilter === 'unassigned'
          ? 'Unassigned section'
          : batches.find((b) => b.id === batchFilter)?.name ?? 'Section',
      onDelete: () => onBatchFilterChange(null),
    });
  }
  if (filters.signIn !== 'any') {
    chips.push({
      key: 'sign-in',
      label: SIGN_IN_FILTER_LABEL[filters.signIn],
      onDelete: () => onFiltersChange({ ...filters, signIn: 'any' }),
    });
  }
  if (filters.account !== 'any') {
    chips.push({
      key: 'account',
      label: ACCOUNT_FILTER_LABEL[filters.account],
      onDelete: () => onFiltersChange({ ...filters, account: 'any' }),
    });
  }

  if (!chips.length) return null;

  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          label={chip.label}
          onDelete={chip.onDelete}
          color="primary"
          variant="outlined"
          sx={{ height: 40, fontWeight: 600 }}
        />
      ))}
    </Box>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:run apps/nexus/src/components/students/StudentSortMenu.test.tsx apps/nexus/src/components/students/StudentFilterSheet.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit (only if the user has asked for commits)**

```bash
git add apps/nexus/src/components/students/StudentSortMenu.tsx apps/nexus/src/components/students/StudentSortMenu.test.tsx apps/nexus/src/components/students/StudentFilterSheet.tsx apps/nexus/src/components/students/StudentFilterSheet.test.tsx
git commit -m "feat(nexus): roster sort menu and filter sheet"
```

---

### Task 8: Add student sheet

**Files:**
- Create: `apps/nexus/src/components/students/AddStudentSheet.tsx`
- Modify: `apps/nexus/src/components/AvailableStudentsSection.tsx`
- Test: `apps/nexus/src/components/students/AddStudentSheet.test.tsx`

**Interfaces:**
- Consumes: `AvailableStudentsSection` with the new `embedded?: boolean` prop.
- Produces:

```ts
export type AddStudentTab = 'create' | 'existing';
export interface AddStudentSheetProps {
  open: boolean; onClose: () => void; classroomId: string;
  getToken: () => Promise<string | null>; onEnrolled: () => void;
  /** Phase 3 passes the account creator here. */
  createAccount?: React.ReactNode;
}
export default function AddStudentSheet(props: AddStudentSheetProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/components/students/AddStudentSheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AddStudentSheet from './AddStudentSheet';

vi.mock('@/components/AvailableStudentsSection', () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="directory">{embedded ? 'embedded' : 'collapsible'}</div>
  ),
}));

function props() {
  return {
    open: true,
    onClose: vi.fn(),
    classroomId: 'room-1',
    getToken: async () => 'token',
    onEnrolled: vi.fn(),
  };
}

describe('AddStudentSheet', () => {
  it('opens on the directory, embedded, when no account creator is supplied', () => {
    render(<AddStudentSheet {...props()} />);
    expect(screen.getByTestId('directory').textContent).toBe('embedded');
  });

  it('explains the manual route on the Create tab and links back', () => {
    render(<AddStudentSheet {...props()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));
    expect(screen.getByText('Create the account in Microsoft first')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Existing Microsoft account' }));
    expect(screen.getByTestId('directory')).toBeTruthy();
  });

  it('opens on the creator when one is supplied', () => {
    render(<AddStudentSheet {...props()} createAccount={<div>creator form</div>} />);
    expect(screen.getByText('creator form')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run apps/nexus/src/components/students/AddStudentSheet.test.tsx`
Expected: FAIL, cannot resolve `./AddStudentSheet`.

- [ ] **Step 3: Give AvailableStudentsSection an embedded mode**

In `apps/nexus/src/components/AvailableStudentsSection.tsx`:

1. In `interface Props`, after `onEnrolled: () => void;` add:

```ts
  /** Inside the Add student sheet: always open, no collapsible header, no border. */
  embedded?: boolean;
```

2. Change the signature line to `export default function AvailableStudentsSection({ classroomId, getToken, onEnrolled, embedded = false }: Props) {` and the first state line to `const [expanded, setExpanded] = useState(embedded);`.

3. Replace everything from `return (` to the end of the component with:

```tsx
  const body = (
    <Box sx={{ px: embedded ? 0 : 1.5, pb: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        New Microsoft accounts that are not in this classroom yet, newest first. Add them to grant Nexus access.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {unavailable ? (
        <Alert severity="info" sx={{ mb: 1 }}>
          The organisation directory is temporarily unavailable. Use the &quot;Add Student&quot;
          button to search and add a student by name or email.
        </Alert>
      ) : loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          {(students.length > 0 || past.length > 0) && (
            <TextField
              fullWidth
              size="small"
              placeholder="Filter by name or email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              sx={{ mb: 1.5 }}
              inputProps={{ style: { minHeight: 24 } }}
            />
          )}

          {selected.size > 0 && (
            <Button
              fullWidth
              variant="contained"
              size="small"
              startIcon={adding ? <CircularProgress size={16} color="inherit" /> : <PersonAddAltOutlinedIcon />}
              disabled={adding}
              onClick={() => enroll([...students, ...past].filter((s) => selected.has(s.ms_oid)))}
              sx={{ mb: 1.5, minHeight: 48 }}
            >
              Add {selected.size} to class
            </Button>
          )}

          {students.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              {past.length > 0
                ? 'No new accounts. Past students are listed below.'
                : 'Everyone in the directory is already in this class.'}
            </Typography>
          ) : (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                ...(embedded ? {} : { maxHeight: 360, overflow: 'auto' }),
              }}
            >
              {filtered.map((s) =>
                renderRow(s, s.createdAt ? `Account created ${timeAgo(s.createdAt)}` : '', 'Add')
              )}
              {filtered.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  No matches for &quot;{query}&quot;.
                </Typography>
              )}
            </Box>
          )}

          {past.length > 0 && (
            <Box sx={{ mt: 1.5, pt: 1, borderTop: 1, borderColor: 'divider' }}>
              <Button
                fullWidth
                onClick={() => setShowPast((v) => !v)}
                aria-expanded={showPast}
                endIcon={showPast ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                sx={{
                  justifyContent: 'space-between',
                  minHeight: 48,
                  textTransform: 'none',
                  fontWeight: 600,
                  color: 'text.secondary',
                }}
              >
                Past students ({past.length})
              </Button>
              {showPast && (
                <>
                  <Alert severity="info" sx={{ my: 1 }}>
                    These students left a class earlier but were never graduated, so their Microsoft
                    accounts are still active. Graduate them in the Admin app to free their licenses.
                    Add someone back only if they have rejoined.
                  </Alert>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {filteredPast.map((s) => renderRow(s, pastMeta(s), 'Add back'))}
                    {filteredPast.length === 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                        No past students match &quot;{query}&quot;.
                      </Typography>
                    )}
                  </Box>
                </>
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  );

  if (embedded) {
    return (
      <Box>
        {body}
        {dialog}
      </Box>
    );
  }

  return (
    <Paper variant="outlined" sx={{ mb: 2, borderRadius: 2, overflow: 'hidden' }}>
      {/* Header. A real button, so the section opens from a keyboard, with the
          refresh control beside it rather than nested inside it. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.5, minHeight: 48 }}>
        <Button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          startIcon={<PersonAddAltOutlinedIcon fontSize="small" />}
          endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          sx={{
            flex: 1,
            minHeight: 48,
            justifyContent: 'flex-start',
            textTransform: 'none',
            fontWeight: 600,
            color: 'text.primary',
            '& .MuiButton-endIcon': { ml: 'auto' },
          }}
        >
          Not yet in class
          {loaded && !unavailable && (
            <Chip
              component="span"
              label={students.length}
              size="small"
              color={students.length > 0 ? 'primary' : 'default'}
              sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Button>
        {expanded && (
          <IconButton
            onClick={() => fetchAvailable()}
            disabled={loading}
            aria-label="Refresh directory"
            sx={{ width: 48, height: 48 }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {expanded && body}

      {dialog}
    </Paper>
  );
}
```

- [ ] **Step 4: Implement the sheet**

Create `apps/nexus/src/components/students/AddStudentSheet.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Box, Button, Drawer, IconButton, Tab, Tabs, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import AvailableStudentsSection from '@/components/AvailableStudentsSection';

export type AddStudentTab = 'create' | 'existing';

export interface AddStudentSheetProps {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  getToken: () => Promise<string | null>;
  onEnrolled: () => void;
  /**
   * The account creator. Until it is supplied, the Create tab explains the manual
   * route rather than offering a form that cannot work.
   */
  createAccount?: React.ReactNode;
}

/**
 * One place to add a student, opened from the Students screen.
 *
 * "Not yet in class" used to sit under the whole roster, so reaching it meant
 * scrolling past every enrolled student. Adding someone is a task, so it opens as
 * a sheet and leaves the roster for finding people.
 */
export default function AddStudentSheet({
  open,
  onClose,
  classroomId,
  getToken,
  onEnrolled,
  createAccount,
}: AddStudentSheetProps) {
  const canCreate = !!createAccount;
  const [tab, setTab] = useState<AddStudentTab>(canCreate ? 'create' : 'existing');

  // Every opening starts on the most useful tab, not wherever it was left.
  useEffect(() => {
    if (open) setTab(canCreate ? 'create' : 'existing');
  }, [open, canCreate]);

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, height: '92dvh', width: '100%', maxWidth: 760, mx: 'auto' },
      }}
    >
      <Box
        role="dialog"
        aria-labelledby="add-student-title"
        sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 1 }}>
          <Typography id="add-student-title" sx={{ fontWeight: 800, fontSize: '1.1rem', flex: 1 }}>
            Add student
          </Typography>
          <IconButton onClick={onClose} aria-label="Close" sx={{ width: 48, height: 48 }}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Tabs
          value={tab}
          onChange={(_event, value: AddStudentTab) => setTab(value)}
          variant="fullWidth"
          sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="create" label="Create account" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }} />
          <Tab
            value="existing"
            label="Existing Microsoft account"
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
          />
        </Tabs>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2, pb: 'calc(16px + env(safe-area-inset-bottom))' }}>
          {tab === 'create' ? (
            createAccount ?? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 520 }}>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  Create the account in Microsoft first
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Make the student&apos;s @neramclasses.com account in the Microsoft 365 admin center and give it the
                  student license. It then appears under Existing Microsoft account, ready to add.
                </Typography>
                <Button
                  variant="outlined"
                  onClick={() => setTab('existing')}
                  sx={{ alignSelf: 'flex-start', minHeight: 48, fontWeight: 700 }}
                >
                  Go to Existing Microsoft account
                </Button>
              </Box>
            )
          ) : (
            <AvailableStudentsSection classroomId={classroomId} getToken={getToken} onEnrolled={onEnrolled} embedded />
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:run apps/nexus/src/components/students/AddStudentSheet.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit (only if the user has asked for commits)**

```bash
git add apps/nexus/src/components/students/AddStudentSheet.tsx apps/nexus/src/components/students/AddStudentSheet.test.tsx apps/nexus/src/components/AvailableStudentsSection.tsx
git commit -m "feat(nexus): add student sheet with the directory embedded"
```

---

### Task 9: Compose the page

**Files:**
- Modify: `apps/nexus/src/app/(teacher)/teacher/students/page.tsx` (replace file)
- Delete: `apps/nexus/src/components/students/ClassYearIssues.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1 to 8; `RemoveStudentDialog` (`students: [{ enrollmentId, userId, name, email, avatar_url }]`); `useNexusAuthContext()` fields `isTeacher`, `impersonation.active`, `startImpersonation(studentId, { reason, returnUrl })`; `DormantIcon` from `components/students/StageGlyph`.

- [ ] **Step 1: Replace the page**

Re-read `page.tsx` first; carry any change made since this plan into the version below. Replace `apps/nexus/src/app/(teacher)/teacher/students/page.tsx` with:

```tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Fab,
  IconButton,
  Typography,
  Paper,
  Chip,
  TextField,
  Snackbar,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
  useMediaQuery,
  alpha,
} from '@neram/ui';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import DensitySmallOutlinedIcon from '@mui/icons-material/DensitySmallOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined';
import RemoveStudentDialog from '@/components/RemoveStudentDialog';
import AddStudentSheet from '@/components/students/AddStudentSheet';
import BulkSelectBar from '@/components/students/BulkSelectBar';
import ClassifyDrawer, { type ClassifyMode } from '@/components/students/ClassifyDrawer';
import NeedsAttentionCard from '@/components/students/NeedsAttentionCard';
import PrefillReviewSheet, {
  type PrefillSuggestion,
} from '@/components/students/PrefillReviewSheet';
import { DormantIcon } from '@/components/students/StageGlyph';
import StudentFilterSheet, { ActiveFilterChips } from '@/components/students/StudentFilterSheet';
import StudentListSkeleton from '@/components/students/StudentListSkeleton';
import StudentRowMenu, { type RowMenuItem } from '@/components/students/StudentRowMenu';
import StudentSegmentBar from '@/components/students/StudentSegmentBar';
import StudentSortMenu from '@/components/students/StudentSortMenu';
import { CompactRow, StudentCard, DetailedRow } from '@/components/students/StudentRows';
import {
  VIEW_STORAGE_KEY,
  type EnrolledStudent,
  type StudentBatch,
  type ViewMode,
} from '@/components/students/studentRow.types';
import {
  DEFAULT_SEGMENT,
  SEGMENT_LABEL,
  SEGMENT_STORAGE_KEY,
  matchesSegment,
  segmentCounts,
  stageCounts,
  stageKeyOf,
  type StageKey,
  type StudentSegment,
} from '@/lib/student-stage';
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  FILTERS_STORAGE_KEY,
  SORT_STORAGE_KEY,
  activeFilterCount,
  matchesFilters,
  parseStoredFilters,
  parseStoredSort,
  sortStudents,
  type RosterFilters,
  type RosterSort,
} from '@/lib/student-roster-view';
import type { AttentionActionKey } from '@/lib/student-attention';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { usePresence } from '@/hooks/usePresence';
import { rankPeople, suggestPeople } from '@/lib/people-search';

const SEGMENTS: StudentSegment[] = [
  'exam_this_year',
  'all_active',
  '11th',
  'lower',
  'unset',
  'dormant',
];

interface StudentCounts {
  total: number;
  active: number;
  awaitingMicrosoft: number;
  tracked: number;
  dormant: number;
  stage: Record<StageKey, number>;
  segments: Record<StudentSegment, number>;
  /** Class and exam year contradict each other. Excludes dormant students. */
  mismatch: number;
  /** No exam year at all. Excludes dormant students. */
  noYear: number;
  /** Has a Microsoft account and has never opened Nexus. Excludes dormant students. */
  neverSignedIn: number;
  /** Last opened Nexus 14 or more days ago. Excludes dormant students. */
  notSeen14d: number;
}

/** Snackbar verb for a class and/or exam year edit, naming what actually changed. */
function describeFieldChange(payload: {
  studyStage?: string | null;
  academicYear?: string | null;
}): string {
  const touchedStage = 'studyStage' in payload;
  const touchedYear = 'academicYear' in payload;
  if (touchedStage && touchedYear) return 'Class and exam year set';
  if (touchedYear) return payload.academicYear === null ? 'Cleared exam year' : 'Exam year set';
  return payload.studyStage === null ? 'Cleared class' : 'Class set';
}

const EMPTY_COUNTS: StudentCounts = {
  total: 0,
  active: 0,
  awaitingMicrosoft: 0,
  tracked: 0,
  dormant: 0,
  stage: { gap_year: 0, '12th': 0, '11th': 0, '10th': 0, unset: 0 },
  segments: { exam_this_year: 0, all_active: 0, '11th': 0, lower: 0, unset: 0, dormant: 0 },
  mismatch: 0,
  noYear: 0,
  neverSignedIn: 0,
  notSeen14d: 0,
};

export default function TeacherStudents() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const router = useRouter();
  const pathname = usePathname();
  const { activeClassroom, getToken, can, isTeacher, impersonation, startImpersonation } = useNexusAuthContext();

  // can() is fail-closed: an unknown capability, or a payload from before this
  // rollout, returns false. So a stale /api/auth/me hides the controls rather
  // than offering an action the server will refuse.
  //
  // Any teaching staff can set a class or an exam year: data entry after speaking
  // to a student, visible and self-correcting. Only a manager or admin can mark
  // someone dormant, because that removes them from every metric and reminder with
  // nothing on screen turning red. Adding and removing change who holds Nexus
  // access, so they follow the same enrolment capabilities the route enforces.
  const canSetStage = can('coord.student.stage');
  const canSetDormancy = can('coord.student.dormancy');
  const canAddStudents = can('structure.enrollment.add');
  const canRemoveStudents = can('structure.enrollment.remove');

  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [counts, setCounts] = useState<StudentCounts>(EMPTY_COUNTS);
  const [batches, setBatches] = useState<StudentBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  const [examBatches, setExamBatches] = useState<{ code: string }[]>([]);
  // Default 'current' = the current exam-year cohort PLUS any upcoming years
  // (and untagged), so the primary view is the batch the teacher runs now
  // together with students already enrolled for a future batch.
  const [examBatchFilter, setExamBatchFilter] = useState<string>('current');
  const [currentBatch, setCurrentBatch] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; undo?: () => void } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('compact');
  const [sort, setSort] = useState<RosterSort>(DEFAULT_SORT);
  const [filters, setFilters] = useState<RosterFilters>(DEFAULT_FILTERS);
  /** One clock per load, so every row's "Seen 2h ago" agrees. */
  const [now, setNow] = useState(0);

  // The landing filter: the students who actually sit the exam this year. This
  // makes the priority the default daily experience instead of something a
  // teacher has to remember to filter for.
  const [segment, setSegment] = useState<StudentSegment>(DEFAULT_SEGMENT);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Set only by the "N not set" banner, so a manual Select starts empty. */
  const [autoSelectPending, setAutoSelectPending] = useState(false);
  const [drawer, setDrawer] = useState<{ mode: ClassifyMode } | null>(null);
  /** Set when the classify drawer was opened from ONE row's menu, not a selection. */
  const [drawerTargetIds, setDrawerTargetIds] = useState<string[] | null>(null);
  const [removeTarget, setRemoveTarget] = useState<EnrolledStudent | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * A transient narrowing to the students whose class and exam year disagree.
   * Sits alongside the segment rather than inside it, because a mismatch can occur
   * in any segment, and it is always rendered as a removable chip so the narrowing
   * is never invisible.
   */
  const [mismatchOnly, setMismatchOnly] = useState(false);

  const [prefill, setPrefill] = useState<{
    open: boolean;
    loading: boolean;
    suggestions: PrefillSuggestion[];
  }>({ open: false, loading: false, suggestions: [] });
  /** Count only, so the banner can hide the prefill button when there is nothing. */
  const [suggestionCount, setSuggestionCount] = useState(0);

  // Preferences are read AFTER mount, not during render: reading localStorage
  // while rendering a client page produces a hydration mismatch.
  useEffect(() => {
    try {
      const savedView = localStorage.getItem(VIEW_STORAGE_KEY);
      if (savedView === 'compact' || savedView === 'cards' || savedView === 'detailed') {
        setViewMode(savedView);
      }
      const savedSegment = localStorage.getItem(SEGMENT_STORAGE_KEY);
      if (savedSegment && (SEGMENTS as string[]).includes(savedSegment)) {
        setSegment(savedSegment as StudentSegment);
      }
      setSort(parseStoredSort(localStorage.getItem(SORT_STORAGE_KEY)));
      setFilters(parseStoredFilters(localStorage.getItem(FILTERS_STORAGE_KEY)));
    } catch {
      /* localStorage unavailable, keep defaults */
    }
  }, []);

  const handleViewModeChange = useCallback((_e: React.MouseEvent<HTMLElement>, next: ViewMode | null) => {
    if (!next) return; // ignore de-select (a mode is always active)
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* non-fatal */
    }
  }, []);

  const handleSegmentChange = useCallback((next: StudentSegment) => {
    setSegment(next);
    setSelectedIds(new Set());
    try {
      localStorage.setItem(SEGMENT_STORAGE_KEY, next);
    } catch {
      /* non-fatal */
    }
  }, []);

  const handleSortChange = useCallback((next: RosterSort) => {
    setSort(next);
    try {
      localStorage.setItem(SORT_STORAGE_KEY, next);
    } catch {
      /* non-fatal */
    }
  }, []);

  const handleFiltersChange = useCallback((next: RosterFilters) => {
    setFilters(next);
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* non-fatal */
    }
  }, []);

  // Load the exam-year batch list once (for the filter sheet).
  useEffect(() => {
    async function loadExamBatches() {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch('/api/batches', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setExamBatches(data.batches || []);
          if (data.current?.code) setCurrentBatch(data.current.code);
        }
      } catch {
        /* non-fatal */
      }
    }
    loadExamBatches();
  }, [getToken]);

  const fetchStudents = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      // The exam-year cohort filter is deliberately dropped for the two
      // data-hygiene segments. users.academic_year is noisy (one classroom
      // spans NULL, 2025-26, 2026-27, 2027-28 and 2028-29), so leaving it on
      // would hide some of the very students those segments exist to surface,
      // and the pill count would not match the list.
      const cohortFree = segment === 'unset' || segment === 'dormant';
      const examParam = cohortFree ? 'all' : examBatchFilter;

      let url = `/api/students?classroom=${activeClassroom.id}`;
      if (batchFilter) url += `&batch=${batchFilter}`;
      if (examParam && examParam !== 'all') url += `&examBatch=${examParam}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        setNow(Date.now());
        if (data.counts) setCounts({ ...EMPTY_COUNTS, ...data.counts });
        if (data.batches) setBatches(data.batches);
        if (data.currentBatch) setCurrentBatch(data.currentBatch);
      }
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken, batchFilter, examBatchFilter, segment]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Bulk presence for all loaded students
  const { presenceMap } = usePresence(students.map((s) => s.ms_oid));

  // Counts come from the server over the COMPLETE roster; these local ones only
  // exist so the pills stay honest while a request is in flight or if an older
  // payload arrives without them.
  const localCounts = useMemo(() => {
    const facts = students.map((s) => ({
      stage: stageKeyOf(s.study_stage),
      dormant: s.participation_status === 'dormant',
    }));
    return { segments: segmentCounts(facts), stage: stageCounts(facts) };
  }, [students]);

  const segmentTotals = counts.segments ?? localCounts.segments;
  /**
   * Non-dormant students with no class, which is `segments.unset` rather than
   * `stage.unset`: a dormant student cannot be prioritised or targeted anyway, so
   * the smaller number is the actionable one and it matches the pill.
   */
  const unsetTotal = segmentTotals.unset ?? localCounts.segments.unset;

  // Never land on an empty list. A remembered segment can legitimately go to
  // zero between visits, and restoring it would show a teacher an empty screen
  // with no clue that 28 students are one tap away.
  useEffect(() => {
    if (loading || counts.total === 0) return;
    // While reviewing mismatches the segment is not what is on screen, so moving
    // it would silently drop the review the moment the last one was fixed.
    if (mismatchOnly) return;
    if (segmentTotals[segment] > 0) return;
    const fallback =
      segmentTotals[DEFAULT_SEGMENT] > 0
        ? DEFAULT_SEGMENT
        : SEGMENTS.find((s) => segmentTotals[s] > 0);
    if (fallback && fallback !== segment) handleSegmentChange(fallback);
  }, [loading, counts.total, segmentTotals, segment, handleSegmentChange, mismatchOnly]);

  const trimmedQuery = searchQuery.trim();

  // A typed name searches the WHOLE roster, ranked by closeness, and keeps that
  // relevance order. Browsing uses the chosen sort. The sign-in and account
  // filters apply either way, and always show as chips, so a narrowed list is
  // never a mystery.
  const visibleStudents = useMemo(() => {
    let rows: EnrolledStudent[];
    if (trimmedQuery && !mismatchOnly) {
      rows = rankPeople(students, trimmedQuery);
    } else {
      rows = students.filter((s) => {
        if (mismatchOnly) return s.pair_status === 'mismatch';
        return matchesSegment(
          { stage: stageKeyOf(s.study_stage), dormant: s.participation_status === 'dormant' },
          segment,
        );
      });
      if (trimmedQuery) rows = rankPeople(rows, trimmedQuery);
    }
    rows = rows.filter((s) => matchesFilters(s, filters, now));
    return trimmedQuery ? rows : sortStudents(rows, sort);
  }, [students, segment, trimmedQuery, mismatchOnly, filters, sort, now]);

  // Offered only when the search found nobody, so a near miss is one tap away.
  const searchSuggestions = useMemo(
    () => (trimmedQuery && visibleStudents.length === 0 ? suggestPeople(students, trimmedQuery) : []),
    [students, trimmedQuery, visibleStudents.length],
  );

  const duplicateCount = useMemo(
    () => students.filter((s) => !s.ms_oid && s.possible_duplicate_of).length,
    [students],
  );
  const withoutMicrosoft = useMemo(() => students.filter((s) => !s.ms_oid).length, [students]);
  const filtersActive = activeFilterCount(filters) > 0;

  const headerCaption = [
    `${counts.tracked} tracked`,
    counts.dormant > 0 ? `${counts.dormant} dormant` : null,
    withoutMicrosoft > 0 ? `${withoutMicrosoft} without Microsoft` : null,
    currentBatch ? `Batch ${currentBatch}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const copyEmail = useCallback((email: string) => {
    navigator.clipboard?.writeText(email).then(
      () => setSnackbar({ message: `Copied ${email}` }),
      () => setSnackbar({ message: 'Could not copy the email' }),
    );
  }, []);

  const viewAsStudent = useCallback(
    async (student: EnrolledStudent) => {
      try {
        await startImpersonation(student.id, { reason: `Student list: ${student.name}`, returnUrl: pathname });
        router.push('/student/dashboard');
      } catch (err) {
        setSnackbar({ message: err instanceof Error ? err.message : 'Could not open the student view' });
      }
    },
    [startImpersonation, pathname, router],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setAutoSelectPending(false);
  }, []);

  const openClassifyFor = useCallback((mode: ClassifyMode, student: EnrolledStudent) => {
    setDrawerTargetIds([student.id]);
    setDrawer({ mode });
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawer(null);
    setDrawerTargetIds(null);
  }, []);

  /** One tap from the "N not set" row to about-to-fix-them-all. */
  const startFixingUnset = useCallback(() => {
    setMismatchOnly(false);
    handleSegmentChange('unset');
    setSelectMode(true);
    setAutoSelectPending(true);
  }, [handleSegmentChange]);

  /**
   * Review the students whose class and exam year contradict each other. Forces
   * the cohort filter to "all" first, because the mismatch count is computed inside
   * the cohort filter and a student parked on a past year is otherwise not loaded.
   */
  const reviewMismatches = useCallback(() => {
    setExamBatchFilter('all');
    setMismatchOnly(true);
    setSelectMode(true);
    setAutoSelectPending(true);
  }, []);

  /** The students with a class but no cohort. */
  const startFixingYears = useCallback(() => {
    setMismatchOnly(false);
    setExamBatchFilter('none');
    handleSegmentChange('all_active');
    setSelectMode(true);
    setAutoSelectPending(true);
  }, [handleSegmentChange]);

  const loadSuggestions = useCallback(
    async (openSheet: boolean) => {
      if (!activeClassroom) return;
      if (openSheet) setPrefill((p) => ({ ...p, open: true, loading: true }));
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(
          `/api/students/classification/suggestions?classroom=${activeClassroom.id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          setSuggestionCount(0);
          if (openSheet) setPrefill({ open: true, loading: false, suggestions: [] });
          return;
        }
        const data = await res.json();
        const suggestions = (data.suggestions || []) as PrefillSuggestion[];
        setSuggestionCount(suggestions.length);
        if (openSheet) setPrefill({ open: true, loading: false, suggestions });
      } catch {
        setSuggestionCount(0);
        if (openSheet) setPrefill({ open: true, loading: false, suggestions: [] });
      }
    },
    [activeClassroom, getToken],
  );

  // Probe for suggestions in the background so the attention card knows whether
  // to offer the button at all. Only worth asking when something is missing.
  useEffect(() => {
    if (!canSetStage) return;
    if (unsetTotal <= 0 && counts.noYear <= 0) {
      setSuggestionCount(0);
      return;
    }
    loadSuggestions(false);
  }, [canSetStage, unsetTotal, counts.noYear, loadSuggestions]);

  // Selecting everyone has to wait for the segment switch and the refetch to
  // land, so it runs off the rendered list rather than being folded into the
  // action that asked for it.
  //
  // Gated on the flag, NOT just on being in select mode: a manager who taps
  // "Select" themselves must start from an EMPTY selection, because the very next
  // control is "Mark dormant" and silently pre-selecting the whole segment turns
  // one tap into a bulk change nobody asked for.
  useEffect(() => {
    if (!autoSelectPending) return;
    if (loading || !visibleStudents.length) return;
    setSelectedIds(new Set(visibleStudents.map((s) => s.id)));
    setAutoSelectPending(false);
  }, [autoSelectPending, loading, visibleStudents]);

  interface ClassifyPayload {
    studyStage?: StageKey | null;
    academicYear?: string | null;
    participationStatus?: 'active' | 'dormant';
    reason?: string;
  }

  interface Assignment {
    studentId: string;
    studyStage?: string | null;
    academicYear?: string | null;
  }

  /**
   * One writer for both request shapes.
   *
   * `payload` + ids applies the same value to many students (the bulk-fix gesture,
   * or one row's menu). `assignments` applies a different value per student, which
   * is what the application-form prefill produces. The API accepts exactly one.
   */
  const applyClassification = useCallback(
    async (
      payload: ClassifyPayload,
      ids?: string[],
      silent = false,
      assignments?: Assignment[],
    ) => {
      if (!activeClassroom) return;
      const studentIds = ids ?? Array.from(selectedIds);
      if (!assignments && !studentIds.length) return;
      if (assignments && !assignments.length) return;

      setSaving(true);
      try {
        const token = await getToken();
        if (!token) return;

        const body = assignments
          ? { classroomId: activeClassroom.id, assignments }
          : { classroomId: activeClassroom.id, studentIds, ...payload };

        const res = await fetch('/api/students/classification', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok) {
          setSnackbar({ message: data?.error || 'Could not update those students' });
          return;
        }

        closeDrawer();
        setPrefill({ open: false, loading: false, suggestions: [] });
        exitSelectMode();
        await fetchStudents();

        if (silent) return;

        const skipped = (data.skipped || []).length;
        const what = assignments
          ? 'Filled in'
          : payload.participationStatus === 'dormant'
            ? 'Marked dormant'
            : payload.participationStatus === 'active'
              ? 'Brought back'
              : describeFieldChange(payload);
        const message = skipped
          ? `${what} for ${data.updated}. ${skipped} skipped (not in this classroom).`
          : `${what} for ${data.updated} student${data.updated === 1 ? '' : 's'}.`;

        // Undo rebuilds from EACH student's own `previous`, not from the first
        // one's. A prefill applies different values per student, so reverting them
        // all to the first student's old class would be worse than no undo at all.
        const returned = (data.students || []) as Array<{
          id: string;
          previous: Record<string, unknown>;
        }>;

        let undo: (() => void) | undefined;
        if (returned.length) {
          const touchedParticipation = returned.some((r) => 'participation_status' in (r.previous || {}));
          if (touchedParticipation) {
            // Participation is uniform by construction (the API refuses it per
            // student), so the flat shape is correct and is the only one that can
            // carry the required reason.
            const first = returned[0]?.previous || {};
            const revert: ClassifyPayload = {
              participationStatus: (first.participation_status as 'active' | 'dormant') ?? 'active',
            };
            if (revert.participationStatus === 'dormant') revert.reason = 'Undo';
            undo = () => applyClassification(revert, returned.map((r) => r.id), true);
          } else {
            const revertAssignments: Assignment[] = returned.map((r) => ({
              studentId: r.id,
              ...('study_stage' in (r.previous || {})
                ? { studyStage: (r.previous.study_stage as string | null) ?? null }
                : {}),
              ...('academic_year' in (r.previous || {})
                ? { academicYear: (r.previous.academic_year as string | null) ?? null }
                : {}),
            }));
            // The API rejects an assignment with no fields, so drop any student
            // whose previous state held nothing we touched.
            const usable = revertAssignments.filter((a) => 'studyStage' in a || 'academicYear' in a);
            if (usable.length) undo = () => applyClassification({}, undefined, true, usable);
          }
        }

        setSnackbar({ message, undo });
      } catch (err) {
        console.error('Classification failed:', err);
        setSnackbar({ message: 'Could not update those students' });
      } finally {
        setSaving(false);
      }
    },
    [activeClassroom, getToken, selectedIds, exitSelectMode, fetchStudents, closeDrawer],
  );

  /** Who the classify drawer is about: one row's student from its menu, or the selection. */
  const drawerNames = useMemo(() => {
    const ids = new Set(drawerTargetIds ?? Array.from(selectedIds));
    return students.filter((s) => ids.has(s.id)).map((s) => s.name);
  }, [students, selectedIds, drawerTargetIds]);

  /**
   * Selectable exam years for the drawer. The registry plus whatever the roster
   * already carries, so a cohort that exists on students but has no batch row is
   * still pickable rather than silently unavailable.
   */
  const examYears = useMemo(() => {
    const codes = new Set<string>(examBatches.map((b) => b.code));
    for (const student of students) {
      if (student.exam_batch) codes.add(student.exam_batch);
    }
    if (currentBatch) codes.add(currentBatch);
    return Array.from(codes).sort().reverse();
  }, [examBatches, students, currentBatch]);

  /**
   * Each attention row defines its own view, so a leftover search or sign-in
   * filter cannot make "14 have no class set" open a list of three.
   */
  const handleAttentionAction = useCallback(
    (key: AttentionActionKey) => {
      setSearchQuery('');
      switch (key) {
        case 'review_mismatches':
          handleFiltersChange({ ...DEFAULT_FILTERS });
          reviewMismatches();
          break;
        case 'fix_stages':
          handleFiltersChange({ ...DEFAULT_FILTERS });
          startFixingUnset();
          break;
        case 'fix_years':
          handleFiltersChange({ ...DEFAULT_FILTERS });
          startFixingYears();
          break;
        case 'prefill':
          loadSuggestions(true);
          break;
        case 'show_never_signed_in':
          setMismatchOnly(false);
          handleSegmentChange('all_active');
          handleFiltersChange({ signIn: 'never', account: 'any' });
          break;
        case 'review_duplicates':
          setMismatchOnly(false);
          setExamBatchFilter('all');
          handleSegmentChange('all_active');
          handleFiltersChange({ signIn: 'any', account: 'possible_duplicate' });
          break;
      }
    },
    [handleFiltersChange, reviewMismatches, startFixingUnset, startFixingYears, loadSuggestions, handleSegmentChange],
  );

  /** One student's actions, each shown only to someone the server would allow. */
  const menuItemsFor = useCallback(
    (student: EnrolledStudent): RowMenuItem[] => {
      const dormant = student.participation_status === 'dormant';
      const items: RowMenuItem[] = [
        {
          key: 'open',
          label: 'Open profile',
          icon: <PersonOutlineIcon fontSize="small" />,
          onClick: () => router.push(`/teacher/students/${student.id}`),
        },
      ];
      if (student.email) {
        const email = student.email;
        items.push({
          key: 'copy',
          label: 'Copy email',
          icon: <ContentCopyOutlinedIcon fontSize="small" />,
          onClick: () => copyEmail(email),
        });
      }
      // Same rule as ViewAsStudentButton, and only for someone who can sign in.
      if (isTeacher && !impersonation.active && student.ms_oid) {
        items.push({
          key: 'view-as',
          label: 'View as student',
          icon: <VisibilityOutlinedIcon fontSize="small" />,
          onClick: () => viewAsStudent(student),
        });
      }
      if (canSetStage) {
        items.push({
          key: 'classify',
          label: 'Set class and exam year',
          icon: <EditOutlinedIcon fontSize="small" />,
          onClick: () => openClassifyFor('stage', student),
          dividerBefore: true,
        });
      }
      if (canSetDormancy) {
        items.push(
          dormant
            ? {
                key: 'reactivate',
                label: 'Bring back',
                icon: <ReplayOutlinedIcon fontSize="small" />,
                onClick: () => openClassifyFor('reactivate', student),
                dividerBefore: !canSetStage,
              }
            : {
                key: 'dormant',
                label: 'Mark dormant',
                icon: <DormantIcon fontSize="small" />,
                onClick: () => openClassifyFor('dormant', student),
                tone: 'warning',
                dividerBefore: !canSetStage,
              },
        );
      }
      if (canRemoveStudents && student.enrollment_id) {
        items.push({
          key: 'remove',
          label: 'Remove from class',
          icon: <PersonRemoveOutlinedIcon fontSize="small" />,
          onClick: () => setRemoveTarget(student),
          tone: 'error',
          dividerBefore: true,
        });
      }
      return items;
    },
    [
      router,
      copyEmail,
      isTeacher,
      impersonation.active,
      viewAsStudent,
      canSetStage,
      canSetDormancy,
      canRemoveStudents,
      openClassifyFor,
    ],
  );

  const fabVisible = canAddStudents && !selectMode && !!activeClassroom;
  const examYearLocked = segment === 'unset' || segment === 'dormant';

  const emptyTitle = trimmedQuery
    ? `No student matches "${trimmedQuery}"`
    : filtersActive
      ? 'No students match these filters'
      : segment === 'dormant'
        ? 'Nobody is marked dormant'
        : segment === 'unset'
          ? 'Every student has a study stage'
          : `No students in ${SEGMENT_LABEL[segment]}`;

  return (
    <Box sx={{ pb: selectMode ? 12 : fabVisible ? { xs: 9, sm: 0 } : 0 }}>
      {/* Header: what the numbers count, and the page's two actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: '1 1 200px' }}>
          <PeopleOutlinedIcon aria-hidden sx={{ fontSize: 20, color: 'primary.main', mr: 0.75, flexShrink: 0 }} />
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
            {loading && !students.length ? 'Loading students' : headerCaption}
          </Typography>
          <Tooltip
            title="Tracked students count in attendance, submissions, prep readiness and the watchlist. Dormant students are left out of all of those. A student without a Microsoft account cannot sign in to Nexus yet."
            arrow
            enterTouchDelay={0}
            leaveTouchDelay={5000}
          >
            <IconButton
              aria-label="What these numbers mean"
              sx={{ width: 48, height: 48, flexShrink: 0, color: 'text.secondary' }}
            >
              <InfoOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
          {canSetStage && !selectMode && (
            <Button
              startIcon={<ChecklistOutlinedIcon />}
              onClick={() => setSelectMode(true)}
              sx={{ minHeight: 48, fontWeight: 700 }}
            >
              Select
            </Button>
          )}
          {selectMode && (
            <Button onClick={exitSelectMode} sx={{ minHeight: 48, fontWeight: 700 }}>
              Done
            </Button>
          )}
          {fabVisible && (
            <Button
              variant="contained"
              startIcon={<PersonAddAltOutlinedIcon />}
              onClick={() => setAddOpen(true)}
              sx={{ display: { xs: 'none', sm: 'inline-flex' }, minHeight: 48, fontWeight: 700 }}
            >
              Add student
            </Button>
          )}
        </Box>
      </Box>

      {/* Sticky: search, categories, then how the list is narrowed and ordered */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          pt: 0.5,
          pb: 1,
          mb: 1,
          bgcolor: (t) => (t.palette.mode === 'light' ? '#FAFAFA' : t.palette.background.default),
        }}
      >
        <TextField
          fullWidth
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          sx={{
            mb: 1,
            '& .MuiOutlinedInput-root': { borderRadius: 2.5, bgcolor: 'background.paper', minHeight: 48 },
          }}
          // 16px stops iOS zooming the page when the field takes focus.
          inputProps={{ 'aria-label': 'Search students', style: { fontSize: 16 } }}
        />
        {trimmedQuery && !mismatchOnly && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.5, mb: 1 }}>
            Searching every student in this classroom, in all categories.
          </Typography>
        )}

        <Box sx={{ mb: 1 }}>
          <StudentSegmentBar value={segment} counts={segmentTotals} onChange={handleSegmentChange} />
        </Box>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <StudentFilterSheet
            filters={filters}
            examBatchFilter={examBatchFilter}
            batchFilter={batchFilter}
            onFiltersChange={handleFiltersChange}
            onExamBatchFilterChange={setExamBatchFilter}
            onBatchFilterChange={setBatchFilter}
            examBatches={examBatches}
            examYearLocked={examYearLocked}
            batches={batches}
          />
          <StudentSortMenu value={sort} onChange={handleSortChange} />

          {/* Density switch: dense scan list / avatar cards / roomy rows */}
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            size="small"
            aria-label="Student list layout"
            sx={{
              ml: 'auto',
              bgcolor: 'background.paper',
              borderRadius: 2,
              '& .MuiToggleButton-root': {
                minWidth: 44,
                minHeight: 48,
                px: 1.25,
                borderRadius: 2,
                color: 'text.secondary',
              },
              '& .Mui-selected': {
                bgcolor: (t) => alpha(t.palette.primary.main, 0.14),
                color: 'primary.main',
                '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.2) },
              },
            }}
          >
            <ToggleButton value="compact" aria-label="Compact list">
              <Tooltip title="Compact" arrow>
                <DensitySmallOutlinedIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="cards" aria-label="Card grid">
              <Tooltip title="Cards" arrow>
                <GridViewOutlinedIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="detailed" aria-label="Detailed rows">
              <Tooltip title="Detailed" arrow>
                <ViewAgendaOutlinedIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <ActiveFilterChips
          filters={filters}
          examBatchFilter={examBatchFilter}
          batchFilter={batchFilter}
          onFiltersChange={handleFiltersChange}
          onExamBatchFilterChange={setExamBatchFilter}
          onBatchFilterChange={setBatchFilter}
          batches={batches}
        />
      </Box>

      {mismatchOnly && (
        <Box sx={{ mb: 1.5 }}>
          <Chip
            label={`Showing ${visibleStudents.length} that need a year check`}
            onDelete={() => {
              setMismatchOnly(false);
              exitSelectMode();
            }}
            color="warning"
            sx={{ fontWeight: 700, minHeight: 40 }}
          />
        </Box>
      )}

      {!loading && !mismatchOnly && !selectMode && (
        <Box sx={{ mb: 1.5 }}>
          <NeedsAttentionCard
            // A row whose list is already on screen only costs vertical space.
            duplicateCount={filters.account === 'possible_duplicate' ? 0 : duplicateCount}
            mismatchCount={counts.mismatch}
            neverSignedInCount={filters.signIn === 'never' ? 0 : counts.neverSignedIn}
            noStageCount={segment === 'unset' ? 0 : unsetTotal}
            noYearCount={counts.noYear}
            suggestionCount={suggestionCount}
            canEdit={canSetStage}
            onAction={handleAttentionAction}
          />
        </Box>
      )}

      {/* Student List */}
      {loading ? (
        <StudentListSkeleton viewMode={viewMode} />
      ) : visibleStudents.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderRadius: 2, borderStyle: 'dashed' }}>
          <PeopleOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {emptyTitle}
          </Typography>
          {trimmedQuery && searchSuggestions.length > 0 ? (
            <Box
              sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', alignItems: 'center' }}
            >
              <Typography variant="body2" color="text.secondary">
                Did you mean
              </Typography>
              {searchSuggestions.map((suggestion) => (
                <Chip
                  key={suggestion.id}
                  label={suggestion.name}
                  onClick={() => setSearchQuery(suggestion.name)}
                  sx={{ height: 'auto', minHeight: 48, px: 1, fontWeight: 600, borderRadius: 6 }}
                />
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {trimmedQuery
                ? 'Try part of the first name, or the email.'
                : filtersActive
                  ? 'Clear the filters to see everyone in this category.'
                  : segment === 'exam_this_year'
                    ? 'Break Year and Class 12 students appear here once their stage is set.'
                    : 'Try another category, or All active to see everyone.'}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap', mt: 1.5 }}>
            {trimmedQuery && examBatchFilter !== 'all' && (
              <Button onClick={() => setExamBatchFilter('all')} sx={{ minHeight: 48, fontWeight: 700 }}>
                Search every exam year
              </Button>
            )}
            {filtersActive && (
              <Button onClick={() => handleFiltersChange({ ...DEFAULT_FILTERS })} sx={{ minHeight: 48, fontWeight: 700 }}>
                Clear filters
              </Button>
            )}
          </Box>
        </Paper>
      ) : (
        <Box
          role={selectMode ? 'listbox' : undefined}
          aria-multiselectable={selectMode || undefined}
          sx={
            viewMode === 'cards'
              ? { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.5 }
              : { display: 'flex', flexDirection: 'column', gap: viewMode === 'compact' ? 1 : 1.5 }
          }
        >
          {visibleStudents.map((student) => {
            const checklistPct = student.checklist.total > 0
              ? Math.round((student.checklist.completed / student.checklist.total) * 100)
              : 0;
            const attColor = student.attendance.percentage >= 75 ? theme.palette.success.main : theme.palette.warning.main;
            const doneColor = checklistPct >= 50 ? theme.palette.info.main : theme.palette.text.disabled;
            const presenceStatus = student.ms_oid ? presenceMap[student.ms_oid]?.availability : undefined;

            const rowProps = {
              student,
              checklistPct,
              attColor,
              doneColor,
              presenceStatus,
              currentBatch,
              isMobile,
              now,
              selectMode,
              selected: selectedIds.has(student.id),
              onToggleSelect: () => toggleSelect(student.id),
              onOpen: () => router.push(`/teacher/students/${student.id}`),
              actions: <StudentRowMenu title={student.name} items={menuItemsFor(student)} />,
            };

            if (viewMode === 'compact') return <CompactRow key={student.id} {...rowProps} />;
            if (viewMode === 'cards') return <StudentCard key={student.id} {...rowProps} />;
            return <DetailedRow key={student.id} {...rowProps} />;
          })}
        </Box>
      )}

      {selectMode && (
        <BulkSelectBar
          selectedCount={selectedIds.size}
          visibleCount={visibleStudents.length}
          canClassify={canSetStage}
          canSetDormancy={canSetDormancy}
          onSelectAll={() => setSelectedIds(new Set(visibleStudents.map((s) => s.id)))}
          onClear={() => setSelectedIds(new Set())}
          onSetStage={() => setDrawer({ mode: 'stage' })}
          onMarkDormant={() => setDrawer({ mode: 'dormant' })}
          onReactivate={() => setDrawer({ mode: 'reactivate' })}
          showReactivate={segment === 'dormant'}
        />
      )}

      {fabVisible && (
        <Fab
          color="primary"
          aria-label="Add student"
          onClick={() => setAddOpen(true)}
          sx={{
            display: { xs: 'flex', sm: 'none' },
            position: 'fixed',
            // Clears the mobile bottom navigation, like every other Nexus FAB.
            bottom: 'calc(80px + env(safe-area-inset-bottom))',
            right: 16,
          }}
        >
          <PersonAddAltOutlinedIcon />
        </Fab>
      )}

      <ClassifyDrawer
        open={!!drawer}
        mode={drawer?.mode ?? 'stage'}
        names={drawerNames}
        busy={saving}
        examYears={examYears}
        currentBatch={currentBatch}
        onClose={closeDrawer}
        onApply={(payload) => applyClassification(payload, drawerTargetIds ?? undefined)}
      />

      <PrefillReviewSheet
        open={prefill.open}
        loading={prefill.loading}
        busy={saving}
        suggestions={prefill.suggestions}
        onClose={() => setPrefill({ open: false, loading: false, suggestions: [] })}
        onApply={(assignments) => applyClassification({}, undefined, false, assignments)}
      />

      {activeClassroom && removeTarget?.enrollment_id && (
        <RemoveStudentDialog
          open
          onClose={() => setRemoveTarget(null)}
          students={[
            {
              enrollmentId: removeTarget.enrollment_id,
              userId: removeTarget.id,
              name: removeTarget.name,
              email: removeTarget.email,
              avatar_url: removeTarget.avatar_url,
            },
          ]}
          classroomId={activeClassroom.id}
          getToken={getToken}
          onRemoved={() => {
            setSnackbar({ message: `Removed ${removeTarget.name} from this class` });
            fetchStudents();
          }}
        />
      )}

      {activeClassroom && canAddStudents && (
        <AddStudentSheet
          open={addOpen}
          onClose={() => setAddOpen(false)}
          classroomId={activeClassroom.id}
          getToken={getToken}
          onEnrolled={fetchStudents}
        />
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={snackbar?.undo ? 8000 : 2500}
        onClose={() => setSnackbar(null)}
        message={snackbar?.message}
        action={
          snackbar?.undo ? (
            <Button
              size="small"
              color="secondary"
              onClick={() => {
                snackbar.undo?.();
                setSnackbar(null);
              }}
            >
              Undo
            </Button>
          ) : undefined
        }
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          // Above the bottom navigation and the Add button on a phone.
          bottom: { xs: selectMode ? 96 : fabVisible ? 148 : 88, md: selectMode ? 96 : 24 },
          '& .MuiSnackbarContent-root': {
            minWidth: 'auto',
            borderRadius: 2,
            fontSize: '0.85rem',
          },
        }}
      />
    </Box>
  );
}
```

- [ ] **Step 2: Delete the old banner**

`ClassYearIssues.tsx` has no other importer (checked with a grep for `ClassYearIssues` across `apps/nexus/src`). Delete it:

```bash
git rm apps/nexus/src/components/students/ClassYearIssues.tsx
```

If `git rm` is unavailable because the file is untracked, delete it with the file tools instead.

- [ ] **Step 3: Check for leftovers**

Run a grep for `CopyEmailButton` across `apps/nexus/src`. If nothing imports it any more, delete `apps/nexus/src/components/students/CopyEmailButton.tsx` as well.

- [ ] **Step 4: Type-check, lint, unit tests**

Run: `pnpm --filter @neram/nexus type-check`
Expected: exit code 0.
Run: `pnpm --filter @neram/nexus lint`
Expected: exit code 0, no new warnings in the touched files.
Run: `pnpm test:run apps/nexus/src/components/students apps/nexus/src/lib/student-roster-view.test.ts apps/nexus/src/lib/roster-duplicates.test.ts apps/nexus/src/lib/student-attention.test.ts`
Expected: PASS, including `student-name-face.test.ts`.

- [ ] **Step 5: Commit (only if the user has asked for commits)**

```bash
git add "apps/nexus/src/app/(teacher)/teacher/students/page.tsx" apps/nexus/src/components/students
git commit -m "feat(nexus): students roster with sort, filters, row menu and add sheet"
```

---

### Task 10: End-to-end checks at 375px

**Files:**
- Create: `tests/e2e/students-roster-nexus.spec.ts`
- Modify: `tests/e2e/student-stage-nexus-mobile.spec.ts` (the banner test)

**Interfaces:**
- Consumes: accessible names from Tasks 4 to 9: `Sort: <label>`, `Filters`, dialog `Filter students`, radio `Never signed in`, chip `Never signed in`, `Actions for <name>`, menuitem `Open profile`, FAB `Add student`, dialog `Add student`, tabs `Create account` and `Existing Microsoft account`, region `Needs attention`.

- [ ] **Step 1: Write the roster spec**

Create `tests/e2e/students-roster-nexus.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

/**
 * The redesigned Students roster at 375px: sign-in status, sort, filters, the row
 * menu and the Add student sheet.
 *
 * Read-only. Local dev writes to the production database, so nothing here marks
 * anyone dormant, removes, adds or reclassifies a student. Menus and sheets are
 * opened and dismissed, never acted on.
 */

const NEXUS = APP_URLS.nexus;
const SEARCH_PLACEHOLDER = 'Search by name or email...';

test.use({ viewport: { width: 375, height: 812 } });

function studentRows(page: Page) {
  return page.locator('[role="button"]').filter({ hasText: /@/ });
}

async function fitsWidth(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

test.describe('Students roster', () => {
  // A cold /teacher/students compile alone can outlast the 30s default.
  test.describe.configure({ timeout: 120_000 });

  let classroomId: string | null = null;
  let token: string | null = null;

  test.beforeAll(async ({ request }) => {
    await request.get(`${NEXUS}/teacher/students`, { timeout: 110_000 }).catch(() => null);
    const auth = await getTestAuthToken(request, 'teacher');
    classroomId = auth?.classrooms?.[0]?.id ?? null;
    token = auth?.testToken ?? null;
  });

  test('the payload carries sign-in dates, the enrollment id and duplicate flags', async ({ request }) => {
    test.skip(!classroomId || !token, 'Nexus test-login unavailable');
    const res = await request.get(`${NEXUS}/api/students?classroom=${classroomId}&examBatch=all`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.counts.neverSignedIn).toBe('number');
    expect(typeof body.counts.notSeen14d).toBe('number');
    for (const student of body.students) {
      expect(typeof student.enrollment_id).toBe('string');
      expect(student).toHaveProperty('first_signed_in_at');
      expect(student).toHaveProperty('last_seen_at');
      expect(student).toHaveProperty('possible_duplicate_of');
    }
  });

  test.describe('on a phone', () => {
    test.beforeEach(async ({ page }) => {
      const ok = await injectAuthForPage(page, 'teacher');
      test.skip(!ok, 'Nexus test-login unavailable');
      await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible({ timeout: 60_000 });
      await expect(studentRows(page).first()).toBeVisible({ timeout: 60_000 });
    });

    test('a row says whether the student uses Nexus', async ({ page }) => {
      await expect(studentRows(page).first()).toContainText(/Never signed in|Seen |No Microsoft account/);
    });

    test('the sort choice sticks across a reload', async ({ page }) => {
      await page.getByRole('button', { name: /^Sort: / }).click();
      await page.getByRole('menuitem', { name: 'Newest joined' }).click();
      await expect(page.getByRole('button', { name: 'Sort: Newest joined' })).toBeVisible();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: 'Sort: Newest joined' })).toBeVisible({ timeout: 60_000 });
    });

    test('a sign-in filter narrows the list and shows as a removable chip', async ({ page }) => {
      await page.getByRole('button', { name: 'Filters' }).click();
      const sheet = page.getByRole('dialog', { name: 'Filter students' });
      await sheet.getByRole('radio', { name: 'Never signed in' }).check();
      await sheet.getByRole('button', { name: 'Done' }).click();

      const chip = page.getByRole('button', { name: 'Never signed in', exact: true });
      await expect(chip).toBeVisible();

      const rows = studentRows(page);
      const count = await rows.count();
      if (count === 0) {
        await expect(page.getByText('No students match these filters')).toBeVisible();
      }
      for (let i = 0; i < Math.min(count, 5); i++) {
        await expect(rows.nth(i)).toContainText('Never signed in');
      }

      await chip.locator('.MuiChip-deleteIcon').click();
      await expect(chip).toHaveCount(0);
    });

    test('the row menu opens at a 48px target without navigating', async ({ page }) => {
      const menuButton = page.getByRole('button', { name: /^Actions for / }).first();
      const box = await menuButton.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
      expect(box!.width).toBeGreaterThanOrEqual(48);

      await menuButton.click();
      await expect(page.getByRole('menuitem', { name: 'Open profile' })).toBeVisible();
      await expect(page).toHaveURL(/\/teacher\/students(\?.*)?$/);
      expect(await fitsWidth(page)).toBe(true);

      await page.keyboard.press('Escape');
      await expect(page.getByRole('menuitem', { name: 'Open profile' })).toHaveCount(0);
    });

    test('Add student opens one sheet with both routes', async ({ page }) => {
      const fab = page.getByRole('button', { name: 'Add student' });
      test.skip((await fab.count()) === 0, 'The test account cannot add students');

      await fab.click();
      const sheet = page.getByRole('dialog', { name: 'Add student' });
      await expect(sheet.getByRole('tab', { name: 'Create account' })).toBeVisible();
      await expect(sheet.getByRole('tab', { name: 'Existing Microsoft account' })).toBeVisible();
      expect(await fitsWidth(page)).toBe(true);

      await sheet.getByRole('button', { name: 'Close' }).click();
      await expect(sheet).toHaveCount(0);
    });

    test('the attention card collapses and keeps the page inside 375px', async ({ page }) => {
      const card = page.getByRole('region', { name: 'Needs attention' });
      test.skip((await card.count()) === 0, 'Nothing on this roster needs attention');

      const toggle = card.getByRole('button', { name: /^Needs attention \(/ });
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(await fitsWidth(page)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Point the banner test at the attention card**

In `tests/e2e/student-stage-nexus-mobile.spec.ts`, replace the test `the issues banner stacks its rows without pushing the page sideways` with:

```ts
  test('the attention card stacks its rows without pushing the page sideways', async ({ page }) => {
    // Wait for the roster to land FIRST. The card only renders once counts have
    // arrived, and `count()` does not auto-wait.
    await expect(studentRows(page).first()).toBeVisible({ timeout: 15000 });

    const card = page.getByRole('region', { name: 'Needs attention' });
    if ((await card.count()) === 0) {
      test.skip(true, 'This classroom has nothing that needs attention');
    }

    await expect(card).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);

    // Every action in the card stays a real touch target.
    const actions = card.getByRole('button');
    for (let i = 0; i < (await actions.count()); i++) {
      const box = await actions.nth(i).boundingBox();
      expect(box, `card action ${i} has no box`).toBeTruthy();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
```

- [ ] **Step 3: Run the specs**

The Nexus dev server must be running on port 3012 (never `next build` while it runs).

Run: `PW_APPS=nexus pnpm test:e2e tests/e2e/students-roster-nexus.spec.ts tests/e2e/students-search-nexus.spec.ts --project=nexus-chrome --no-deps`
Expected: all pass (skips only with their stated reason).
Run: `PW_APPS=nexus pnpm test:e2e tests/e2e/student-stage-nexus-mobile.spec.ts tests/e2e/student-stage-nexus.spec.ts --project=nexus-chrome --no-deps`
Expected: the UI tests pass. Do NOT let the API write tests in `student-stage-nexus.spec.ts` run against production without the user's go; run only the `UI:` tests with `-g "UI:"`.

- [ ] **Step 4: Commit (only if the user has asked for commits)**

```bash
git add tests/e2e/students-roster-nexus.spec.ts tests/e2e/student-stage-nexus-mobile.spec.ts
git commit -m "test(nexus): e2e for the redesigned students roster"
```

---

## Execution notes (2026-09-11)

Executed inline. Where the code differs from the blocks above, the code is right:

1. `shortDate` builds "18 Aug" from IST date parts and a fixed month list, because ICU builds disagree on "Sep" versus "Sept". A test pins the IST day boundary.
2. `parseStoredFilters` accepts only own keys of the label maps, so a stored `"toString"` cannot pass as a choice.
3. `NeedsAttentionCard` is a `section` labelled "Needs attention" (a region), which the mobile E2E spec targets.
4. `StudentSortMenu` shows only "Sort" on phones so Filters, Sort and the layout switch fit 375px; the accessible name always carries the current order.
5. The filter sheet and the Add sheet put `role="dialog"` on the drawer paper, so their footer buttons are inside the dialog.
6. Row menu actions, the compact row status line and the attention card shipped as planned; Phase 3 then added Create Microsoft account and Reset password to the same menu (see the Phase 3 plan).
7. `AvailableStudentsSection` in the sheet has its own Refresh button, and its "directory unavailable" copy no longer points at a button that is not on this screen.
8. Verification: 27 new unit tests plus the Task 1 suite (21); full Nexus suite 4069 passed at the end of Phase 2; type-check and lint clean.