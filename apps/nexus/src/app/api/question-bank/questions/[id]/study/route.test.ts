// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ staff: vi.fn(), editor: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/qb-auth', () => ({ verifyQBStaff: (...a: unknown[]) => mocks.staff(...a) }));
vi.mock('@neram/database', () => ({
  getQBStudyEditorData: (...a: unknown[]) => mocks.editor(...a),
  saveQBQuestionStudy: (...a: unknown[]) => mocks.save(...a),
}));

import { GET, PUT } from './route';

const ctx = { params: Promise.resolve({ id: 'q1' }) };
const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/question-bank/questions/q1/study', {
    method,
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.staff.mockResolvedValue({ ok: true, caller: { id: 'teacher-1' } });
  mocks.editor.mockResolvedValue({ row: null, categories: ['mathematics', 'functions'], chapters: [], ncert: [], foundation: [] });
  mocks.save.mockResolvedValue({ question_id: 'q1', source: 'staff' });
});

describe('/api/question-bank/questions/[id]/study', () => {
  it('is staff only', async () => {
    mocks.staff.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    expect((await GET(req('GET'), ctx)).status).toBe(403);
    expect((await PUT(req('PUT', {}), ctx)).status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('saves a teacher version as the caller, trimmed to what the editor sends', async () => {
    const res = await PUT(
      req('PUT', {
        primary_slug: ' functions ',
        also_uses: ['trigonometric_ratios', 7],
        concepts: [{ name: 'Domain', why: 'roots', ncert_ref: 'c11.2.4' }, { nope: true }],
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(
      'q1',
      {
        primary_slug: 'functions',
        also_uses: ['trigonometric_ratios'],
        concepts: [{ name: 'Domain', why: 'roots', ncert_ref: 'c11.2.4', foundation_section_id: null }],
      },
      'teacher-1',
    );
    expect((await res.json()).data.categories).toEqual(['mathematics', 'functions']);
  });
});
