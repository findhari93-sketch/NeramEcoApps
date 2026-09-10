# Nexus Students Phase 1 (bug fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Nexus Students page find students despite spelling variants, stop "Add" from creating duplicate student records, hide past students from "Not yet in class", and repair Afrin's duplicate in production.

**Architecture:** A new lowest `FUZZY` tier in the shared pure ranker (`people-search.ts`) powers roster search and "Did you mean". Directory enrollment moves behind a pure resolver (`directory-enrollment.ts`) with an injected store, so the order "link, reconcile, ask, create" is unit-tested and the route returns `409 possible_duplicate` instead of inserting a second row. The directory route splits past students out with pure helpers in `org-directory.ts`.

**Tech Stack:** Next.js 14 App Router, MUI via `@neram/ui`, Supabase (service client), Microsoft Graph app-only, Vitest + React Testing Library 14 (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-nexus-students-management-design.md` (Phase 1 sections 1.1 to 1.4)

## Global Constraints

- User-visible strings (labels, messages, errors) never contain em dashes, double dashes or `&mdash;`. Use commas, colons, periods or parentheses.
- Scope: `apps/nexus/**` and `tests/e2e/**` only. No edits under `packages/`.
- Every new tap target is at least 48px tall. No horizontal overflow at 375px width.
- UI primitives import from `@neram/ui`; icons from `@mui/icons-material/<Name>`; never import `@mui/material` directly.
- Unit tests run from the repo root with `pnpm test:run <path>` (root `vitest.config.ts` includes `apps/**/*.test.{ts,tsx}`, jsdom). Never bare `pnpm test` (watch mode, never exits).
- Type-check and lint without pipes (a pipe hides the exit code): `pnpm --filter @neram/nexus type-check` and `pnpm --filter @neram/nexus lint`.
- Other sessions have uncommitted edits in this tree (including `people-search.ts`, `AvailableStudentsSection.tsx`, `api/users/search/route.ts`). Re-read each file immediately before editing it. Never `git stash`, `git reset` or revert anything you did not write.
- Commit only when the user has asked for commits. Never push or deploy.
- Local Nexus dev (port 3012) reads and writes the PRODUCTION database. During manual checks do not press Add, Link or anything that writes an enrollment.
- Never run `next build` while `pnpm dev:nexus` is running.
- Task 9 touches production data and runs only after the user explicitly says go.

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/nexus/src/lib/people-search.ts` | Modify | Add `phoneticKey`, `editDistance`, `MatchTier.FUZZY`, `suggestPeople` |
| `apps/nexus/src/lib/people-search.test.ts` | Modify | Fuzzy tier, phonetic key, suggestions |
| `apps/nexus/src/app/(teacher)/teacher/students/page.tsx` | Modify | Whole-roster ranked search, Did you mean, Search every exam year |
| `apps/nexus/src/lib/identity-candidates.ts` | Create | Pure "same person?" matcher |
| `apps/nexus/src/lib/identity-candidates.test.ts` | Create | Matcher tests |
| `apps/nexus/src/lib/directory-enrollment.ts` | Create | Pure resolver + store interface |
| `apps/nexus/src/lib/directory-enrollment.test.ts` | Create | Resolver ordering tests with a fake store |
| `apps/nexus/src/lib/directory-enrollment-store.ts` | Create | Supabase + Graph implementation of the store |
| `apps/nexus/src/app/api/classrooms/[id]/enrollments/route.ts` | Modify | Directory branch uses the resolver, returns 409 |
| `apps/nexus/src/components/students/DuplicateConfirmSheet.tsx` | Create | "Is this the same student?" bottom sheet |
| `apps/nexus/src/components/students/useDirectoryEnroll.tsx` | Create | Sequential enroll that pauses on 409 and asks |
| `apps/nexus/src/components/students/useDirectoryEnroll.test.tsx` | Create | Hook + sheet behaviour |
| `apps/nexus/src/components/AddStudentDialog.tsx` | Modify | Use the hook, surface failures |
| `apps/nexus/src/lib/org-directory.ts` | Modify | `createdDateTime`, `foldPastStudents`, `splitAddableStudents` |
| `apps/nexus/src/lib/org-directory.test.ts` | Modify | Fold and split tests |
| `apps/nexus/src/app/api/classrooms/[id]/available-students/route.ts` | Modify | Return `{ students, past }` |
| `apps/nexus/src/components/AvailableStudentsSection.tsx` | Modify | Hook, created date, collapsed Past students |
| `tests/e2e/students-search-nexus.spec.ts` | Create | Search at 375px + directory API shape |

---

### Task 1: Fuzzy tier in the shared people ranker

**Files:**
- Modify: `apps/nexus/src/lib/people-search.ts`
- Test: `apps/nexus/src/lib/people-search.test.ts`

**Interfaces:**
- Consumes: existing `normalizeQuery`, `wordStarts`, `matchTier`, `rankPeople`.
- Produces:
  - `MatchTier.FUZZY` (value `5`)
  - `phoneticKey(text: string | null | undefined): string`
  - `editDistance(a: string, b: string): number`
  - `suggestPeople<T extends RankablePerson>(people: T[], query: string, limit?: number): T[]`

- [ ] **Step 1: Write the failing tests**

In `people-search.test.ts`, change the import line to:

```ts
import {
  escapeIlike,
  matchTier,
  rankPeople,
  MatchTier,
  phoneticKey,
  editDistance,
  suggestPeople,
} from './people-search';
```

Append at the end of the file:

```ts
/**
 * The same name reaches the roster spelled several ways. "disha" found nobody
 * because the student is stored as "Dhisha", which a substring search can never
 * reach. These pin the spelling-tolerant tier that fixes that.
 */
const SPELLINGS = [
  { name: 'Dhisha Haribabu', email: 'Dhisha_Haribabu@neramclasses.com' },
  { name: 'Keerthana SureshMurugan', email: 'keerthana_suresh@neramclasses.com' },
  { name: 'Aarthi Selvam', email: 'Aarthi@neramclasses.com' },
  { name: 'Afrin banu', email: 'Afrin_banu@neramclasses.com' },
  { name: 'Aryakumar Amitkumar', email: 'Aryakumar@neramclasses.com' },
  { name: 'Dhivyadharshini Student', email: null },
];

describe('phoneticKey', () => {
  it('folds aspirated consonants', () => {
    expect(phoneticKey('Dhisha')).toBe('disa');
    expect(phoneticKey('Disha')).toBe('disa');
  });

  it('folds long vowels and doubled letters', () => {
    expect(phoneticKey('Keerthana')).toBe('kirtana');
    expect(phoneticKey('Keertana')).toBe('kirtana');
    expect(phoneticKey('Nethrra')).toBe('netra');
    expect(phoneticKey('Nethra')).toBe('netra');
    expect(phoneticKey('Aarthi')).toBe('arti');
  });

  it('reads zh the way people type it', () => {
    expect(phoneticKey('Kuzhali')).toBe('kulali');
  });

  it('returns an empty key for empty input', () => {
    expect(phoneticKey('')).toBe('');
    expect(phoneticKey(null)).toBe('');
  });
});

describe('editDistance', () => {
  it('counts inserts, deletes, substitutions and neighbour swaps as one each', () => {
    expect(editDistance('disa', 'disa')).toBe(0);
    expect(editDistance('afrin', 'afrn')).toBe(1);
    expect(editDistance('kirtana', 'kirtnaa')).toBe(1);
    expect(editDistance('abc', '')).toBe(3);
  });
});

describe('fuzzy tier', () => {
  it('finds Dhisha when someone types disha, the bug this fixes', () => {
    expect(rankPeople(SPELLINGS, 'disha')[0].name).toBe('Dhisha Haribabu');
    expect(matchTier(SPELLINGS[0], 'disha')).toBe(MatchTier.FUZZY);
  });

  it('tolerates a dropped h and a doubled letter', () => {
    expect(rankPeople(SPELLINGS, 'keertana')[0].name).toBe('Keerthana SureshMurugan');
    expect(rankPeople(ROSTER, 'nethra')[0].name).toBe('Nethrra BadhriNarayanan');
  });

  it('tolerates a one-letter typo in a later word', () => {
    expect(matchTier(SPELLINGS[3], 'afrin bano')).toBe(MatchTier.FUZZY);
  });

  it('tolerates two neighbouring letters swapped', () => {
    expect(rankPeople(SPELLINGS, 'aryakuamr')[0].name).toBe('Aryakumar Amitkumar');
  });

  it('never outranks a real substring match', () => {
    const ranked = rankPeople(
      [
        { name: 'Dhisha Haribabu', email: null },
        { name: 'Disha Kumar', email: null },
      ],
      'disha'
    );
    expect(ranked.map((r) => r.name)).toEqual(['Disha Kumar', 'Dhisha Haribabu']);
  });

  it('does not invent matches for a short query', () => {
    expect(matchTier({ name: 'Divya', email: null }, 'dh')).toBeNull();
    // Name only: every org address contains "neram", which is a legitimate
    // EMAIL_CONTAINS hit for "ram". The point here is that no FUZZY hit is invented.
    expect(matchTier({ name: 'Ananya AnoopPuthan', email: null }, 'ram')).toBeNull();
  });
});

describe('suggestPeople', () => {
  it('offers the nearest name when nothing matched', () => {
    expect(suggestPeople(SPELLINGS, 'dsha')[0].name).toBe('Dhisha Haribabu');
  });

  it('offers nothing for noise', () => {
    expect(suggestPeople(SPELLINGS, 'zzzzqqqq')).toEqual([]);
    expect(suggestPeople(SPELLINGS, '  ')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(suggestPeople(SPELLINGS, 'dhisa', 1)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run apps/nexus/src/lib/people-search.test.ts`
Expected: FAIL, `phoneticKey` / `editDistance` / `suggestPeople` are not exported.

- [ ] **Step 3: Implement**

In `people-search.ts`, replace the `MatchTier` constant with:

```ts
export const MatchTier = {
  NAME_PREFIX: 0,
  NAME_WORD: 1,
  EMAIL_WORD: 2,
  NAME_CONTAINS: 3,
  EMAIL_CONTAINS: 4,
  /** A respelling or a one-letter typo. Always ranks below every literal hit. */
  FUZZY: 5,
} as const;
```

Directly after `normalizeQuery`, add:

```ts
/**
 * Consonant clusters whose h is optional when Indian names are romanised:
 * "Dhisha" and "Disha", "Keerthana" and "Keertana", "Kuzhali" and "Kulali".
 * Order matters only in that every pair is applied before the vowel folds.
 */
const CONSONANT_FOLDS: ReadonlyArray<[RegExp, string]> = [
  [/zh/g, 'l'],
  [/dh/g, 'd'],
  [/th/g, 't'],
  [/sh/g, 's'],
  [/kh/g, 'k'],
  [/bh/g, 'b'],
  [/ph/g, 'f'],
  [/gh/g, 'g'],
];

/** Long vowels written doubled or not: "Aarthi" and "Arthi", "Deepa" and "Dipa". */
const VOWEL_FOLDS: ReadonlyArray<[RegExp, string]> = [
  [/aa/g, 'a'],
  [/ee/g, 'i'],
  [/ii/g, 'i'],
  [/oo/g, 'u'],
  [/uu/g, 'u'],
];

/**
 * A spelling-insensitive key for a name typed in Latin script. Two spellings of
 * the same name produce the same key, so "disha" can find "Dhisha".
 */
export function phoneticKey(text: string | null | undefined): string {
  let key = String(text || '').toLowerCase().replace(/[^a-z]/g, '');
  for (const [pattern, replacement] of CONSONANT_FOLDS) key = key.replace(pattern, replacement);
  for (const [pattern, replacement] of VOWEL_FOLDS) key = key.replace(pattern, replacement);
  return key.replace(/(.)\1+/g, '$1');
}

/**
 * Optimal string alignment distance: inserting, deleting or substituting one
 * letter, or swapping two neighbours, each costs one.
 */
export function editDistance(a: string, b: string): number {
  const rows = a.length;
  const cols = b.length;
  if (rows === 0) return cols;
  if (cols === 0) return rows;

  const d: number[][] = Array.from({ length: rows + 1 }, (_, i) => {
    const row = new Array<number>(cols + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= cols; j++) d[0][j] = j;

  for (let i = 1; i <= rows; i++) {
    for (let j = 1; j <= cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[rows][cols];
}
```

Directly after `hasWordStartingWith`, add:

```ts
/** The words of a name or an address local part, split on separators and camel humps. */
function wordsOf(text: string): string[] {
  const starts = wordStarts(text);
  const words: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : text.length;
    const word = text.slice(starts[i], end).replace(/[^a-z0-9]/gi, '');
    if (word) words.push(word);
  }
  return words;
}

/** Phonetic keys of every word in the person's name and email local part. */
function storedKeysOf(person: RankablePerson): string[] {
  const localPart = (person.email || '').split('@')[0] || '';
  return [...wordsOf(person.name || ''), ...wordsOf(localPart)].map(phoneticKey).filter(Boolean);
}

/** How many edits a typed word of this length may carry and still count. */
function allowedDistance(length: number): number {
  if (length >= 8) return 2;
  if (length >= 4) return 1;
  return 0;
}

/**
 * True when a typed word is a respelling, a small typo, or the start of a stored
 * word. The prefix comparison is what lets a half-typed word still match.
 */
function wordsResemble(queryKey: string, storedKey: string): boolean {
  if (storedKey.startsWith(queryKey)) return true;
  const allowed = allowedDistance(queryKey.length);
  if (allowed === 0) return false;
  return (
    editDistance(queryKey, storedKey) <= allowed ||
    editDistance(queryKey, storedKey.slice(0, queryKey.length)) <= allowed
  );
}

/** Every typed word resembles some word of the person. Query already normalised. */
function fuzzyMatches(person: RankablePerson, normalizedQuery: string): boolean {
  const queryKeys = normalizedQuery.split(' ').map(phoneticKey).filter((key) => key.length >= 2);
  if (!queryKeys.length) return false;
  const storedKeys = storedKeysOf(person);
  if (!storedKeys.length) return false;
  return queryKeys.every((queryKey) => storedKeys.some((storedKey) => wordsResemble(queryKey, storedKey)));
}
```

In `matchTier`, replace the final two lines:

```ts
  if (lowerEmail.includes(q)) return MatchTier.EMAIL_CONTAINS;

  return null;
```

with:

```ts
  if (lowerEmail.includes(q)) return MatchTier.EMAIL_CONTAINS;

  // Three characters minimum: below that every name starting with the same
  // sound would match, which is noise rather than help.
  if (q.length >= 3 && fuzzyMatches(person, q)) return MatchTier.FUZZY;

  return null;
```

At the end of the file, add:

```ts
/** Edits a suggestion may be away from a typed word of this length. */
function suggestionDistance(length: number): number {
  return length >= 6 ? 2 : 1;
}

/**
 * The closest people to a query that matched nobody, for a "Did you mean" row.
 * It only ever offers: a person is included when every typed word is within a
 * small distance of one of their words, nearest first.
 */
export function suggestPeople<T extends RankablePerson>(people: T[], query: string, limit = 3): T[] {
  const queryKeys = normalizeQuery(query)
    .split(' ')
    .map(phoneticKey)
    .filter((key) => key.length >= 3);
  if (!queryKeys.length) return [];

  const scored: Array<{ person: T; score: number }> = [];
  for (const person of people) {
    const storedKeys = storedKeysOf(person);
    if (!storedKeys.length) continue;

    let total = 0;
    for (const queryKey of queryKeys) {
      let best = Infinity;
      for (const storedKey of storedKeys) {
        best = Math.min(
          best,
          editDistance(queryKey, storedKey),
          editDistance(queryKey, storedKey.slice(0, queryKey.length))
        );
      }
      if (best > suggestionDistance(queryKey.length)) {
        total = Infinity;
        break;
      }
      total += best;
    }
    if (Number.isFinite(total)) scored.push({ person, score: total });
  }

  scored.sort((a, b) => a.score - b.score || (a.person.name || '').localeCompare(b.person.name || ''));
  return scored.slice(0, limit).map((entry) => entry.person);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run apps/nexus/src/lib/people-search.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Commit (only if the user has asked for commits)**

```bash
git add apps/nexus/src/lib/people-search.ts apps/nexus/src/lib/people-search.test.ts
git commit -m "feat(nexus): spelling-tolerant people search tier"
```

---

### Task 2: Students page searches the whole roster, with Did you mean

**Files:**
- Modify: `apps/nexus/src/app/(teacher)/teacher/students/page.tsx`

**Interfaces:**
- Consumes: `rankPeople`, `suggestPeople` from Task 1.
- Produces: no exports. Visible text `No student matches "<query>"`, `Did you mean`, `Search every exam year` (Task 7 asserts the first).

- [ ] **Step 1: Add the import**

After `import { usePresence } from '@/hooks/usePresence';` add:

```ts
import { rankPeople, suggestPeople } from '@/lib/people-search';
```

- [ ] **Step 2: Replace the filter**

Replace the whole block that starts with the comment `// Segment first, then the free-text search,` and ends with `}, [students, segment, searchQuery, mismatchOnly]);` with:

```ts
  const trimmedQuery = searchQuery.trim();

  // A typed name searches the WHOLE roster, ranked by closeness. Finding one
  // person must not depend on which category pill is active, and a respelling
  // ("disha" for "Dhisha") must still land. The mismatch review keeps narrowing
  // first, because it is a review mode the teacher entered on purpose.
  const visibleStudents = useMemo(() => {
    if (trimmedQuery && !mismatchOnly) return rankPeople(students, trimmedQuery);
    const base = students.filter((s) => {
      if (mismatchOnly) return s.pair_status === 'mismatch';
      return matchesSegment(
        { stage: stageKeyOf(s.study_stage), dormant: s.participation_status === 'dormant' },
        segment,
      );
    });
    return trimmedQuery ? rankPeople(base, trimmedQuery) : base;
  }, [students, segment, trimmedQuery, mismatchOnly]);

  // Offered only when the search found nobody, so a near miss is one tap away.
  const searchSuggestions = useMemo(
    () => (trimmedQuery && visibleStudents.length === 0 ? suggestPeople(students, trimmedQuery) : []),
    [students, trimmedQuery, visibleStudents.length],
  );
```

- [ ] **Step 3: Say what the search covers**

Directly after the search `<TextField ... placeholder="Search by name or email..." ... />` element (it closes with `inputProps={{ style: { minHeight: 24 } }}` then `/>`), add:

```tsx
        {trimmedQuery && !mismatchOnly && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -1, mb: 1 }}>
            Searching every student in this classroom, in all categories.
          </Typography>
        )}
```

- [ ] **Step 4: Replace the empty state**

Replace the `<Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderRadius: 2, borderStyle: 'dashed' }}>` element and everything inside it (up to its closing `</Paper>`) with:

```tsx
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderRadius: 2, borderStyle: 'dashed' }}>
          <PeopleOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {trimmedQuery
              ? `No student matches "${trimmedQuery}"`
              : segment === 'dormant'
                ? 'Nobody is marked dormant'
                : segment === 'unset'
                  ? 'Every student has a study stage'
                  : `No students in ${SEGMENT_LABEL[segment]}`}
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
                : segment === 'exam_this_year'
                  ? 'Break Year and Class 12 students appear here once their stage is set.'
                  : 'Try another category, or All active to see everyone.'}
            </Typography>
          )}
          {trimmedQuery && examBatchFilter !== 'all' && (
            <Button onClick={() => setExamBatchFilter('all')} sx={{ mt: 1.5, minHeight: 48, fontWeight: 700 }}>
              Search every exam year
            </Button>
          )}
        </Paper>
```

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @neram/nexus type-check`
Expected: exit code 0. If it fails on files this task did not touch, record them and continue; if it fails in `page.tsx`, fix before moving on.

- [ ] **Step 6: Commit (only if the user has asked for commits)**

```bash
git add "apps/nexus/src/app/(teacher)/teacher/students/page.tsx"
git commit -m "feat(nexus): students search spans the roster with Did you mean"
```

---

### Task 3: Pure "same person?" matcher

**Files:**
- Create: `apps/nexus/src/lib/identity-candidates.ts`
- Test: `apps/nexus/src/lib/identity-candidates.test.ts`

**Interfaces:**
- Consumes: `phoneticKey` from Task 1.
- Produces:

```ts
export interface IdentityCandidateRow {
  user_id: string;
  name: string | null;
  email: string | null;
  personal_email?: string | null;
  phone?: string | null;
  enrolled_at?: string | null;
}
export interface DirectoryIdentity {
  name: string | null;
  upn: string | null;
  phones?: Array<string | null | undefined>;
  emails?: Array<string | null | undefined>;
}
export type CandidateReason = 'phone' | 'email' | 'name';
export interface IdentityCandidate {
  user_id: string;
  name: string | null;
  email: string | null;
  enrolled_at: string | null;
  reason: CandidateReason;
}
export function normalizePhone(raw: string | null | undefined): string | null;
export function firstNameKey(nameOrAddress: string | null | undefined): string;
export function findIdentityCandidates(account: DirectoryIdentity, rows: IdentityCandidateRow[]): IdentityCandidate[];
```

- [ ] **Step 1: Write the failing tests**

Create `apps/nexus/src/lib/identity-candidates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findIdentityCandidates, firstNameKey, normalizePhone } from './identity-candidates';

