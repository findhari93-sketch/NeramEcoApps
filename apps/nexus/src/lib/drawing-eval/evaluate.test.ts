import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import goodResponse from './__fixtures__/still-life-good.json';

vi.hoisted(() => {
  process.env.GEMINI_API_KEY = 'test-key';
});

/**
 * The real @neram/ai is used on purpose, with only its Supabase reads mocked.
 *
 * Mocking generateGemini would test nothing that matters here: the point of
 * these tests is that the shared budget guard genuinely refuses, that the
 * refusal reaches the caller as a manual prompt rather than a 500, and that no
 * request ever leaves the process while the feature ships off. A stubbed
 * client would let all three regress silently.
 */
const aiControls = { value: {} as Record<string, unknown> };

vi.mock('@neram/database', () => ({
  getNexusSetting: vi.fn(async () => aiControls),
  getAiSpend: vi.fn(async () => zeroSpend()),
  getAiSpendForFeature: vi.fn(async () => zeroSpend()),
  countAiCallsForClient: vi.fn(async () => 0),
  recordAiUsage: vi.fn(async () => {}),
  utcDay: () => '2026-09-09',
  utcMonthStart: () => '2026-09-01',
}));

function zeroSpend() {
  return { calls: 0, blockedCalls: 0, promptTokens: 0, outputTokens: 0, costUsd: 0 };
}

import { clearBudgetCache } from '@neram/ai';

import { evaluateSubmission } from './evaluate';
import { GENERIC_PROMPT_VERSION, PROMPT_VERSION } from './schema';

const STILL_LIFE_CRITERIA = [
  { key: 'composition', title: 'Composition', observable_checks: ['a'], band_descriptions: { '1': 'x' }, sort_order: 0 },
  { key: 'proportion', title: 'Proportion', observable_checks: ['a'], band_descriptions: { '1': 'x' }, sort_order: 1 },
  { key: 'depth_perspective', title: 'Depth', observable_checks: ['a'], band_descriptions: { '1': 'x' }, sort_order: 2 },
  { key: 'tonal_quality', title: 'Tone', observable_checks: ['a'], band_descriptions: { '1': 'x' }, sort_order: 3 },
  { key: 'line_quality', title: 'Line', observable_checks: ['a'], band_descriptions: { '1': 'x' }, sort_order: 4 },
];

const FIVE_ANCHORS = [1, 2, 3, 4, 5].map((band) => ({
  band,
  image_url: `https://storage.example/anchor-${band}.jpg`,
  comment: `Band ${band} reference`,
}));

interface TableData {
  [table: string]: any;
}

const inserted: Record<string, any[]> = {};

/**
 * Minimal PostgREST-shaped stub. Every builder method returns the builder, and
 * the builder resolves to { data } when awaited, so both the .maybeSingle()
 * and the .order() call styles in the service work against it.
 */
function makeSupabase(tables: TableData) {
  function builder(table: string) {
    let payload: any = tables[table];
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      insert: (rows: any) => {
        inserted[table] = inserted[table] || [];
        inserted[table].push(...(Array.isArray(rows) ? rows : [rows]));
        payload = { id: `${table}-id` };
        return chain;
      },
      maybeSingle: async () => ({ data: Array.isArray(payload) ? payload[0] ?? null : payload ?? null }),
      single: async () => ({ data: Array.isArray(payload) ? payload[0] ?? null : payload ?? null, error: null }),
      then: (resolve: any) => resolve({ data: payload ?? null, error: null }),
    };
    return chain;
  }
  return { from: (table: string) => builder(table) };
}

function fullyConfigured() {
  return makeSupabase({
    drawing_submissions: {
      id: 'sub-1',
      original_image_url: 'https://storage.example/student.jpg',
      question_id: 'q-1',
      assignment_id: null,
      exam_qb_question_id: null,
    },
    drawing_questions: { category: '3d_composition', sub_type: 'still_life', question_text: 'Draw three vessels.' },
    drawing_brief_type: {
      id: 'brief-1',
      key: '3d_composition.still_life',
      category: '3d_composition',
      sub_type: 'still_life',
      title: 'Still life',
      description: 'An arrangement of objects.',
      is_active: true,
    },
    drawing_criterion: STILL_LIFE_CRITERIA,
    drawing_anchor_sheet: FIVE_ANCHORS,
    drawing_evaluation: null,
    drawing_evaluation_criterion: null,
    drawing_annotation: null,
  });
}

/** Every URL fetched during a run, so image loads and model calls are separable. */
let fetched: string[] = [];

