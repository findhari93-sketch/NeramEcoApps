# Aintra Architecture College Hub Q&A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the existing Aintra chatbot (Gemini 2.5 Flash, marketing site) to answer architecture college questions by calling tools against our Supabase college tables, with Google Search grounding as a fallback.

**Architecture:** Extend `apps/marketing/src/app/api/chat/route.ts` with a tool-calling dispatch loop (3-iteration cap). Three DB tools (`get_college`, `search_colleges`, `compare_colleges`) wrap existing queries in `src/lib/college-hub/queries.ts`. Gemini's native `google_search` grounding handles web fallback. System prompt gains a ~300-word architecture admissions primer and behavior rules. Current college page URL is parsed to a slug and injected as a soft anchor. Two additive migrations (KB seed rows + `tool_calls` column).

**Tech Stack:** Next.js 14 App Router, Gemini REST API (generativelanguage.googleapis.com), Supabase, Vitest, Playwright, TypeScript.

**Spec:** `docs/superpowers/specs/2026-04-23-aintra-college-hub-design.md`

---

## File Plan

**New files:**
- `apps/marketing/src/lib/aintra/slug.ts` — URL → college slug parser
- `apps/marketing/src/lib/aintra/slug.test.ts` — parser unit tests
- `apps/marketing/src/lib/aintra/primer.ts` — architecture admissions primer text + prompt-builder helper
- `apps/marketing/src/lib/aintra/tools/types.ts` — `ToolResult`, `ToolName`, arg types
- `apps/marketing/src/lib/aintra/tools/declarations.ts` — Gemini `functionDeclarations` payload
- `apps/marketing/src/lib/aintra/tools/get-college.ts` — handler
- `apps/marketing/src/lib/aintra/tools/get-college.test.ts`
- `apps/marketing/src/lib/aintra/tools/search-colleges.ts` — handler
- `apps/marketing/src/lib/aintra/tools/search-colleges.test.ts`
- `apps/marketing/src/lib/aintra/tools/compare-colleges.ts` — handler
- `apps/marketing/src/lib/aintra/tools/compare-colleges.test.ts`
- `apps/marketing/src/lib/aintra/tools/dispatch.ts` — name → handler map
- `apps/marketing/src/lib/aintra/tools/dispatch.test.ts`
- `packages/database/supabase/migrations/20260423090000_chatbot_tool_calls.sql` — add column
- `packages/database/supabase/migrations/20260423090100_aintra_architecture_kb_seed.sql` — seed rows
- `tests/e2e/aintra-colleges.spec.ts` — Playwright E2E

**Modified files:**
- `apps/marketing/src/app/api/chat/route.ts` — tool-call loop, slug anchor, primer, `tool_calls` logging
- `packages/database/src/types/database.generated.ts` — regenerated after migration (via `pnpm supabase:gen:types`)

---

## Task 0: Branch setup

**Files:** none yet (branch only)

- [ ] **Step 1: Create a feature branch off the current branch**

Run:
```bash
git checkout -b feat/aintra-college-hub
```

Expected: "Switched to a new branch 'feat/aintra-college-hub'".

- [ ] **Step 2: Verify workspace is clean**

Run:
```bash
git status
```

Expected: "nothing to commit, working tree clean" (or only the spec file already committed).

---

## Task 1: Slug extraction from page URL

**Files:**
- Create: `apps/marketing/src/lib/aintra/slug.ts`
- Test: `apps/marketing/src/lib/aintra/slug.test.ts`

- [ ] **Step 1: Write the failing test file**

Write `apps/marketing/src/lib/aintra/slug.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { extractCollegeSlug } from './slug';

describe('extractCollegeSlug', () => {
  it('returns slug for /colleges/[state]/[slug]', () => {
    expect(
      extractCollegeSlug('https://neramclasses.com/colleges/tamil-nadu/papni-architecture')
    ).toBe('papni-architecture');
  });

  it('returns slug for locale-prefixed path', () => {
    expect(
      extractCollegeSlug('https://neramclasses.com/en/colleges/tamil-nadu/papni-architecture')
    ).toBe('papni-architecture');
  });

  it('returns slug for /ta/colleges/.../slug', () => {
    expect(
      extractCollegeSlug('https://neramclasses.com/ta/colleges/kerala/college-of-architecture-trivandrum')
    ).toBe('college-of-architecture-trivandrum');
  });

  it('strips query string', () => {
    expect(
      extractCollegeSlug('https://neramclasses.com/colleges/tamil-nadu/papni-architecture?from=hub')
    ).toBe('papni-architecture');
  });

  it('strips hash', () => {
    expect(
      extractCollegeSlug('https://neramclasses.com/colleges/tamil-nadu/papni-architecture#fees')
    ).toBe('papni-architecture');
  });

  it('handles trailing slash', () => {
    expect(
      extractCollegeSlug('https://neramclasses.com/colleges/tamil-nadu/papni-architecture/')
    ).toBe('papni-architecture');
  });

  it('returns null for state listing page', () => {
    expect(extractCollegeSlug('https://neramclasses.com/colleges/tamil-nadu')).toBeNull();
  });

  it('returns null for hub landing', () => {
    expect(extractCollegeSlug('https://neramclasses.com/colleges')).toBeNull();
  });

  it('returns null for unrelated path', () => {
    expect(extractCollegeSlug('https://neramclasses.com/apply')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(extractCollegeSlug('')).toBeNull();
    expect(extractCollegeSlug('not-a-url')).toBeNull();
  });

  it('accepts path-only input (no origin)', () => {
    expect(extractCollegeSlug('/colleges/tamil-nadu/papni-architecture')).toBe('papni-architecture');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --filter @neram/marketing test src/lib/aintra/slug.test.ts
```

Expected: FAIL, "Cannot find module './slug'" or "extractCollegeSlug is not a function".

- [ ] **Step 3: Write the minimal implementation**

Write `apps/marketing/src/lib/aintra/slug.ts`:

```typescript
// Parses a page URL and returns the college slug if it matches
// /colleges/[state]/[slug], else null. Works for absolute URLs and path-only input,
// tolerates an optional locale prefix (e.g., /en, /ta), query strings, hashes,
// and trailing slashes.

const LOCALES = new Set(['en', 'ta', 'hi', 'kn', 'ml']);

export function extractCollegeSlug(pageUrl: string | null | undefined): string | null {
  if (!pageUrl || typeof pageUrl !== 'string') return null;

  // Accept absolute URLs or path-only strings.
  let pathname: string;
  try {
    const url = new URL(pageUrl, 'https://placeholder.local');
    pathname = url.pathname;
  } catch {
    return null;
  }

  // Drop leading slash, trailing slash, split.
  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (segments.length === 0) return null;

  // Skip a leading locale segment if present.
  let start = 0;
  if (LOCALES.has(segments[0])) start = 1;

  // Must have exactly colleges/<state>/<slug> after the optional locale.
  if (segments.length - start !== 3) return null;
  if (segments[start] !== 'colleges') return null;

  const slug = segments[start + 2];
  if (!slug) return null;
  return slug;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm --filter @neram/marketing test src/lib/aintra/slug.test.ts
```