/**
 * Production, 2026-08-14: a student paid with Gmail on 13 Aug (enrolled, no
 * Microsoft account). The next day her new Afrin_banu@neramclasses.com account
 * was added from "Not yet in class" and a second student record appeared.
 */
const GMAIL_ROW = {
  user_id: 'gmail-row',
  name: 'Afrin',
  email: 'afrinbanu20101@gmail.com',
  personal_email: null,
  phone: '+916382901455',
  enrolled_at: '2026-08-13T12:45:27Z',
};

const OTHER_ROW = {
  user_id: 'other-row',
  name: 'Aryakumar Amitkumar',
  email: 'arya@example.com',
  personal_email: null,
  phone: '+919999999999',
  enrolled_at: '2026-04-03T00:00:00Z',
};

describe('normalizePhone', () => {
  it('keeps the last ten digits', () => {
    expect(normalizePhone('+91 63829 01455')).toBe('6382901455');
    expect(normalizePhone('6382901455')).toBe('6382901455');
  });

  it('rejects anything shorter than ten digits', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe('firstNameKey', () => {
  it('reads the first name from a display name or an address', () => {
    expect(firstNameKey('Afrin banu')).toBe('afrin');
    expect(firstNameKey('Afrin_banu@neramclasses.com')).toBe('afrin');
    expect(firstNameKey('HariHeera@neramclasses.com')).toBe('hari');
  });

  it('ignores case, padding and optional letters', () => {
    expect(firstNameKey('CHETANA ')).toBe(firstNameKey('Chetana AjayKumar'));
    expect(firstNameKey('Dhisha')).toBe(firstNameKey('Disha'));
  });
});

describe('findIdentityCandidates', () => {
  it('proposes the paid Gmail record for the new org account (the duplicate this prevents)', () => {
    const found = findIdentityCandidates(
      { name: 'Afrin banu', upn: 'Afrin_banu@neramclasses.com' },
      [GMAIL_ROW, OTHER_ROW],
    );
    expect(found).toEqual([
      {
        user_id: 'gmail-row',
        name: 'Afrin',
        email: 'afrinbanu20101@gmail.com',
        enrolled_at: '2026-08-13T12:45:27Z',
        reason: 'name',
      },
    ]);
  });

  it('labels a phone match', () => {
    const found = findIdentityCandidates(
      { name: 'Someone Else', upn: 'someone@neramclasses.com', phones: ['+91 63829 01455'] },
      [GMAIL_ROW, OTHER_ROW],
    );
    expect(found.map((c) => [c.user_id, c.reason])).toEqual([['gmail-row', 'phone']]);
  });

  it('labels a personal email match regardless of case', () => {
    const found = findIdentityCandidates(
      { name: 'Someone Else', upn: 'someone@neramclasses.com', emails: ['AfrinBanu20101@gmail.com'] },
      [GMAIL_ROW],
    );
    expect(found[0].reason).toBe('email');
  });

  it('orders phone matches before name matches', () => {
    const nameTwin = { ...OTHER_ROW, user_id: 'name-twin', name: 'Afrin S', phone: null };
    const found = findIdentityCandidates(
      { name: 'Afrin banu', upn: 'Afrin_banu@neramclasses.com', phones: ['9999999999'] },
      [nameTwin, OTHER_ROW],
    );
    expect(found.map((c) => c.user_id)).toEqual(['other-row', 'name-twin']);
  });

  it('ignores first names shorter than three letters', () => {
    const found = findIdentityCandidates(
      { name: 'Al Khan', upn: 'Al_Khan@neramclasses.com' },
      [{ ...OTHER_ROW, user_id: 'al', name: 'Al' }],
    );
    expect(found).toEqual([]);
  });

  it('returns nothing when no row resembles the account', () => {
    expect(
      findIdentityCandidates({ name: 'Dhisha Haribabu', upn: 'Dhisha_Haribabu@neramclasses.com' }, [OTHER_ROW]),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run apps/nexus/src/lib/identity-candidates.test.ts`
Expected: FAIL, cannot resolve `./identity-candidates`.

- [ ] **Step 3: Implement**

Create `apps/nexus/src/lib/identity-candidates.ts`:

```ts
/**
 * Could this Microsoft account belong to a student who is already enrolled
 * without one?
 *
 * A student who pays through the marketing link is enrolled on their Google
 * record before any @neramclasses.com account exists. When staff later add the
 * new Microsoft account, nothing on the two records has to agree: the Entra
 * account is made by hand with no phone, and the names differ ("Afrin" and
 * "Afrin banu"). This module proposes likely matches so a person can confirm.
 *
 * It only ever PROPOSES. First names collide between different students, which
 * past merges proved, so nothing is linked without a human saying yes.
 *
 * Pure, so the route and the tests share one rule.
 */

import { phoneticKey } from './people-search';

/** A classroom student who has no Microsoft account yet. */
export interface IdentityCandidateRow {
  user_id: string;
  name: string | null;
  email: string | null;
  personal_email?: string | null;
  phone?: string | null;
  enrolled_at?: string | null;
}

/** What is known about the Microsoft account being added. */
export interface DirectoryIdentity {
  name: string | null;
  upn: string | null;
  phones?: Array<string | null | undefined>;
  emails?: Array<string | null | undefined>;
}

export type CandidateReason = 'phone' | 'email' | 'name';

/** A proposed match, safe to send to the browser (no phone number). */
export interface IdentityCandidate {
  user_id: string;
  name: string | null;
  email: string | null;
  enrolled_at: string | null;
  reason: CandidateReason;
}

const REASON_ORDER: Record<CandidateReason, number> = { phone: 0, email: 1, name: 2 };

/** Last ten digits, or null when there are fewer. Indian mobiles are ten digits after +91. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Phonetic key of the first name, from a display name or an address local part. */
export function firstNameKey(nameOrAddress: string | null | undefined): string {
  const local = String(nameOrAddress || '').split('@')[0].trim();
  const first = local.split(/[\s._-]+/)[0] || '';
  // A camelCase mailbox such as "HariHeera" starts its second word at the hump.
  const hump = first.match(/^[A-Z]?[a-z]+/);
  return phoneticKey(hump ? hump[0] : first);
}

function lowerAddresses(values: Array<string | null | undefined>): string[] {
  return values.map((value) => String(value || '').trim().toLowerCase()).filter((value) => value.includes('@'));
}

export function findIdentityCandidates(
  account: DirectoryIdentity,
  rows: IdentityCandidateRow[],
): IdentityCandidate[] {
  const phones = new Set(
    (account.phones || []).map(normalizePhone).filter((phone): phone is string => !!phone),
  );
  const emails = new Set(lowerAddresses([account.upn, ...(account.emails || [])]));
  const nameKeys = new Set(
    [firstNameKey(account.name), firstNameKey(account.upn)].filter((key) => key.length >= 3),
  );

  const found: IdentityCandidate[] = [];
  for (const row of rows || []) {
    let reason: CandidateReason | null = null;

    const rowPhone = normalizePhone(row.phone);
    if (rowPhone && phones.has(rowPhone)) {
      reason = 'phone';
    } else if (lowerAddresses([row.email, row.personal_email]).some((address) => emails.has(address))) {
      reason = 'email';
    } else {
      const key = firstNameKey(row.name);
      if (key.length >= 3 && nameKeys.has(key)) reason = 'name';
    }

    if (reason) {
      found.push({
        user_id: row.user_id,
        name: row.name,
        email: row.email ?? row.personal_email ?? null,
        enrolled_at: row.enrolled_at ?? null,
        reason,
      });
    }
  }

  return found.sort((a, b) => REASON_ORDER[a.reason] - REASON_ORDER[b.reason]);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run apps/nexus/src/lib/identity-candidates.test.ts`
Expected: PASS (6 describe blocks, all green).

- [ ] **Step 5: Commit (only if the user has asked for commits)**

```bash
git add apps/nexus/src/lib/identity-candidates.ts apps/nexus/src/lib/identity-candidates.test.ts
git commit -m "feat(nexus): propose same-person matches before adding a directory account"
```

---

### Task 4: Resolver, store, and the enrollments route

**Files:**
- Create: `apps/nexus/src/lib/directory-enrollment.ts`
- Create: `apps/nexus/src/lib/directory-enrollment-store.ts`
- Modify: `apps/nexus/src/app/api/classrooms/[id]/enrollments/route.ts` (directory branch of `POST`)
- Test: `apps/nexus/src/lib/directory-enrollment.test.ts`

**Interfaces:**
- Consumes: `findIdentityCandidates`, `IdentityCandidate`, `IdentityCandidateRow` (Task 3); `reconcileMsIdentity`, `recordUserHistory` from `@neram/database`; `getUserProfile` from `@neram/auth`.
- Produces:

```ts
export interface DirectoryHints { phones: string[]; emails: string[] }
export interface ReconcileRequest {
  msOid: string; upn: string; name: string;
  phoneHints: string[]; emailHints: string[];
  allowCreate: boolean; userType: string;
}
export interface DirectoryEnrollStore {
  getUser(userId: string): Promise<{ id: string; ms_oid: string | null } | null>;
  findUserIdByMsOid(msOid: string): Promise<string | null>;
  linkMicrosoft(userId: string, msOid: string, upn: string, actorId: string): Promise<void>;
  listClassroomStudentsWithoutMicrosoft(classroomId: string): Promise<IdentityCandidateRow[]>;
  getDirectoryHints(msOid: string): Promise<DirectoryHints>;
  reconcile(request: ReconcileRequest): Promise<string | null>;
}
export interface ResolveDirectoryUserInput {
  classroomId: string; msOid: string; upn: string; name: string;
  role: string; userType: string;
  linkUserId: string | null; confirmNew: boolean; actorId: string;
}
export type ResolveDirectoryUserResult =
  | { kind: 'resolved'; userId: string; how: 'linked' | 'matched' | 'created' }
  | { kind: 'possible_duplicate'; candidates: IdentityCandidate[] }
  | { kind: 'conflict'; status: 404 | 409; error: string };
export function resolveDirectoryUser(store: DirectoryEnrollStore, input: ResolveDirectoryUserInput): Promise<ResolveDirectoryUserResult>;
export const LINK_TARGET_MISSING: string;
export const LINK_TARGET_OTHER_ACCOUNT: string;
export const ACCOUNT_HAS_OWN_RECORD: string;
export const CREATE_FAILED: string;
export function createSupabaseDirectoryEnrollStore(supabase: any): DirectoryEnrollStore; // in directory-enrollment-store.ts
```
- HTTP contract (used by Task 5): `POST /api/classrooms/[id]/enrollments` with `{ role, batch_id?, ms_oid, name, email, user_type?, link_user_id?, confirm_new? }` returns `201 { enrollment }`, or `409 { error: 'possible_duplicate', candidates: IdentityCandidate[] }`, or `404|409 { error: string }`.

- [ ] **Step 1: Write the failing tests**

Create `apps/nexus/src/lib/directory-enrollment.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  ACCOUNT_HAS_OWN_RECORD,
  LINK_TARGET_MISSING,
  LINK_TARGET_OTHER_ACCOUNT,
  resolveDirectoryUser,
  type DirectoryEnrollStore,
  type ReconcileRequest,
  type ResolveDirectoryUserInput,
} from './directory-enrollment';

const INPUT: ResolveDirectoryUserInput = {
  classroomId: 'room-1',
  msOid: 'oid-afrin',
  upn: 'Afrin_banu@neramclasses.com',
  name: 'Afrin banu',
  role: 'student',
  userType: 'student',
  linkUserId: null,
  confirmNew: false,
  actorId: 'admin-1',
};

const GMAIL_ROW = {
  user_id: 'gmail-row',
  name: 'Afrin',
  email: 'afrinbanu20101@gmail.com',
  phone: '+916382901455',
  enrolled_at: '2026-08-13T12:45:27Z',
};

function fakeStore(overrides: Partial<DirectoryEnrollStore> = {}) {
  const linked: Array<[string, string, string, string]> = [];
  const reconciled: ReconcileRequest[] = [];
  const store: DirectoryEnrollStore = {
    getUser: async () => null,
    findUserIdByMsOid: async () => null,
    linkMicrosoft: async (userId, msOid, upn, actorId) => {
      linked.push([userId, msOid, upn, actorId]);
    },
    listClassroomStudentsWithoutMicrosoft: async () => [],
    getDirectoryHints: async () => ({ phones: [], emails: [] }),
    reconcile: async (request) => {
      reconciled.push(request);
      return request.allowCreate ? 'new-user' : null;
    },
    ...overrides,
  };
  return { store, linked, reconciled };
}

describe('resolveDirectoryUser', () => {
  it('links onto the record the teacher chose and never creates a row', async () => {
    const { store, linked, reconciled } = fakeStore({
      getUser: async () => ({ id: 'gmail-row', ms_oid: null }),
    });
    const result = await resolveDirectoryUser(store, { ...INPUT, linkUserId: 'gmail-row' });
    expect(result).toEqual({ kind: 'resolved', userId: 'gmail-row', how: 'linked' });
    expect(linked).toEqual([['gmail-row', 'oid-afrin', 'Afrin_banu@neramclasses.com', 'admin-1']]);
    expect(reconciled).toEqual([]);
  });

  it('refuses a record that belongs to a different Microsoft account', async () => {
    const { store, linked } = fakeStore({
      getUser: async () => ({ id: 'gmail-row', ms_oid: 'someone-else' }),
    });
    const result = await resolveDirectoryUser(store, { ...INPUT, linkUserId: 'gmail-row' });
    expect(result).toEqual({ kind: 'conflict', status: 409, error: LINK_TARGET_OTHER_ACCOUNT });
    expect(linked).toEqual([]);
  });

  it('refuses when the Microsoft account already has its own record', async () => {
    const { store, linked } = fakeStore({
      getUser: async () => ({ id: 'gmail-row', ms_oid: null }),
      findUserIdByMsOid: async () => 'org-row',
    });
    const result = await resolveDirectoryUser(store, { ...INPUT, linkUserId: 'gmail-row' });
    expect(result).toEqual({ kind: 'conflict', status: 409, error: ACCOUNT_HAS_OWN_RECORD });
    expect(linked).toEqual([]);
  });

  it('reports a missing link target', async () => {
    const { store } = fakeStore();
    const result = await resolveDirectoryUser(store, { ...INPUT, linkUserId: 'gone' });
    expect(result).toEqual({ kind: 'conflict', status: 404, error: LINK_TARGET_MISSING });
  });

  it('attaches through the reconciler when the directory hints recognise the person', async () => {
    const { store, reconciled } = fakeStore({
      getDirectoryHints: async () => ({ phones: ['+916382901455'], emails: [] }),
      reconcile: async (request) => {
        reconciled.push(request);
        return request.allowCreate ? 'new-user' : 'gmail-row';
      },
    });
    const result = await resolveDirectoryUser(store, INPUT);
    expect(result).toEqual({ kind: 'resolved', userId: 'gmail-row', how: 'matched' });
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).toMatchObject({ allowCreate: false, phoneHints: ['+916382901455'] });
  });

  it('stops and asks instead of creating a second record (the Afrin case)', async () => {
    const { store, reconciled } = fakeStore({
      listClassroomStudentsWithoutMicrosoft: async () => [GMAIL_ROW],
    });
    const result = await resolveDirectoryUser(store, INPUT);
    expect(result.kind).toBe('possible_duplicate');
    if (result.kind !== 'possible_duplicate') return;
    expect(result.candidates.map((c) => c.user_id)).toEqual(['gmail-row']);
    expect(reconciled.every((r) => r.allowCreate === false)).toBe(true);
  });

  it('creates once the teacher has said it is a different student', async () => {
    const { store, reconciled } = fakeStore({
      listClassroomStudentsWithoutMicrosoft: async () => [GMAIL_ROW],
    });
    const result = await resolveDirectoryUser(store, { ...INPUT, confirmNew: true });
    expect(result).toEqual({ kind: 'resolved', userId: 'new-user', how: 'created' });
    expect(reconciled[reconciled.length - 1]).toMatchObject({ allowCreate: true, userType: 'student' });
  });

  it('skips the duplicate question and directory hints for teachers', async () => {
    const getDirectoryHints = vi.fn(async () => ({ phones: ['1'], emails: [] }));
    const listClassroomStudentsWithoutMicrosoft = vi.fn(async () => [GMAIL_ROW]);
    const { store } = fakeStore({ getDirectoryHints, listClassroomStudentsWithoutMicrosoft });
    const result = await resolveDirectoryUser(store, { ...INPUT, role: 'teacher', userType: 'teacher' });
    expect(result).toEqual({ kind: 'resolved', userId: 'new-user', how: 'created' });
    expect(getDirectoryHints).not.toHaveBeenCalled();
    expect(listClassroomStudentsWithoutMicrosoft).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run apps/nexus/src/lib/directory-enrollment.test.ts`
Expected: FAIL, cannot resolve `./directory-enrollment`.

- [ ] **Step 3: Implement the resolver**

Create `apps/nexus/src/lib/directory-enrollment.ts`:

```ts
/**
 * Turning a Microsoft directory account into the Nexus user to enroll.
 *
 * The enrollments route used to look the account up by ms_oid and, on a miss,
 * insert a brand new users row. A student who paid through the marketing link
 * already has a row (Google login, no ms_oid), so adding their new
 * @neramclasses.com account created a second student. The unusable copy then
 * collected false absences and held the real catch-up journey.
 *
 * The order now:
 *   1. The teacher already said which record it is (linkUserId): attach to it.
 *   2. The reconciler recognises the person (ms_oid, recorded link, email, phone,
 *      personal email): attach to that.
 *   3. A student in this classroom with no Microsoft account looks like the same
 *      person: stop and ask, unless the teacher already answered "different".
 *   4. Otherwise create.
 *
 * Database and Graph access sit behind DirectoryEnrollStore so this ordering is
 * unit-tested without either.
 */

import {
  findIdentityCandidates,
  type IdentityCandidate,
  type IdentityCandidateRow,
} from './identity-candidates';

export const LINK_TARGET_MISSING = 'That student record no longer exists. Refresh and try again.';
export const LINK_TARGET_OTHER_ACCOUNT = 'That student is already linked to a different Microsoft account.';
export const ACCOUNT_HAS_OWN_RECORD =
  'This Microsoft account already has its own Nexus record. Merge the two records in Admin before linking.';
export const CREATE_FAILED = 'Could not create a Nexus record for this Microsoft account.';

export interface DirectoryHints {
  phones: string[];
  emails: string[];
}

export interface ReconcileRequest {
  msOid: string;
  upn: string;
  name: string;
  phoneHints: string[];
  emailHints: string[];
  allowCreate: boolean;
  userType: string;
}

export interface DirectoryEnrollStore {
  getUser(userId: string): Promise<{ id: string; ms_oid: string | null } | null>;
  findUserIdByMsOid(msOid: string): Promise<string | null>;
  linkMicrosoft(userId: string, msOid: string, upn: string, actorId: string): Promise<void>;
  listClassroomStudentsWithoutMicrosoft(classroomId: string): Promise<IdentityCandidateRow[]>;
  getDirectoryHints(msOid: string): Promise<DirectoryHints>;
  reconcile(request: ReconcileRequest): Promise<string | null>;
}

export interface ResolveDirectoryUserInput {
  classroomId: string;
  msOid: string;
  upn: string;
  name: string;
  role: string;
  userType: string;
  linkUserId: string | null;
  confirmNew: boolean;
  actorId: string;
}

export type ResolveDirectoryUserResult =
  | { kind: 'resolved'; userId: string; how: 'linked' | 'matched' | 'created' }
  | { kind: 'possible_duplicate'; candidates: IdentityCandidate[] }
  | { kind: 'conflict'; status: 404 | 409; error: string };

export async function resolveDirectoryUser(
  store: DirectoryEnrollStore,
  input: ResolveDirectoryUserInput,
): Promise<ResolveDirectoryUserResult> {
  const { msOid, upn, name, linkUserId, confirmNew, actorId, classroomId, userType } = input;

  // 1. The teacher picked the record.
  if (linkUserId) {
    const target = await store.getUser(linkUserId);
    if (!target) return { kind: 'conflict', status: 404, error: LINK_TARGET_MISSING };
    if (target.ms_oid && target.ms_oid !== msOid) {
      return { kind: 'conflict', status: 409, error: LINK_TARGET_OTHER_ACCOUNT };
    }
    const owner = await store.findUserIdByMsOid(msOid);
    if (owner && owner !== target.id) {
      return { kind: 'conflict', status: 409, error: ACCOUNT_HAS_OWN_RECORD };
    }
    if (!target.ms_oid) await store.linkMicrosoft(target.id, msOid, upn, actorId);
    return { kind: 'resolved', userId: target.id, how: 'linked' };
  }

  // Duplicates are a student problem. A teacher's phone must never pull their
  // account onto a student's Google record, so staff skip hints and the question.
  const isStudent = input.role === 'student';
  const hints: DirectoryHints = isStudent ? await store.getDirectoryHints(msOid) : { phones: [], emails: [] };

  // 2. The reconciler recognises the person. A match is attached, never duplicated.
  const matched = await store.reconcile({
    msOid,
    upn,
    name,
    phoneHints: hints.phones,
    emailHints: hints.emails,
    allowCreate: false,
    userType,
  });
  if (matched) return { kind: 'resolved', userId: matched, how: 'matched' };

  // 3. Someone already enrolled here may be the same person.
  if (isStudent && !confirmNew) {
    const rows = await store.listClassroomStudentsWithoutMicrosoft(classroomId);
    const candidates = findIdentityCandidates({ name, upn, phones: hints.phones, emails: hints.emails }, rows);
    if (candidates.length) return { kind: 'possible_duplicate', candidates };
  }

  // 4. A genuinely new person.
  const created = await store.reconcile({
    msOid,
    upn,
    name,
    phoneHints: [],
    emailHints: [],
    allowCreate: true,
    userType,
  });
  if (!created) return { kind: 'conflict', status: 409, error: CREATE_FAILED };
  return { kind: 'resolved', userId: created, how: 'created' };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run apps/nexus/src/lib/directory-enrollment.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Implement the Supabase store**

Create `apps/nexus/src/lib/directory-enrollment-store.ts`:

```ts
/**
 * The real DirectoryEnrollStore: Supabase for records, Graph for directory hints.
 * Kept apart from directory-enrollment.ts so the resolver's tests never load a
 * database client or a Graph token.
 */

import { reconcileMsIdentity, recordUserHistory } from '@neram/database';
import { getUserProfile } from '@neram/auth';
import type { DirectoryEnrollStore } from './directory-enrollment';

export function createSupabaseDirectoryEnrollStore(supabase: any): DirectoryEnrollStore {
  return {
    async getUser(userId) {
      const { data, error } = await supabase.from('users').select('id, ms_oid').eq('id', userId).maybeSingle();
      if (error) throw error;
      return data ?? null;
    },

    async findUserIdByMsOid(msOid) {
      const { data, error } = await supabase.from('users').select('id').eq('ms_oid', msOid).maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },

    async linkMicrosoft(userId, msOid, upn, actorId) {
      const now = new Date().toISOString();
      const { data: current, error: readError } = await supabase
        .from('users')
        .select('linked_classroom_email')
        .eq('id', userId)
        .maybeSingle();
      if (readError) throw readError;

      const updates: Record<string, unknown> = { ms_oid: msOid, updated_at: now };
      if (!current?.linked_classroom_email) {
        updates.linked_classroom_email = upn;
        updates.linked_classroom_at = now;
      }
      const { error: updateError } = await supabase.from('users').update(updates).eq('id', userId);
      if (updateError) throw updateError;

      // Teams grant and revoke read ms_teams_email from the fee record, so a
      // linked student must carry it or the next Teams sync silently skips them.
      const { error: profileError } = await supabase
        .from('student_profiles')
        .update({ ms_teams_email: upn })
        .eq('user_id', userId)
        .is('ms_teams_email', null);
      if (profileError) throw profileError;

      await recordUserHistory(supabase, userId, 'ms_oid', null, msOid, actorId);
    },

    async listClassroomStudentsWithoutMicrosoft(classroomId) {
      const { data, error } = await supabase
        .from('nexus_enrollments')
        .select(
          'enrolled_at, user:users!nexus_enrollments_user_id_fkey!inner(id, name, email, personal_email, phone, ms_oid)',
        )
        .eq('classroom_id', classroomId)
        .eq('role', 'student')
        .eq('is_active', true)
        .is('users.ms_oid', null);
      if (error) throw error;
      return (data || []).map((row: any) => ({
        user_id: row.user.id,
        name: row.user.name ?? null,
        email: row.user.email ?? null,
        personal_email: row.user.personal_email ?? null,
        phone: row.user.phone ?? null,
        enrolled_at: row.enrolled_at ?? null,
      }));
    },

    async getDirectoryHints(msOid) {
      const profile = await getUserProfile(msOid).catch(() => null);
      if (!profile) return { phones: [], emails: [] };
      return {
        phones: [profile.mobilePhone, ...(profile.businessPhones || [])].filter(Boolean),
        emails: (profile.otherMails || []).filter(Boolean),
      };
    },

    async reconcile(request) {
      const result = await reconcileMsIdentity(supabase, {
        msOid: request.msOid,
        upn: request.upn,
        name: request.name,
        phoneHints: request.phoneHints,
        emailHints: request.emailHints,
        allowCreate: request.allowCreate,
        createDefaults: {
          user_type: request.userType,
          phone_verified: false,
          preferred_language: 'en',
        },
      });
      return result.user?.id ?? null;
    },
  };
}
```

- [ ] **Step 6: Wire the route**

In `apps/nexus/src/app/api/classrooms/[id]/enrollments/route.ts`, add after the existing imports:

```ts
import { resolveDirectoryUser } from '@/lib/directory-enrollment';
import { createSupabaseDirectoryEnrollStore } from '@/lib/directory-enrollment-store';
```

In `POST`, replace the block from `let resolvedUserId: string;` through the closing `}` of the final `else { return NextResponse.json({ error: 'Either user_id or (ms_oid + name + email) is required' }, ...) }` with:

```ts
    let resolvedUserId: string;

    if (body.user_id) {
      // Existing user flow
      resolvedUserId = body.user_id;
    } else if (body.ms_oid && body.name && body.email) {
      // A directory account. Never insert a second row for someone already
      // enrolled without a Microsoft account: link, reconcile, or stop and ask.
      // See lib/directory-enrollment.ts.
      const resolved = await resolveDirectoryUser(createSupabaseDirectoryEnrollStore(supabase), {
        classroomId: id,
        msOid: body.ms_oid,
        upn: body.email,
        name: body.name,
        role,
        userType: body.user_type || 'student',
        linkUserId: typeof body.link_user_id === 'string' ? body.link_user_id : null,
        confirmNew: body.confirm_new === true,
        actorId: caller.id,
      });

      if (resolved.kind === 'possible_duplicate') {
        return NextResponse.json(
          { error: 'possible_duplicate', candidates: resolved.candidates },
          { status: 409 },
        );
      }
      if (resolved.kind === 'conflict') {
        return NextResponse.json({ error: resolved.error }, { status: resolved.status });
      }
      resolvedUserId = resolved.userId;
    } else {
      return NextResponse.json(
        { error: 'Either user_id or (ms_oid + name + email) is required' },
        { status: 400 }
      );
    }
```

- [ ] **Step 7: Type-check**

Run: `pnpm --filter @neram/nexus type-check`
Expected: exit code 0 for the touched files.

- [ ] **Step 8: Commit (only if the user has asked for commits)**

```bash
git add apps/nexus/src/lib/directory-enrollment.ts apps/nexus/src/lib/directory-enrollment.test.ts apps/nexus/src/lib/directory-enrollment-store.ts "apps/nexus/src/app/api/classrooms/[id]/enrollments/route.ts"
git commit -m "fix(nexus): adding a directory account links or asks instead of duplicating a student"
```

---

### Task 5: Ask the teacher, in every add flow

**Files:**
- Create: `apps/nexus/src/components/students/DuplicateConfirmSheet.tsx`
- Create: `apps/nexus/src/components/students/useDirectoryEnroll.tsx`
- Modify: `apps/nexus/src/components/AddStudentDialog.tsx`
- Test: `apps/nexus/src/components/students/useDirectoryEnroll.test.tsx`

**Interfaces:**
- Consumes: HTTP contract from Task 4.
- Produces:

```ts
export interface DuplicateCandidate {
  user_id: string; name: string | null; email: string | null;
  enrolled_at: string | null; reason: 'phone' | 'email' | 'name';
}
export interface DirectoryPerson { ms_oid: string; name: string; email: string }
export interface EnrollOutcome { added: string[]; skipped: string[]; errors: string[] }
export function useDirectoryEnroll(options: {
  classroomId: string;
  getToken: () => Promise<string | null>;
  role?: 'student' | 'teacher';
  batchId?: string | null;
}): { enroll: (people: DirectoryPerson[]) => Promise<EnrollOutcome>; dialog: JSX.Element };
```
- Visible text: sheet title `Is this the same student?`; buttons `Yes, same student`, `No, a different student`, `Skip this one`.

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/components/students/useDirectoryEnroll.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useDirectoryEnroll, type EnrollOutcome } from './useDirectoryEnroll';

const AFRIN = { ms_oid: 'oid-afrin', name: 'Afrin banu', email: 'Afrin_banu@neramclasses.com' };

const CANDIDATE = {
  user_id: 'gmail-row',
  name: 'Afrin',
  email: 'afrinbanu20101@gmail.com',
  enrolled_at: '2026-08-13T12:45:27Z',
  reason: 'name',
};

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function Harness({ onDone }: { onDone: (outcome: EnrollOutcome) => void }) {
  const { enroll, dialog } = useDirectoryEnroll({ classroomId: 'room-1', getToken: async () => 'token' });
  return (
    <>
      <button type="button" onClick={() => enroll([AFRIN]).then(onDone)}>
        start
      </button>
      {dialog}
    </>
  );
}

const fetchMock = vi.fn();

function bodyOfCall(index: number) {
  return JSON.parse((fetchMock.mock.calls[index][1] as RequestInit).body as string);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDirectoryEnroll', () => {
  it('asks before linking, then sends link_user_id', async () => {
    fetchMock
      .mockResolvedValueOnce(response(409, { error: 'possible_duplicate', candidates: [CANDIDATE] }))
      .mockResolvedValueOnce(response(201, { enrollment: {} }));
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);

    fireEvent.click(screen.getByText('start'));
    expect(await screen.findByText('Is this the same student?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, same student' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0][0]).toEqual({ added: ['oid-afrin'], skipped: [], errors: [] });
    expect(bodyOfCall(1).link_user_id).toBe('gmail-row');
    expect(bodyOfCall(1).confirm_new).toBeUndefined();
  });

  it('sends confirm_new when the teacher says it is a different student', async () => {
    fetchMock
      .mockResolvedValueOnce(response(409, { error: 'possible_duplicate', candidates: [CANDIDATE] }))
      .mockResolvedValueOnce(response(201, { enrollment: {} }));
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);

    fireEvent.click(screen.getByText('start'));
    fireEvent.click(await screen.findByRole('button', { name: 'No, a different student' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(bodyOfCall(1).confirm_new).toBe(true);
    expect(bodyOfCall(1).link_user_id).toBeUndefined();
  });

  it('skips without a second request', async () => {
    fetchMock.mockResolvedValueOnce(response(409, { error: 'possible_duplicate', candidates: [CANDIDATE] }));
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);

    fireEvent.click(screen.getByText('start'));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip this one' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0][0]).toEqual({ added: [], skipped: ['oid-afrin'], errors: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns a refusal into a readable error without asking', async () => {
    fetchMock.mockResolvedValueOnce(
      response(409, { error: 'This Microsoft account already has its own Nexus record.' }),
    );
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);

    fireEvent.click(screen.getByText('start'));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0][0].errors).toEqual([
      'Afrin banu: This Microsoft account already has its own Nexus record.',
    ]);
    expect(screen.queryByText('Is this the same student?')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run apps/nexus/src/components/students/useDirectoryEnroll.test.tsx`
Expected: FAIL, cannot resolve `./useDirectoryEnroll`.

- [ ] **Step 3: Implement the sheet**

Create `apps/nexus/src/components/students/DuplicateConfirmSheet.tsx`:

```tsx
'use client';

import { Box, Button, Drawer, Typography } from '@neram/ui';

export interface DuplicateCandidate {
  user_id: string;
  name: string | null;
  email: string | null;
  enrolled_at: string | null;
  reason: 'phone' | 'email' | 'name';
}

const REASON_LABEL: Record<DuplicateCandidate['reason'], string> = {
  phone: 'Same phone number',
  email: 'Same email address',
  name: 'Same first name',
};

function joinedOn(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Asked before a Microsoft account is added when a student with no Microsoft
 * account is already enrolled and may be the same person. Linking keeps one
 * record, so fees, attendance and catch-up stay together.
 *
 * A bottom sheet like ClassifyDrawer. Its z-index sits above MUI dialogs
 * because Add Student opens it from inside one.
 */
export default function DuplicateConfirmSheet({
  open,
  personName,
  personEmail,
  candidates,
  onLink,
  onCreateNew,
  onSkip,
}: {
  open: boolean;
  personName: string;
  personEmail: string;
  candidates: DuplicateCandidate[];
  onLink: (userId: string) => void;
  onCreateNew: () => void;
  onSkip: () => void;
}) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onSkip}
      sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '88dvh' } }}
    >
      <Box
        role="dialog"
        aria-labelledby="duplicate-sheet-title"
        sx={{
          p: 2,
          pb: 'calc(16px + env(safe-area-inset-bottom))',
          width: '100%',
          maxWidth: 560,
          mx: 'auto',
          overflowY: 'auto',
        }}
      >
        <Typography id="duplicate-sheet-title" variant="h6" sx={{ fontWeight: 800 }}>
          Is this the same student?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          {personName} ({personEmail}) may already be in this class on a record with no Microsoft account.
          Linking keeps one record, so fees, attendance and catch-up stay together.
        </Typography>

        {candidates.map((candidate) => (
          <Box
            key={candidate.user_id}
            sx={{ p: 1.5, mb: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}
          >
            <Typography sx={{ fontWeight: 700 }}>{candidate.name || 'Unnamed student'}</Typography>
            {candidate.email && (
              <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                {candidate.email}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              {REASON_LABEL[candidate.reason]}
              {candidate.enrolled_at ? `, joined ${joinedOn(candidate.enrolled_at)}` : ''}
            </Typography>
            <Button
              fullWidth
              variant="contained"
              onClick={() => onLink(candidate.user_id)}
              sx={{ mt: 1, minHeight: 48, fontWeight: 700 }}
            >
              Yes, same student
            </Button>
          </Box>
        ))}

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, mt: 1 }}>
          <Button fullWidth variant="outlined" onClick={onCreateNew} sx={{ minHeight: 48 }}>
            No, a different student
          </Button>
          <Button fullWidth onClick={onSkip} sx={{ minHeight: 48 }}>
            Skip this one
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
```

- [ ] **Step 4: Implement the hook**

Create `apps/nexus/src/components/students/useDirectoryEnroll.tsx`:

```tsx
'use client';

import { useCallback, useRef, useState } from 'react';
import DuplicateConfirmSheet, { type DuplicateCandidate } from './DuplicateConfirmSheet';

export interface DirectoryPerson {
  ms_oid: string;
  name: string;
  email: string;
}

export interface EnrollOutcome {
  /** ms_oids now enrolled. */
  added: string[];
  /** ms_oids the teacher chose to skip at the duplicate question. */
  skipped: string[];
  /** One readable sentence per failure. */
  errors: string[];
}

type Decision = { action: 'link'; userId: string } | { action: 'new' } | { action: 'skip' };

interface PendingQuestion {
  person: DirectoryPerson;
  candidates: DuplicateCandidate[];
}

/**
 * Enrolls Microsoft directory accounts one at a time, pausing to ask when the
 * server says an account may belong to a student already enrolled without one.
 * The server refuses to guess, so every add flow asks the same question.
 */
export function useDirectoryEnroll({
  classroomId,
  getToken,
  role = 'student',
  batchId = null,
}: {
  classroomId: string;
  getToken: () => Promise<string | null>;
  role?: 'student' | 'teacher';
  batchId?: string | null;
}) {
  const [pending, setPending] = useState<PendingQuestion | null>(null);
  const resolveDecision = useRef<((decision: Decision) => void) | null>(null);

  const ask = useCallback(
    (question: PendingQuestion) =>
      new Promise<Decision>((resolve) => {
        resolveDecision.current = resolve;
        setPending(question);
      }),
    [],
  );

  const answer = useCallback((decision: Decision) => {
    resolveDecision.current?.(decision);
    resolveDecision.current = null;
    setPending(null);
  }, []);

  const enroll = useCallback(
    async (people: DirectoryPerson[]): Promise<EnrollOutcome> => {
      const outcome: EnrollOutcome = { added: [], skipped: [], errors: [] };

      const post = async (person: DirectoryPerson, extra: Record<string, unknown> = {}) => {
        const token = await getToken();
        if (!token) throw new Error('Your session expired. Sign in again.');
        return fetch(`/api/classrooms/${classroomId}/enrollments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role,
            batch_id: batchId,
            ms_oid: person.ms_oid,
            name: person.name,
            email: person.email,
            user_type: role,
            ...extra,
          }),
        });
      };

      const errorOf = async (res: Response) => {
        const data = await res.json().catch(() => ({}));
        return typeof data?.error === 'string' ? data.error : 'Could not add.';
      };

      // One at a time on purpose: a question pauses the run, and the answer for
      // one account must never be applied to the next.
      for (const person of people) {
        let res = await post(person);

        if (res.status === 409) {
          const data = await res.json().catch(() => ({}));
          if (data?.error !== 'possible_duplicate' || !Array.isArray(data.candidates)) {
            outcome.errors.push(`${person.name}: ${typeof data?.error === 'string' ? data.error : 'Could not add.'}`);
            continue;
          }
          const decision = await ask({ person, candidates: data.candidates });
          if (decision.action === 'skip') {
            outcome.skipped.push(person.ms_oid);
            continue;
          }
          res = await post(
            person,
            decision.action === 'link' ? { link_user_id: decision.userId } : { confirm_new: true },
          );
        }

        if (res.ok) outcome.added.push(person.ms_oid);
        else outcome.errors.push(`${person.name}: ${await errorOf(res)}`);
      }

      return outcome;
    },
    [ask, batchId, classroomId, getToken, role],
  );

  const dialog = (
    <DuplicateConfirmSheet
      open={!!pending}
      personName={pending?.person.name ?? ''}
      personEmail={pending?.person.email ?? ''}
      candidates={pending?.candidates ?? []}
      onLink={(userId) => answer({ action: 'link', userId })}
      onCreateNew={() => answer({ action: 'new' })}
      onSkip={() => answer({ action: 'skip' })}
    />
  );

  return { enroll, dialog };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:run apps/nexus/src/components/students/useDirectoryEnroll.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Wire AddStudentDialog**

In `apps/nexus/src/components/AddStudentDialog.tsx`:

1. Add `Alert` to the `@neram/ui` import list, and add:

```ts
import { useDirectoryEnroll } from '@/components/students/useDirectoryEnroll';
```

2. After `const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);` add:

```ts
  const [error, setError] = useState<string | null>(null);
  const { enroll: enrollDirectory, dialog } = useDirectoryEnroll({
    classroomId,
    getToken,
    role: selectedRole,
    batchId: selectedBatch,
  });
```

3. Replace the whole `handleAdd` function with:

```ts
  const handleAdd = async () => {
    if (selected.size === 0) return;
    setAdding(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) return;

      const selectedUsers = results.filter((u) => selected.has(u.ms_oid));
      const localUsers = selectedUsers.filter((u) => u.source === 'local' && u.id);
      const directoryUsers = selectedUsers.filter((u) => !(u.source === 'local' && u.id));

      const localResponses = await Promise.all(
        localUsers.map((user) =>
          fetch(`/api/classrooms/${classroomId}/enrollments`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: selectedRole, batch_id: selectedBatch, user_id: user.id }),
          })
        )
      );

      // Directory accounts go one by one so a possible duplicate can be asked about.
      const outcome = await enrollDirectory(
        directoryUsers.map((user) => ({ ms_oid: user.ms_oid, name: user.name, email: user.email }))
      );

      const failures = [
        ...localUsers.filter((_, i) => !localResponses[i].ok).map((user) => `${user.name}: could not add.`),
        ...outcome.errors,
      ];
      const addedCount = localResponses.filter((r) => r.ok).length + outcome.added.length;

      if (addedCount > 0) onStudentsAdded();
      if (failures.length > 0) {
        setError(failures.join(' '));
        return;
      }
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add those people.');
    } finally {
      setAdding(false);
    }
  };
```

4. In `handleClose`, add `setError(null);` before `onClose();`.

5. Directly after the search `<TextField ... autoFocus ... />` add:

```tsx
        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
```

6. Wrap the returned `<Dialog>...</Dialog>` in a fragment and render the sheet after it:

```tsx
  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        {/* existing dialog content unchanged */}
      </Dialog>
      {dialog}
    </>
  );
```

- [ ] **Step 7: Type-check**

Run: `pnpm --filter @neram/nexus type-check`
Expected: exit code 0 for the touched files.

- [ ] **Step 8: Commit (only if the user has asked for commits)**

```bash
git add apps/nexus/src/components/students/DuplicateConfirmSheet.tsx apps/nexus/src/components/students/useDirectoryEnroll.tsx apps/nexus/src/components/students/useDirectoryEnroll.test.tsx apps/nexus/src/components/AddStudentDialog.tsx
git commit -m "feat(nexus): ask before adding an account that may already be enrolled"
```

---

### Task 6: "Not yet in class" separates past students

**Files:**
- Modify: `apps/nexus/src/lib/org-directory.ts`
- Modify: `apps/nexus/src/app/api/classrooms/[id]/available-students/route.ts`
- Modify: `apps/nexus/src/components/AvailableStudentsSection.tsx`
- Test: `apps/nexus/src/lib/org-directory.test.ts`

**Interfaces:**
- Consumes: `useDirectoryEnroll` (Task 5), `rankPeople` (Task 1), `timeAgo` from `@/components/catchup/shared`.
- Produces:

```ts
// org-directory.ts
export interface EntraDirectoryUser { /* existing fields */ createdDateTime?: string | null }
export interface StudentEnrollmentRow {
  user_id: string;
  is_active: boolean | null;
  removed_at?: string | null;
  removal_reason_category?: string | null;
  classroom?: { name?: string | null } | null;
  user?: (EnrollmentBlockRow & { id?: string; name?: string | null; academic_year?: string | null }) | null;
}
export interface PastStudentRecord extends EnrollmentBlockRow {
  user_id: string; name: string | null; academic_year: string | null;
  last_classroom: string | null; removal_reason: string | null; removed_at: string | null;
}
export function foldPastStudents(rows: StudentEnrollmentRow[]): PastStudentRecord[];
export interface AddableSplit {
  fresh: EntraDirectoryUser[];
  past: Array<{ user: EntraDirectoryUser; record: PastStudentRecord }>;
}
export function splitAddableStudents(addable: EntraDirectoryUser[], pastRecords: PastStudentRecord[]): AddableSplit;
```
- HTTP: `GET /api/classrooms/[id]/available-students` returns `{ students: Dto[], past: PastDto[], total, pastTotal }` where `Dto = { ms_oid, name, email, inDatabase, createdAt }` and `PastDto = Dto & { academicYear, lastClassroom, removalReason, removedAt }`.

- [ ] **Step 1: Write the failing tests**

In `org-directory.test.ts`, extend the import:

```ts
import {
  isOrgDomain,
  isOrgPersonAccount,
  buildEnrollmentBlocklist,
  isBlockedFromStudentEnrollment,
  selectAddableStudents,
  foldPastStudents,
  splitAddableStudents,
  type EntraDirectoryUser,
  type PastStudentRecord,
  type StudentEnrollmentRow,
} from './org-directory';
```

Append at the end of the file:

```ts
/**
 * 2026-09-10: 25 students removed as course_completed were never graduated, so
 * is_alumni stayed false and their enabled Microsoft accounts filled "Not yet in
 * class" ahead of the genuinely new ones.
 */
describe('foldPastStudents', () => {
  const row = (over: Partial<StudentEnrollmentRow> = {}): StudentEnrollmentRow => ({
    user_id: 'u1',
    is_active: false,
    removed_at: '2026-04-10T00:00:00Z',
    removal_reason_category: 'course_completed',
    classroom: { name: 'NATA 2026' },
    user: {
      id: 'u1',
      name: 'Old Student',
      ms_oid: 'oid-old',
      email: 'old.student@neram.co.in',
      personal_email: null,
      linked_classroom_email: null,
      academic_year: '2024-25',
    },
    ...over,
  });

  it('keeps someone whose every student enrollment is inactive, with the latest removal', () => {
    const past = foldPastStudents([
      row(),
      row({ classroom: { name: 'JEE B.Arch Session 1' }, removed_at: '2026-06-01T00:00:00Z' }),
    ]);
    expect(past).toHaveLength(1);
    expect(past[0]).toMatchObject({
      user_id: 'u1',
      ms_oid: 'oid-old',
      academic_year: '2024-25',
      last_classroom: 'JEE B.Arch Session 1',
      removal_reason: 'course_completed',
    });
  });

  it('drops anyone still active in any classroom, in either order', () => {
    expect(foldPastStudents([row(), row({ is_active: true, removed_at: null })])).toEqual([]);
    expect(foldPastStudents([row({ is_active: true, removed_at: null }), row()])).toEqual([]);
  });
});

describe('splitAddableStudents', () => {
  const pastRecord: PastStudentRecord = {
    user_id: 'u1',
    name: 'Old Student',
    ms_oid: 'oid-old',
    email: 'Old_Student@neramclasses.com',
    personal_email: null,
    linked_classroom_email: null,
    academic_year: '2024-25',
    last_classroom: 'NATA 2026',
    removal_reason: 'course_completed',
    removed_at: '2026-04-10T00:00:00Z',
  };

  it('moves a past student out of the new accounts, matched by oid', () => {
    const split = splitAddableStudents(
      [dir({ id: 'oid-old', userPrincipalName: 'x@neramclasses.com', mail: null }), dir({ id: 'oid-new' })],
      [pastRecord],
    );
    expect(split.fresh.map((u) => u.id)).toEqual(['oid-new']);
    expect(split.past.map((p) => p.user.id)).toEqual(['oid-old']);
  });

  it('matches by address when the stored oid is missing', () => {
    const split = splitAddableStudents(
      [dir({ id: 'oid-other', userPrincipalName: 'old_student@NERAMCLASSES.com', mail: null })],
      [{ ...pastRecord, ms_oid: null }],
    );
    expect(split.past).toHaveLength(1);
    expect(split.fresh).toEqual([]);
  });

  it('lists new accounts newest first, undated last', () => {
    const split = splitAddableStudents(
      [
        dir({ id: 'a', displayName: 'Older', createdDateTime: '2026-08-01T10:00:00Z' }),
        dir({ id: 'b', displayName: 'Newest', createdDateTime: '2026-09-08T10:00:00Z' }),
        dir({ id: 'c', displayName: 'No date', createdDateTime: null }),
      ],
      [],
    );
    expect(split.fresh.map((u) => u.displayName)).toEqual(['Newest', 'Older', 'No date']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run apps/nexus/src/lib/org-directory.test.ts`
Expected: FAIL, `foldPastStudents` / `splitAddableStudents` not exported, `createdDateTime` not in the type.

- [ ] **Step 3: Implement the helpers**

In `org-directory.ts`, add to `EntraDirectoryUser` after `userType`:

```ts
  /** When the account was created. Lets the newest joiners be listed first. */
  createdDateTime?: string | null;
```

At the end of the file, add:

```ts
/** One nexus_enrollments student row with its user and classroom, as the route selects it. */
export interface StudentEnrollmentRow {
  user_id: string;
  is_active: boolean | null;
  removed_at?: string | null;
  removal_reason_category?: string | null;
  classroom?: { name?: string | null } | null;
  user?: (EnrollmentBlockRow & { id?: string; name?: string | null; academic_year?: string | null }) | null;
}

/** Someone who was a student in some classroom and is active in none. */
export interface PastStudentRecord extends EnrollmentBlockRow {
  user_id: string;
  name: string | null;
  academic_year: string | null;
  last_classroom: string | null;
  removal_reason: string | null;
  removed_at: string | null;
}

/**
 * Fold every student enrollment into the people who are active nowhere.
 *
 * These left a class (usually "course completed") without going through
 * Graduate, so is_alumni is still false and the blocklist cannot see them.
 */
export function foldPastStudents(rows: StudentEnrollmentRow[]): PastStudentRecord[] {
  const byUser = new Map<string, { active: boolean; latest: StudentEnrollmentRow }>();

  for (const row of rows || []) {
    if (!row?.user_id) continue;
    const seen = byUser.get(row.user_id);
    if (!seen) {
      byUser.set(row.user_id, { active: !!row.is_active, latest: row });
      continue;
    }
    seen.active = seen.active || !!row.is_active;
    if ((row.removed_at || '') > (seen.latest.removed_at || '')) seen.latest = row;
  }

  const past: PastStudentRecord[] = [];
  for (const [userId, { active, latest }] of byUser) {
    if (active) continue;
    const user = latest.user ?? null;
    past.push({
      user_id: userId,
      name: user?.name ?? null,
      ms_oid: user?.ms_oid ?? null,
      email: user?.email ?? null,
      personal_email: user?.personal_email ?? null,
      linked_classroom_email: user?.linked_classroom_email ?? null,
      academic_year: user?.academic_year ?? null,
      last_classroom: latest.classroom?.name ?? null,
      removal_reason: latest.removal_reason_category ?? null,
      removed_at: latest.removed_at ?? null,
    });
  }
  return past;
}

export interface AddableSplit {
  fresh: EntraDirectoryUser[];
  past: Array<{ user: EntraDirectoryUser; record: PastStudentRecord }>;
}

/**
 * Separate addable directory accounts into genuinely new ones (newest first)
 * and past students, matched on ms_oid and on every address we hold, the same
 * way the blocklist matches, so a null or stale oid still lands correctly.
 */
export function splitAddableStudents(
  addable: EntraDirectoryUser[],
  pastRecords: PastStudentRecord[]
): AddableSplit {
  const byOid = new Map<string, PastStudentRecord>();
  const byEmail = new Map<string, PastStudentRecord>();
  for (const record of pastRecords || []) {
    if (record.ms_oid) byOid.set(record.ms_oid, record);
    for (const address of [record.email, record.personal_email, record.linked_classroom_email]) {
      if (address) byEmail.set(String(address).trim().toLowerCase(), record);
    }
  }

  const fresh: EntraDirectoryUser[] = [];
  const past: AddableSplit['past'] = [];
  for (const user of addable || []) {
    const upn = String(user.userPrincipalName || '').trim().toLowerCase();
    const mail = String(user.mail || '').trim().toLowerCase();
    let record = byOid.get(user.id);
    if (!record && upn) record = byEmail.get(upn);
    if (!record && mail) record = byEmail.get(mail);
    if (record) past.push({ user, record });
    else fresh.push(user);
  }

  fresh.sort((a, b) => {
    const aCreated = a.createdDateTime || '';
    const bCreated = b.createdDateTime || '';
    if (aCreated !== bCreated) return bCreated.localeCompare(aCreated);
    return (a.displayName || '').localeCompare(b.displayName || '');
  });
  past.sort((a, b) => (a.user.displayName || '').localeCompare(b.user.displayName || ''));

  return { fresh, past };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run apps/nexus/src/lib/org-directory.test.ts`
Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Update the route**

In `apps/nexus/src/app/api/classrooms/[id]/available-students/route.ts`:

1. Replace the org-directory import with:

```ts
import {
  buildEnrollmentBlocklist,
  foldPastStudents,
  selectAddableStudents,
  splitAddableStudents,
  type EntraDirectoryUser,
} from '@/lib/org-directory';
```

2. In the Graph URL, change `$select=id,displayName,userPrincipalName,mail,accountEnabled,userType` to `$select=id,displayName,userPrincipalName,mail,accountEnabled,userType,createdDateTime`.

3. In the doc comment, change the line `Teacher/admin only. Returns { students: [{ ms_oid, name, email, inDatabase }] }.` to `Teacher/admin only. Returns { students, past, total, pastTotal }: new accounts newest first, and past students (active in no classroom) kept apart.`

4. Replace everything from the comment `// 4. Flag which of them already have a local users row (informational only).` through `return NextResponse.json({ students, total: students.length });` with:

```ts
    // 4. Past students: people who were students in some classroom and are active
    // in none. They left without being graduated, so the alumni block above misses
    // them, and their still-enabled accounts used to crowd out the new ones.
    const { data: studentEnrollmentRows, error: pastError } = await supabase
      .from('nexus_enrollments')
      .select(
        'user_id, is_active, removed_at, removal_reason_category, classroom:nexus_classrooms(name), user:users!nexus_enrollments_user_id_fkey!inner(id, name, ms_oid, email, personal_email, linked_classroom_email, academic_year)'
      )
      .eq('role', 'student');
    if (pastError) throw pastError;

    const { fresh, past } = splitAddableStudents(addable, foldPastStudents(studentEnrollmentRows || []));

    // 5. Flag which of them already have a local users row (informational only).
    const addableOids = addable.map((u) => u.id);
    const { data: existingUsers } = await supabase
      .from('users')
      .select('ms_oid')
      .in('ms_oid', addableOids.length > 0 ? addableOids : ['__none__']);
    const existingOids = new Set((existingUsers || []).map((u: any) => u.ms_oid));

    const toDto = (u: EntraDirectoryUser) => ({
      ms_oid: u.id,
      name: u.displayName || u.userPrincipalName?.split('@')[0] || 'Unknown',
      email: u.mail || u.userPrincipalName || '',
      inDatabase: existingOids.has(u.id),
      createdAt: u.createdDateTime ?? null,
    });

    const students = fresh.map(toDto);
    const pastStudents = past.map(({ user, record }) => ({
      ...toDto(user),
      academicYear: record.academic_year,
      lastClassroom: record.last_classroom,
      removalReason: record.removal_reason,
      removedAt: record.removed_at,
    }));

    return NextResponse.json({
      students,
      past: pastStudents,
      total: students.length,
      pastTotal: pastStudents.length,
    });
```

- [ ] **Step 6: Rewrite AvailableStudentsSection**

Re-read `apps/nexus/src/components/AvailableStudentsSection.tsx` first. If it changed since this plan was written, carry those changes into the version below. Replace the file with:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  TextField,
  Button,
  Checkbox,
  CircularProgress,
  IconButton,
  Alert,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import GraphAvatar from '@/components/GraphAvatar';
import { timeAgo } from '@/components/catchup/shared';
import { useDirectoryEnroll } from '@/components/students/useDirectoryEnroll';
import { rankPeople } from '@/lib/people-search';

interface DirectoryStudent {
  ms_oid: string;
  name: string;
  email: string;
  inDatabase: boolean;
  /** When the Microsoft account was created, so the newest joiners read first. */
  createdAt: string | null;
}

interface PastStudent extends DirectoryStudent {
  academicYear: string | null;
  lastClassroom: string | null;
  removalReason: string | null;
  removedAt: string | null;
}

interface Props {
  classroomId: string;
  getToken: () => Promise<string | null>;
  /** Called after one or more students are enrolled, so the parent refreshes its roster. */
  onEnrolled: () => void;
}

const REMOVAL_LABEL: Record<string, string> = {
  course_completed: 'Course completed',
  fee_nonpayment: 'Fees unpaid',
  college_admitted: 'Joined college',
  self_withdrawal: 'Left on their own',
  disciplinary: 'Removed by staff',
  other: 'Removed',
};

function pastMeta(student: PastStudent): string {
  return [
    student.academicYear,
    student.removalReason ? REMOVAL_LABEL[student.removalReason] ?? 'Removed' : null,
    student.lastClassroom,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * "Not yet in class": Microsoft accounts not enrolled in this classroom.
 *
 * New accounts come first, newest at the top, because that is who a teacher
 * opens this for. Past students (active in no classroom, never graduated) sit in
 * a collapsed group underneath: they used to top the list and bury the new ones.
 * Every add goes through useDirectoryEnroll, which asks before linking or
 * creating when the account may belong to a student already enrolled.
 */
export default function AvailableStudentsSection({ classroomId, getToken, onEnrolled }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<DirectoryStudent[]>([]);
  const [past, setPast] = useState<PastStudent[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const { enroll: enrollDirectory, dialog } = useDirectoryEnroll({ classroomId, getToken });

  const fetchAvailable = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/classrooms/${classroomId}/available-students`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 502) {
        setUnavailable(true);
        setStudents([]);
        setPast([]);
        return;
      }
      if (!res.ok) throw new Error('Failed to load available students');
      const data = await res.json();
      setStudents(data.students || []);
      setPast(data.past || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load available students');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [classroomId, getToken]);

  // Lazy-load the directory the first time the section is expanded.
  useEffect(() => {
    if (expanded && !loaded && !loading) fetchAvailable();
  }, [expanded, loaded, loading, fetchAvailable]);

  const toggleSelect = (msOid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(msOid)) next.delete(msOid);
      else next.add(msOid);
      return next;
    });
  };

  // An empty query keeps the order the route returns; a typed one leads with the closest match.
  const filtered = rankPeople(students, query);
  const filteredPast = rankPeople(past, query);

  const enroll = async (toAdd: DirectoryStudent[]) => {
    if (toAdd.length === 0) return;
    setAdding(true);
    setError(null);
    try {
      const outcome = await enrollDirectory(toAdd.map(({ ms_oid, name, email }) => ({ ms_oid, name, email })));
      const added = new Set(outcome.added);
      setStudents((prev) => prev.filter((s) => !added.has(s.ms_oid)));
      setPast((prev) => prev.filter((s) => !added.has(s.ms_oid)));
      setSelected(new Set());
      if (outcome.errors.length > 0) setError(outcome.errors.join(' '));
      if (added.size > 0) onEnrolled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add students');
    } finally {
      setAdding(false);
    }
  };

  const renderRow = (student: DirectoryStudent, meta: string, actionLabel: string) => (
    <Box
      key={student.ms_oid}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1,
        borderRadius: 2,
        minHeight: 56,
        bgcolor: selected.has(student.ms_oid) ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Checkbox
        checked={selected.has(student.ms_oid)}
        size="small"
        onChange={() => toggleSelect(student.ms_oid)}
        inputProps={{ 'aria-label': `Select ${student.name}` }}
        sx={{ p: 0.5 }}
      />
      <GraphAvatar msOid={student.ms_oid} name={student.name} size={36} clickable={false} tapToView={false} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {student.name}
          </Typography>
          {!student.inDatabase && (
            <Chip label="New" size="small" color="info" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
          )}
        </Box>
        {student.email && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {student.email}
          </Typography>
        )}
        {meta && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {meta}
          </Typography>
        )}
      </Box>
      <Button
        size="small"
        variant="outlined"
        disabled={adding}
        onClick={() => enroll([student])}
        sx={{ minHeight: 48, textTransform: 'none', flexShrink: 0 }}
      >
        {actionLabel}
      </Button>
    </Box>
  );

  return (
    <Paper variant="outlined" sx={{ mb: 2, borderRadius: 2, overflow: 'hidden' }}>
      {/* Header */}
      <Box
        onClick={() => setExpanded((v) => !v)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          cursor: 'pointer',
          minHeight: 48,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <PersonAddAltOutlinedIcon fontSize="small" color="action" />
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
          Not yet in class
          {loaded && !unavailable && (
            <Chip
              label={students.length}
              size="small"
              color={students.length > 0 ? 'primary' : 'default'}
              sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Typography>
        {expanded && (
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); fetchAvailable(); }}
            disabled={loading}
            aria-label="Refresh directory"
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        )}
        {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      </Box>

      {expanded && (
        <Box sx={{ px: 1.5, pb: 1.5 }}>
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
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 360, overflow: 'auto' }}>
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
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 360, overflow: 'auto' }}>
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
      )}

      {dialog}
    </Paper>
  );
}
```

- [ ] **Step 7: Type-check and lint**

Run: `pnpm --filter @neram/nexus type-check`
Expected: exit code 0 for the touched files.
Run: `pnpm --filter @neram/nexus lint`
Expected: no new errors in the touched files (`react/no-unescaped-entities` is why quotes use `&quot;`).

- [ ] **Step 8: Commit (only if the user has asked for commits)**

```bash
git add apps/nexus/src/lib/org-directory.ts apps/nexus/src/lib/org-directory.test.ts "apps/nexus/src/app/api/classrooms/[id]/available-students/route.ts" apps/nexus/src/components/AvailableStudentsSection.tsx
git commit -m "fix(nexus): Not yet in class lists new accounts first and past students apart"
```

---

### Task 7: E2E coverage

**Files:**
- Create: `tests/e2e/students-search-nexus.spec.ts`

**Interfaces:**
- Consumes: `APP_URLS`, `getTestAuthToken`, `injectAuthForPage` from `tests/utils/credentials.ts`; page text from Task 2; HTTP shape from Task 6.
- Produces: nothing.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/students-search-nexus.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

/**
 * Search on the Students screen at 375px, plus the "Not yet in class" payload.
 *
 * Data-driven on purpose: the test classroom's roster is not fixed, so the typo
 * is built from a real student's first name. Only names without an h and
 * without doubled letters are used, because the phonetic folds would otherwise
 * turn a one-letter swap into a larger difference than the typo itself.
 *
 * Read-only. Local dev writes to the production database, so nothing here adds,
 * links or removes anyone.
 */

const NEXUS = APP_URLS.nexus;
const SEARCH_PLACEHOLDER = 'Search by name or email...';

test.use({ viewport: { width: 375, height: 812 } });

/** Swap the third and fourth letters: one edit a substring search cannot reach. */
function transpose(word: string): string {
  return word.slice(0, 2) + word[3] + word[2] + word.slice(4);
}

test.describe('Students search tolerates spelling', () => {
  let target: string | null = null;

  test.beforeAll(async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    const classroomId = auth?.classrooms?.[0]?.id;
    if (!auth || !classroomId) return;
    const res = await request.get(`${NEXUS}/api/students?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (res.status() !== 200) return;
    const { students } = await res.json();
    const pick = (students || []).find((s: { name?: string }) => {
      const first = (s.name || '').split(' ')[0];
      return (
        /^[A-Za-z]{6,}$/.test(first) &&
        !/h/i.test(first) &&
        !/(.)\1/i.test(first) &&
        first[2].toLowerCase() !== first[3].toLowerCase()
      );
    });
    target = pick?.name ?? null;
  });

  test.beforeEach(async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Nexus test-login unavailable');
    test.skip(!target, 'No suitable student name in the test classroom');
    await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible({ timeout: 15000 });
  });

  test('a two-letter swap still finds the student, whatever category is selected', async ({ page }) => {
    const first = target!.split(' ')[0];
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(transpose(first));
    await expect(page.locator('[role="button"]').filter({ hasText: target! }).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('Searching every student in this classroom, in all categories.')).toBeVisible();
  });

  test('a search that matches nobody says so', async ({ page }) => {
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill('qqqzzzxx');
    await expect(page.getByText('No student matches "qqqzzzxx"')).toBeVisible();
  });

  test('searching never pushes the page sideways at 375px', async ({ page }) => {
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(target!.split(' ')[0]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});

test.describe('Not yet in class payload', () => {
  test('returns new accounts and past students separately', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    const classroomId = auth?.classrooms?.[0]?.id;
    test.skip(!auth || !classroomId, 'Nexus test-login unavailable');

    const res = await request.get(`${NEXUS}/api/classrooms/${classroomId}/available-students`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
    });
    test.skip(res.status() === 502, 'Microsoft directory unavailable in this environment');
    test.skip(res.status() === 403, 'The test account may not list the directory');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.students)).toBe(true);
    expect(Array.isArray(body.past)).toBe(true);
    for (const student of body.students) expect(student).toHaveProperty('createdAt');

    const pastOids = new Set(body.past.map((p: { ms_oid: string }) => p.ms_oid));
    for (const student of body.students) expect(pastOids.has(student.ms_oid)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it**

Make sure `pnpm dev:nexus` is running (do not run a build). Then:

Run: `PW_APPS=nexus pnpm test:e2e tests/e2e/students-search-nexus.spec.ts --project=nexus-chrome --no-deps`
Expected: PASS, or explicit skips with the reasons above.

> Deviation recorded during execution (2026-09-10): the first version of this spec picked a student by requiring a 6+ letter first name with no h and no doubled letters. The test classroom had none, so all three search tests skipped. The shipped spec (see `tests/e2e/students-search-nexus.spec.ts`) instead doubles one safe inner consonant of any 4+ letter first name, loads the roster with `examBatch=current` to match the screen, and only the respelling test depends on finding a student. `PW_APPS=nexus` keeps Playwright from starting the other three apps. A skip for "Nexus test-login unavailable" means the auth bypass is not configured locally; report it rather than treating it as a pass.

- [ ] **Step 3: Commit (only if the user has asked for commits)**

```bash
git add tests/e2e/students-search-nexus.spec.ts
git commit -m "test(nexus): e2e for spelling-tolerant student search and directory split"
```

---

### Task 8: Verification gate

**Files:** none changed unless a check fails.

**Interfaces:** none.

- [ ] **Step 1: Unit tests for this phase**

Run: `pnpm test:run apps/nexus/src/lib/people-search.test.ts apps/nexus/src/lib/identity-candidates.test.ts apps/nexus/src/lib/directory-enrollment.test.ts apps/nexus/src/lib/org-directory.test.ts apps/nexus/src/components/students/useDirectoryEnroll.test.tsx`
Expected: all PASS.

- [ ] **Step 2: The whole Nexus unit suite**

Run: `pnpm test:run apps/nexus`
Expected: no test that passed before this work now fails. If something unrelated was already failing, note it with its name.

- [ ] **Step 3: Type-check and lint**

Run: `pnpm --filter @neram/nexus type-check`
Expected: exit code 0.
Run: `pnpm --filter @neram/nexus lint`
Expected: exit code 0.

- [ ] **Step 4: Manual check on the dev server (read-only)**

With `pnpm dev:nexus` running, sign in as staff and open `http://localhost:3012/teacher/students`:
1. Type `disha`. Expected: Dhisha Haribabu appears, with the "Searching every student..." caption.
2. Type `dsha`. Expected: "No student matches" with a Did you mean chip for Dhisha Haribabu; tapping it fills the search.
3. Expand "Not yet in class". Expected: newest accounts first with "Account created ..."; a collapsed "Past students (N)" group; expanding it shows year, reason and last classroom with the info note.
4. At 375px (browser devtools), confirm no sideways scroll and that Add, Add back and the Past students toggle are at least 48px tall.
Do not press Add, Add back or anything in the duplicate sheet: this server writes to production.

- [ ] **Step 5: UI review with the ui-ux-pro-max skill**

Invoke the `ui-ux-pro-max` skill to review `DuplicateConfirmSheet`, the Students empty state and `AvailableStudentsSection` against its critical rules (touch targets, labels, contrast, no color-only meaning). Fix anything it flags in these files, then re-run Steps 1 and 3.

---

### Task 9: Repair Afrin's duplicate in production (gated)

**Files:** none. Runs through the `mcp__supabase-prod__execute_sql` tool.

**Interfaces:**
- Survivor (keeps all Nexus activity): `2c53b9e3-4c20-49a3-b6e2-c19d84dcc300`, `Afrin_banu@neramclasses.com`
- Merged in (fee record, payment, phone): `61ede737-106c-4663-8c55-d720531da39d`, `afrinbanu20101@gmail.com`
- Acting admin for the audit trail: `fe02a591-dd77-4459-a0ae-d281539278c3` (Hari Babu)

- [ ] **Step 1: Preview (read-only) and show the user**

Run:

```sql
select 'merge in gmail record' as direction, * from preview_user_merge('61ede737-106c-4663-8c55-d720531da39d') order by rows desc;
```

and:

```sql
select kind, count(*) as rows,
  count(*) filter (where exists (
    select 1 from nexus_attendance a
    where a.scheduled_class_id = x.scheduled_class_id
      and a.student_id = '2c53b9e3-4c20-49a3-b6e2-c19d84dcc300' and a.attended
  )) as on_classes_she_attended
from nexus_class_absences x
where x.student_id = '61ede737-106c-4663-8c55-d720531da39d'
group by kind;
```

Expected on 2026-09-10: `late_joiner` 16 (0 attended), `no_show` 11 (8 attended). Show both results to the user. If the `no_show` count is no longer 11, stop and report.

- [ ] **Step 2: Wait for an explicit go from the user**

Do not continue on silence or an ambiguous reply.

- [ ] **Step 3: Run the repair as one atomic statement**

```sql
do $$
declare
  removed int;
begin
  delete from nexus_class_absences
   where student_id = '61ede737-106c-4663-8c55-d720531da39d'
     and kind = 'no_show';
  get diagnostics removed = row_count;
  if removed <> 11 then
    raise exception 'expected 11 no_show rows on the gmail record, found %', removed;
  end if;

  perform merge_user_records(
    '2c53b9e3-4c20-49a3-b6e2-c19d84dcc300'::uuid,
    '61ede737-106c-4663-8c55-d720531da39d'::uuid,
    'fe02a591-dd77-4459-a0ae-d281539278c3'::uuid
  );

  update student_profiles
     set ms_teams_email = 'Afrin_banu@neramclasses.com'
   where user_id = '2c53b9e3-4c20-49a3-b6e2-c19d84dcc300'
     and ms_teams_email is null;

  update nexus_enrollments
     set enrolled_at = '2026-08-13T12:45:27.209762+00:00'
   where user_id = '2c53b9e3-4c20-49a3-b6e2-c19d84dcc300'
     and role = 'student'
     and is_active;
end $$;
```

Expected: success. Any exception rolls back every step.

- [ ] **Step 4: Post-check**

```sql
select u.name, u.email, u.personal_email, u.phone,
  u.ms_oid is not null as has_microsoft, u.firebase_uid is not null as has_google,
  (select count(*) from users where id = '61ede737-106c-4663-8c55-d720531da39d') as merged_row_left,
  (select count(*) from nexus_enrollments e where e.user_id = u.id and e.is_active) as active_enrollments,
  (select min(e.enrolled_at) from nexus_enrollments e where e.user_id = u.id and e.is_active) as joined,
  (select count(*) from nexus_class_absences a where a.student_id = u.id and a.kind = 'late_joiner') as late_joiner_absences,
  (select count(*) from nexus_catchup_journeys j where j.student_id = u.id) as catchup_journeys,
  (select count(*) from nexus_class_absences a
     join nexus_attendance t on t.scheduled_class_id = a.scheduled_class_id and t.student_id = a.student_id and t.attended
    where a.student_id = u.id) as absences_on_attended_classes,
  (select count(*) from payments p where p.user_id = u.id) as payments,
  (select sp.ms_teams_email from student_profiles sp where sp.user_id = u.id) as ms_teams_email
from users u
where u.id = '2c53b9e3-4c20-49a3-b6e2-c19d84dcc300';
```

Expected: `email` `Afrin_banu@neramclasses.com`; `personal_email` `afrinbanu20101@gmail.com`; `phone` `+916382901455`; `has_microsoft` true; `has_google` true; `merged_row_left` 0; `active_enrollments` 1; `joined` 2026-08-13; `late_joiner_absences` 16; `catchup_journeys` 1; `absences_on_attended_classes` 0; `payments` 1; `ms_teams_email` `Afrin_banu@neramclasses.com`. Report the actual row to the user, and flag any value that differs.

> Deviation recorded during execution (2026-09-10): the merge ran and every post-check matched except `late_joiner_absences`, which read 0, not 16. `_merge_dedupe_unique` ignores partial-index predicates, so `uq_class_absences_one_active` made it delete all 16 incoming catch-up rows. None carried human input. With the user's go, they were rebuilt with an insert mirroring `ensureCatchupJourney` (guarded to exactly 16 rows): journey `f3445091` now holds 16 absences, 3 Jul to 12 Aug, none on attended classes. The helper is fixed in `supabase/migrations/20260910110000_merge_dedupe_respects_partial_indexes.sql`: applied to staging on 2026-09-10 with its four self-test cases passing, not yet applied to production.

- [ ] **Step 5: Confirm on screen**

On `/teacher/students`, search `afrin`. Expected: one Afrin banu, no "No Microsoft account" chip, and the "1 awaiting Microsoft" chip gone from the header.
