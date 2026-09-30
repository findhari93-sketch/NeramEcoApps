import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PUT /api/students/[id]/skill-level. Only managers and admins set a level
 * (coord.student.level), the body is validated before anything is read, and the
 * previous level comes back for Undo.
 */

const state = vi.hoisted(() => ({
  allowed: true,
  enrolled: true,
  writes: [] as unknown[],
  previous: null as string | null,
}));

vi.mock('@/lib/study-materials', async () => {
  const { ApiError } = await import('@/lib/api-errors');
  return {
    getRequestUser: async () => ({ id: 'manager-1' }),
    assertCapability: (_u: unknown, capability: string) => {
      if (!state.allowed) throw new ApiError(`Not authorized: this action requires ${capability}.`, 403);
    },
  };
});

vi.mock('@/lib/student-level-store', async () => {
  const { ApiError } = await import('@/lib/api-errors');
  return {
    assertIsEnrolledStudent: async () => {
      if (!state.enrolled) throw new ApiError('That person is not an enrolled student.', 404);
    },
    writeSkillLevel: async (args: { level: string | null }) => {
      state.writes.push(args);
      return { level: args.level, previous: state.previous, changed: true };
    },
  };
});

import { PUT } from './route';

function put(body: unknown) {
  const req = new NextRequest('http://localhost/api/students/s1/skill-level', {
    method: 'PUT',
    headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return PUT(req, { params: { id: 's1' } });
}

beforeEach(() => {
  state.allowed = true;
  state.enrolled = true;
  state.writes = [];
  state.previous = null;
});

describe('PUT /api/students/[id]/skill-level', () => {
  it('refuses a teacher without coord.student.level and writes nothing', async () => {
    state.allowed = false;
    const res = await put({ skill: 'drawing', level: 'top', source: 'sort' });
    expect(res.status).toBe(403);
    expect(state.writes).toHaveLength(0);
  });

  it('rejects a bad body with a 400', async () => {
    const res = await put({ skill: 'maths', level: 'top', source: 'sort' });
    expect(res.status).toBe(400);
    expect(state.writes).toHaveLength(0);
  });

  it('refuses a person who is not an enrolled student', async () => {
    state.enrolled = false;
    const res = await put({ skill: 'drawing', level: 'mid', source: 'flip' });
    expect(res.status).toBe(404);
    expect(state.writes).toHaveLength(0);
  });

  it('saves the level as the caller and returns the previous one for Undo', async () => {
    state.previous = 'mid';
    const res = await put({ skill: 'drawing', level: 'top', source: 'snapshot', note: 'clean perspective' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      studentId: 's1',
      skill: 'drawing',
      level: 'top',
      previous: 'mid',
      changed: true,
    });
    expect(state.writes[0]).toMatchObject({
      studentId: 's1',
      skill: 'drawing',
      level: 'top',
      note: 'clean perspective',
      source: 'snapshot',
      performedBy: 'manager-1',
    });
  });

  it('clears a level with null', async () => {
    const res = await put({ skill: 'drawing', level: null, source: 'profile' });
    expect(res.status).toBe(200);
    expect((await res.json()).level).toBeNull();
  });
});
