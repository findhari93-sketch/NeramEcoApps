// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A student reporting a mistake in a question's solution.
 *
 * What they saw is snapshotted by the server, never taken from the request.
 * One open report per student per part; the uploader hears about the FIRST
 * report only, and a failed alert never loses the report.
 */

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  context: vi.fn(),
  findOpen: vi.fn(),
  countSince: vi.fn(),
  countOpen: vi.fn(),
  create: vi.fn(),
  sendNudge: vi.fn(),
}));

vi.mock('@/lib/qb-auth', () => ({ verifyQBAccessAnyClassroom: (...a: unknown[]) => mocks.access(...a) }));
vi.mock('@/lib/nudge-delivery', () => ({ sendNudge: (...a: unknown[]) => mocks.sendNudge(...a) }));
vi.mock('@neram/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neram/database')>();
  return {
    ...actual,
    getQBReportContext: (...a: unknown[]) => mocks.context(...a),
    findOpenQBReport: (...a: unknown[]) => mocks.findOpen(...a),
    countQBReportsSince: (...a: unknown[]) => mocks.countSince(...a),
    countOpenQBReportsOn: (...a: unknown[]) => mocks.countOpen(...a),
    createQBReport: (...a: unknown[]) => mocks.create(...a),
  };
});

import { POST } from './route';

const VIDEO = 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/question-bank/questions/q31/report', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ id: 'q31' }) };

function context(over: Record<string, unknown> = {}) {
  return {
    question: {
      id: 'q31',
      question_text: 'Houses located on which slopes get more sun in winter?',
      question_format: 'MCQ',
      options: [{ id: 'a', text: 'North' }],
      correct_answer: 'a',
      explanation_brief: null,
      explanation_detailed: null,
      solution_image_url: null,
      solution_video_url: VIDEO,
      drawing_parts: null,
      original_paper_id: 'p2015',
      display_order: 31,
      ...over,
    },
    paper: { id: 'p2015', label: 'JEE Paper 2 2015', uploaded_by: 'founder' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ ok: true, caller: { id: 'student-1', user_type: 'student' } });
  mocks.context.mockResolvedValue(context());
  mocks.findOpen.mockResolvedValue(null);
  mocks.countSince.mockResolvedValue(0);
  mocks.countOpen.mockResolvedValue(0);
  mocks.create.mockImplementation(async (row: Record<string, unknown>) => ({ id: 'r1', status: 'open', ...row }));
  mocks.sendNudge.mockResolvedValue({ results: [], counts: { chat: 0, teams: 0, inapp: 1 } });
});

describe('POST /api/question-bank/questions/[id]/report', () => {
  it('saves a report on the video, with what the student saw taken from the database', async () => {
    const res = await POST(
      req({ target: 'video', reason: 'wrong_working', note: ' Step 3 uses sin ', video_seconds: 135, solution_ref: 'forged' }),
      params,
    );
    expect(res.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        question_id: 'q31',
        student_id: 'student-1',
        target: 'video',
        report_type: 'wrong_working',
        description: 'Step 3 uses sin',
        video_seconds: 135,
        solution_ref: VIDEO,
        source: 'practice',
      }),
    );
  });

  it('refuses a reason that belongs to another part of the question', async () => {
    const res = await POST(req({ target: 'video', reason: 'no_correct_option' }), params);
    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('asks for a note when the reason is Something else', async () => {
    const res = await POST(req({ target: 'video', reason: 'other', note: '  ' }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Tell us what looks wrong/);
  });

  it('refuses a report on a video the question does not have', async () => {
    mocks.context.mockResolvedValue(context({ solution_video_url: null }));
    const res = await POST(req({ target: 'video', reason: 'wrong_working' }), params);
    expect(res.status).toBe(400);
  });

  it('does not file the same report twice', async () => {
    mocks.findOpen.mockResolvedValue({ id: 'r0', status: 'open' });
    const res = await POST(req({ target: 'video', reason: 'wrong_working' }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).already_open).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('stops at 20 reports a day, and says so plainly', async () => {
    mocks.countSince.mockResolvedValue(20);
    const res = await POST(req({ target: 'video', reason: 'wrong_working' }), params);
    expect(res.status).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rings the bell of whoever uploaded the paper, on the first report only', async () => {
    await POST(req({ target: 'video', reason: 'wrong_working' }), params);
    expect(mocks.sendNudge).toHaveBeenCalledTimes(1);
    const input = mocks.sendNudge.mock.calls[0][0];
    expect(input).toMatchObject({
      studentIds: ['founder'],
      audience: 'staff',
      bellOnly: true,
      eventType: 'qb_solution_reported',
    });
    expect(input.subject).toContain('JEE Paper 2 2015 Q31');
    expect(input.metadata.href).toBe('/teacher/question-bank/papers/p2015?q=q31&mode=videos');

    mocks.sendNudge.mockClear();
    mocks.countOpen.mockResolvedValue(1);
    await POST(req({ target: 'video', reason: 'wrong_working' }), params);
    expect(mocks.sendNudge).not.toHaveBeenCalled();
  });

  it('keeps the report when the alert fails', async () => {
    mocks.sendNudge.mockRejectedValue(new Error('Graph is down'));
    const res = await POST(req({ target: 'video', reason: 'wrong_working' }), params);
    expect(res.status).toBe(201);
  });

  it('refuses a caller without access', async () => {
    const { NextResponse } = await import('next/server');
    mocks.access.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
    const res = await POST(req({ target: 'video', reason: 'wrong_working' }), params);
    expect(res.status).toBe(401);
  });
});
