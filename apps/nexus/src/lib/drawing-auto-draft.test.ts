import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import goodResponse from './drawing-eval/__fixtures__/still-life-good.json';
import { createFakeDb } from './drawing-eval/__fixtures__/fake-db';

/**
 * Automatic drafting, against an in-memory database that enforces the
 * one-live-AI-draft index, with the model and the orientation step mocked.
 * No request ever leaves the process: generateGemini is a mock, and fetch is
 * stubbed to hand back a few image bytes.
 */

const mocks = vi.hoisted(() => {
  class AiBlockedError extends Error {
    reason: string;
    manualPrompt: string | null;
    constructor(args: { message: string; reason: string; manualPrompt?: string | null }) {
      super(args.message);
      this.name = 'AiBlockedError';
      this.reason = args.reason;
      this.manualPrompt = args.manualPrompt ?? null;
    }
  }
  return {
    AiBlockedError,
    generateGemini: vi.fn(),
    checkBudget: vi.fn(),
    getNexusSetting: vi.fn(),
    listDrawingTags: vi.fn(),
    getSubmissionTags: vi.fn(),
    setSubmissionTags: vi.fn(),
    detectAndFixOrientation: vi.fn(),
  };
});

vi.mock('@neram/ai', () => ({
  AiBlockedError: mocks.AiBlockedError,
  generateGemini: mocks.generateGemini,
  checkBudget: mocks.checkBudget,
}));

vi.mock('@neram/database', () => ({ getNexusSetting: mocks.getNexusSetting }));

vi.mock('@neram/database/queries/nexus', () => ({
  listDrawingTags: mocks.listDrawingTags,
  getSubmissionTags: mocks.getSubmissionTags,
  setSubmissionTags: mocks.setSubmissionTags,
}));

vi.mock('@/lib/drawing-orientation', () => ({ detectAndFixOrientation: mocks.detectAndFixOrientation }));

import { pickSweepCandidates, runAutoDraft, runSweep, STALE_CLAIM_MS } from './drawing-auto-draft';
import { GENERIC_PROMPT_VERSION } from './drawing-eval/schema';

const NOW = new Date('2026-09-14T12:00:00Z');
const now = () => NOW;
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

const IMAGE = 'https://storage.example/drawing-uploads/student-1/1.jpg';

/** An unbriefed assignment drawing drafts on the shared four, so the answer carries those four. */
function genericAnswer(tags: string[] = ['Still Life']) {
  return JSON.stringify({
    ...goodResponse,
    criteria: (goodResponse as any).criteria.filter((c: any) => c.criterionKey !== 'depth_perspective'),
    tags,
  });
}

function seedSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    student_id: 'student-1',
    status: 'submitted',
    source_type: 'assignment',
    original_image_url: IMAGE,
    question_id: null,
    assignment_id: null,
    exam_qb_question_id: null,
    submitted_at: minutesAgo(60),
    ...overrides,
  };
}

function setup(extra: Record<string, any[]> = {}, submission: Record<string, unknown> = {}) {
  return createFakeDb({ drawing_submissions: [seedSubmission(submission)], drawing_evaluation: [], ...extra }, { now });
}

const SEED_TAGS = [
  { id: 't1', slug: 'still-life', label: 'Still Life', is_seed: true },
  { id: 't2', slug: 'portrait', label: 'Portrait', is_seed: true },
  { id: 't3', slug: 'my-own', label: 'My own', is_seed: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getNexusSetting.mockResolvedValue({ value: { 'staff.drawing-eval': true } });
  mocks.checkBudget.mockResolvedValue({ allowed: true, reason: 'auto', message: '', controls: { usdToInr: 84 } });
  mocks.generateGemini.mockResolvedValue({ text: genericAnswer(), model: 'gemini-test', finishReason: 'STOP', costUsd: 0.01 });
  mocks.listDrawingTags.mockResolvedValue(SEED_TAGS);
  mocks.getSubmissionTags.mockResolvedValue([]);
  mocks.setSubmissionTags.mockResolvedValue([]);
  mocks.detectAndFixOrientation.mockImplementation(async (_admin: unknown, sub: { original_image_url: string }) => ({
    checkedUrl: sub.original_image_url,
    imageUrl: sub.original_image_url,
    rotatedDeg: null,
    exifApplied: false,
    answer: { rotateClockwise: 0, confidence: 'high' },
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'image/jpeg' } })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the gate', () => {
  it('is blocked while the staff.drawing-eval flag is off, and writes nothing', async () => {
    mocks.getNexusSetting.mockResolvedValue({ value: {} });
    const db = setup();
    const result = await runAutoDraft(db.client, 'sub-1', { now });
    expect(result).toEqual({ state: 'blocked', reason: 'flag_off' });
    expect(db.tables.drawing_evaluation).toHaveLength(0);
    expect(mocks.generateGemini).not.toHaveBeenCalled();
  });

  it('is blocked with the budget reason when the AI controls refuse', async () => {
    mocks.checkBudget.mockResolvedValue({ allowed: false, reason: 'daily_cap', message: 'cap', controls: {} });
    const db = setup();
    const result = await runAutoDraft(db.client, 'sub-1', { now });
    expect(result).toEqual({ state: 'blocked', reason: 'daily_cap' });
    expect(db.tables.drawing_evaluation).toHaveLength(0);
  });
});

