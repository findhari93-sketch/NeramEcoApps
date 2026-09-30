import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /api/students/[id]/snapshot. Staff who teach the student only: a student
 * or a parent token never reaches the level.
 */

const state = vi.hoisted(() => ({ caller: 'teacher' as 'teacher' | 'student' | 'parent' | 'stranger' }));

vi.mock('@/lib/study-materials', async () => {
  const { ApiError } = await import('@/lib/api-errors');
  return {
    getRequestUser: async () => {
      if (state.caller === 'parent') throw new ApiError('Parent accounts cannot access this resource.', 403);
      return { id: state.caller };
    },
    assertCapability: () => {
      if (state.caller === 'student') throw new ApiError('Not authorized', 403);
    },
  };
});

vi.mock('@/lib/sketchbook-access', async () => {
  const { ApiError } = await import('@/lib/api-errors');
  return {
    assertStaffSeesStudent: async () => {
      if (state.caller === 'stranger') throw new ApiError('You do not teach this student.', 403);
    },
  };
});

vi.mock('@/lib/student-level-store', () => ({
  loadStudentLevelDetail: async () => ({
    levels: { drawing: { level: 'mid', note: null, setAt: '2026-09-29T10:00:00Z', setBy: { id: 'm1', name: 'Hari' } } },
    history: [],
  }),
}));

vi.mock('@/lib/recent-drawings', () => ({
  loadStudentRecentDrawings: async () => [],
}));

import { GET } from './route';

function get() {
  return GET(new NextRequest('http://localhost/api/students/s1/snapshot', { headers: { Authorization: 'Bearer t' } }), {
    params: { id: 's1' },
  });
}

beforeEach(() => {
  state.caller = 'teacher';
});

describe('GET /api/students/[id]/snapshot', () => {
  it('gives a teacher of the student the levels and the overall level', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overallLevel).toBe('mid');
    expect(body.levels.drawing.setBy.name).toBe('Hari');
  });

  it.each(['student', 'parent', 'stranger'] as const)('refuses a %s', async (caller) => {
    state.caller = caller;
    const res = await get();
    expect(res.status).toBe(403);
  });
});