/**
 * The Gemini REST path, matched instead of the host.
 *
 * ESLint bans the host literal anywhere in this app so nobody hand-builds the
 * URL. The rule is right, and this file has no business being the exception,
 * so the stub keys off the path segment instead. It is just as unambiguous:
 * nothing else this code fetches is a versioned model endpoint.
 */
const MODEL_PATH = '/v1beta/models/';

function geminiCalls() {
  return fetched.filter((u) => u.includes(MODEL_PATH));
}

function stubFetch(modelText: string | null, opts: { finishReason?: string } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const href = String(url);
      fetched.push(href);

      if (href.includes(MODEL_PATH)) {
        if (modelText === null) return new Response('quota', { status: 429 });
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: modelText }] },
                finishReason: opts.finishReason ?? 'STOP',
              },
            ],
            usageMetadata: { promptTokenCount: 4000, candidatesTokenCount: 1200 },
          }),
          { status: 200 },
        );
      }

      // An image URL. Any few bytes will do; nothing decodes them here.
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    }),
  );
}

beforeEach(() => {
  fetched = [];
  for (const key of Object.keys(inserted)) delete inserted[key];
  aiControls.value = {};
  clearBudgetCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the kill switch', () => {
  it('ships off, so nothing reaches Google without an explicit decision', async () => {
    stubFetch(JSON.stringify(goodResponse));

    const outcome = await evaluateSubmission({
      supabase: fullyConfigured(),
      submissionId: 'sub-1',
      actorId: 'user-1',
    });

    expect(outcome.ok).toBe(false);
    expect(geminiCalls()).toHaveLength(0);
  });

  it('hands back the manual prompt instead of failing, so a block degrades to the copy-paste workflow', async () => {
    stubFetch(JSON.stringify(goodResponse));

    const outcome = await evaluateSubmission({
      supabase: fullyConfigured(),
      submissionId: 'sub-1',
      actorId: 'user-1',
    });

    if (outcome.ok) throw new Error('expected a refusal');
    expect(outcome.status).toBe(409);
    expect(outcome.manualPrompt).toBeTruthy();
  });

  it('stays blocked when the master switch is off even after the feature is turned on', async () => {
    aiControls.value = { masterEnabled: false, modes: { 'nexus.drawing-eval': 'auto' } };
    stubFetch(JSON.stringify(goodResponse));

    const outcome = await evaluateSubmission({
      supabase: fullyConfigured(),
      submissionId: 'sub-1',
      actorId: 'user-1',
    });

    expect(outcome.ok).toBe(false);
    expect(geminiCalls()).toHaveLength(0);
  });
});