describe('what is drafted', () => {
  it('skips a sheet that is no longer waiting for review', async () => {
    const db = setup({}, { status: 'completed' });
    const result = await runAutoDraft(db.client, 'sub-1', { now });
    expect(result).toEqual({ state: 'skipped', reason: 'not_submitted' });
    expect(db.tables.drawing_evaluation).toHaveLength(0);
    expect(mocks.generateGemini).not.toHaveBeenCalled();
  });

  it('skips sketchbook pages', async () => {
    const db = setup({}, { source_type: 'sketchbook' });
    expect(await runAutoDraft(db.client, 'sub-1', { now })).toEqual({ state: 'skipped', reason: 'sketchbook' });
  });

  it('skips a missing submission', async () => {
    const db = setup();
    expect(await runAutoDraft(db.client, 'nope', { now })).toEqual({ state: 'skipped', reason: 'not_found' });
  });

  it('drafts a waiting sheet onto its claim: one draft row, generic, with criteria rows and tags', async () => {
    const db = setup();
    const result = await runAutoDraft(db.client, 'sub-1', { actorId: 'teacher-1', now });

    expect(result.state).toBe('drafted');
    expect(result.mode).toBe('generic');
    expect(result.tags).toEqual(['Still Life']);
    expect(db.tables.drawing_evaluation).toHaveLength(1);
    const row = db.tables.drawing_evaluation[0];
    expect(row.id).toBe(result.evaluationId);
    expect(row.status).toBe('draft');
    expect(row.source).toBe('ai');
    expect(row.prompt_version).toBe(GENERIC_PROMPT_VERSION);
    expect(row.raw_response.tags).toEqual(['Still Life']);
    expect(row.raw_response.orientation.checkedUrl).toBe(IMAGE);
    expect(db.tables.drawing_evaluation_criterion.map((c) => c.criterion_key).sort()).toEqual(
      ['composition', 'line_quality', 'proportion', 'tonal_quality'],
    );
    for (const c of db.tables.drawing_evaluation_criterion) expect(c.closest_anchor_band).toBeNull();
    expect(mocks.setSubmissionTags).toHaveBeenCalledWith('sub-1', ['Still Life'], 'teacher-1', db.client);
  });

  it('offers the model only the seeded tags', async () => {
    const db = setup();
    await runAutoDraft(db.client, 'sub-1', { now });
    const schema = mocks.generateGemini.mock.calls[0][0].responseSchema;
    expect(schema.properties.tags.items.enum).toEqual(['Still Life', 'Portrait']);
  });

  it('reports the turn the orientation step applied', async () => {
    mocks.detectAndFixOrientation.mockResolvedValue({
      checkedUrl: IMAGE,
      imageUrl: 'https://storage.example/drawing-uploads/student-1/auto-upright-1.jpg',
      rotatedDeg: 90,
      exifApplied: false,
      answer: { rotateClockwise: 90, confidence: 'high' },
    });
    const db = setup();
    const result = await runAutoDraft(db.client, 'sub-1', { now });
    expect(result.state).toBe('drafted');
    expect(result.rotatedDeg).toBe(90);
  });
});

