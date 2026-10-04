// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ writeRsvp: vi.fn(), declareAwayWindow: vi.fn(), addSketchForStudent: vi.fn(), createReminder: vi.fn() }));
vi.mock('@/lib/rsvp-write', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/rsvp-write')>()), writeRsvp: mocks.writeRsvp }));
vi.mock('@/lib/away-windows-write', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/away-windows-write')>()), declareAwayWindow: mocks.declareAwayWindow }));
vi.mock('@/lib/sketchbook-add', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/sketchbook-add')>()), addSketchForStudent: mocks.addSketchForStudent }));
vi.mock('@/lib/assistant/store', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/assistant/store')>()), createReminder: mocks.createReminder }));

import { TOOLS, findActionTool } from '@/lib/assistant/registry';
import '@/lib/assistant/tools/actions';
import type { AssistantCaller, ToolContext } from '@/lib/assistant/types';

const caller: AssistantCaller = { id: 's1', name: 'Priya S', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const classRow = { id: 'k1', title: 'Perspective', scheduled_date: '2026-10-07', start_time: '18:00', end_time: '19:30', classroom_id: 'c1' };
const ctx = (): ToolContext => ({
  caller, channel: 'nexus', mode: 'general',
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: classRow }) }) }) }) },
  classroomId: 'c1', threadId: 't1', now: new Date('2026-10-03T04:30:00Z'), baseUrl: 'https://nexus.test',
  features: { sketchbook: true, attendance: true, tests: true, questionBank: true, inspiration: true },
});

beforeEach(() => Object.values(mocks).forEach((m) => m.mockReset()));