describe('once the feature is switched on', () => {
  beforeEach(() => {
    aiControls.value = { modes: { 'nexus.drawing-eval': 'auto' } };
    clearBudgetCache();
  });

  it('evaluates a fully configured submission and persists the draft', async () => {
    stubFetch(JSON.stringify(goodResponse));

    const outcome = await evaluateSubmission({
      supabase: fullyConfigured(),
      submissionId: 'sub-1',
      actorId: 'user-1',
    });

    if (!outcome.ok) throw new Error(`expected success, got ${outcome.error}`);
    expect(outcome.result.criteria).toHaveLength(5);
    expect(outcome.result.totalScore).toBe(3.4);
    expect(outcome.mode).toBe('anchored');
    expect(inserted.drawing_evaluation[0].prompt_version).toBe(PROMPT_VERSION);
    expect(geminiCalls()).toHaveLength(1);
  });

  it('writes one criterion row per criterion and one annotation row per box', async () => {
    stubFetch(JSON.stringify(goodResponse));

    await evaluateSubmission({ supabase: fullyConfigured(), submissionId: 'sub-1', actorId: 'user-1' });

    expect(inserted.drawing_evaluation).toHaveLength(1);
    expect(inserted.drawing_evaluation[0].status).toBe('draft');
    expect(inserted.drawing_evaluation_criterion).toHaveLength(5);
    // The fixture carries six boxes across its five criteria.
    expect(inserted.drawing_annotation).toHaveLength(6);
  });

  it('stores geometry as normalised [x, y, w, h] and never provider-raw values', async () => {
    stubFetch(JSON.stringify(goodResponse));

    await evaluateSubmission({ supabase: fullyConfigured(), submissionId: 'sub-1', actorId: 'user-1' });

    for (const row of inserted.drawing_annotation) {
      expect(row.geometry).toHaveLength(4);
      expect(row.source).toBe('ai');
      for (const n of row.geometry) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(1);
      }
    }
  });

  it('seeds final_band from ai_band so an untouched criterion reads as accepted', async () => {
    stubFetch(JSON.stringify(goodResponse));

    await evaluateSubmission({ supabase: fullyConfigured(), submissionId: 'sub-1', actorId: 'user-1' });

    for (const row of inserted.drawing_evaluation_criterion) {
      expect(row.final_band).toBe(row.ai_band);
      expect(row.was_corrected).toBe(false);
    }
  });

  it('sends the anchors before the student sheet, so the cacheable prefix is stable', async () => {
    stubFetch(JSON.stringify(goodResponse));

    await evaluateSubmission({ supabase: fullyConfigured(), submissionId: 'sub-1', actorId: 'user-1' });

    const call = (globalThis.fetch as any).mock.calls.find((c: any[]) =>
      String(c[0]).includes(MODEL_PATH),
    );
    const body = JSON.parse(call[1].body);
    const parts = body.contents[0].parts;

    const texts = parts.map((p: any) => p.text ?? '');
    const anchorIndex = texts.findIndex((t: string) => t.includes('Reference sheet, band 1'));
    const studentIndex = texts.findIndex((t: string) => t.includes('STUDENT SHEET TO EVALUATE'));

    expect(anchorIndex).toBeGreaterThan(-1);
    expect(studentIndex).toBeGreaterThan(anchorIndex);

    // Six images: five anchors then the student sheet.
    const images = parts.filter((p: any) => p.inline_data);
    expect(images).toHaveLength(6);
  });

  it('retries once on unusable JSON, then records needs_manual rather than a partial draft', async () => {
    stubFetch('not json at all');

    const outcome = await evaluateSubmission({
      supabase: fullyConfigured(),
      submissionId: 'sub-1',
      actorId: 'user-1',
    });

    expect(outcome.ok).toBe(false);
    expect(geminiCalls()).toHaveLength(2);
    expect(inserted.drawing_evaluation).toHaveLength(1);
    expect(inserted.drawing_evaluation[0].status).toBe('needs_manual');
    expect(inserted.drawing_evaluation_criterion).toBeUndefined();
  });

  it('names truncation as truncation rather than leaving it as a JSON mystery', async () => {
    stubFetch(JSON.stringify(goodResponse).slice(0, 300), { finishReason: 'MAX_TOKENS' });

    const outcome = await evaluateSubmission({
      supabase: fullyConfigured(),
      submissionId: 'sub-1',
      actorId: 'user-1',
    });

    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.error).toMatch(/output space/i);
  });

  it('surfaces a rate limit as 429 rather than a generic failure', async () => {
    stubFetch(null);

    const outcome = await evaluateSubmission({
      supabase: fullyConfigured(),
      submissionId: 'sub-1',
      actorId: 'user-1',
    });

    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.status).toBe(429);
  });
});