describe('claims', () => {
  it('answers busy, and spends nothing, while another run holds the sheet', async () => {
    const db = setup({
      drawing_evaluation: [{ id: 'claim-a', submission_id: 'sub-1', source: 'ai', status: 'running', created_at: minutesAgo(2) }],
    });
    const result = await runAutoDraft(db.client, 'sub-1', { now });
    expect(result).toEqual({ state: 'busy', reason: 'running' });
    expect(db.tables.drawing_evaluation).toHaveLength(1);
    expect(mocks.generateGemini).not.toHaveBeenCalled();
    expect(mocks.detectAndFixOrientation).not.toHaveBeenCalled();
  });

  it('lets only one of two simultaneous runs pay for the sheet', async () => {
    const db = setup();
    const [a, b] = await Promise.all([
      runAutoDraft(db.client, 'sub-1', { now }),
      runAutoDraft(db.client, 'sub-1', { now }),
    ]);
    expect([a.state, b.state].sort()).toEqual(['busy', 'drafted']);
    expect(mocks.generateGemini).toHaveBeenCalledTimes(1);
    expect(db.tables.drawing_evaluation.filter((r) => r.status === 'draft')).toHaveLength(1);
  });

  it('reclaims a running row older than ten minutes as a dead run', async () => {
    const stale = new Date(NOW.getTime() - STALE_CLAIM_MS - 60_000).toISOString();
    const db = setup({
      drawing_evaluation: [{ id: 'claim-dead', submission_id: 'sub-1', source: 'ai', status: 'running', created_at: stale }],
    });
    const result = await runAutoDraft(db.client, 'sub-1', { now });
    expect(result.state).toBe('drafted');
    const dead = db.tables.drawing_evaluation.find((r) => r.id === 'claim-dead');
    expect(dead?.status).toBe('superseded');
    expect(db.tables.drawing_evaluation.filter((r) => r.status === 'draft')).toHaveLength(1);
  });

  it('deletes the claim when the model call is refused, so the sheet is tried again later', async () => {
    mocks.generateGemini.mockRejectedValue(new mocks.AiBlockedError({ message: 'Over the daily cap', reason: 'daily_cap' }));
    const db = setup();
    const result = await runAutoDraft(db.client, 'sub-1', { now });
    expect(result.state).toBe('blocked');
    expect(result.reason).toBe('daily_cap');
    expect(db.tables.drawing_evaluation).toHaveLength(0);
  });

  it('deletes the claim when the orientation call is refused, before any evaluation', async () => {
    mocks.detectAndFixOrientation.mockRejectedValue(new mocks.AiBlockedError({ message: 'off', reason: 'feature_off' }));
    const db = setup();
    const result = await runAutoDraft(db.client, 'sub-1', { now });
    expect(result).toEqual({ state: 'blocked', reason: 'feature_off' });
    expect(db.tables.drawing_evaluation).toHaveLength(0);
    expect(mocks.generateGemini).not.toHaveBeenCalled();
  });

  it('releases the claim on a rate limit and reports it as blocked', async () => {
    mocks.generateGemini.mockRejectedValue(new Error('Gemini 429: every model rate limited'));
    const db = setup();
    const result = await runAutoDraft(db.client, 'sub-1', { now });
    expect(result.state).toBe('blocked');
    expect(result.reason).toBe('rate_limited');
    expect(db.tables.drawing_evaluation).toHaveLength(0);
  });

  it('turns the claim into needs_manual when the model fails', async () => {
    mocks.generateGemini.mockRejectedValue(new Error('upstream exploded'));
    const db = setup();
    const result = await runAutoDraft(db.client, 'sub-1', { now });
    expect(result.state).toBe('failed');
    expect(result.reason).toMatch(/upstream exploded/);
    expect(db.tables.drawing_evaluation).toHaveLength(1);
    expect(db.tables.drawing_evaluation[0].status).toBe('needs_manual');
    expect(db.tables.drawing_evaluation[0].error).toMatch(/upstream exploded/);
  });
});

describe('tags', () => {
  it('adds the draft tags to the ones the sheet already has, never removing any', async () => {
    mocks.getSubmissionTags.mockResolvedValue([{ id: 'x', slug: 'my-own', label: 'My own', is_seed: false }]);
    const db = setup();
    await runAutoDraft(db.client, 'sub-1', { actorId: 'teacher-1', now });
    expect(mocks.setSubmissionTags).toHaveBeenCalledWith('sub-1', ['My own', 'Still Life'], 'teacher-1', db.client);
  });

  it('does not rewrite the tag set when every draft tag is already there', async () => {
    mocks.getSubmissionTags.mockResolvedValue([{ id: 't1', slug: 'still-life', label: 'Still Life', is_seed: true }]);
    const db = setup();
    await runAutoDraft(db.client, 'sub-1', { now });
    expect(mocks.setSubmissionTags).not.toHaveBeenCalled();
  });

  it('writes no tags when the existing set cannot be read, rather than wiping it', async () => {
    mocks.getSubmissionTags.mockRejectedValue(new Error('read failed'));
    const db = setup();
    const result = await runAutoDraft(db.client, 'sub-1', { now });
    expect(result.state).toBe('drafted');
    expect(mocks.setSubmissionTags).not.toHaveBeenCalled();
  });
});

