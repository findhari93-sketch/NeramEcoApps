// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getStudentPrimaryClassroom: vi.fn(), loadUpcomingClasses: vi.fn(), loadDeclinedClassIds: vi.fn(), loadBriefFacts: vi.fn() }));
vi.mock('@neram/database/queries/nexus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database/queries/nexus')>()),
  getStudentPrimaryClassroom: mocks.getStudentPrimaryClassroom,
}));
vi.mock('@/lib/upcoming-classes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/upcoming-classes')>()),
  loadUpcomingClasses: mocks.loadUpcomingClasses,
  loadDeclinedClassIds: mocks.loadDeclinedClassIds,
  istNow: () => ({ today: '2026-10-03', nowHHMM: '10:00' }),
}));
vi.mock('@/lib/assistant/brief-load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/assistant/brief-load')>()),
  loadBriefFacts: mocks.loadBriefFacts,
  istHour: () => 10,
}));
vi.mock('@neram/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@neram/database')>()),
  getSupabaseAdminClient: () => ({}),
  listAssignmentsForStudent: vi.fn(),
  getCatchupBacklog: vi.fn(),
}));

import { fakeDb } from './testing/fake-db';
import { FLOW_TTL_MS } from './flows/types';
import type { AssistantCaller } from './types';
import { runAssistantTurn } from './turn';

