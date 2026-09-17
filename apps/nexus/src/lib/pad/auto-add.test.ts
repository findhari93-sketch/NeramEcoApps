// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./caller', () => ({ padFeatureEnabled: vi.fn(async () => true) }));
vi.mock('./meeting-tab', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./meeting-tab')>();
  return { ...actual, ensureAnswerPadInMeeting: vi.fn() };
});

import { padFeatureEnabled } from './caller';
import { ensureAnswerPadInMeeting } from './meeting-tab';
import {
  SWEEP_MAX_CLASSES,
  addPadToClassMeeting,
  addPadWithinBudget,
  autoAddConfig,
  dueClasses,
  sweepClassMeetings,
  type AutoAddClass,
  type AutoAddConfig,
} from './auto-add';

const CATALOG = '2b524e28-95ce-4c9b-9773-4a5bd6ec1770';
const ORIGIN = 'https://nexus.neramclasses.com';
const CONFIG: AutoAddConfig = { classrooms: new Set(['room-1']), catalogAppId: CATALOG, origin: ORIGIN };
const NOW = new Date('2026-09-11T10:00:00+05:30');

const join = (thread: string) => `https://teams.microsoft.com/l/meetup-join/${encodeURIComponent(thread)}/0`;
let serial = 0;
const cls = (over: Partial<AutoAddClass> = {}): AutoAddClass => {
  serial += 1;
  return {
    id: `class-${String(serial).padStart(3, '0')}`,
    classroom_id: 'room-1',
    scheduled_date: '2026-09-11',
    start_time: '10:15',
    end_time: '11:15',
    status: 'scheduled',
    teams_meeting_join_url: join(`19:meeting_c${serial}@thread.v2`),
    teams_meeting_url: null,
    ...over,
  };
};
const ids = (rows: AutoAddClass[]) => rows.map((row) => row.id).sort();

beforeEach(() => {
  vi.mocked(padFeatureEnabled).mockReset().mockResolvedValue(true);
  vi.mocked(ensureAnswerPadInMeeting).mockReset().mockResolvedValue({ outcome: 'added', chatId: 'x' });
});

describe('autoAddConfig', () => {
  it('is off until classrooms are listed, and trims what it reads', () => {
    expect(autoAddConfig({})).toEqual({ classrooms: new Set(), catalogAppId: null, origin: null });
    const config = autoAddConfig({
      PAD_AUTO_ADD_CLASSROOMS: ' room-1 , room-2,, ',
      TEAMS_APP_CATALOG_ID: ` ${CATALOG} `,
      NEXT_PUBLIC_NEXUS_URL: ORIGIN,
    });
    expect(config).toEqual({ classrooms: new Set(['room-1', 'room-2']), catalogAppId: CATALOG, origin: ORIGIN });
  });

  it('prefers the Answer Pad catalog id and tab origin, which testing points at the dev app and the tunnel', () => {
    expect(
      autoAddConfig({
        PAD_AUTO_ADD_CLASSROOMS: 'all',
        PAD_TEAMS_APP_CATALOG_ID: 'dev-app',
        TEAMS_APP_CATALOG_ID: 'prod-app',
        PAD_TEAMS_TAB_ORIGIN: 'https://blue-river.trycloudflare.com',
        NEXT_PUBLIC_NEXUS_URL: ORIGIN,
      }),
    ).toEqual({ classrooms: 'all', catalogAppId: 'dev-app', origin: 'https://blue-river.trycloudflare.com' });
  });
});

describe('dueClasses', () => {
  it('picks listed class meetings from 30 minutes before start until they end', () => {
    const inside = [
      cls({ start_time: '10:30', end_time: '11:30' }),
      cls({ start_time: '09:00', end_time: '11:00' }),
      cls({ start_time: '09:00:00', end_time: '10:00:00' }),
      cls({ teams_meeting_join_url: null, teams_meeting_url: join('19:meeting_legacy@thread.v2') }),
    ];
    const outside = [
      cls({ start_time: '10:31', end_time: '11:30' }),
      cls({ start_time: '08:00', end_time: '09:59' }),
      cls({ status: 'cancelled' }),
      cls({ scheduled_date: '2026-09-10' }),
      cls({ classroom_id: 'room-2' }),
      cls({ teams_meeting_join_url: join('19:4f2a8c@thread.tacv2') }),
      cls({ teams_meeting_join_url: null }),
      cls({ start_time: null, end_time: null }),
    ];
    expect(ids(dueClasses([...outside, ...inside], NOW, CONFIG))).toEqual(ids(inside));
  });

  it('keeps a class that runs past midnight, and every classroom when the list says all', () => {
    const late = cls({ start_time: '23:00', end_time: '00:30', classroom_id: 'room-9' });
    expect(dueClasses([late], new Date('2026-09-11T23:50:00+05:30'), CONFIG)).toEqual([]);
    expect(dueClasses([late], new Date('2026-09-11T23:50:00+05:30'), { ...CONFIG, classrooms: 'all' })).toEqual([late]);
  });

  it('ignores the clock in single-class mode, but never lets in a cancelled class, a channel meeting or another classroom', () => {
    const tomorrow = cls({ scheduled_date: '2026-09-12', start_time: '18:00' });
    const blocked = [cls({ status: 'cancelled' }), cls({ teams_meeting_join_url: join('19:x@thread.tacv2') }), cls({ classroom_id: 'room-2' })];
    expect(dueClasses([tomorrow, ...blocked], NOW, CONFIG, { ignoreWindow: true })).toEqual([tomorrow]);
  });
});