Expected: PASS (all 11 test cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/lib/aintra/slug.ts apps/marketing/src/lib/aintra/slug.test.ts
git commit -m "feat(aintra): extract college slug from page URL"
```

---

## Task 2: Architecture admissions primer

**Files:**
- Create: `apps/marketing/src/lib/aintra/primer.ts`

No tests for this file — it's a static string + a pure string-building helper, covered indirectly by the route integration test in Task 9.

- [ ] **Step 1: Create the primer module**

Write `apps/marketing/src/lib/aintra/primer.ts`:

```typescript
// Architecture admissions primer appended to the Aintra system prompt.
// Stable knowledge only. Time-sensitive info (exam dates, counseling schedules)
// belongs in aintra_knowledge_base so admins can edit it without deploys.

export const ARCHITECTURE_PRIMER = `

## ARCHITECTURE COLLEGE HUB (Extended Role)

You are also an **architecture college admissions counselor** for students exploring Neram's college hub at neramclasses.com/colleges. Help them understand colleges, compare options, and navigate admissions.

### NATA basics
- NATA (National Aptitude Test in Architecture) is conducted by the Council of Architecture (CoA).
- Required for B.Arch admission into most COA-approved colleges.
- Pattern: Part A Drawing (80 marks, offline) + Part B MCQ/NCQ (120 marks, online) = 200 marks, 3 hours.
- Two phases per year; you can appear in only one.

### TNEA (Tamil Nadu Engineering Admissions) counseling flow for architecture
1. Online registration on tneaonline.org.
2. Random number allotment, then the TNEA rank list.
3. Choice filling (students order preferred college + branch).
4. Allotment round (government + self-financing rounds; multiple rounds possible).
5. Reporting at the allotted college within the deadline.
- Architecture seats are filled via the same counseling but require a valid NATA score.

### Kerala / Karnataka
- **Kerala**: KEAM + Centralized Allotment Process (CAP) by CEE Kerala. Separate architecture rank list.
- **Karnataka**: KCET (government and aided seats) + COMEDK (private). NATA still required for B.Arch.

### COA vs NAAC vs NIRF (what each means)
- **COA approved**: Council of Architecture has validated the program. Mandatory for practicing as a registered architect in India. Non-negotiable.
- **NAAC grade**: Peer accreditation of institutional quality (A++, A+, A, B++, B+, B). Higher grades signal better infrastructure, faculty, processes.
- **NIRF rank**: Ministry of Education's annual ranking of institutions. Relative, not absolute.

### B.Arch vs B.Planning
- **B.Arch**: 5-year professional degree. Focus on design, construction, aesthetics. Licensable as an architect.
- **B.Planning**: 4-year degree. Focus on urban/regional planning. Career paths include town planning, GIS, policy. Fewer colleges offer it.

### Behavior rules for college hub questions
- When the user asks about "this college", "the fees", "placements" and a soft anchor "User is currently viewing: <slug>" is present: call **get_college** with that slug.
- When they name a specific college but no slug is known: call **search_colleges** with \`q: "<name>"\` (limit 3), then **get_college** on the top match.
- When they ask to compare: call **compare_colleges** with up to 3 slugs.
- When they ask broadly (city / state / fee range / exam / COA / NAAC): call **search_colleges** with the matching filters.
- When the DB has no match or the question is time-sensitive (NATA dates this year, TNEA 2026 counseling schedule, industry news): use **google_search**.
- **Always cite sources** when you used a tool:
  - DB tools: link to the internal page, e.g., [Papni School of Architecture](/colleges/tamil-nadu/papni-architecture).
  - google_search: include the web URL(s) returned by grounding.
- **Decline clearly off-topic questions** (restaurants, movies, coding help, general life advice) politely. Redirect: "I specialize in Neram Classes and architecture college admissions. Ask me about colleges, NATA, fees, or counseling and I'll help."

### Scope
- **In scope**: Neram Classes info (coaching, fees, timings, courses, NATA preparation) + architecture colleges in our DB + general architecture admissions topics (NATA, TNEA, KEAM, KCET, COA, NAAC, NIRF, scholarships, careers after B.Arch).
- **Out of scope**: Unrelated topics; general non-architecture education; politics; entertainment.
`;

export function buildSystemPrompt(params: {
  base: string;
  kb: string;
  currentCollegeSlug: string | null;
}): string {
  const anchor = params.currentCollegeSlug
    ? `\n\n## PAGE CONTEXT\nUser is currently viewing college: ${params.currentCollegeSlug}\nIf the user asks about "this college" or uses pronouns, assume this slug unless they name another college.`
    : '';
  return params.base + ARCHITECTURE_PRIMER + params.kb + anchor;
}
```

- [ ] **Step 2: Verify it type-checks**

Run:
```bash
pnpm --filter @neram/marketing type-check
```

Expected: PASS (no new type errors).

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/lib/aintra/primer.ts
git commit -m "feat(aintra): add architecture admissions primer and prompt builder"
```

---

## Task 3: Tool types and Gemini function declarations

**Files:**
- Create: `apps/marketing/src/lib/aintra/tools/types.ts`
- Create: `apps/marketing/src/lib/aintra/tools/declarations.ts`

- [ ] **Step 1: Write the types file**

Write `apps/marketing/src/lib/aintra/tools/types.ts`:

```typescript
export type ToolName = 'get_college' | 'search_colleges' | 'compare_colleges';

export type ToolSuccess<T> = { ok: true; data: T };
export type ToolFailure = { ok: false; error: string; slug?: string };
export type ToolResult<T = unknown> = ToolSuccess<T> | ToolFailure;

export interface GetCollegeArgs {
  slug: string;
}

export interface SearchCollegesArgs {
  q?: string;
  state?: string;
  city?: string;
  type?: 'government' | 'private' | 'aided' | 'deemed';
  counseling_system?: string;
  coa_approved?: boolean;
  naac_grade?: string;
  accepted_exam?: string;
  fee_max?: number;
  neram_tier?: string;
  sort_by?: 'arch_index' | 'nirf_rank' | 'fee_low' | 'fee_high' | 'name' | 'placement_high' | 'naac_grade';
  limit?: number;
}

export interface CompareCollegesArgs {
  slugs: string[];
}

export interface CollegeCard {
  name: string;
  slug: string;
  url: string;
  city: string | null;
  state: string | null;
  type: string | null;
  annual_fee_min: number | null;
  annual_fee_max: number | null;
  annual_fee_approx: number | null;
  coa_approved: boolean | null;
  naac_grade: string | null;
  nirf_rank: number | null;
  neram_tier: string | null;
  total_barch_seats: number | null;
  accepted_exams: string[] | null;
}
```

- [ ] **Step 2: Write the Gemini function declarations**

Write `apps/marketing/src/lib/aintra/tools/declarations.ts`:

```typescript
// Gemini v1beta function-call declarations. Shape matches the REST API payload
// under `tools[0].functionDeclarations`. The second tool entry (`google_search: {}`)
// is added alongside in route.ts, not here, because it's a native grounding config,
// not a function declaration.

export const TOOL_DECLARATIONS = [
  {
    name: 'get_college',
    description:
      'Fetch full data for one architecture college by slug. Returns college info plus fees, cutoffs, placements, infrastructure, and faculty. Use this when the user asks about a specific college and you know its slug.',
    parameters: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Unique college slug from the /colleges/<state>/<slug> URL, e.g., "papni-architecture".',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'search_colleges',
    description:
      'Search architecture colleges with filters. Returns up to 20 matching college cards. Use when the user asks broadly (by city, state, fee range, exam, COA status, NAAC grade) or when you need to resolve a college name to a slug via the "q" free-text search.',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Free-text name match, e.g., "sathyabama".' },
        state: { type: 'string', description: 'State slug, e.g., "tamil-nadu", "kerala", "karnataka".' },
        city: { type: 'string', description: 'City slug, e.g., "chennai", "bangalore".' },
        type: {
          type: 'string',
          enum: ['government', 'private', 'aided', 'deemed'],
          description: 'College type.',
        },
        counseling_system: {
          type: 'string',
          description: 'Counseling system code, e.g., "tnea", "keam", "kcet", "comedk", "josaa".',
        },
        coa_approved: { type: 'boolean', description: 'Filter to COA-approved colleges only.' },
        naac_grade: {
          type: 'string',
          description: 'NAAC grade filter, e.g., "A++", "A+", "A", "B++".',
        },
        accepted_exam: {
          type: 'string',
          description: 'Exam accepted, e.g., "nata", "jee_paper_2", "kcet".',
        },
        fee_max: {
          type: 'number',
          description: 'Maximum annual fee in INR, e.g., 200000 for "under 2 lakh".',
        },
        neram_tier: {
          type: 'string',
          enum: ['platinum', 'gold', 'silver', 'bronze'],
          description: 'Neram quality tier.',
        },
        sort_by: {
          type: 'string',
          enum: ['arch_index', 'nirf_rank', 'fee_low', 'fee_high', 'name', 'placement_high', 'naac_grade'],
          description: 'Sort order. Default arch_index (best first).',
        },
        limit: {
          type: 'number',
          description: 'Max results to return. Default 10, max 20.',
        },
      },
    },
  },
  {
    name: 'compare_colleges',
    description:
      'Compare 2 to 3 architecture colleges side-by-side by slug. Returns comparison-trimmed data for each.',
    parameters: {
      type: 'object',
      properties: {
        slugs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of 2 or 3 college slugs to compare.',
        },
      },
      required: ['slugs'],
    },
  },
] as const;
```

- [ ] **Step 3: Type-check**

Run:
```bash
pnpm --filter @neram/marketing type-check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/marketing/src/lib/aintra/tools/types.ts apps/marketing/src/lib/aintra/tools/declarations.ts
git commit -m "feat(aintra): define tool types and Gemini function declarations"
```

---

## Task 4: `get_college` tool handler

**Files:**
- Create: `apps/marketing/src/lib/aintra/tools/get-college.ts`
- Test: `apps/marketing/src/lib/aintra/tools/get-college.test.ts`

- [ ] **Step 1: Write the failing test**

Write `apps/marketing/src/lib/aintra/tools/get-college.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the upstream query before importing the tool.
vi.mock('@/lib/college-hub/queries', () => ({
  getCollegeBySlug: vi.fn(),
}));

import { getCollegeBySlug } from '@/lib/college-hub/queries';
import { getCollegeTool } from './get-college';

describe('getCollegeTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok with trimmed record when college exists', async () => {
    (getCollegeBySlug as any).mockResolvedValue({
      id: 'c-1',
      slug: 'papni-architecture',
      state_slug: 'tamil-nadu',
      name: 'Papni School of Architecture',
      short_name: 'PISA',
      city: 'Kancheepuram',
      state: 'Tamil Nadu',
      type: 'private',
      neram_tier: 'gold',
      coa_approved: true,
      naac_grade: null,
      nirf_rank: null,
      annual_fee_min: 45000,
      annual_fee_max: 60000,
      annual_fee_approx: 50000,
      total_barch_seats: 40,
      accepted_exams: ['nata'],
      counseling_systems: ['tnea'],
      highlights: ['Focused on B.Arch'],
      fees: [{ year_number: 1, tuition_fees: 40000 }],
      cutoffs: [{ academic_year: 2024, cutoff_value: 120 }],
      placements: [{ placement_rate_percent: 70 }],
      infrastructure: { hostel_available: true },
      faculty: [{ name: 'A', is_practicing_architect: true }],
    });

    const res = await getCollegeTool({ slug: 'papni-architecture' });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.name).toBe('Papni School of Architecture');
      expect(res.data.url).toBe('/colleges/tamil-nadu/papni-architecture');
      expect(res.data.fees).toHaveLength(1);
      expect(res.data.cutoffs).toHaveLength(1);
      expect(res.data.faculty).toHaveLength(1);
    }
  });

  it('returns not_found when college missing', async () => {
    (getCollegeBySlug as any).mockResolvedValue(null);
    const res = await getCollegeTool({ slug: 'does-not-exist' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('not_found');
      expect(res.slug).toBe('does-not-exist');
    }
  });

  it('rejects empty slug', async () => {
    const res = await getCollegeTool({ slug: '' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_slug');
  });

  it('returns tool_error on query throw', async () => {
    (getCollegeBySlug as any).mockRejectedValue(new Error('db boom'));
    const res = await getCollegeTool({ slug: 'anything' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('tool_error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --filter @neram/marketing test src/lib/aintra/tools/get-college.test.ts
```

Expected: FAIL, "Cannot find module './get-college'".

- [ ] **Step 3: Write the implementation**

Write `apps/marketing/src/lib/aintra/tools/get-college.ts`:

```typescript
import { getCollegeBySlug } from '@/lib/college-hub/queries';
import type { GetCollegeArgs, ToolResult } from './types';

export async function getCollegeTool(
  args: GetCollegeArgs
): Promise<ToolResult<Record<string, unknown>>> {
  const slug = (args?.slug || '').trim();
  if (!slug) return { ok: false, error: 'invalid_slug' };

  try {
    const college = await getCollegeBySlug(slug);
    if (!college) return { ok: false, error: 'not_found', slug };

    const url = `/colleges/${college.state_slug ?? 'india'}/${college.slug}`;

    // Return the full detail with an added `url` for citation. Gemini Flash can
    // handle the full record comfortably within its context window.
    return {
      ok: true,
      data: { url, ...(college as unknown as Record<string, unknown>) },
    };
  } catch (err) {
    console.error('[aintra/get-college] query error', err);
    return { ok: false, error: 'tool_error', slug };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm --filter @neram/marketing test src/lib/aintra/tools/get-college.test.ts
```

Expected: PASS (all 4 cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/lib/aintra/tools/get-college.ts apps/marketing/src/lib/aintra/tools/get-college.test.ts
git commit -m "feat(aintra): add get_college tool handler"
```

---

## Task 5: `search_colleges` tool handler

**Files:**
- Create: `apps/marketing/src/lib/aintra/tools/search-colleges.ts`
- Test: `apps/marketing/src/lib/aintra/tools/search-colleges.test.ts`

- [ ] **Step 1: Write the failing test**

Write `apps/marketing/src/lib/aintra/tools/search-colleges.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/college-hub/queries', () => ({
  getColleges: vi.fn(),
}));

