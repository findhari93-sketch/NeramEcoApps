import { describe, it, expect } from 'vitest';
import { mayHavePendingClassTeams, pickYearClassroom, teamsStepAfter, CLASS_TEAMS_WINDOW_DAYS } from './class-account-teams';

const NOW = Date.parse('2026-10-23T10:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();
const AT = '2026-10-23T10:00:00.000Z';

describe('class account Teams step on opening Nexus', () => {
  it('only looks for a recently linked student, never while staff view as one', () => {
    const student = { user_type: 'student', linked_classroom_at: daysAgo(1) };
    expect(mayHavePendingClassTeams(student, { impersonating: false, now: NOW })).toBe(true);
    expect(mayHavePendingClassTeams(student, { impersonating: true, now: NOW })).toBe(false);
    expect(mayHavePendingClassTeams({ ...student, user_type: 'teacher' }, { impersonating: false, now: NOW })).toBe(false);
    expect(mayHavePendingClassTeams({ ...student, linked_classroom_at: null }, { impersonating: false, now: NOW })).toBe(false);
    expect(
      mayHavePendingClassTeams({ ...student, linked_classroom_at: daysAgo(CLASS_TEAMS_WINDOW_DAYS + 1) }, { impersonating: false, now: NOW }),
    ).toBe(false);
  });

  it('marks the step done when the Team and the group chat both took', () => {
    expect(teamsStepAfter({ team: { success: true }, groupChat: { success: true }, inviteLink: null, skipped: false }, AT)).toEqual({
      status: 'done',
      at: AT,
    });
  });

  it('keeps the step failed when the Team or the chat did not take', () => {
    expect(teamsStepAfter({ team: { success: false }, groupChat: null, inviteLink: null, skipped: false }, AT).status).toBe('failed');
    const chatOnly = teamsStepAfter({ team: { success: true }, groupChat: { success: false }, inviteLink: null, skipped: false }, AT);
    expect(chatOnly.status).toBe('failed');
    expect(chatOnly.message).toMatch(/^In the class Team, but not in the student group chat yet/);
  });

  it('skips a classroom with no linked Team', () => {
    expect(teamsStepAfter({ team: null, groupChat: null, inviteLink: null, skipped: false }, AT).status).toBe('skipped');
  });

  it('picks the live year classroom, newest year first', () => {
    expect(
      pickYearClassroom([
        { classroom: { id: 'old', academic_year: '2025-26', is_archived: false, is_active: true } },
        { classroom: { id: 'archived', academic_year: '2027-28', is_archived: true, is_active: true } },
        { classroom: { id: 'live', academic_year: '2026-27', is_archived: false, is_active: true } },
        { classroom: { id: 'no-year', academic_year: null } },
        { classroom: null },
      ]),
    ).toBe('live');
    expect(pickYearClassroom([])).toBeNull();
  });
});
