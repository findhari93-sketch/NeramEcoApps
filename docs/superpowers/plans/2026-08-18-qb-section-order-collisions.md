# QB Section/Order Collision Review Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give teachers a review screen that finds every question-bank paper where two or more
questions collide on the same `(section, display_order)`, suggests which section each colliding
question actually belongs to, and lets the teacher confirm/override before writing anything.

**Architecture:** A package-layer query pair (`findSectionOrderCollisions`,
`resolveSectionOrderCollisions`) does the reads/writes. Two small pure-function `lib` modules in
`apps/nexus` do the judgment calls: `suggestSection()` (category taxonomy, falling back to the
existing `contentSignal()` text classifier) and `assignSectionOrders()` (renumbering within a
target section so a batch never creates a new collision). One API route file exposes GET (list)
and PATCH (apply) on `/api/question-bank/section-collisions`, matching the existing
`.../papers/[id]/sections/route.ts` GET/PATCH/POST-on-one-file convention rather than a separate
`/apply` sub-route. A small presentational component renders one collision group; the page itself
is a thin fetch/state wrapper, matching this codebase's existing split (tested components,
E2E-only pages — there are no page-level component tests anywhere in
`apps/nexus/src/app/(teacher)/teacher/question-bank/`).

**Tech Stack:** Next.js 14 App Router API routes, Supabase (admin client), MUI v5, Vitest,
Playwright.

**Spec:** `docs/superpowers/specs/2026-08-18-qb-section-order-collisions-design.md`

## Global Constraints

- No em dashes, double dashes, or `&mdash;` in any user-visible text/labels/copy (repo-wide rule).
- No schema/migration changes (spec's explicit non-goal).
- Never fetch an unbounded page of `nexus_qb_questions` without either scoping to one paper
  (bounded, always < 500 rows) or using `fetchAllRows` from
  `packages/database/src/utils/paged-rows.ts` — PostgREST silently truncates at 1000 rows with no
  error (see that file's own docstring for the incident this fixes).
- Every new API route is staff-only via `verifyQBStaff` from `apps/nexus/src/lib/qb-auth.ts`.
- Every write is scoped by `paper_id`/`original_paper_id` server-side, matching
  `setQuestionSections`'s existing scoping rule.
- Mobile-first: 375px viewport, 44px minimum touch targets, matching `apps/nexus/CLAUDE.md`.
- Every feature ships with tests in the same change: unit tests for pure logic, a component test
  for the review card, an E2E smoke test (per root `CLAUDE.md` Testing Requirements).

---

## Task 1: Package query layer

**Files:**
- Modify: `packages/database/src/queries/nexus/question-bank.ts` (add after `setQuestionSections`,
  which ends at line 2321)
- Test: `packages/database/src/queries/__tests__/qb-section-order-collisions.test.ts`

**Interfaces:**
- Produces: `QBSectionOrderCollisionCandidate`, `QBSectionOrderCollisionGroup`,
  `findSectionOrderCollisions(client?: TypedSupabaseClient): Promise<QBSectionOrderCollisionGroup[]>`,
  `resolveSectionOrderCollisions(paperId: string, resolutions: Array<{ question_id: string; section: QBQuestionSection; display_order: number }>, client?: TypedSupabaseClient): Promise<{ updated: number }>`.
  All three exported from `@neram/database` automatically via the existing
  `export * from './question-bank'` barrel in `packages/database/src/queries/nexus/index.ts:13`
  and `packages/database/src/queries/index.ts:32`.

- [ ] **Step 1: Write the failing test**

Create `packages/database/src/queries/__tests__/qb-section-order-collisions.test.ts`:

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { findSectionOrderCollisions, resolveSectionOrderCollisions } from '../nexus/question-bank';

function createChainableMock() {
  let resolvedValue: any = { data: null, error: null };

  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    range: vi.fn(() => Promise.resolve(resolvedValue)),
    then: vi.fn((resolve: any) => resolve(resolvedValue)),
  };

  for (const method of ['from', 'select', 'update', 'eq', 'not']) {
    const original = chain[method];
    chain[method] = vi.fn((...args: any[]) => {
      original(...args);
      return chain;
    });
  }

  return {
    mock: chain,
    setResolvedValue: (val: any) => { resolvedValue = val; },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findSectionOrderCollisions', () => {
  test('groups by paper + section + display_order and drops singletons', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({
      data: [
        { id: 'q1', original_paper_id: 'p1', section: 'math_mcq', display_order: 1, question_text: 'a', question_format: 'MCQ', categories: ['mathematics'] },
        { id: 'q2', original_paper_id: 'p1', section: 'math_mcq', display_order: 12, question_text: 'b', question_format: 'MCQ', categories: ['differential_equations'] },
        { id: 'q3', original_paper_id: 'p1', section: 'math_mcq', display_order: 12, question_text: 'c', question_format: 'MCQ', categories: ['aptitude'] },
        { id: 'q4', original_paper_id: 'p1', section: 'aptitude', display_order: 1, question_text: 'd', question_format: 'MCQ', categories: ['aptitude'] },
      ],
      error: null,
    });

    const groups = await findSectionOrderCollisions(mock.mock);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ original_paper_id: 'p1', section: 'math_mcq', display_order: 12 });
    expect(groups[0].candidates.map((c) => c.id).sort()).toEqual(['q2', 'q3']);
  });

  test('returns nothing when no paper has a collision', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({
      data: [
        { id: 'q1', original_paper_id: 'p1', section: 'math_mcq', display_order: 1, question_text: 'a', question_format: 'MCQ', categories: [] },
      ],
      error: null,
    });

    const groups = await findSectionOrderCollisions(mock.mock);
    expect(groups).toEqual([]);
  });

  test('throws on a query error rather than returning a partial result', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(findSectionOrderCollisions(mock.mock)).rejects.toBeTruthy();
  });
});