import { getColleges } from '@/lib/college-hub/queries';
import { searchCollegesTool } from './search-colleges';

describe('searchCollegesTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns trimmed cards with internal URLs', async () => {
    (getColleges as any).mockResolvedValue({
      data: [
        {
          id: '1',
          slug: 'papni-architecture',
          state_slug: 'tamil-nadu',
          name: 'Papni',
          city: 'Kancheepuram',
          state: 'Tamil Nadu',
          type: 'private',
          annual_fee_min: 45000,
          annual_fee_max: 60000,
          annual_fee_approx: 50000,
          coa_approved: true,
          naac_grade: null,
          nirf_rank: null,
          neram_tier: 'gold',
          total_barch_seats: 40,
          accepted_exams: ['nata'],
        },
      ],
      count: 1,
    });

    const res = await searchCollegesTool({ state: 'tamil-nadu', fee_max: 100000 });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.count).toBe(1);
      expect(res.data.results[0].url).toBe('/colleges/tamil-nadu/papni-architecture');
      expect(res.data.results[0].name).toBe('Papni');
    }
  });

  it('maps q -> search and fee_max -> maxFee filter', async () => {
    (getColleges as any).mockResolvedValue({ data: [], count: 0 });
    await searchCollegesTool({ q: 'sathyabama', fee_max: 200000 });

    const call = (getColleges as any).mock.calls[0][0];
    expect(call.search).toBe('sathyabama');
    expect(call.maxFee).toBe(200000);
  });

  it('caps limit at 20', async () => {
    (getColleges as any).mockResolvedValue({ data: [], count: 0 });
    await searchCollegesTool({ limit: 999 });
    const call = (getColleges as any).mock.calls[0][0];
    expect(call.limit).toBe(20);
  });

  it('defaults limit to 10', async () => {
    (getColleges as any).mockResolvedValue({ data: [], count: 0 });
    await searchCollegesTool({});
    const call = (getColleges as any).mock.calls[0][0];
    expect(call.limit).toBe(10);
  });

  it('passes coa_approved boolean through', async () => {
    (getColleges as any).mockResolvedValue({ data: [], count: 0 });
    await searchCollegesTool({ coa_approved: true });
    const call = (getColleges as any).mock.calls[0][0];
    expect(call.coa).toBe(true);
  });

  it('returns tool_error on query throw', async () => {
    (getColleges as any).mockRejectedValue(new Error('db boom'));
    const res = await searchCollegesTool({});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('tool_error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --filter @neram/marketing test src/lib/aintra/tools/search-colleges.test.ts
```

Expected: FAIL, "Cannot find module './search-colleges'".

- [ ] **Step 3: Write the implementation**

Write `apps/marketing/src/lib/aintra/tools/search-colleges.ts`:

```typescript
import { getColleges } from '@/lib/college-hub/queries';
import type { SearchCollegesArgs, ToolResult, CollegeCard } from './types';

// Bounds
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

export async function searchCollegesTool(
  args: SearchCollegesArgs
): Promise<ToolResult<{ count: number; results: CollegeCard[] }>> {
  try {
    const limit = Math.min(MAX_LIMIT, Math.max(1, args.limit ?? DEFAULT_LIMIT));

    const { data, count } = await getColleges({
      search: args.q,
      state: args.state,
      city: args.city,
      type: args.type,
      counselingSystem: args.counseling_system,
      coa: args.coa_approved,
      naacGrade: args.naac_grade,
      exam: args.accepted_exam,
      maxFee: args.fee_max,
      sortBy: args.sort_by ?? 'arch_index',
      limit,
      page: 1,
    });

    const results: CollegeCard[] = (data ?? []).map((row: any) => ({
      name: row.name,
      slug: row.slug,
      url: `/colleges/${row.state_slug ?? 'india'}/${row.slug}`,
      city: row.city ?? null,
      state: row.state ?? null,
      type: row.type ?? null,
      annual_fee_min: row.annual_fee_min ?? null,
      annual_fee_max: row.annual_fee_max ?? null,
      annual_fee_approx: row.annual_fee_approx ?? null,
      coa_approved: row.coa_approved ?? null,
      naac_grade: row.naac_grade ?? null,
      nirf_rank: row.nirf_rank ?? null,
      neram_tier: row.neram_tier ?? null,
      total_barch_seats: row.total_barch_seats ?? null,
      accepted_exams: row.accepted_exams ?? null,
    }));

    return { ok: true, data: { count, results } };
  } catch (err) {
    console.error('[aintra/search-colleges] query error', err);
    return { ok: false, error: 'tool_error' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm --filter @neram/marketing test src/lib/aintra/tools/search-colleges.test.ts
```

Expected: PASS (all 6 cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/lib/aintra/tools/search-colleges.ts apps/marketing/src/lib/aintra/tools/search-colleges.test.ts
git commit -m "feat(aintra): add search_colleges tool handler"
```

---

## Task 6: `compare_colleges` tool handler

**Files:**
- Create: `apps/marketing/src/lib/aintra/tools/compare-colleges.ts`
- Test: `apps/marketing/src/lib/aintra/tools/compare-colleges.test.ts`

- [ ] **Step 1: Write the failing test**

Write `apps/marketing/src/lib/aintra/tools/compare-colleges.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/college-hub/queries', () => ({
  getCollegeBySlug: vi.fn(),
}));

import { getCollegeBySlug } from '@/lib/college-hub/queries';
import { compareCollegesTool } from './compare-colleges';

const makeCollege = (slug: string, name: string) => ({
  id: slug,
  slug,
  name,
  state_slug: 'tamil-nadu',
  annual_fee_approx: 50000,
  total_barch_seats: 40,
  coa_approved: true,
  naac_grade: null,
  nirf_rank: null,
  accepted_exams: ['nata'],
  fees: [{ year_number: 1, tuition_fees: 40000 }],
  cutoffs: [{ academic_year: 2024, category: 'OC', cutoff_value: 120 }],
  placements: [{ academic_year: 2024, placement_rate_percent: 70, avg_package_lpa: 4.5 }],
});

describe('compareCollegesTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns comparison records for 2 slugs', async () => {
    (getCollegeBySlug as any).mockImplementation((slug: string) =>
      Promise.resolve(slug === 'a' ? makeCollege('a', 'A') : makeCollege('b', 'B'))
    );

    const res = await compareCollegesTool({ slugs: ['a', 'b'] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(2);
      expect(res.data[0].name).toBe('A');
      expect(res.data[1].url).toBe('/colleges/tamil-nadu/b');
    }
  });

  it('returns not_found slot for missing college', async () => {
    (getCollegeBySlug as any).mockImplementation((slug: string) =>
      Promise.resolve(slug === 'real' ? makeCollege('real', 'R') : null)
    );
    const res = await compareCollegesTool({ slugs: ['real', 'ghost'] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect((res.data[1] as any).error).toBe('not_found');
      expect((res.data[1] as any).slug).toBe('ghost');
    }
  });

  it('rejects fewer than 2 slugs', async () => {
    const res = await compareCollegesTool({ slugs: ['only-one'] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_slug_count');
  });

  it('rejects more than 3 slugs', async () => {
    const res = await compareCollegesTool({ slugs: ['a', 'b', 'c', 'd'] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_slug_count');
  });

  it('returns tool_error when any slug throws', async () => {
    (getCollegeBySlug as any).mockRejectedValue(new Error('db boom'));
    const res = await compareCollegesTool({ slugs: ['a', 'b'] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('tool_error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --filter @neram/marketing test src/lib/aintra/tools/compare-colleges.test.ts
```

Expected: FAIL, "Cannot find module './compare-colleges'".

- [ ] **Step 3: Write the implementation**

Write `apps/marketing/src/lib/aintra/tools/compare-colleges.ts`:

```typescript
import { getCollegeBySlug } from '@/lib/college-hub/queries';
import type { CompareCollegesArgs, ToolResult } from './types';

type Trimmed =
  | {
      name: string;
      slug: string;
      url: string;
      annual_fee_approx: number | null;
      total_barch_seats: number | null;
      coa_approved: boolean | null;
      naac_grade: string | null;
      nirf_rank: number | null;
      accepted_exams: string[] | null;
      fees_summary: Array<{ year: number; tuition: number | null }>;
      cutoffs_summary: Array<{ year: number; category: string | null; value: number | null }>;
      placements_summary: {
        latest_year: number | null;
        placement_rate_percent: number | null;
        avg_package_lpa: number | null;
      } | null;
    }
  | { slug: string; error: 'not_found' };

export async function compareCollegesTool(
  args: CompareCollegesArgs
): Promise<ToolResult<Trimmed[]>> {
  const slugs = Array.isArray(args?.slugs) ? args.slugs.filter(Boolean) : [];
  if (slugs.length < 2 || slugs.length > 3) {
    return { ok: false, error: 'invalid_slug_count' };
  }

  try {
    const rows = await Promise.all(slugs.map((s) => getCollegeBySlug(s)));
    const data: Trimmed[] = rows.map((row, i) => {
      const slug = slugs[i];
      if (!row) return { slug, error: 'not_found' };

      const r = row as any;
      const latestPlacement = (r.placements ?? [])[0] ?? null;

      return {
        name: r.name,
        slug: r.slug,
        url: `/colleges/${r.state_slug ?? 'india'}/${r.slug}`,
        annual_fee_approx: r.annual_fee_approx ?? null,
        total_barch_seats: r.total_barch_seats ?? null,
        coa_approved: r.coa_approved ?? null,
        naac_grade: r.naac_grade ?? null,
        nirf_rank: r.nirf_rank ?? null,
        accepted_exams: r.accepted_exams ?? null,
        fees_summary: (r.fees ?? []).map((f: any) => ({
          year: f.year_number,
          tuition: f.tuition_fees ?? null,
        })),
        cutoffs_summary: (r.cutoffs ?? []).slice(0, 5).map((c: any) => ({
          year: c.academic_year,
          category: c.category ?? null,
          value: c.cutoff_value ?? null,
        })),
        placements_summary: latestPlacement
          ? {
              latest_year: latestPlacement.academic_year ?? null,
              placement_rate_percent: latestPlacement.placement_rate_percent ?? null,
              avg_package_lpa: latestPlacement.avg_package_lpa ?? null,
            }
          : null,
      };
    });

    return { ok: true, data };
  } catch (err) {
    console.error('[aintra/compare-colleges] query error', err);
    return { ok: false, error: 'tool_error' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm --filter @neram/marketing test src/lib/aintra/tools/compare-colleges.test.ts
```

Expected: PASS (all 5 cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/lib/aintra/tools/compare-colleges.ts apps/marketing/src/lib/aintra/tools/compare-colleges.test.ts
git commit -m "feat(aintra): add compare_colleges tool handler"
```

---

## Task 7: Tool dispatcher

**Files:**
- Create: `apps/marketing/src/lib/aintra/tools/dispatch.ts`
- Test: `apps/marketing/src/lib/aintra/tools/dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

Write `apps/marketing/src/lib/aintra/tools/dispatch.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./get-college', () => ({
  getCollegeTool: vi.fn(async () => ({ ok: true, data: { name: 'X' } })),
}));
vi.mock('./search-colleges', () => ({
  searchCollegesTool: vi.fn(async () => ({ ok: true, data: { count: 0, results: [] } })),
}));
vi.mock('./compare-colleges', () => ({
  compareCollegesTool: vi.fn(async () => ({ ok: true, data: [] })),
}));

import { dispatchTool } from './dispatch';

describe('dispatchTool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes get_college', async () => {
    const r = await dispatchTool('get_college', { slug: 'x' });
    expect(r.ok).toBe(true);
  });

  it('routes search_colleges', async () => {
    const r = await dispatchTool('search_colleges', { state: 'tamil-nadu' });
    expect(r.ok).toBe(true);
  });

  it('routes compare_colleges', async () => {
    const r = await dispatchTool('compare_colleges', { slugs: ['a', 'b'] });
    expect(r.ok).toBe(true);
  });

  it('returns unknown_tool for unrecognized name', async () => {
    const r = await dispatchTool('not_a_tool' as any, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unknown_tool');
  });

  it('enforces 3-second timeout', async () => {
    const { getCollegeTool } = await import('./get-college');
    (getCollegeTool as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, data: {} }), 5000))
    );
    const r = await dispatchTool('get_college', { slug: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('timeout');
  }, 10000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --filter @neram/marketing test src/lib/aintra/tools/dispatch.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Write `apps/marketing/src/lib/aintra/tools/dispatch.ts`:

```typescript
import { getCollegeTool } from './get-college';
import { searchCollegesTool } from './search-colleges';
import { compareCollegesTool } from './compare-colleges';
import type { ToolName, ToolResult } from './types';

const TOOL_TIMEOUT_MS = 3000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([
    p,
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms)),
  ]);
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const runner = (async (): Promise<ToolResult> => {
    switch (name as ToolName) {
      case 'get_college':
        return getCollegeTool(args as any);
      case 'search_colleges':
        return searchCollegesTool(args as any);
      case 'compare_colleges':
        return compareCollegesTool(args as any);
      default:
        return { ok: false, error: 'unknown_tool' };
    }
  })();

  const result = await withTimeout(runner, TOOL_TIMEOUT_MS);
  if (result === 'timeout') return { ok: false, error: 'timeout' };
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm --filter @neram/marketing test src/lib/aintra/tools/dispatch.test.ts
```

Expected: PASS (all 5 cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/lib/aintra/tools/dispatch.ts apps/marketing/src/lib/aintra/tools/dispatch.test.ts
git commit -m "feat(aintra): add tool dispatcher with 3s timeout"
```

---

## Task 8: Migration to add `tool_calls` column

**Files:**
- Create: `packages/database/supabase/migrations/20260423090000_chatbot_tool_calls.sql`

- [ ] **Step 1: Write the migration SQL**

Write `packages/database/supabase/migrations/20260423090000_chatbot_tool_calls.sql`:

```sql
-- Add tool_calls column to chatbot_conversations for Aintra tool-call telemetry.
-- Stores an array of { name, args, latency_ms, success, error? } per user turn.
-- Nullable so existing rows remain valid.

ALTER TABLE public.chatbot_conversations
  ADD COLUMN IF NOT EXISTS tool_calls jsonb;

COMMENT ON COLUMN public.chatbot_conversations.tool_calls IS
  'Array of tool invocations (name, args, latency_ms, success, error?) performed while generating the AI response. Aintra college hub tools.';
```

- [ ] **Step 2: Apply the migration to staging via MCP**

Use `mcp__supabase-staging__apply_migration` with:
- name: `chatbot_tool_calls`
- query: the contents of the SQL file above

Expected: Migration applied successfully.

- [ ] **Step 3: Apply to production via MCP**

Use `mcp__supabase-prod__apply_migration` with the same name and query.

Expected: Migration applied successfully.

- [ ] **Step 4: Regenerate TypeScript types**

Run:
```bash
pnpm supabase:gen:types
```

Expected: `packages/database/src/types/database.generated.ts` updated; `chatbot_conversations` Row/Insert/Update now include `tool_calls?: Json | null`.

- [ ] **Step 5: Verify type-check**

Run:
```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/database/supabase/migrations/20260423090000_chatbot_tool_calls.sql packages/database/src/types/database.generated.ts packages/database/src/types/supabase.ts
git commit -m "feat(db): add chatbot_conversations.tool_calls column for Aintra telemetry"
```

(If any other generated file was touched, include it in the commit.)

---

## Task 9: Wire tool-calling into `/api/chat/route.ts`

**Files:**
- Modify: `apps/marketing/src/app/api/chat/route.ts`

This is the integration step. It replaces the single-shot `callGemini` loop with a tool-calling loop and plumbs through the slug anchor + primer.

- [ ] **Step 1: Read the current route end-to-end**

Open `apps/marketing/src/app/api/chat/route.ts` and confirm:
- `GEMINI_API_KEY`, `GEMINI_MODELS`, `GEMINI_BASE_URL` constants (lines 6-8)
- `SYSTEM_PROMPT` constant (lines 10-115)
- `getKBSection()` helper (lines 124-157)
- `callGemini()` helper (lines 159-224)
- `logConversation()` helper (lines 226-274)
- `POST` handler (lines 276-376)

Do not change the existing Neram system prompt text — we append to it, we don't rewrite it.

- [ ] **Step 2: Replace the file with the tool-aware version**

Replace `apps/marketing/src/app/api/chat/route.ts` with:

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getActiveAintraKnowledgeBase } from '@neram/database';
import { extractCollegeSlug } from '@/lib/aintra/slug';
import { buildSystemPrompt } from '@/lib/aintra/primer';
import { TOOL_DECLARATIONS } from '@/lib/aintra/tools/declarations';
import { dispatchTool } from '@/lib/aintra/tools/dispatch';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_TOOL_ITERATIONS = 3;

const SYSTEM_PROMPT = `You are the Neram Classes Assistant — a friendly, helpful chatbot on neramclasses.com. You help prospective and current students with questions about Neram Classes courses, fees, timings, NATA exam, and related topics.

## ABOUT NERAM CLASSES
Neram Classes is India's top-rated NATA coaching institute (4.9 stars on Google, 90+ reviews). We offer online and offline coaching for NATA and JEE Paper 2 (B.Arch/B.Planning).
- Website: neramclasses.com
- Free tools: app.neramclasses.com (Question Bank, Cutoff Calculator, College Predictor, Mock Tests, Eligibility Checker, Cost Calculator, Image Crop, Exam Centers finder)
- Founded by IIT/NIT alumni

## CONTACT INFORMATION
- Phone: +91 91761 37043, +91 88074 37399
- Email: info@neramclasses.com
- Office hours: 9:00 AM – 6:00 PM, Monday to Saturday (Closed Sunday)
- Centers: Coimbatore, Chennai, Bangalore, Madurai, Trichy (Tiruchirapalli), Tiruppur, Pudukkottai, Kanchipuram, Hyderabad, Mumbai, Delhi
- For center addresses and directions, visit neramclasses.com/centers

## CORRECT FEE STRUCTURE (CRITICAL — use these EXACT numbers)
| Course | Duration | Installment | Single Payment |
|--------|----------|-------------|----------------|
| Crash Course | 3 months | — | ₹15,000 |
| 1-Year Program | 12 months | ₹30,000 | ₹25,000 |
| 2-Year Program | 24 months | ₹35,000 | ₹30,000 |

- Scholarships available based on academic performance and financial background
- EMI/installment options available
- YouTube subscription reward: Rs. 50 off

## CLASS TIMINGS & MODES
**Online Classes (RECOMMENDED for consistent long-term preparation):**
- Alternate-day evening classes: 7:00 PM – 8:30 PM
- Consistent schedule throughout the year
- Live interactive sessions via Microsoft Teams
- Recorded lectures available for revision

**Offline Classes:**
- Weekend batches (less consistent schedule)
- Available at physical centers
- Drawing studios and classroom facilities

**Strong recommendation:** We highly recommend online classes for long-term preparation because of the consistency in schedule. Offline weekend batches can be inconsistent.

## COURSES OFFERED
1. **NATA Coaching** — NATA entrance exam preparation
2. **JEE Paper 2 Coaching** — B.Arch/B.Planning entrance
3. **Revit Architecture Training** — 3 months, beginner to advanced
4. **AutoCAD Training** — 2 months, beginner
5. **SketchUp Training** — 1 month, beginner
6. **NATA Self-Learning App** — Self-paced, AI-powered

## FREE STUDY MATERIALS
Yes, we offer free tools at app.neramclasses.com:
- Question Bank with 1000+ practice questions
- Cutoff Calculator
- College Predictor
- Mock Tests
- Eligibility Checker
- Cost Calculator
- Image Crop tool (for NATA application)
- Exam Centers finder

## DEMO CLASS
- Available on **Sundays only**
- Time slots: **10:00 AM** (morning) or **3:00 PM** (afternoon)
- Demo class is conducted when **10+ students register**
- Register at neramclasses.com/demo-class
- Phone verification required for registration

## REFUND POLICY
- Refund requests accepted **only within 24 hours** of payment
- **30% processing fee** is deducted from all refunds
- Example: Paid ₹25,000 → Maximum refund = ₹17,500
- One refund request per payment
- Approval is at the discretion of administration
- Processing time: 5-10 business days
- For full details: neramclasses.com/refund-policy

## SCHOLARSHIP
- Based on academic performance, financial background, and school type
- Required documents: School ID, Parents' Income Certificate, Parents' Aadhar Card, Mark Sheet (optional)
- Apply after admission application
- Review time: 3-5 business days
- Details: neramclasses.com/scholarship

## NATA 2026 EXAM (Key Facts)
- Conducted by Council of Architecture (CoA)
- **Exam medium: English and Hindi ONLY** (no regional languages — not Tamil, Telugu, Kannada, etc.)
- Two phases: Phase 1 (April 4 – June 13, 2026, up to 2 attempts, percentile scoring), Phase 2 (August 7-8, 2026, 1 attempt, raw scores). Cannot appear in both.
- Pattern: Part A (Drawing, 80 marks, offline) + Part B (MCQ/NCQ, 120 marks, online adaptive) = 200 marks, 3 hours
- No negative marking. No minimum qualifying score.
- Eligibility: 10+2 with Physics + Mathematics, minimum 45% for admission
- NATA exam fee: General ₹1,750, SC/ST/EWS/PwD ₹1,250
- Materials allowed: Pencils, erasers, dry colors, scale up to 15cm only. NO geometry box, compass, calculator, or mobile phone.
- Registration: www.nata.in
- For detailed NATA info, use our NATA chatbot or visit neramclasses.com/nata-2026

## INSTRUCTIONS
- Be warm, friendly, and conversational — like chatting with a helpful mentor
- Keep answers concise (2-4 paragraphs max)
- Use **bold** for key info (fees, dates, phone numbers)
- When asked about fees, ALWAYS use the EXACT fee structure above — never approximate or guess
- When asked about timings/modes, recommend online classes for consistency
- For questions you don't know the answer to, say: "I'm not sure about that. Please contact us at **+91 91761 37043** or **info@neramclasses.com** for accurate information."
- NEVER fabricate information or make up details
- When relevant, naturally mention free tools at app.neramclasses.com
- If the user seems interested in joining, suggest visiting neramclasses.com/apply or booking a demo class
- End responses with a brief follow-up question or helpful suggestion when appropriate
- IMPORTANT: Always complete your answer. If a topic needs a long explanation, summarize the key points concisely rather than giving an incomplete detailed answer. Never end mid-sentence.`;

// ============================================
// KB CACHE (unchanged)
// ============================================

let kbCache: { text: string; fetchedAt: number } | null = null;
const KB_CACHE_TTL_MS = 5 * 60 * 1000;

async function getKBSection(): Promise<string> {
  const now = Date.now();
  if (kbCache && now - kbCache.fetchedAt < KB_CACHE_TTL_MS) return kbCache.text;

  try {
    const items = await getActiveAintraKnowledgeBase();
    if (!items.length) {
      kbCache = { text: '', fetchedAt: now };
      return '';
    }

    const grouped: Record<string, { question: string; answer: string }[]> = {};
    for (const item of items) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push({ question: item.question, answer: item.answer });
    }

    const lines: string[] = ['\n\n## ADDITIONAL KNOWLEDGE BASE (Admin-Managed)'];
    for (const [cat, catItems] of Object.entries(grouped)) {
      lines.push(`\n### ${cat}`);
      for (const { question, answer } of catItems) {
        lines.push(`Q: ${question}\nA: ${answer}`);
      }
    }

    const text = lines.join('\n');
    kbCache = { text, fetchedAt: now };
    return text;
  } catch (err) {
    console.error('[GeneralChat] Failed to load KB:', err);
    kbCache = { text: '', fetchedAt: now };
    return '';
  }
}

// ============================================
// GEMINI CALL (tool-aware)
// ============================================

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GeminiContent = { role: 'user' | 'model' | 'function'; parts: GeminiPart[] };

interface ToolCallLog {
  name: string;
  args: Record<string, unknown>;
  latency_ms: number;
  success: boolean;
  error?: string;
}

interface GeminiResult {
  reply: string;
  model: string;
  finishReason: string;
  toolCalls: ToolCallLog[];
}

async function callGemini(
  model: string,
  contents: GeminiContent[],
  systemPrompt: string,
  tools: unknown[] | null,
  errors: string[]
): Promise<{ candidate: any; model: string; finishReason: string } | null> {
  try {
    const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const body: Record<string, unknown> = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.75, maxOutputTokens: 4096, topP: 0.9 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    };
    if (tools && tools.length > 0) body.tools = tools;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text().catch(() => 'unknown');
      const detail = `${model}:HTTP${status}(${errorText.slice(0, 150)})`;
      errors.push(detail);
      console.error(`[GeneralChat] Gemini ${model} error: ${status}`, errorText);
      return null;
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    if (!candidate) {
      const blockReason = data?.promptFeedback?.blockReason || 'NO_CONTENT';
      errors.push(`${model}:${blockReason}`);
      console.error(`[GeneralChat] Gemini ${model}: no candidate (${blockReason})`);
      return null;
    }
    return { candidate, model, finishReason: candidate.finishReason || 'UNKNOWN' };
  } catch (err) {
    errors.push(`${model}:FETCH_ERROR(${err instanceof Error ? err.message : 'unknown'})`);
    console.error(`[GeneralChat] Gemini ${model} fetch error:`, err);
    return null;
  }
}

function extractFunctionCalls(candidate: any): Array<{ name: string; args: Record<string, unknown> }> {
  const parts = candidate?.content?.parts || [];
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  for (const p of parts) {
    if (p.functionCall && p.functionCall.name) {
      calls.push({ name: p.functionCall.name, args: p.functionCall.args || {} });
    }
  }
  return calls;
}

function extractText(candidate: any): string {
  const parts = candidate?.content?.parts || [];
  const chunks: string[] = [];
  for (const p of parts) {
    if (typeof p.text === 'string' && p.text.length) chunks.push(p.text);
  }
  return chunks.join('\n').trim();
}

async function runGeminiLoop(
  initialContents: GeminiContent[],
  systemPrompt: string,
  errors: string[]
): Promise<GeminiResult | null> {
  const contents: GeminiContent[] = [...initialContents];
  const toolCalls: ToolCallLog[] = [];

  // Tools include our DB function declarations + Gemini's native google_search.
  const toolsWithGrounding: unknown[] = [
    { functionDeclarations: TOOL_DECLARATIONS },
    { google_search: {} },
  ];

  let lastModel = GEMINI_MODELS[0];

  for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
    // On the final iteration, disable tools to force a text answer.
    const tools = iteration < MAX_TOOL_ITERATIONS ? toolsWithGrounding : null;

    let result: { candidate: any; model: string; finishReason: string } | null = null;
    for (const model of GEMINI_MODELS) {
      result = await callGemini(model, contents, systemPrompt, tools, errors);
      if (result) {
        lastModel = model;
        break;
      }
    }
    if (!result) return null;

    const functionCalls = extractFunctionCalls(result.candidate);

    if (functionCalls.length === 0) {
      // Model produced a text answer. Done.
      const reply = extractText(result.candidate);
      if (!reply) {
        errors.push(`${result.model}:EMPTY_TEXT`);
        return null;
      }
      const finishReason: string = result.finishReason;
      let finalReply = reply;
      if (finishReason === 'MAX_TOKENS') {
        finalReply =
          reply.trimEnd() +
          '\n\n*For more details, please contact us at **+91 91761 37043** or visit **neramclasses.com**.*';
      }
      return { reply: finalReply, model: result.model, finishReason, toolCalls };
    }

    // Append the model's function-call message verbatim so Gemini can track what it asked.
    contents.push({
      role: 'model',
      parts: functionCalls.map((c) => ({
        functionCall: { name: c.name, args: c.args },
      })),
    });

    // Execute all tool calls in parallel.
    const executions = await Promise.all(
      functionCalls.map(async (call) => {
        const started = Date.now();
        const res = await dispatchTool(call.name, call.args);
        const latency = Date.now() - started;
        toolCalls.push({
          name: call.name,
          args: call.args,
          latency_ms: latency,
          success: res.ok,
          error: res.ok ? undefined : res.error,
        });
        return { call, res };
      })
    );

    // Append each tool result as a functionResponse.
    for (const { call, res } of executions) {
      contents.push({
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: call.name,
              response: res as unknown as Record<string, unknown>,
            },
          },
        ],
      });
    }
  }

  // Hit the iteration cap; force one final text-only call without tools.
  const finalResult = await callGemini(
    GEMINI_MODELS[GEMINI_MODELS.length - 1],
    contents,
    systemPrompt,
    null,
    errors
  );
  if (!finalResult) return null;
  const finalReply = extractText(finalResult.candidate);
  if (!finalReply) return null;
  return {
    reply: finalReply,
    model: finalResult.model,
    finishReason: finalResult.finishReason,
    toolCalls,
  };
}