describe('addPadToClassMeeting', () => {
  const meeting = { classroom_id: 'room-1', teams_meeting_join_url: join('19:meeting_new@thread.v2') };

  it('stops at the cheapest switch that is off, without reading flags or calling Graph', async () => {
    await expect(addPadToClassMeeting({ ...meeting, classroom_id: 'room-2' }, { config: CONFIG })).resolves.toEqual({ outcome: 'not_listed', chatId: null });
    await expect(addPadToClassMeeting(meeting, { config: { ...CONFIG, catalogAppId: null } })).resolves.toEqual({ outcome: 'not_configured', chatId: null });
    expect(padFeatureEnabled).not.toHaveBeenCalled();

    vi.mocked(padFeatureEnabled).mockResolvedValue(false);
    await expect(addPadToClassMeeting(meeting, { config: CONFIG })).resolves.toEqual({ outcome: 'switched_off', chatId: null });
    expect(padFeatureEnabled).toHaveBeenCalledWith('staff');
    expect(ensureAnswerPadInMeeting).not.toHaveBeenCalled();
  });

  it('never throws when the flags cannot be read', async () => {
    vi.mocked(padFeatureEnabled).mockRejectedValue(new Error('database unreachable'));
    await expect(addPadToClassMeeting(meeting, { config: CONFIG })).resolves.toMatchObject({ outcome: 'failed', reason: expect.stringContaining('database unreachable') });
  });

  it('adds the pad with the configured app and origin, and reports what happened', async () => {
    vi.mocked(ensureAnswerPadInMeeting).mockResolvedValue({ outcome: 'chat_not_ready', chatId: '19:meeting_new@thread.v2', reason: 'list tabs: 404' });
    await expect(addPadToClassMeeting(meeting, { config: CONFIG })).resolves.toMatchObject({ outcome: 'chat_not_ready' });
    expect(ensureAnswerPadInMeeting).toHaveBeenCalledWith({ joinUrl: meeting.teams_meeting_join_url, catalogAppId: CATALOG, origin: ORIGIN }, undefined);
  });
});

describe('addPadWithinBudget', () => {
  const meeting = { classroom_id: 'room-1', teams_meeting_join_url: join('19:meeting_slow@thread.v2') };

  it('returns the result when Graph answers in time', async () => {
    await expect(addPadWithinBudget(meeting, 1_000, { config: CONFIG })).resolves.toEqual({ outcome: 'added', chatId: 'x' });
  });

  it('gives up waiting on a slow Graph so scheduling carries on', async () => {
    vi.mocked(ensureAnswerPadInMeeting).mockImplementation(() => new Promise(() => undefined));
    await expect(addPadWithinBudget(meeting, 5, { config: CONFIG })).resolves.toEqual({ outcome: 'timed_out', chatId: null });
  });
});

describe('sweepClassMeetings', () => {
  it('skips the whole run when the app is not configured or the flag is off', async () => {
    const rows = [cls()];
    await expect(sweepClassMeetings({ rows, now: NOW, config: { ...CONFIG, origin: null } })).resolves.toMatchObject({ skipped: 'not_configured', due: 0 });
    vi.mocked(padFeatureEnabled).mockResolvedValue(false);
    await expect(sweepClassMeetings({ rows, now: NOW, config: CONFIG })).resolves.toMatchObject({ skipped: 'switched_off', due: 0 });
    expect(ensureAnswerPadInMeeting).not.toHaveBeenCalled();
  });

  it('runs every due class and counts the outcomes, keeping the reasons', async () => {
    const rows = [cls({ start_time: '10:10' }), cls({ start_time: '10:20' }), cls({ start_time: '15:00' })];
    vi.mocked(ensureAnswerPadInMeeting)
      .mockResolvedValueOnce({ outcome: 'added', chatId: 'a' })
      .mockResolvedValueOnce({ outcome: 'chat_not_ready', chatId: 'b', reason: 'list tabs: 404' });

    const summary = await sweepClassMeetings({ rows, now: NOW, config: CONFIG });
    expect(summary).toEqual({
      considered: 3,
      due: 2,
      counts: { added: 1, chat_not_ready: 1 },
      results: [
        { classId: rows[0].id, outcome: 'added' },
        { classId: rows[1].id, outcome: 'chat_not_ready', reason: 'list tabs: 404' },
      ],
    });
  });

  it('takes at most 40 classes a run, five Graph conversations at a time', async () => {
    let active = 0;
    let peak = 0;
    vi.mocked(ensureAnswerPadInMeeting).mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return { outcome: 'already', chatId: 'x' };
    });

    const rows = Array.from({ length: 45 }, () => cls());
    const summary = await sweepClassMeetings({ rows, now: NOW, config: CONFIG });
    expect(summary.due).toBe(SWEEP_MAX_CLASSES);
    expect(ensureAnswerPadInMeeting).toHaveBeenCalledTimes(SWEEP_MAX_CLASSES);
    expect(peak).toBeLessThanOrEqual(5);
  });
});