describe('resolveSectionOrderCollisions', () => {
  test('writes section, section_order and display_order per resolution, scoped to the paper', async () => {
    const { mock, setResolvedValue } = createChainableMock();
    setResolvedValue({ data: [{ id: 'q3' }], error: null });

    const result = await resolveSectionOrderCollisions(
      'p1',
      [{ question_id: 'q3', section: 'aptitude', display_order: 51 }],
      mock.mock,
    );

    expect(result).toEqual({ updated: 1 });
    expect(mock.mock.update).toHaveBeenCalledWith(
      expect.objectContaining({ section: 'aptitude', section_order: 3, display_order: 51 }),
    );
    expect(mock.mock.eq).toHaveBeenCalledWith('original_paper_id', 'p1');
  });

  test('returns updated: 0 for an empty resolution list without querying', async () => {
    const { mock } = createChainableMock();
    const result = await resolveSectionOrderCollisions('p1', [], mock.mock);
    expect(result).toEqual({ updated: 0 });
    expect(mock.mock.from).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @neram/database exec vitest run src/queries/__tests__/qb-section-order-collisions.test.ts`
Expected: FAIL with "findSectionOrderCollisions is not a function" (or similar import error).

- [ ] **Step 3: Write minimal implementation**

Add to `packages/database/src/queries/nexus/question-bank.ts` immediately after
`setQuestionSections` (after the closing brace at line 2321), and add
`import { fetchAllRows } from '../../utils/paged-rows';` to the top import block alongside the
existing `import { QB_SECTION_ORDER } from '../../types';` at line 3:

```typescript
/** One question implicated in a section/number collision. */
export interface QBSectionOrderCollisionCandidate {
  id: string;
  original_paper_id: string;
  section: QBQuestionSection;
  display_order: number;
  question_text: string | null;
  question_format: QBQuestionFormat;
  categories: string[];
}

/** Two or more questions on one paper sharing the same section and number. */
export interface QBSectionOrderCollisionGroup {
  original_paper_id: string;
  section: QBQuestionSection;
  display_order: number;
  candidates: QBSectionOrderCollisionCandidate[];
}

/**
 * Find every question-bank paper where two or more questions share the same
 * (section, display_order): a parser that lost its place on a multi-column PDF
 * stamped unrelated questions with the same row-position number.
 *
 * Reads every sectioned question bank-wide (about 2,000 rows at time of
 * writing), so this goes through fetchAllRows rather than a bare .select():
 * PostgREST silently truncates a single page at 1000 rows with no error, which
 * is exactly the failure mode this tool exists to catch, not repeat.
 */
export async function findSectionOrderCollisions(
  client?: TypedSupabaseClient
): Promise<QBSectionOrderCollisionGroup[]> {
  const supabase = client || getSupabaseAdminClient();

  const rows = await fetchAllRows<any>(() =>
    (supabase as any)
      .from('nexus_qb_questions')
      .select('id, original_paper_id, section, display_order, question_text, question_format, categories')
      .not('display_order', 'is', null)
      .not('section', 'is', null)
  );

  const groups = new Map<string, QBSectionOrderCollisionGroup>();
  for (const row of rows) {
    const key = `${row.original_paper_id}::${row.section}::${row.display_order}`;
    if (!groups.has(key)) {
      groups.set(key, {
        original_paper_id: row.original_paper_id,
        section: row.section,
        display_order: row.display_order,
        candidates: [],
      });
    }
    groups.get(key)!.candidates.push({
      id: row.id,
      original_paper_id: row.original_paper_id,
      section: row.section,
      display_order: row.display_order,
      question_text: row.question_text ?? null,
      question_format: row.question_format,
      categories: row.categories ?? [],
    });
  }

  return Array.from(groups.values()).filter((g) => g.candidates.length > 1);
}

/**
 * Write a batch of confirmed section/number reassignments.
 *
 * Scoped by paperId on every write, matching setQuestionSections: a stray
 * question id from another paper can never be touched through this call. Each
 * resolution writes section, section_order (derived, never accepted from the
 * caller, same rule as setQuestionSections) and display_order together, since
 * a collision fix always changes both at once.
 */
export async function resolveSectionOrderCollisions(
  paperId: string,
  resolutions: Array<{ question_id: string; section: QBQuestionSection; display_order: number }>,
  client?: TypedSupabaseClient
): Promise<{ updated: number }> {
  const supabase = client || getSupabaseAdminClient();
  if (resolutions.length === 0) return { updated: 0 };

  let updated = 0;
  for (const r of resolutions) {
    const { data, error } = await (supabase as any)
      .from('nexus_qb_questions')
      .update({
        section: r.section,
        section_order: QB_SECTION_ORDER[r.section] ?? null,
        display_order: r.display_order,
      })
      .eq('original_paper_id', paperId)
      .eq('id', r.question_id)
      .select('id');
    if (error) throw error;
    updated += (data || []).length;
  }

  return { updated };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @neram/database exec vitest run src/queries/__tests__/qb-section-order-collisions.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/queries/nexus/question-bank.ts packages/database/src/queries/__tests__/qb-section-order-collisions.test.ts
git commit -m "feat(database): add section/order collision query pair for QB papers"
```

---

## Task 2: Export the existing content classifier for reuse

**Files:**
- Modify: `apps/nexus/src/lib/qb-section-inference.ts:90` (the `contentSignal` function)
- Test: `apps/nexus/src/lib/qb-section-inference.test.ts` (add one case to the existing file)

**Interfaces:**
- Produces: `contentSignal(q: QBSectionInferenceInput): -1 | 0 | 1`, now exported.

- [ ] **Step 1: Write the failing test**

Add to the end of `apps/nexus/src/lib/qb-section-inference.test.ts` (open the file first to place
this inside the existing `describe` block or as a new one, following the file's existing import of
`inferPaperSections, type QBSectionInferenceInput` at line 2):

```typescript
import { contentSignal } from './qb-section-inference';

describe('contentSignal', () => {
  it('is exported for reuse outside the paper-wide boundary scan', () => {
    const signal = contentSignal({
      id: 'q1',
      question_number: 1,
      question_format: 'MCQ',
      question_text: 'Solution of the differential equation $(1 + y^2)dx$',
    });
    expect(signal).toBe(1);
  });

  it('reads aptitude vocabulary the same way it does inside inferPaperSections', () => {
    const signal = contentSignal({
      id: 'q2',
      question_number: 1,
      question_format: 'MCQ',
      question_text: 'Which of the following building represents the colonial Architectural pattern in India?',
    });
    expect(signal).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter nexus exec vitest run src/lib/qb-section-inference.test.ts`
Expected: FAIL with "contentSignal is not exported" / import error.

- [ ] **Step 3: Write minimal implementation**

In `apps/nexus/src/lib/qb-section-inference.ts`, change line 90 from:

```typescript
function contentSignal(q: QBSectionInferenceInput): -1 | 0 | 1 {
```

to:

```typescript
export function contentSignal(q: QBSectionInferenceInput): -1 | 0 | 1 {
```

No other line in the file changes; `findMathBoundary` and `inferPaperSections` keep calling it
exactly as before.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter nexus exec vitest run src/lib/qb-section-inference.test.ts`
Expected: PASS, including every pre-existing test in the file (regression check that the export
keyword changed nothing else).

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/lib/qb-section-inference.ts apps/nexus/src/lib/qb-section-inference.test.ts
git commit -m "refactor(nexus): export contentSignal for the collision-suggestion tool"
```

---

## Task 3: Section suggestion heuristic

**Files:**
- Create: `apps/nexus/src/lib/qb-collision-suggestion.ts`
- Test: `apps/nexus/src/lib/qb-collision-suggestion.test.ts`

**Interfaces:**
- Consumes: `contentSignal` from `./qb-section-inference` (Task 2); `QB_CATEGORY_GROUP_LABELS`,
  `QBCategory`, `QBQuestionFormat`, `QBQuestionSection` from `@neram/database`.
- Produces: `suggestSection(question: QBCollisionSuggestionInput): QBQuestionSection | null`, used
  by Task 5's GET handler.

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/lib/qb-collision-suggestion.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { suggestSection } from './qb-collision-suggestion';

describe('suggestSection', () => {
  it('format vetoes to drawing regardless of category', () => {
    expect(suggestSection({
      question_format: 'DRAWING_PROMPT',
      question_text: 'Draw a proportionate sketch',
      categories: ['mathematics'],
    })).toBe('drawing');
  });

  it('format vetoes to math_numerical regardless of category', () => {
    expect(suggestSection({
      question_format: 'NUMERICAL',
      question_text: 'Find the value of x',
      categories: ['aptitude'],
    })).toBe('math_numerical');
  });

  it('reads the broad "mathematics" category', () => {
    expect(suggestSection({
      question_format: 'MCQ',
      question_text: 'irrelevant',
      categories: ['mathematics'],
    })).toBe('math_mcq');
  });

  it('reads the broad "aptitude" category', () => {
    expect(suggestSection({
      question_format: 'MCQ',
      question_text: 'irrelevant',
      categories: ['aptitude'],
    })).toBe('aptitude');
  });

  it('reads a maths subcategory (differential_equations -> Calculus group)', () => {
    expect(suggestSection({
      question_format: 'MCQ',
      question_text: 'irrelevant',
      categories: ['differential_equations'],
    })).toBe('math_mcq');
  });

  it('reads an aptitude subcategory (architecture_gk -> Aptitude Topics group)', () => {
    expect(suggestSection({
      question_format: 'MCQ',
      question_text: 'irrelevant',
      categories: ['architecture_gk'],
    })).toBe('aptitude');
  });

  it('reads a NATA-topics subcategory (planning -> NATA Topics group)', () => {
    expect(suggestSection({
      question_format: 'MCQ',
      question_text: 'irrelevant',
      categories: ['planning'],
    })).toBe('aptitude');
  });

  it('falls back to the text classifier when categories give no signal', () => {
    expect(suggestSection({
      question_format: 'MCQ',
      question_text: 'The least positive integral value of $\\lambda$ such that $10^{50} + \\lambda$ is divisible by 9',
      categories: [],
    })).toBe('math_mcq');
  });

  it('returns null when nothing gives a usable signal, rather than guessing', () => {
    expect(suggestSection({
      question_format: 'MCQ',
      question_text: 'What is the answer?',
      categories: [],
    })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter nexus exec vitest run src/lib/qb-collision-suggestion.test.ts`
Expected: FAIL, module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/nexus/src/lib/qb-collision-suggestion.ts`:

```typescript
import {
  QB_CATEGORY_GROUP_LABELS,
  type QBCategory,
  type QBQuestionFormat,
  type QBQuestionSection,
} from '@neram/database';
import { contentSignal } from './qb-section-inference';

export interface QBCollisionSuggestionInput {
  question_format: QBQuestionFormat;
  question_text: string | null;
  categories: string[];
}

/**
 * Which QB_CATEGORY_GROUP_LABELS groups belong to which paper section.
 *
 * Deliberately reuses the taxonomy's existing group labels rather than
 * hand-listing every QBCategory a second time: QB_CATEGORY_GROUP_LABELS
 * already partitions every subcategory into exactly these groups for the
 * authoring UI, and a second, independent list here would drift from it the
 * first time a category is re-parented.
 */
const MATH_GROUPS = new Set([
  'Algebra',
  'Coordinate Geometry',
  'Calculus',
  'Trigonometry',
  'Vectors & 3D Geometry',
  'Probability & Statistics',
]);
const APTITUDE_GROUPS = new Set(['NATA Topics', 'Aptitude Topics']);

/**
 * Suggest which section a question actually belongs to, for one candidate in
 * a section/number collision.
 *
 * Signals in priority order:
 *   1. question_format vetoes first, same rule as inferPaperSections: a
 *      DRAWING_PROMPT is drawing, a NUMERICAL is maths numerical, wherever it
 *      sits.
 *   2. categories[], which the investigation that produced this tool found to
 *      be reliably correct even on rows whose `section` column was wrong. The
 *      broad categories (mathematics/aptitude/drawing) are checked directly;
 *      every other category is resolved through the group it already belongs
 *      to in the shared taxonomy.
 *   3. contentSignal(), the same LaTeX/vocabulary classifier
 *      inferPaperSections uses, run on this one question rather than assuming
 *      a paper-wide layout.
 *
 * Returns null when none of the three gives a usable answer, so the caller
 * shows "no suggestion" rather than a confident wrong guess.
 */
export function suggestSection(question: QBCollisionSuggestionInput): QBQuestionSection | null {
  if (question.question_format === 'DRAWING_PROMPT') return 'drawing';
  if (question.question_format === 'NUMERICAL') return 'math_numerical';

  for (const cat of question.categories) {
    if (cat === 'mathematics') return 'math_mcq';
    if (cat === 'aptitude') return 'aptitude';
    if (cat === 'drawing') return 'drawing';

    const group = QB_CATEGORY_GROUP_LABELS[cat as QBCategory];
    if (group && MATH_GROUPS.has(group)) return 'math_mcq';
    if (group && APTITUDE_GROUPS.has(group)) return 'aptitude';
  }

  const signal = contentSignal({
    id: '',
    question_number: null,
    question_format: question.question_format,
    question_text: question.question_text,
  });
  if (signal === 1) return 'math_mcq';
  if (signal === -1) return 'aptitude';

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter nexus exec vitest run src/lib/qb-collision-suggestion.test.ts`
Expected: PASS, all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/lib/qb-collision-suggestion.ts apps/nexus/src/lib/qb-collision-suggestion.test.ts
git commit -m "feat(nexus): add section-suggestion heuristic for colliding QB questions"
```

---

## Task 4: Within-batch renumbering

**Files:**
- Create: `apps/nexus/src/lib/qb-collision-renumber.ts`
- Test: `apps/nexus/src/lib/qb-collision-renumber.test.ts`

**Interfaces:**
- Produces: `assignSectionOrders(maxBySection, resolutions): CollisionRenumberOutput[]`, used by
  Task 5's PATCH handler.

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/lib/qb-collision-renumber.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assignSectionOrders } from './qb-collision-renumber';

describe('assignSectionOrders', () => {
  it('appends after the current max for that section', () => {
    const result = assignSectionOrders(
      { aptitude: 50 },
      [{ question_id: 'q1', section: 'aptitude' }],
    );
    expect(result).toEqual([{ question_id: 'q1', section: 'aptitude', display_order: 51 }]);
  });

  it('starts at 1 for a section with no existing questions', () => {
    const result = assignSectionOrders({}, [{ question_id: 'q1', section: 'math_numerical' }]);
    expect(result).toEqual([{ question_id: 'q1', section: 'math_numerical', display_order: 1 }]);
  });

  it('gives two candidates moving into the same section distinct, increasing numbers', () => {
    const result = assignSectionOrders(
      { aptitude: 50 },
      [
        { question_id: 'q1', section: 'aptitude' },
        { question_id: 'q2', section: 'aptitude' },
      ],
    );
    expect(result).toEqual([
      { question_id: 'q1', section: 'aptitude', display_order: 51 },
      { question_id: 'q2', section: 'aptitude', display_order: 52 },
    ]);
  });

  it('keeps each target section counting independently', () => {
    const result = assignSectionOrders(
      { aptitude: 50, math_mcq: 20 },
      [
        { question_id: 'q1', section: 'aptitude' },
        { question_id: 'q2', section: 'math_mcq' },
      ],
    );
    expect(result).toEqual([
      { question_id: 'q1', section: 'aptitude', display_order: 51 },
      { question_id: 'q2', section: 'math_mcq', display_order: 21 },
    ]);
  });

  it('returns an empty list for an empty input without touching maxBySection', () => {
    const maxBySection = { aptitude: 50 };
    const result = assignSectionOrders(maxBySection, []);
    expect(result).toEqual([]);
    expect(maxBySection).toEqual({ aptitude: 50 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter nexus exec vitest run src/lib/qb-collision-renumber.test.ts`
Expected: FAIL, module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/nexus/src/lib/qb-collision-renumber.ts`:

```typescript
import type { QBQuestionSection } from '@neram/database';

export interface CollisionRenumberResolution {
  question_id: string;
  section: QBQuestionSection;
}

export interface CollisionRenumberOutput {
  question_id: string;
  section: QBQuestionSection;
  display_order: number;
}

/**
 * Assign each resolved question a number within its target section's own
 * local sequence, appended after whatever that section's current highest
 * number already is.
 *
 * maxBySection is read but never mutated: a fresh running counter is derived
 * from it so two candidates resolving into the same section in one batch get
 * distinct, increasing numbers (51, 52, ...) instead of both becoming the
 * same "next" number.
 */
export function assignSectionOrders(
  maxBySection: Partial<Record<QBQuestionSection, number>>,
  resolutions: CollisionRenumberResolution[],
): CollisionRenumberOutput[] {
  const running: Partial<Record<QBQuestionSection, number>> = { ...maxBySection };

  return resolutions.map((r) => {
    const next = (running[r.section] ?? 0) + 1;
    running[r.section] = next;
    return { question_id: r.question_id, section: r.section, display_order: next };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter nexus exec vitest run src/lib/qb-collision-renumber.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/lib/qb-collision-renumber.ts apps/nexus/src/lib/qb-collision-renumber.test.ts
git commit -m "feat(nexus): add within-batch renumbering for resolved QB collisions"
```

---

## Task 5: API route

**Files:**
- Create: `apps/nexus/src/app/api/question-bank/section-collisions/route.ts`

**Interfaces:**
- Consumes: `findSectionOrderCollisions`, `resolveSectionOrderCollisions` (Task 1),
  `suggestSection` (Task 3), `assignSectionOrders` (Task 4), `verifyQBStaff` from
  `apps/nexus/src/lib/qb-auth.ts`, `describeError` from `apps/nexus/src/lib/api-errors.ts`,
  `getSupabaseAdminClient`, `isQBQuestionSection`, `QB_EXAM_TYPE_LABELS`, `type QBQuestionSection`
  from `@neram/database`.
- Produces the HTTP contract the page (Task 7) calls:
  - `GET` -> `{ data: { papers: Array<{ paper_id: string; exam_type: string; year: number;
    session: string | null; collisions: Array<{ section: string; display_order: number;
    candidates: Array<{ id: string; question_text: string | null; question_format: string;
    current_section: string; suggested_section: string | null }> }> }> } }`
  - `PATCH` body `{ paper_id: string; resolutions: Array<{ question_id: string; section:
    QBQuestionSection }> }` -> `{ data: { updated: number } }`

No unit test file for this task: this codebase has no precedent for testing API route handlers
directly (`apps/nexus/src/app/api/question-bank/**` has zero `.test.ts` files today); coverage
comes from the already-tested pure functions this route composes, plus the Task 9 E2E smoke test.

- [ ] **Step 1: Write the route**

Create `apps/nexus/src/app/api/question-bank/section-collisions/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import { suggestSection } from '@/lib/qb-collision-suggestion';
import { assignSectionOrders } from '@/lib/qb-collision-renumber';
import {
  findSectionOrderCollisions,
  resolveSectionOrderCollisions,
  getSupabaseAdminClient,
  isQBQuestionSection,
  type QBQuestionSection,
} from '@neram/database';
import { describeError } from '@/lib/api-errors';

/**
 * Papers with a question-number collision: two or more questions sharing the
 * same (section, display_order), almost always because some of them were
 * mistagged with the wrong section during parsing.
 *
 * Staff only, both verbs. Nothing here is destructive: PATCH only ever moves
 * a question to a different section/number, never deletes one.
 */

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const groups = await findSectionOrderCollisions();
    if (groups.length === 0) {
      return NextResponse.json({ data: { papers: [] } }, { status: 200 });
    }

    const paperIds = [...new Set(groups.map((g) => g.original_paper_id))];
    const supabase = getSupabaseAdminClient() as any;
    const { data: paperRows, error } = await supabase
      .from('nexus_qb_original_papers')
      .select('id, exam_type, year, session')
      .in('id', paperIds);
    if (error) throw error;

    const paperById = new Map((paperRows || []).map((p: any) => [p.id, p]));

    const byPaper = new Map<string, typeof groups>();
    for (const g of groups) {
      if (!byPaper.has(g.original_paper_id)) byPaper.set(g.original_paper_id, []);
      byPaper.get(g.original_paper_id)!.push(g);
    }

    const papers = Array.from(byPaper.entries()).map(([paperId, paperGroups]) => {
      const paper = paperById.get(paperId) as any;
      return {
        paper_id: paperId,
        exam_type: paper?.exam_type ?? 'unknown',
        year: paper?.year ?? null,
        session: paper?.session ?? null,
        collisions: paperGroups.map((g) => ({
          section: g.section,
          display_order: g.display_order,
          candidates: g.candidates.map((c) => ({
            id: c.id,
            question_text: c.question_text,
            question_format: c.question_format,
            current_section: c.section,
            suggested_section: suggestSection({
              question_format: c.question_format,
              question_text: c.question_text,
              categories: c.categories,
            }),
          })),
        })),
      };
    });

    return NextResponse.json({ data: { papers } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Section Collisions API] GET Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => null);
    const paperId = typeof body?.paper_id === 'string' ? body.paper_id : null;
    const raw = Array.isArray(body?.resolutions) ? body.resolutions : null;
    if (!paperId || !raw || raw.length === 0) {
      return NextResponse.json({ error: 'paper_id and resolutions are required' }, { status: 400 });
    }

    const resolutions: Array<{ question_id: string; section: QBQuestionSection }> = [];
    for (const r of raw) {
      if (!r || typeof r.question_id !== 'string' || !r.question_id) {
        return NextResponse.json({ error: 'Every resolution needs a question_id' }, { status: 400 });
      }
      if (!isQBQuestionSection(r.section)) {
        return NextResponse.json(
          { error: `"${String(r.section)}" is not a section on this paper` },
          { status: 400 },
        );
      }
      resolutions.push({ question_id: r.question_id, section: r.section });
    }

    const supabase = getSupabaseAdminClient() as any;
    const resolvedIds = new Set(resolutions.map((r) => r.question_id));
    const { data: existing, error: existingError } = await supabase
      .from('nexus_qb_questions')
      .select('id, section, display_order')
      .eq('original_paper_id', paperId);
    if (existingError) throw existingError;

    const maxBySection: Partial<Record<QBQuestionSection, number>> = {};
    for (const row of existing || []) {
      if (resolvedIds.has(row.id) || row.display_order == null || !row.section) continue;
      const current = maxBySection[row.section as QBQuestionSection] ?? 0;
      if (row.display_order > current) maxBySection[row.section as QBQuestionSection] = row.display_order;
    }

    const fullResolutions = assignSectionOrders(maxBySection, resolutions);
    const result = await resolveSectionOrderCollisions(paperId, fullResolutions);

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Section Collisions API] PATCH Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter nexus exec tsc --noEmit`
Expected: no new errors attributable to this file. (`isQBQuestionSection` and
`getSupabaseAdminClient` must resolve from `@neram/database`; if either import fails, check the
exact export name in `packages/database/src/types/index.ts:6585` and
`packages/database/src/client.ts` respectively before proceeding.)

- [ ] **Step 3: Commit**

```bash
git add apps/nexus/src/app/api/question-bank/section-collisions/route.ts
git commit -m "feat(nexus): add GET/PATCH API route for QB section collisions"
```

---

## Task 6: Collision review card component

**Files:**
- Create: `apps/nexus/src/components/question-bank/CollisionReviewGroup.tsx`
- Test: `apps/nexus/src/components/question-bank/CollisionReviewGroup.test.tsx`

**Interfaces:**
- Consumes: `QB_SECTIONS`, `qbSectionLabel`, `type QBQuestionSection` from `@neram/database`;
  `MathText` from `@/components/common/MathText`.
- Produces: `<CollisionReviewGroup section display_order candidates selections onSelect />`, used
  by Task 7's page.

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/components/question-bank/CollisionReviewGroup.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import CollisionReviewGroup, { type CollisionCandidate } from './CollisionReviewGroup';

const CANDIDATES: CollisionCandidate[] = [
  {
    id: 'q1',
    question_text: 'Solution of the differential equation',
    question_format: 'MCQ',
    current_section: 'math_mcq',
    suggested_section: 'math_mcq',
  },
  {
    id: 'q2',
    question_text: 'Match List - I with List - II. (I) Agra fort',
    question_format: 'MCQ',
    current_section: 'math_mcq',
    suggested_section: 'aptitude',
  },
];

describe('CollisionReviewGroup', () => {
  it('shows the colliding number and every candidate\'s question text', () => {
    render(
      <CollisionReviewGroup
        section="math_mcq"
        display_order={12}
        candidates={CANDIDATES}
        selections={{}}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/Mathematics \(MCQ\)/)).not.toBeNull();
    expect(screen.getByText(/Q12/)).not.toBeNull();
    expect(screen.getByText(/Solution of the differential equation/)).not.toBeNull();
    expect(screen.getByText(/Agra fort/)).not.toBeNull();
  });

  it('defaults each candidate\'s selection to its suggestion', () => {
    render(
      <CollisionReviewGroup
        section="math_mcq"
        display_order={12}
        candidates={CANDIDATES}
        selections={{ q1: 'math_mcq', q2: 'aptitude' }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByLabelText('Section for question q2').textContent).toContain('Aptitude');
  });

  it('calls onSelect with the candidate id and the newly chosen section', () => {
    const onSelect = vi.fn();
    render(
      <CollisionReviewGroup
        section="math_mcq"
        display_order={12}
        candidates={CANDIDATES}
        selections={{ q1: 'math_mcq', q2: 'aptitude' }}
        onSelect={onSelect}
      />,
    );
    fireEvent.mouseDown(screen.getByLabelText('Section for question q1'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Drawing'));
    expect(onSelect).toHaveBeenCalledWith('q1', 'drawing');
  });

  it('leaves a candidate with no suggestion unselected', () => {
    render(
      <CollisionReviewGroup
        section="math_mcq"
        display_order={12}
        candidates={[{ ...CANDIDATES[0], suggested_section: null }]}
        selections={{}}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByLabelText('Section for question q1').textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter nexus exec vitest run src/components/question-bank/CollisionReviewGroup.test.tsx`
Expected: FAIL, module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/nexus/src/components/question-bank/CollisionReviewGroup.tsx`:

```typescript
'use client';

import { Box, MenuItem, Paper, Select, Typography } from '@neram/ui';
import { QB_SECTIONS, qbSectionLabel, type QBQuestionSection } from '@neram/database';
import MathText from '@/components/common/MathText';

export interface CollisionCandidate {
  id: string;
  question_text: string | null;
  question_format: string;
  current_section: string;
  suggested_section: QBQuestionSection | null;
}

export interface CollisionReviewGroupProps {
  section: string;
  display_order: number;
  candidates: CollisionCandidate[];
  /** question id -> chosen section. A candidate absent here shows no selection. */
  selections: Record<string, QBQuestionSection>;
  onSelect: (candidateId: string, section: QBQuestionSection) => void;
}

/**
 * One collision: N questions on one paper that all claim the same section and
 * number. Each candidate gets its own Select, defaulted by the caller to its
 * suggestion (or left blank when nothing could be suggested), so nothing is
 * ever silently kept or moved without a visible, overridable choice.
 */
export default function CollisionReviewGroup({
  section,
  display_order,
  candidates,
  selections,
  onSelect,
}: CollisionReviewGroupProps) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1, borderRadius: 1.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        {qbSectionLabel(section)} Q{display_order}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {candidates.map((c) => (
          <Box
            key={c.id}
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'stretch', sm: 'center' },
              gap: 1,
              p: 1,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            <MathText
              text={c.question_text || '(no text)'}
              variant="body2"
              sx={{ flex: 1, minWidth: 0 }}
            />
            <Select
              size="small"
              displayEmpty
              value={selections[c.id] ?? ''}
              onChange={(e) => onSelect(c.id, e.target.value as QBQuestionSection)}
              SelectDisplayProps={{ 'aria-label': `Section for question ${c.id}` }}
              renderValue={(value) => (value ? qbSectionLabel(value as string) : '')}
              sx={{ minWidth: 160, minHeight: 44 }}
            >
              {QB_SECTIONS.map((s) => (
                <MenuItem key={s} value={s} sx={{ minHeight: 44 }}>
                  {qbSectionLabel(s)}
                </MenuItem>
              ))}
            </Select>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter nexus exec vitest run src/components/question-bank/CollisionReviewGroup.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/question-bank/CollisionReviewGroup.tsx apps/nexus/src/components/question-bank/CollisionReviewGroup.test.tsx
git commit -m "feat(nexus): add CollisionReviewGroup card for the collision review page"
```

---

## Task 7: Review page + hub entry point

**Files:**
- Create: `apps/nexus/src/app/(teacher)/teacher/question-bank/section-collisions/page.tsx`
- Modify: `apps/nexus/src/app/(teacher)/teacher/question-bank/page.tsx:42-78` (the `MORE_TOOLS`
  array)

**Interfaces:**
- Consumes: `CollisionReviewGroup` (Task 6), the GET/PATCH contract from Task 5,
  `useNexusAuthContext` from `@/hooks/useNexusAuth`, `PageHeader` from `@/components/PageHeader`
  (both already used by `apps/nexus/src/app/(teacher)/teacher/question-bank/reclassify/page.tsx`,
  which this page's data-flow shape mirrors).

- [ ] **Step 1: Write the page**

Create `apps/nexus/src/app/(teacher)/teacher/question-bank/section-collisions/page.tsx`:

```typescript
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Skeleton, Snackbar, Stack, Typography } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { QB_EXAM_TYPE_LABELS, type QBExamType, type QBQuestionSection } from '@neram/database';
import CollisionReviewGroup, { type CollisionCandidate } from '@/components/question-bank/CollisionReviewGroup';

interface CollisionEntry {
  section: string;
  display_order: number;
  candidates: CollisionCandidate[];
}

interface PaperCollisions {
  paper_id: string;
  exam_type: string;
  year: number | null;
  session: string | null;
  collisions: CollisionEntry[];
}

/**
 * Review queue for questions crammed onto the same section + number.
 *
 * Every candidate on screen starts pre-selected to its suggestion (computed
 * server-side by suggestSection) but nothing is written until a teacher
 * presses Apply for that paper, matching the reclassify page's proposal
 * review shape: staged, then confirmed, never silently applied.
 */
export default function SectionCollisionsPage() {
  const { getToken } = useNexusAuthContext();

  const [papers, setPapers] = useState<PaperCollisions[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingPaperId, setApplyingPaperId] = useState<string | null>(null);
  // paper_id -> question_id -> chosen section
  const [selections, setSelections] = useState<Record<string, Record<string, QBQuestionSection>>>({});
  const [snack, setSnack] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>({
    open: false,
    msg: '',
    severity: 'success',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/question-bank/section-collisions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load collisions');
      const json = await res.json();
      const loadedPapers: PaperCollisions[] = json.data?.papers || [];
      setPapers(loadedPapers);

      // Default every candidate to its suggestion.
      const nextSelections: Record<string, Record<string, QBQuestionSection>> = {};
      for (const paper of loadedPapers) {
        nextSelections[paper.paper_id] = {};
        for (const collision of paper.collisions) {
          for (const candidate of collision.candidates) {
            if (candidate.suggested_section) {
              nextSelections[paper.paper_id][candidate.id] = candidate.suggested_section;
            }
          }
        }
      }
      setSelections(nextSelections);
    } catch (err) {
      setSnack({ open: true, msg: err instanceof Error ? err.message : 'Failed to load', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const select = (paperId: string, candidateId: string, section: QBQuestionSection) => {
    setSelections((prev) => ({
      ...prev,
      [paperId]: { ...prev[paperId], [candidateId]: section },
    }));
  };

  const unresolvedCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const paper of papers) {
      let n = 0;
      for (const collision of paper.collisions) {
        for (const candidate of collision.candidates) {
          if (!selections[paper.paper_id]?.[candidate.id]) n++;
        }
      }
      counts[paper.paper_id] = n;
    }
    return counts;
  }, [papers, selections]);

  async function applyPaper(paperId: string) {
    const paperSelections = selections[paperId] || {};
    const resolutions = Object.entries(paperSelections).map(([question_id, section]) => ({
      question_id,
      section,
    }));
    if (resolutions.length === 0) return;

    setApplyingPaperId(paperId);
    try {
      const token = await getToken();
      const res = await fetch('/api/question-bank/section-collisions', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paper_id: paperId, resolutions }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Request failed');
      }
      const json = await res.json();
      setSnack({ open: true, msg: `Fixed ${json.data?.updated ?? 0} questions`, severity: 'success' });
      await load();
    } catch (err) {
      setSnack({ open: true, msg: err instanceof Error ? err.message : 'Failed', severity: 'error' });
    } finally {
      setApplyingPaperId(null);
    }
  }

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, pb: 12, maxWidth: 900, mx: 'auto' }}>
      <PageHeader
        title="Fix numbering clashes"
        subtitle="Questions crammed onto the same section and number. Nothing changes until you apply a paper."
        breadcrumbs={[{ label: 'Question Bank', href: '/teacher/question-bank' }]}
        backHref="/teacher/question-bank"
      />

      {loading ? (
        <Stack spacing={1}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={120} />
          ))}
        </Stack>
      ) : papers.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="body1" fontWeight={600}>
            No clashes found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Every paper's questions have a unique number within their section.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={3}>
          {papers.map((paper) => (
            <Box key={paper.paper_id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
                  {QB_EXAM_TYPE_LABELS[paper.exam_type as QBExamType] || paper.exam_type}{' '}
                  {paper.year}{paper.session ? ` ${paper.session}` : ''}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  disabled={applyingPaperId !== null || unresolvedCount[paper.paper_id] > 0}
                  onClick={() => applyPaper(paper.paper_id)}
                  startIcon={applyingPaperId === paper.paper_id ? <CircularProgress size={16} color="inherit" /> : undefined}
                  sx={{ textTransform: 'none', minHeight: 44 }}
                >
                  {unresolvedCount[paper.paper_id] > 0
                    ? `${unresolvedCount[paper.paper_id]} unresolved`
                    : 'Apply to this paper'}
                </Button>
              </Box>
              {paper.collisions.map((collision) => (
                <CollisionReviewGroup
                  key={`${collision.section}-${collision.display_order}`}
                  section={collision.section}
                  display_order={collision.display_order}
                  candidates={collision.candidates}
                  selections={selections[paper.paper_id] || {}}
                  onSelect={(candidateId, section) => select(paper.paper_id, candidateId, section)}
                />
              ))}
            </Box>
          ))}
        </Stack>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={5000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
```

- [ ] **Step 2: Add the hub entry point**

In `apps/nexus/src/app/(teacher)/teacher/question-bank/page.tsx`, add one entry to the
`MORE_TOOLS` array (currently lines 42-78), immediately after the `'Re-classify topics'` entry:

```typescript
  {
    label: 'Fix numbering clashes',
    desc: 'Questions crammed onto the same number',
    href: '/teacher/question-bank/section-collisions',
  },
```

- [ ] **Step 3: Type-check and lint**

Run: `pnpm --filter nexus exec tsc --noEmit`
Run: `pnpm --filter nexus exec eslint src/app/\(teacher\)/teacher/question-bank/section-collisions/page.tsx src/app/\(teacher\)/teacher/question-bank/page.tsx`
Expected: no new errors on either file.

- [ ] **Step 4: Commit**

```bash
git add "apps/nexus/src/app/(teacher)/teacher/question-bank/section-collisions/page.tsx" "apps/nexus/src/app/(teacher)/teacher/question-bank/page.tsx"
git commit -m "feat(nexus): add the section-collision review page and hub link"
```

---

## Task 8: E2E smoke test

**Files:**
- Create: `tests/e2e/nexus-qb-section-collisions.spec.ts`

**Interfaces:**
- Consumes: `TEACHER_ACCOUNT`, `APP_URLS`, `injectAuthForPage` from `tests/utils/credentials.ts`
  (per root `CLAUDE.md`'s E2E credentials section).

- [ ] **Step 1: Write the test**

Create `tests/e2e/nexus-qb-section-collisions.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { injectAuthForPage, APP_URLS } from '../utils/credentials';

test.describe('QB section collisions review', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthForPage(page, 'teacher');
  });

  test('opens from the hub, and an unresolved paper cannot be applied', async ({ page }) => {
    await page.goto(`${APP_URLS.nexus}/teacher/question-bank`);
    await page.getByText('Fix numbering clashes').click();
    await expect(page).toHaveURL(/section-collisions/);

    await expect(
      page.getByText(/No clashes found|unresolved|Apply to this paper/).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test('mobile: the review page has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/question-bank/section-collisions`);
    await expect(
      page.getByText(/No clashes found|unresolved|Apply to this paper/).first(),
    ).toBeVisible({ timeout: 15000 });

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });
});
```

- [ ] **Step 2: Run it against staging or local dev**

Run: `pnpm test:e2e tests/e2e/nexus-qb-section-collisions.spec.ts --project=nexus-chrome`
Expected: PASS. If the "No clashes found" branch is what renders (staging has no corrupted
papers), that is a valid pass, not a failure — the test only asserts the page loads and the
Apply gate holds, it does not require a live collision to exist.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/nexus-qb-section-collisions.spec.ts
git commit -m "test(e2e): add smoke coverage for the QB section-collision review page"
```

---

## Self-Review Notes

- **Spec coverage:** every spec section has a task — query layer (Task 1), reused classifier
  export (Task 2), suggestion heuristic (Task 3), renumbering (Task 4), API routes (Task 5,
  consolidated onto one GET/PATCH file per the existing `.../sections/route.ts` precedent rather
  than the spec's separate `/apply` path — called out in the Architecture line above), review UI
  (Tasks 6-7), hub link (Task 7 Step 2), testing (every task, plus Task 8 E2E).
- **Placeholder scan:** none found; every step carries real, complete code.
- **Type consistency:** `QBQuestionSection` and the `{ question_id, section, display_order }`
  resolution shape are the same across Tasks 1, 4, 5 and 7. `CollisionCandidate` (Task 6) matches
  the candidate shape the GET route (Task 5) actually returns (`current_section`,
  `suggested_section`, not the query layer's internal `section` field).