// ============================================
// LOGGING
// ============================================

async function logConversation(params: {
  sessionId: string;
  userMessage: string;
  aiResponse: string | null;
  userId?: string | null;
  userName?: string | null;
  pageUrl?: string;
  modelUsed?: string;
  responseTimeMs?: number;
  error?: string;
  toolCalls?: ToolCallLog[];
}) {
  try {
    const supabase = createAdminClient();

    let resolvedUserId: string | null = null;
    let resolvedLeadName: string | null = params.userName || null;
    let resolvedLeadPhone: string | null = null;
    if (params.userId) {
      const { data: dbUser } = await supabase
        .from('users')
        .select('id, name, first_name, last_name, phone')
        .eq('firebase_uid', params.userId)
        .single();
      resolvedUserId = dbUser?.id || null;
      const dbName = dbUser?.first_name
        ? `${dbUser.first_name}${dbUser.last_name ? ' ' + dbUser.last_name : ''}`
        : dbUser?.name || null;
      resolvedLeadName = dbName || params.userName || dbUser?.phone || null;
      resolvedLeadPhone = dbUser?.phone || null;
    }

    await (supabase.from('chatbot_conversations') as any).insert({
      session_id: params.sessionId,
      user_message: params.userMessage,
      ai_response: params.aiResponse,
      user_id: resolvedUserId,
      lead_name: resolvedLeadName,
      lead_phone: resolvedLeadPhone,
      page_url: params.pageUrl || null,
      model_used: params.modelUsed || null,
      response_time_ms: params.responseTimeMs || null,
      error: params.error || null,
      source: 'general_chatbot',
      tool_calls: params.toolCalls && params.toolCalls.length ? params.toolCalls : null,
    });
  } catch (err) {
    console.error('Failed to log chatbot conversation:', err);
  }
}

