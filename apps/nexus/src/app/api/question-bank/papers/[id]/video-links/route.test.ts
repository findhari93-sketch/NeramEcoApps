// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Saving a paper's solution videos from Videos mode.
 *
 * Every row is judged on its own: one bad link, a question from another paper
 * or a split drawing is refused with its reason while the rest save. The link
 * is stored in its canonical form, and a blank clears the video (NULL, never
 * '', because the paper's "solutions" count reads NOT NULL).
 */

type Result = { data?: unknown; error?: { message?: string } | null };

const mocks = vi.hoisted(() => ({
  staff: vi.fn(),
  results: [] as Result[],
  calls: [] as Array<{ table: string; ops: Array<[string, unknown[]]> }>,
}));

function chain(table: string) {
  const entry = { table, ops: [] as Array<[string, unknown[]]> };
  mocks.calls.push(entry);
  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          const result = mocks.results.shift() ?? { data: null, error: null };
          return (resolve: (v: Result) => void) => resolve(result);
        }
        return (...args: unknown[]) => {
          entry.ops.push([prop, args]);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

vi.mock('@/lib/qb-auth', () => ({ verifyQBStaff: (...a: unknown[]) => mocks.staff(...a) }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (table: string) => chain(table) }),
}));

import { POST } from './route';

const PAPER = 'paper-2015';
const req = (body: unknown, auth = true) =>
  new NextRequest(`http://localhost/api/question-bank/papers/${PAPER}/video-links`, {
    method: 'POST',
    headers: { ...(auth ? { Authorization: 'Bearer t' } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = { params: { id: PAPER } };

const PAPER_ROWS = [
  { id: 'q31', question_format: 'MCQ', drawing_parts: null },
  { id: 'q32', question_format: 'MCQ', drawing_parts: null },
  {
    id: 'q81',
    question_format: 'DRAWING_PROMPT',
    drawing_parts: {
      mode: 'any_one',
      items: [
        { id: 'a', label: 'A', text: 'Draw a market' },
        { id: 'b', label: 'B', text: 'Draw a harbour' },
      ],
    },
  },
];

/** The update payload each question received, by id. */
function updates(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const call of mocks.calls) {
    const update = call.ops.find(([op]) => op === 'update');
    const eq = call.ops.find(([op, args]) => op === 'eq' && args[0] === 'id');
    if (update && eq) out[eq[1][1] as string] = (update[1][0] as Record<string, unknown>).solution_video_url;
  }
  return out;
}

beforeEach(() => {
  mocks.staff.mockReset();
  mocks.staff.mockResolvedValue({ ok: true, caller: { id: 'teacher-1' } });
  mocks.results = [{ data: PAPER_ROWS, error: null }];
  mocks.calls = [];
});

describe('POST /api/question-bank/papers/[id]/video-links', () => {
  it('answers 401 without an Authorization header', async () => {
    const res = await POST(req({ links: [] }, false), params);
    expect(res.status).toBe(401);
  });

  it('refuses a caller who is not question bank staff', async () => {
    mocks.staff.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    const res = await POST(req({ links: [{ question_id: 'q31', solution_video_url: 'x' }] }), params);
    expect(res.status).toBe(403);
  });

  it('stores the canonical link and clears a blank one to NULL', async () => {
    const res = await POST(
      req({
        links: [
          { question_id: 'q31', solution_video_url: 'https://youtu.be/U1X9MmLh-ZQ?si=abc ' },
          { question_id: 'q32', solution_video_url: '' },
        ],
      }),
      params,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(updates()).toEqual({
      q31: 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ',
      q32: null,
    });
    expect(body.data.updated).toBe(2);
    expect(body.data.results).toEqual([
      { question_id: 'q31', ok: true, solution_video_url: 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ' },
      { question_id: 'q32', ok: true, solution_video_url: null },
    ]);
  });

  it('refuses each bad row by itself and still saves the good ones', async () => {
    const res = await POST(
      req({
        links: [
          { question_id: 'q31', solution_video_url: 'https://vimeo.com/1' },
          { question_id: 'q-other-paper', solution_video_url: 'https://youtu.be/U1X9MmLh-ZQ' },
          { question_id: 'q81', solution_video_url: 'https://youtu.be/U1X9MmLh-ZQ' },
          { question_id: 'q32', solution_video_url: 'https://youtu.be/x2fO__sSSzU' },
        ],
      }),
      params,
    );
    const body = await res.json();

    expect(updates()).toEqual({ q32: 'https://www.youtube.com/watch?v=x2fO__sSSzU' });
    expect(body.data.updated).toBe(1);
    expect(body.data.results).toEqual([
      { question_id: 'q31', ok: false, error: 'Not a YouTube or SharePoint link' },
      { question_id: 'q-other-paper', ok: false, error: 'This question is not on this paper' },
      { question_id: 'q81', ok: false, error: 'This drawing has parts: set its videos per part' },
      { question_id: 'q32', ok: true, solution_video_url: 'https://www.youtube.com/watch?v=x2fO__sSSzU' },
    ]);
  });

  it('reports a failed write on its own row', async () => {
    mocks.results = [{ data: PAPER_ROWS, error: null }, { data: null, error: { message: 'timeout' } }];
    const body = await (
      await POST(req({ links: [{ question_id: 'q31', solution_video_url: 'https://youtu.be/U1X9MmLh-ZQ' }] }), params)
    ).json();
    expect(body.data.updated).toBe(0);
    expect(body.data.results).toEqual([{ question_id: 'q31', ok: false, error: 'timeout' }]);
  });

  it('asks for at least one link', async () => {
    const res = await POST(req({ links: [] }), params);
    expect(res.status).toBe(400);
  });
});