describe('action tools', () => {
  it('are registered as student actions with an execute', () => {
    for (const n of ['decline_class', 'declare_away_window', 'set_reminder', 'add_sketch']) {
      expect(findActionTool(n)).toMatchObject({ audience: 'student', kind: 'action' });
    }
    expect(TOOLS.filter((t) => t.kind === 'action')).toHaveLength(4);
  });

  it('add_sketch is the one action that leads into a switchable feature (Ruling 25)', () => {
    expect(findActionTool('add_sketch')!.feature).toBe('sketchbook');
    for (const n of ['decline_class', 'declare_away_window', 'set_reminder']) expect(findActionTool(n)!.feature).toBeUndefined();
  });

  it('decline_class proposes with the class named, then writes through writeRsvp', async () => {
    const tool = findActionTool('decline_class')!;
    const proposed = await tool.run(ctx(), { class_id: 'k1', reason_code: 'unwell' });
    expect(proposed.ok).toBe(true);
    expect(proposed.data).toMatchObject({
      kind: 'decline_class',
      args: { class_id: 'k1', reason_code: 'unwell', note: null },
      summary: 'Tell your teacher you cannot attend Perspective on Wednesday 7 Oct at 6:00 pm.',
      fields: [{ label: 'Class', value: 'Perspective' }, { label: 'When', value: 'Wednesday 7 Oct, 6:00 pm' }, { label: 'Reason', value: 'Feeling unwell' }],
    });
    expect(await tool.run(ctx(), { class_id: 'k1', reason_code: 'other' })).toMatchObject({ ok: false });
    mocks.writeRsvp.mockResolvedValue({ ok: true, attending: false, rsvp: {}, classTitle: 'Perspective', classroomId: 'c1' });
    const done = await tool.execute(ctx(), { class_id: 'k1', reason_code: 'unwell', note: null });
    expect(mocks.writeRsvp).toHaveBeenCalledWith(expect.anything(), { userId: 's1', classId: 'k1', response: 'not_attending', reasonCode: 'unwell', note: null, wantsCatchup: true });
    expect(done.reply).toBe('Done. Your teacher knows you cannot attend Perspective. The catch-up for it will appear on your list after the class.');
    mocks.writeRsvp.mockResolvedValue({ ok: false, status: 404, error: 'Class not found in this classroom' });
    expect(await tool.execute(ctx(), { class_id: 'k1', reason_code: 'unwell', note: null })).toMatchObject({ ok: false, error: 'Class not found in this classroom' });
  });

  it('declare_away_window proposes a range and writes through declareAwayWindow', async () => {
    const tool = findActionTool('declare_away_window')!;
    const proposed = await tool.run(ctx(), { starts_on: '2026-10-05', ends_on: '2026-10-09', reason_code: 'clash', note: 'School exams' });
    expect(proposed.data).toMatchObject({
      kind: 'declare_away_window',
      summary: 'Mark you away from Monday 5 Oct to Friday 9 Oct. Reason: School or exam clash.',
      fields: [{ label: 'From', value: 'Monday 5 Oct' }, { label: 'To', value: 'Friday 9 Oct' }, { label: 'Reason', value: 'School or exam clash' }, { label: 'Note', value: 'School exams' }],
    });
    expect(await tool.run(ctx(), { starts_on: '2026-10-05', ends_on: '2026-10-01', reason_code: 'clash' })).toMatchObject({ ok: false });
    mocks.declareAwayWindow.mockResolvedValue({ ok: true, window: { id: 'w1' }, summary: 'Away from 5 Oct to 9 Oct', classroomId: 'c1' });
    const done = await tool.execute(ctx(), { starts_on: '2026-10-05', ends_on: '2026-10-09', reason_code: 'clash', note: 'School exams' });
    expect(mocks.declareAwayWindow).toHaveBeenCalledWith(expect.anything(), { userId: 's1', startsOn: '2026-10-05', endsOn: '2026-10-09', reasonCode: 'clash', note: 'School exams' });
    expect(done.reply).toBe('Done. Away from 5 Oct to 9 Oct. Your teachers know, and those classes will show as away on the register. The catch-up work still waits for you when you are back.');
    mocks.declareAwayWindow.mockResolvedValue({ ok: false, status: 409, error: 'You have already told us you are away then' });
    expect(await tool.execute(ctx(), { starts_on: '2026-10-05', ends_on: null, reason_code: 'unwell' })).toMatchObject({ ok: false, error: expect.stringMatching(/already told us/) });
  });

  it('set_reminder proposes and stores', async () => {
    const tool = findActionTool('set_reminder')!;
    const proposed = await tool.run(ctx(), { due_on: '2026-10-04', text: 'finish the catch-up' });
    expect(proposed.data).toMatchObject({ kind: 'set_reminder', summary: 'Remind you tomorrow: finish the catch-up.', fields: [{ label: 'When', value: 'tomorrow' }, { label: 'About', value: 'finish the catch-up' }] });
    expect(await tool.run(ctx(), { due_on: '2026-10-01', text: 'x' })).toMatchObject({ ok: false, error: expect.stringMatching(/already passed/) });
    expect(await tool.run(ctx(), { due_on: '2026-10-04', text: '' })).toMatchObject({ ok: false });
    mocks.createReminder.mockResolvedValue({ id: 'r1' });
    const done = await tool.execute(ctx(), { due_on: '2026-10-04', text: 'finish the catch-up' });
    expect(mocks.createReminder).toHaveBeenCalledWith(expect.anything(), { userId: 's1', threadId: 't1', dueOn: '2026-10-04', text: 'finish the catch-up', kind: 'free' });
    // M1 sends nothing (Ruling 24): the reply promises the brief card only, never a message.
    expect(done.reply).toBe('Done. I will put this on your brief card tomorrow: finish the catch-up.');
    expect(done.reply).not.toMatch(/remind you|message/i);
  });

  it('add_sketch proposes with the caption and files the sketch', async () => {
    const tool = findActionTool('add_sketch')!;
    const args = { original_image_url: 'https://cdn.test/a.jpg', thumbnail_url: 'https://cdn.test/t.jpg', caption: 'Perspective study' };
    expect((await tool.run(ctx(), args)).data).toMatchObject({ kind: 'add_sketch', summary: 'Add this sketch to your sketchbook.', fields: [{ label: 'Caption', value: 'Perspective study' }] });
    expect(await tool.run(ctx(), { ...args, original_image_url: 'nope' })).toMatchObject({ ok: false });
    mocks.addSketchForStudent.mockResolvedValue({ sketch: { id: 'sub1' }, rhythm: { today: '2026-10-03', week: { start: '', days: [], count: 2, goal: 3, met: false }, lastWeek: null, run: 0, bestRun: 0, totalDays: 5, lastPracticeDate: null, quietDays: 0 }, isNewDay: true });
    const done = await tool.execute(ctx(), args);
    expect(mocks.addSketchForStudent).toHaveBeenCalledWith({ id: 's1', user_type: 'student' }, args);
    expect(done.reply).toBe('Added to your sketchbook. 2 of 3 days this week.');
    expect(done.links?.[0].url).toBe('/student/sketchbook');
  });
});