const student: AssistantCaller = { id: 's1', name: 'Priya S', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const UNIQUE = { nexus_assistant_messages: [['thread_id', 'external_id']] };
const upcoming = [{ id: 'k1', title: 'Perspective', classroom_id: 'c1', scheduled_date: '2026-10-04', start_time: '18:00', end_time: '19:30', status: 'scheduled', teams_meeting_url: null }];
/** decline_class.run re-reads the class row before anything is proposed (Ruling 11). */
const CLASSES = {
  nexus_scheduled_classes: upcoming.map(({ id, title, classroom_id, scheduled_date, start_time, end_time }) => ({ id, title, classroom_id, scheduled_date, start_time, end_time })),
};

function turn(db: ReturnType<typeof fakeDb>, text: string, extra: Record<string, unknown> = {}) {
  return runAssistantTurn({ supabase: db, caller: student, channel: 'nexus', text, baseUrl: 'https://nexus.test', now: new Date('2026-10-03T04:30:00Z'), ...extra });
}

beforeEach(() => {
  mocks.getStudentPrimaryClassroom.mockReset().mockResolvedValue({ id: 'c1', name: 'JEE', sketchbook_weekly_goal: 3, batch_id: null });
  mocks.loadUpcomingClasses.mockReset().mockResolvedValue(upcoming);
  mocks.loadDeclinedClassIds.mockReset().mockResolvedValue(new Set());
  mocks.loadBriefFacts.mockReset().mockResolvedValue({
    firstName: 'Priya', today: '2026-10-03', classroomName: 'JEE', nextClass: null,
    assignments: { pending: 0, nextTitle: null, nextDueOn: null }, catchup: null, reviewsBack: 0, sketchbookLine: null, exam: null, remindersToday: [],
  });
});

describe('runAssistantTurn', () => {
  it('creates a thread, stores both messages, and answers a routed tool without a model', async () => {
    const db = fakeDb({}, { unique: UNIQUE });
    const env = await turn(db, 'when is my next class');
    expect(env.reply).toMatch(/^Your next classes:/);
    expect(env.threadId).toBeTruthy();
    expect(env.mode).toBe('general');
    expect(db.rows('nexus_assistant_messages').map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(db.rows('nexus_assistant_messages')[1].llm).toBe(false);
  });

  it('falls back politely when the model would be needed, with the page chips', async () => {
    const db = fakeDb({});
    const env = await turn(db, 'why is the sky blue', { pageContext: { path: '/student/sketchbook' } });
    expect(env.reply).toMatch(/I cannot answer free questions yet/);
    expect(env.suggestions[0].label).toBe('How is my rhythm?');
  });

  it('runs a flow across turns and proposes an action at the end', async () => {
    const db = fakeDb({ ...CLASSES });
    const first = await turn(db, "I can't attend");
    expect(first.reply).toBe('Which class can you not attend?');
    expect(db.rows('nexus_assistant_threads')[0].flow_state).toMatchObject({ flow: 'cannot-attend', step: 'pick-class' });
    const second = await turn(db, 'Tomorrow 6:00 pm: Perspective', { threadId: first.threadId });
    expect(second.reply).toMatch(/Why can you not make it/);
    const third = await turn(db, 'Feeling unwell', { threadId: first.threadId });
    expect(third.action).toMatchObject({ kind: 'decline_class', fields: expect.any(Array) });
    expect(db.rows('nexus_assistant_actions')[0]).toMatchObject({ user_id: 's1', status: 'pending' });
    expect(db.rows('nexus_assistant_threads')[0].flow_state).toBeNull();
  });

  it('checks a flow proposal with the action tool, and proposes nothing when the tool refuses', async () => {
    const db = fakeDb({});
    const out = await turn(db, 'remind me 20 Feb 2027 to practise perspective');
    expect(out.action).toBeNull();
    expect(out.reply).toBe('I can only set reminders up to four months ahead.');
    expect(db.rows('nexus_assistant_actions')).toHaveLength(0);
    expect(db.rows('nexus_assistant_threads')[0].flow_state).toBeNull();
  });

  it('cancel clears the flow and says so', async () => {
    const db = fakeDb({});
    const first = await turn(db, "I can't attend");
    const out = await turn(db, 'cancel', { threadId: first.threadId });
    expect(out.reply).toBe('Okay, cancelled. Nothing was changed.');
    expect(db.rows('nexus_assistant_threads')[0].flow_state).toBeNull();
    expect(out.suggestions.length).toBeGreaterThan(0);
  });

  it('ignores a stale flow and routes the message fresh', async () => {
    const db = fakeDb({});
    const first = await turn(db, "I can't attend");
    const later = new Date(Date.parse('2026-10-03T04:30:00Z') + FLOW_TTL_MS + 1000);
    const out = await turn(db, 'when is my next class', { threadId: first.threadId, now: later });
    expect(out.reply).toMatch(/^Your next classes:/);
    expect(db.rows('nexus_assistant_threads')[0].flow_state).toBeNull();
  });

  it('refuses to propose while impersonating but still answers reads', async () => {
    const db = fakeDb({});
    const viewer = { ...student, impersonating: true };
    const read = await runAssistantTurn({ supabase: db, caller: viewer, channel: 'nexus', text: 'my schedule', baseUrl: 'https://nexus.test' });
    expect(read.reply).toMatch(/^Your next classes:/);
    const out = await runAssistantTurn({ supabase: db, caller: viewer, channel: 'nexus', text: 'remind me tomorrow to practise', baseUrl: 'https://nexus.test' });
    expect(out.action).toBeNull();
    expect(out.reply).toMatch(/read only/);
    expect(db.rows('nexus_assistant_actions')).toHaveLength(0);
  });

  it('returns the stored reply for a redelivered external id without doing the work twice', async () => {
    const db = fakeDb({}, { unique: UNIQUE });
    const a = await turn(db, 'when is my next class', { channel: 'teams', externalId: 'act-1', threadExternalId: '19:conv' });
    const b = await turn(db, 'when is my next class', { channel: 'teams', externalId: 'act-1', threadExternalId: '19:conv' });
    expect(b.reply).toBe(a.reply);
    expect(mocks.loadUpcomingClasses).toHaveBeenCalledTimes(1);
    expect(db.rows('nexus_assistant_messages')).toHaveLength(2);
  });

  it('does the work for a redelivery whose first attempt died, instead of replaying an earlier reply', async () => {
    const db = fakeDb({}, { unique: UNIQUE });
    const teams = { channel: 'teams', threadExternalId: '19:conv' };
    const earlier = await turn(db, 'why is the sky blue', { ...teams, externalId: 'act-1' });
    expect(earlier.reply).toMatch(/free questions/);
    mocks.loadUpcomingClasses.mockRejectedValueOnce(new Error('db down'));
    await expect(turn(db, 'when is my next class', { ...teams, externalId: 'act-2' })).rejects.toThrow('db down');
    const retry = await turn(db, 'when is my next class', { ...teams, externalId: 'act-2' });
    expect(retry.reply).toMatch(/^Your next classes:/);
    expect(mocks.loadUpcomingClasses).toHaveBeenCalledTimes(2);
    expect(db.rows('nexus_assistant_messages').map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('refuses a thread that belongs to someone else by starting a fresh one', async () => {
    const db = fakeDb({ nexus_assistant_threads: [{ id: 't-other', user_id: 'u9', channel: 'nexus', flow_state: null }] });
    const env = await turn(db, 'brief', { threadId: 't-other' });
    expect(env.threadId).not.toBe('t-other');
  });

  it('answers an empty message without storing anything', async () => {
    const db = fakeDb({});
    const env = await turn(db, '   ');
    expect(env.reply).toMatch(/Say what you need/);
    expect(db.rows('nexus_assistant_messages')).toHaveLength(0);
  });
});