describe('force (Draft again)', () => {
  const existingDraft = () => ({
    id: 'draft-old',
    submission_id: 'sub-1',
    source: 'ai',
    status: 'draft',
    created_at: minutesAgo(30),
    raw_response: { orientation: { checkedUrl: IMAGE, imageUrl: IMAGE } },
  });

  it('without force, leaves an existing draft alone', async () => {
    const db = setup({ drawing_evaluation: [existingDraft()] });
    const result = await runAutoDraft(db.client, 'sub-1', { now });
    expect(result).toEqual({ state: 'skipped', reason: 'already_drafted' });
    expect(mocks.generateGemini).not.toHaveBeenCalled();
  });

  it('with force, supersedes the old draft and writes a new one', async () => {
    const db = setup({ drawing_evaluation: [existingDraft()] });
    const result = await runAutoDraft(db.client, 'sub-1', { force: true, now });
    expect(result.state).toBe('drafted');
    expect(db.tables.drawing_evaluation.find((r) => r.id === 'draft-old')?.status).toBe('superseded');
    const live = db.tables.drawing_evaluation.filter((r) => r.status === 'draft');
    expect(live).toHaveLength(1);
    expect(live[0].id).not.toBe('draft-old');
  });

  it('does not pay to check the orientation of an image that was already checked', async () => {
    const db = setup({ drawing_evaluation: [existingDraft()] });
    await runAutoDraft(db.client, 'sub-1', { force: true, now });
    expect(mocks.detectAndFixOrientation).not.toHaveBeenCalled();
  });
});

describe('sweep', () => {
  function sweepDb() {
    return createFakeDb(
      {
        drawing_submissions: [
          seedSubmission({ id: 'drafted', submitted_at: minutesAgo(600) }),
          seedSubmission({ id: 'running', submitted_at: minutesAgo(590) }),
          seedSubmission({ id: 'dead-run', submitted_at: minutesAgo(580) }),
          seedSubmission({ id: 'failed-today', submitted_at: minutesAgo(570) }),
          seedSubmission({ id: 'failed-long-ago', submitted_at: minutesAgo(560) }),
          seedSubmission({ id: 'fresh-old', submitted_at: minutesAgo(550) }),
          seedSubmission({ id: 'sketch', source_type: 'sketchbook', submitted_at: minutesAgo(540) }),
          seedSubmission({ id: 'done', status: 'completed', submitted_at: minutesAgo(530) }),
          seedSubmission({ id: 'fresh-new', submitted_at: minutesAgo(5) }),
        ],
        drawing_evaluation: [
          { id: 'e1', submission_id: 'drafted', source: 'ai', status: 'draft', created_at: minutesAgo(100) },
          { id: 'e2', submission_id: 'running', source: 'ai', status: 'running', created_at: minutesAgo(1) },
          { id: 'e3', submission_id: 'dead-run', source: 'ai', status: 'running', created_at: minutesAgo(60) },
          { id: 'e4', submission_id: 'failed-today', source: 'ai', status: 'needs_manual', created_at: minutesAgo(120) },
          { id: 'e5', submission_id: 'failed-long-ago', source: 'ai', status: 'needs_manual', created_at: minutesAgo(26 * 60) },
          { id: 'e6', submission_id: 'fresh-old', source: 'manual', status: 'reviewed', created_at: minutesAgo(10) },
        ],
      },
      { now },
    );
  }

  it('picks the oldest waiting sheets with no draft, no live run and no failure today', async () => {
    const db = sweepDb();
    const ids = await pickSweepCandidates(db.client, 6, NOW);
    expect(ids).toEqual(['dead-run', 'failed-long-ago', 'fresh-old', 'fresh-new']);
  });

  it('respects the limit, oldest first', async () => {
    const db = sweepDb();
    expect(await pickSweepCandidates(db.client, 2, NOW)).toEqual(['dead-run', 'failed-long-ago']);
  });

  it('drafts the picked sheets and reports each state', async () => {
    const db = sweepDb();
    const result = await runSweep(db.client, { now });
    expect(result.blocked).toBe(false);
    expect(result.processed).toBe(4);
    expect(result.results.every((r) => r.state === 'drafted')).toBe(true);
  });

  it('stops starting new drafts after the first refusal', async () => {
    mocks.generateGemini.mockRejectedValue(new mocks.AiBlockedError({ message: 'cap', reason: 'daily_cap' }));
    const db = sweepDb();
    const result = await runSweep(db.client, { now, concurrency: 1 });
    expect(result.blocked).toBe(true);
    expect(result.processed).toBe(1);
  });

  it('does not read the queue at all while switched off', async () => {
    mocks.getNexusSetting.mockResolvedValue({ value: {} });
    const db = sweepDb();
    expect(await runSweep(db.client, { now })).toEqual({ processed: 0, results: [], blocked: true });
  });
});