describe('without a complete anchored brief, drafts in generic mode instead of refusing', () => {
  beforeEach(() => {
    aiControls.value = { modes: { 'nexus.drawing-eval': 'auto' } };
    clearBudgetCache();
  });

  /** The shared four only: what an unbriefed assignment drawing is scored on. */
  const SHARED_FOUR_RESPONSE = {
    ...goodResponse,
    criteria: (goodResponse as any).criteria.filter((c: any) => c.criterionKey !== 'depth_perspective'),
  };

  async function run(overrides: TableData, response: unknown = goodResponse) {
    stubFetch(JSON.stringify(response));
    const base = {
      drawing_submissions: {
        id: 'sub-1',
        original_image_url: 'https://storage.example/student.jpg',
        question_id: 'q-1',
        assignment_id: null,
        exam_qb_question_id: null,
      },
      drawing_questions: { category: '3d_composition', sub_type: 'still_life', question_text: 'Draw.' },
      drawing_brief_type: {
        id: 'brief-1', key: '3d_composition.still_life', category: '3d_composition', sub_type: 'still_life',
        title: 'Still life', description: null, is_active: true,
      },
      drawing_criterion: STILL_LIFE_CRITERIA,
      drawing_anchor_sheet: FIVE_ANCHORS,
    };
    return evaluateSubmission({
      supabase: makeSupabase({ ...base, ...overrides }),
      submissionId: 'sub-1',
      actorId: 'user-1',
    });
  }

  function modelRequest() {
    const call = (globalThis.fetch as any).mock.calls.find((c: any[]) => String(c[0]).includes(MODEL_PATH));
    return JSON.parse(call[1].body);
  }

  it('drafts a brief type that is not active yet without reference sheets', async () => {
    const outcome = await run({
      drawing_brief_type: {
        id: 'brief-1', key: '3d_composition.still_life', category: '3d_composition', sub_type: 'still_life',
        title: 'Still life', description: null, is_active: false,
      },
    });
    if (!outcome.ok) throw new Error(`expected a generic draft, got ${outcome.error}`);
    expect(outcome.mode).toBe('generic');
    expect(inserted.drawing_evaluation[0].prompt_version).toBe(GENERIC_PROMPT_VERSION);
    // Only the student sheet: no anchors are sent, so none are downloaded.
    expect(modelRequest().contents[0].parts.filter((p: any) => p.inline_data)).toHaveLength(1);
    expect(fetched.filter((u) => u.includes('anchor-'))).toHaveLength(0);
  });

  it('drafts without comparing against an incomplete anchor scale', async () => {
    const outcome = await run({ drawing_anchor_sheet: FIVE_ANCHORS.slice(0, 4) });
    if (!outcome.ok) throw new Error(`expected a generic draft, got ${outcome.error}`);
    expect(outcome.mode).toBe('generic');
    expect(modelRequest().contents[0].parts.filter((p: any) => p.inline_data)).toHaveLength(1);
  });

  it('stores no closest anchor band on a generic draft', async () => {
    await run({ drawing_anchor_sheet: [] });
    for (const row of inserted.drawing_evaluation_criterion) expect(row.closest_anchor_band).toBeNull();
  });

  it('drafts a sheet with no brief type on the shared four criteria the rubric panel shows', async () => {
    const outcome = await run({ drawing_questions: null, drawing_brief_type: null }, SHARED_FOUR_RESPONSE);
    if (!outcome.ok) throw new Error(`expected a generic draft, got ${outcome.error}`);
    expect(outcome.result.criteria.map((c) => c.criterionKey).sort()).toEqual(
      ['composition', 'line_quality', 'proportion', 'tonal_quality'],
    );
    expect(inserted.drawing_evaluation[0].brief_type_id).toBeNull();
  });

  it('rejects a fifth criterion the rubric panel would not show for an unbriefed sheet', async () => {
    const outcome = await run({ drawing_questions: null, drawing_brief_type: null }, goodResponse);
    if (outcome.ok) throw new Error('expected the invented criterion to be refused');
    expect(outcome.error).toMatch(/Unknown criterion "depth_perspective"/);
  });

  it('falls back to the seeded observable checks when the database has none', async () => {
    const outcome = await run({ drawing_criterion: [] });
    if (!outcome.ok) throw new Error(`expected a generic draft, got ${outcome.error}`);
    const text = modelRequest().contents[0].parts[0].text as string;
    expect(text).toContain('Receding edges converge consistently towards a coherent vanishing point.');
  });

  it('asks for tags from the supplied list only, and keeps only those', async () => {
    stubFetch(JSON.stringify({ ...goodResponse, tags: ['Still Life', 'Made up tag'] }));
    const outcome = await evaluateSubmission({
      supabase: fullyConfigured(),
      submissionId: 'sub-1',
      actorId: 'user-1',
      tagLabels: ['Still Life', 'Portrait'],
    });
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.result.tags).toEqual(['Still Life']);
    expect(inserted.drawing_evaluation[0].raw_response.tags).toEqual(['Still Life']);
    expect(modelRequest().generationConfig.responseSchema.properties.tags.items.enum).toEqual(['Still Life', 'Portrait']);
  });

  it('reports a missing submission as 404', async () => {
    const outcome = await run({ drawing_submissions: null });
    if (outcome.ok) throw new Error('expected refusal');
    expect(outcome.status).toBe(404);
    expect(outcome.kind).toBe('not_found');
  });
});

describe('writing onto a claimed row', () => {
  beforeEach(() => {
    aiControls.value = { modes: { 'nexus.drawing-eval': 'auto' } };
    clearBudgetCache();
  });

  it('updates the claim to draft instead of inserting a second evaluation', async () => {
    stubFetch(JSON.stringify(goodResponse));
    const updates: any[] = [];
    const base = fullyConfigured();
    const supabase = {
      from: (table: string) => {
        const chain = base.from(table);
        chain.update = (values: any) => {
          updates.push({ table, values });
          const guarded: any = {
            eq: () => guarded,
            select: async () => ({ data: [{ id: 'claim-1' }], error: null }),
            then: (resolve: any) => resolve({ data: null, error: null }),
          };
          return guarded;
        };
        return chain;
      },
    };

    const outcome = await evaluateSubmission({
      supabase,
      submissionId: 'sub-1',
      actorId: 'user-1',
      claimedEvaluationId: 'claim-1',
    });

    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.evaluationId).toBe('claim-1');
    expect(inserted.drawing_evaluation).toBeUndefined();
    expect(updates).toHaveLength(1);
    expect(updates[0].values.status).toBe('draft');
    expect(inserted.drawing_evaluation_criterion.every((r: any) => r.evaluation_id === 'claim-1')).toBe(true);
  });
});