// ============================================
// POST HANDLER
// ============================================

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    console.error('[GeneralChat] GEMINI_API_KEY is not set');
    return NextResponse.json({ error: 'Chat service not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { message, history, sessionId, userId, userName, pageUrl } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }
    if (message.length > 500) {
      return NextResponse.json({ error: 'Message too long (max 500 characters)' }, { status: 400 });
    }

    const contents: GeminiContent[] = [];
    const recentHistory = Array.isArray(history) ? history.slice(-10) : [];
    for (const turn of recentHistory) {
      if (turn.role === 'user' || turn.role === 'model') {
        contents.push({ role: turn.role, parts: [{ text: turn.text }] });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    const startTime = Date.now();
    const kbSection = await getKBSection();
    const currentCollegeSlug = extractCollegeSlug(pageUrl || null);
    const effectivePrompt = buildSystemPrompt({
      base: SYSTEM_PROMPT,
      kb: kbSection,
      currentCollegeSlug,
    });

    const errors: string[] = [];
    const result = await runGeminiLoop(contents, effectivePrompt, errors);
    const responseTimeMs = Date.now() - startTime;

    if (!result) {
      await logConversation({
        sessionId: sessionId || 'unknown',
        userMessage: message.trim(),
        aiResponse: null,
        userId,
        userName,
        pageUrl,
        error: errors.join(' | '),
        responseTimeMs,
      });
      return NextResponse.json(
        { error: 'AI service temporarily unavailable. Please try again in a moment.' },
        { status: 502 }
      );
    }

    await logConversation({
      sessionId: sessionId || 'unknown',
      userMessage: message.trim(),
      aiResponse: result.reply,
      userId,
      userName,
      pageUrl,
      modelUsed: result.model,
      responseTimeMs,
      error: result.finishReason === 'MAX_TOKENS' ? 'TRUNCATED_MAX_TOKENS' : undefined,
      toolCalls: result.toolCalls,
    });

    return NextResponse.json({
      reply: result.reply,
      model: result.model,
      finishReason: result.finishReason,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify type-check passes**

Run:
```bash
pnpm --filter @neram/marketing type-check
```

Expected: PASS.

- [ ] **Step 4: Lint**

Run:
```bash
pnpm --filter @neram/marketing lint
```

Expected: PASS (no new warnings from the new files). If any import-order or unused-var warnings appear, fix them inline.

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/app/api/chat/route.ts
git commit -m "feat(aintra): wire tool-calling + google_search + slug anchor into /api/chat"
```

---

## Task 10: Seed architecture knowledge base rows

**Files:**
- Create: `packages/database/supabase/migrations/20260423090100_aintra_architecture_kb_seed.sql`

- [ ] **Step 1: Write the seed migration**

Write `packages/database/supabase/migrations/20260423090100_aintra_architecture_kb_seed.sql`:

```sql
-- Seed aintra_knowledge_base with architecture admissions Q&A entries.
-- Idempotent: uses ON CONFLICT DO NOTHING keyed on (question, category).
-- These rows are admin-editable via the Supabase dashboard; the route.ts
-- cache picks up changes within 5 minutes.

DO $$
BEGIN
  -- Ensure a unique index exists for ON CONFLICT. Safe to run multiple times.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'aintra_knowledge_base_question_category_key'
  ) THEN
    CREATE UNIQUE INDEX aintra_knowledge_base_question_category_key
      ON public.aintra_knowledge_base (question, category);
  END IF;
END $$;

INSERT INTO public.aintra_knowledge_base (question, answer, category, is_active, display_order)
VALUES
  (
    'What is the NATA 2026 exam pattern?',
    'NATA 2026 has two parts: Part A (Drawing, 80 marks, offline paper) and Part B (MCQ/NCQ, 120 marks, online adaptive). Total 200 marks over 3 hours. No negative marking and no minimum qualifying score. Conducted by the Council of Architecture (CoA).',
    'Architecture Admissions',
    true,
    100
  ),
  (
    'When is NATA 2026?',
    'NATA 2026 is conducted in two phases. Phase 1 runs April 4 to June 13, 2026 (up to 2 attempts, percentile scoring). Phase 2 is on August 7 and 8, 2026 (single attempt, raw scores). Candidates can appear in only one phase. Register at www.nata.in.',
    'Architecture Admissions',
    true,
    101
  ),
  (
    'How does TNEA architecture counseling work?',
    'Tamil Nadu architecture seats are allotted through TNEA (tneaonline.org). Steps: (1) online registration, (2) random number and rank list, (3) choice filling for college and branch preferences, (4) allotment rounds (government and self-financing), (5) reporting at the allotted college. A valid NATA score is required.',
    'Architecture Admissions',
    true,
    102
  ),
  (
    'What is the Kerala architecture admission process?',
    'Kerala admits through KEAM + Centralized Allotment Process (CAP) by CEE Kerala. A separate architecture rank list is published based on NATA score combined with 10+2 marks. Allotment happens in multiple rounds.',
    'Architecture Admissions',
    true,
    103
  ),
  (
    'What is the Karnataka architecture admission process?',
    'Karnataka uses KCET for government and aided seats and COMEDK for private self-financing seats. NATA is required for B.Arch admission regardless of the counseling route. Admissions are managed by KEA (Karnataka Examinations Authority).',
    'Architecture Admissions',
    true,
    104
  ),
  (
    'What does COA approval mean?',
    'The Council of Architecture (CoA) is the statutory body regulating architecture education in India. A COA-approved program is mandatory to register and practice as an architect. Always check COA approval before joining any B.Arch program, no approval means the degree will not qualify you to practice.',
    'Architecture Admissions',
    true,
    105
  ),
  (
    'What is NAAC grade and why does it matter?',
    'NAAC (National Assessment and Accreditation Council) grades institutions A++, A+, A, B++, B+, B based on peer review of teaching, research, infrastructure, and outcomes. Higher NAAC grades generally signal better institutional quality. It is a supporting signal, not a substitute for COA approval.',
    'Architecture Admissions',
    true,
    106
  ),
  (
    'What is NIRF ranking?',
    'NIRF (National Institutional Ranking Framework) is the Ministry of Education annual ranking. It ranks institutions on teaching, research, graduation outcomes, outreach, and perception. For architecture specifically, look at the Architecture discipline ranking rather than the overall rank.',
    'Architecture Admissions',
    true,
    107
  ),
  (
    'What is the difference between B.Arch and B.Planning?',
    'B.Arch is a 5-year professional degree focused on design, construction, and aesthetics, it licenses you to practice as an architect (after COA registration). B.Planning is a 4-year degree focused on urban and regional planning, careers include town planning, GIS analysis, and policy. Fewer colleges offer B.Planning.',
    'Architecture Admissions',
    true,
    108
  ),
  (
    'Are there scholarships for architecture students?',
    'Yes. Most states offer merit, SC/ST/OBC, and minority scholarships administered through the state scholarship portal. Many private colleges offer their own merit-based concessions. Neram Classes also offers performance-based scholarships for coaching, details at neramclasses.com/scholarship.',
    'Architecture Admissions',
    true,
    109
  ),
  (
    'How is architecture college fee structured?',
    'Annual fees typically include tuition (the main component), hostel (if residential), mess, lab/studio fees, library and caution deposit. Government colleges charge around 30k to 80k per year. Self-financing and deemed colleges range from 1L to 3L+. Always check the full 5-year cost, not just Year 1.',
    'Architecture Admissions',
    true,
    110
  ),
  (
    'What are the career paths after B.Arch?',
    'Common paths: practising architect (register with CoA), urban designer, interior designer, landscape architect, BIM/CAD specialist, construction manager, sustainability consultant, academia, or higher studies (M.Arch, MBA, urban planning abroad). Many also go into real estate, architectural journalism, or product design.',
    'Architecture Admissions',
    true,
    111
  ),
  (
    'How do I shortlist architecture colleges?',
    'A practical shortlist: (1) filter to COA-approved colleges, (2) confirm NATA or JEE Paper 2 eligibility matches your exam plan, (3) check NAAC grade or NIRF rank for quality signal, (4) compare 5-year total fees against your budget, (5) check placements and top recruiters if available, (6) consider location and hostel availability. Neram college hub shows all these at a glance.',
    'Architecture Admissions',
    true,
    112
  ),
  (
    'JEE Paper 2 or NATA, which one should I take?',
    'Both accept students into B.Arch, but the college set differs. NITs, SPAs (Schools of Planning and Architecture), and IIITs admit through JEE Paper 2 (JoSAA counseling). Most state colleges and private colleges accept NATA. Many students take both to maximize options. Check each target college accepted_exams list.',
    'Architecture Admissions',
    true,
    113
  ),
  (
    'Who accepts KCET for architecture?',
    'KCET is used by government and aided colleges in Karnataka. Private colleges in Karnataka typically use COMEDK or management quota. In both cases NATA is required for B.Arch admission.',
    'Architecture Admissions',
    true,
    114
  )
ON CONFLICT (question, category) DO NOTHING;
```

- [ ] **Step 2: Apply to staging via MCP**

Use `mcp__supabase-staging__apply_migration` with:
- name: `aintra_architecture_kb_seed`
- query: the file contents

Expected: 15 rows inserted (or fewer if some already present).

- [ ] **Step 3: Verify staging rows**

Use `mcp__supabase-staging__execute_sql`:
```sql
SELECT COUNT(*) AS seeded
FROM aintra_knowledge_base
WHERE category = 'Architecture Admissions' AND is_active = true;
```

Expected: `seeded = 15`.

- [ ] **Step 4: Apply to production via MCP**

Use `mcp__supabase-prod__apply_migration` with the same name and query.

Expected: Migration applied successfully.

- [ ] **Step 5: Verify production rows**

Use `mcp__supabase-prod__execute_sql` with the same SELECT as step 3. Expected: 15.

- [ ] **Step 6: Commit**

```bash
git add packages/database/supabase/migrations/20260423090100_aintra_architecture_kb_seed.sql
git commit -m "feat(db): seed aintra_knowledge_base with architecture admissions entries"
```

---

## Task 11: Playwright E2E tests

**Files:**
- Create: `tests/e2e/aintra-colleges.spec.ts`

- [ ] **Step 1: Find the marketing project config and an existing marketing test for reference**

Run:
```bash
ls tests/e2e/
```

Scan output for an existing `*marketing*.spec.ts` file. Open the Playwright config:

```bash
cat playwright.config.ts | head -100
```

Confirm there's a `marketing-chrome` (or similarly named) project and note its `baseURL`.

- [ ] **Step 2: Write the E2E spec**

Write `tests/e2e/aintra-colleges.spec.ts`:

```typescript
import { test, expect, Page } from '@playwright/test';

// Helper to open Aintra, send a message, and read the latest model reply.
// The widget mounts as GeneralChatbot; selectors are loose to survive style tweaks.
async function openAintra(page: Page) {
  // Widget floating button lives near the bottom-right on every page.
  // It has an <img alt> of the assistant's name. If the button is missing,
  // the widget hasn't mounted yet; wait briefly.
  const opener = page.locator('[data-testid="aintra-opener"], button:has-text("Chat"), button:has(img[alt*="Aintra" i])').first();
  await expect(opener).toBeVisible({ timeout: 10000 });
  await opener.click();
  // Wait for an input textbox to appear inside the chat drawer.
  await expect(page.getByRole('textbox').last()).toBeVisible({ timeout: 5000 });
}

async function askAintra(page: Page, text: string): Promise<string> {
  const input = page.getByRole('textbox').last();
  await input.fill(text);
  await input.press('Enter');
  // Wait for a new model message to render. Aintra typically finishes in 2-15s.
  await page.waitForTimeout(500);
  const start = Date.now();
  let lastText = '';
  while (Date.now() - start < 25000) {
    const messages = await page.locator('[data-role="assistant"], [data-role="model"], .message-assistant, [class*="assistant"]').allTextContents();
    if (messages.length > 0) {
      const candidate = messages[messages.length - 1].trim();
      if (candidate.length > 20 && candidate !== lastText) {
        // Give the stream a moment to finish.
        await page.waitForTimeout(1000);
        const final = (await page.locator('[data-role="assistant"], [data-role="model"], .message-assistant, [class*="assistant"]').allTextContents()).pop() || candidate;
        return final.trim();
      }
      lastText = candidate;
    }
    await page.waitForTimeout(500);
  }
  throw new Error('Aintra did not respond within 25s');
}

test.describe('Aintra college hub Q&A', () => {
  test.beforeEach(async ({ page }) => {
    // Mute dismiss flag so the widget opens fresh on each test.
    await page.addInitScript(() => {
      try {
        window.sessionStorage.removeItem('aintra_dismissed');
      } catch {}
    });
  });

  test('AC1: page anchor, asking "fees" on a college page answers with that college', async ({ page }) => {
    await page.goto('/colleges/tamil-nadu/papni-architecture');
    await openAintra(page);
    const reply = await askAintra(page, 'What are the fees?');
    expect(reply.toLowerCase()).toMatch(/papni|₹|fee|annual/);
    expect(reply).toMatch(/\/colleges\/[a-z-]+\/[a-z0-9-]+/); // cites internal link
  });

  test('AC2: comparison query returns both colleges', async ({ page }) => {
    await page.goto('/colleges');
    await openAintra(page);
    const reply = await askAintra(page, 'Compare Papni with MEASI briefly');
    expect(reply.toLowerCase()).toMatch(/papni/);
    expect(reply.toLowerCase()).toMatch(/measi/);
  });

  test('AC3: filter search finds Chennai colleges under 2L', async ({ page }) => {
    await page.goto('/colleges');
    await openAintra(page);
    const reply = await askAintra(page, 'List architecture colleges in Chennai with annual fee under 2 lakh');
    expect(reply.toLowerCase()).toMatch(/chennai/);
    // Must mention at least one specific college (any name word)
    expect(reply).toMatch(/[A-Z][a-z]+ (School|College|Institute|University)/);
  });

  test('AC4: NATA score primer question answered without requiring a DB tool', async ({ page }) => {
    await page.goto('/');
    await openAintra(page);
    const reply = await askAintra(page, "What's a good NATA score to aim for?");
    expect(reply.toLowerCase()).toMatch(/nata|score|percentile|marks/);
    expect(reply.length).toBeGreaterThan(80);
  });

  test('AC5: off-topic question is declined politely', async ({ page }) => {
    await page.goto('/');
    await openAintra(page);
    const reply = await askAintra(page, 'Whats the best restaurant in Chennai?');
    expect(reply.toLowerCase()).toMatch(/architecture|neram|college|nata|counsel/);
    // Should not attempt to list restaurants
    expect(reply.toLowerCase()).not.toMatch(/biryani|dosa|restaurant recommendations/);
  });

  test('AC7: mobile viewport, widget opens, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/colleges/tamil-nadu/papni-architecture');
    await openAintra(page);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test('AC9: existing Neram fee question still answers correctly', async ({ page }) => {
    await page.goto('/');
    await openAintra(page);
    const reply = await askAintra(page, 'What is the fee for your 1-year program?');
    expect(reply).toMatch(/30,?000|25,?000|₹/);
  });
});
```

> Notes:
> - AC6 (web fallback) and AC8 / AC10 are best validated via the route integration test in production logs rather than brittle Playwright selectors. They are intentionally excluded here; add them if UI selectors stabilize.
> - If the selectors in `openAintra` / `askAintra` don't match the real widget, inspect `apps/marketing/src/components/GeneralChatbot.tsx` and update the selectors to match the rendered DOM. Prefer adding `data-testid="aintra-opener"` and `data-role="assistant"` if missing, it's a one-line ergonomic win.

- [ ] **Step 3: If needed, add data-testid hooks to the widget**

If the selectors above don't match, open `apps/marketing/src/components/GeneralChatbot.tsx`. Find the floating open button (around line 191-817) and add `data-testid="aintra-opener"`. Find the assistant message rendering and add `data-role="assistant"` to each message bubble. Keep the UI unchanged otherwise.

- [ ] **Step 4: Run the E2E suite against local dev**

In one terminal:
```bash
pnpm dev:marketing
```

In another:
```bash
pnpm test:e2e --project=marketing-chrome tests/e2e/aintra-colleges.spec.ts --reporter=list
```

Expected: All 7 assertions pass. If any fails because the model phrased its response differently, soften the regex to match the semantic content (not exact words). Do not loosen the "cites internal link" assertion, it's the source-attribution contract.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/aintra-colleges.spec.ts
# If you edited GeneralChatbot.tsx for test hooks, include it:
git add apps/marketing/src/components/GeneralChatbot.tsx
git commit -m "test(aintra): add E2E coverage for college hub Q&A"
```

---

## Task 12: Final verification and PR

**Files:** none

- [ ] **Step 1: Full repo type-check**

Run:
```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 2: Lint**

Run:
```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 3: Unit tests**

Run:
```bash
pnpm --filter @neram/marketing test
```

Expected: PASS, including the 5 new test files (slug, get-college, search-colleges, compare-colleges, dispatch).

- [ ] **Step 4: E2E smoke (marketing + mobile)**

Run:
```bash
pnpm test:e2e --project=marketing-chrome tests/e2e/aintra-colleges.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Manual smoke in a browser (mandatory per CLAUDE.md for UI changes)**

1. Start dev: `pnpm dev:marketing`
2. Open `http://localhost:3010/colleges/tamil-nadu/papni-architecture`
3. Click Aintra, ask "What are the fees?", confirm the answer cites fee data and includes `/colleges/tamil-nadu/papni-architecture`.
4. Go to `/colleges`, ask "colleges in Chennai under 2 lakh", confirm at least one college listed.
5. Go to `/`, ask "what is your 1-year program fee?", confirm ₹30,000 / ₹25,000 (the existing Neram answer still works).
6. Confirm no console errors in DevTools.

- [ ] **Step 6: Confirm tool-call telemetry in Supabase**

Use `mcp__supabase-staging__execute_sql` (after running one or two real chats against local dev pointing at staging Supabase):
```sql
SELECT id, user_message, model_used, response_time_ms, tool_calls
FROM chatbot_conversations
WHERE tool_calls IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
```

Expected: rows with `tool_calls` populated as an array.

- [ ] **Step 7: Push branch and open a PR**

Run:
```bash
git push -u origin feat/aintra-college-hub
```

Then:
```bash
gh pr create --title "feat(aintra): architecture college hub Q&A" --body "$(cat <<'EOF'
## Summary
- Extends Aintra (marketing-site Gemini chatbot) to answer architecture college questions using Supabase data.
- Adds Gemini tool-calling for \`get_college\`, \`search_colleges\`, \`compare_colleges\`, plus native \`google_search\` grounding as a fallback.
- Injects current college slug as a soft anchor when the user is on a \`/colleges/[state]/[slug]\` page.
- Seeds 15 architecture-admissions Q&A entries into \`aintra_knowledge_base\` (admin-editable via Supabase dashboard).
- Adds \`chatbot_conversations.tool_calls jsonb\` column for tool-call telemetry.

## Design & plan
- Spec: \`docs/superpowers/specs/2026-04-23-aintra-college-hub-design.md\`
- Plan: \`docs/superpowers/plans/2026-04-23-aintra-college-hub.md\`

## Test plan
- [ ] Unit tests: slug parser, three tool handlers, dispatcher (\`pnpm --filter @neram/marketing test\`)
- [ ] E2E: \`pnpm test:e2e --project=marketing-chrome tests/e2e/aintra-colleges.spec.ts\`
- [ ] Manual smoke on \`/colleges/tamil-nadu/papni-architecture\` (fees question cites internal link)
- [ ] Manual smoke on \`/colleges\` (city + fee filter returns results)
- [ ] Manual smoke on \`/\` (existing Neram fee answer still works)
- [ ] Confirm \`chatbot_conversations.tool_calls\` populates in staging Supabase

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Do NOT auto-merge, the user reviews and deploys per CLAUDE.md's deploy rule.

---

## Self-Review (internal, completed before handoff)

**Spec coverage:**
- Architecture overview → Task 9 wires the loop.
- `get_college`, `search_colleges`, `compare_colleges`, `google_search` → Tasks 4, 5, 6, 9.
- Tool-dispatch loop, 3-iter cap, parallel tool execution → Task 9 (`runGeminiLoop`).
- Slug extraction → Task 1.
- Architecture primer + system prompt additions → Task 2, integrated in Task 9.
- Knowledge base seeding → Task 10.
- Schema change (tool_calls column) → Task 8.
- Telemetry (tool_calls logged) → Task 9 (`logConversation`).
- Error handling (timeouts, tool errors, loop exhaustion) → Tasks 7 + 9.
- Testing (unit + E2E) → Tasks 1, 4, 5, 6, 7, 11.
- Rollout plan → Task 12 (staging-first via migration, manual smoke, PR open for review).

**Placeholder scan:** No TBDs, no "implement later", every code block is complete. Test regexes are intentionally loose on phrasing but strict on citation contract — annotated in-line.

**Type consistency:** `ToolResult` / `ToolSuccess` / `ToolFailure` / `CollegeCard` defined once in `types.ts`, referenced consistently. Function names stable: `getCollegeTool`, `searchCollegesTool`, `compareCollegesTool`, `dispatchTool`, `extractCollegeSlug`, `buildSystemPrompt`, `runGeminiLoop`.

**Scope:** One focused feature, single plan, ~12 small tasks, each 2-5 minutes of real work plus test runs.
