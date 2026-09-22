import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sendNudge: vi.fn() }));
vi.mock('./nudge-delivery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./nudge-delivery')>();
  return { ...actual, sendNudge: (...a: unknown[]) => mocks.sendNudge(...a) };
});

import { tellReportersTheOutcome } from './qb-report-notify';

const base = {
  studentIds: ['s1', 's2'],
  target: 'video' as const,
  partLabel: null,
  questionId: 'q31',
  paperLabel: 'JEE Paper 2 2015',
  number: 31,
  teacher: { authHeader: 'Bearer t', userId: 'teacher-1' },
  origin: 'https://nexus.neramclasses.com',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendNudge.mockResolvedValue({ results: [], counts: { chat: 1, teams: 0, inapp: 2 } });
});

describe('tellReportersTheOutcome', () => {
  it('tells every reporter the video was corrected, from the teacher who fixed it', async () => {
    const told = await tellReportersTheOutcome({ ...base, outcome: 'fixed', note: null });
    expect(told).toBe(3);
    const input = mocks.sendNudge.mock.calls[0][0];
    expect(input).toMatchObject({
      studentIds: ['s1', 's2'],
      eventType: 'qb_report_resolved',
      teacher: { authHeader: 'Bearer t', userId: 'teacher-1' },
    });
    expect(input.assistant).toBeUndefined();
    expect(input.plain).toContain('video solution for JEE Paper 2 2015 Q31');
    expect(input.plain).toContain('corrected');
    expect(input.metadata.href).toBe('/student/question-bank/questions/q31');
    expect(input.html).toContain('https://nexus.neramclasses.com/student/question-bank/questions/q31');
  });

  it('explains, in the teacher\'s words, why it was not a mistake', async () => {
    await tellReportersTheOutcome({
      ...base,
      outcome: 'not_a_mistake',
      note: 'sin 30 is 0.5, so step 3 is right.',
    });
    const input = mocks.sendNudge.mock.calls[0][0];
    expect(input.subject).toBe('We checked your report');
    expect(input.plain).toContain('sin 30 is 0.5, so step 3 is right.');
  });

  it('names the part of a split drawing', async () => {
    await tellReportersTheOutcome({ ...base, partLabel: 'B', number: 81, outcome: 'fixed', note: null });
    expect(mocks.sendNudge.mock.calls[0][0].plain).toContain('Q81 part B');
  });

  it('sends nothing when nobody is left to tell', async () => {
    expect(await tellReportersTheOutcome({ ...base, studentIds: [], outcome: 'fixed', note: null })).toBe(0);
    expect(mocks.sendNudge).not.toHaveBeenCalled();
  });
});
