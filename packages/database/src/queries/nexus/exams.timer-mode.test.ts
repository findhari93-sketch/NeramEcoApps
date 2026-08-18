import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import { createExamSeries } from './exams';

/**
 * timer_mode is additive, same discipline as mode/proctoring_enabled in
 * exams.practice-mode.test.ts: every existing caller that omits timerMode
 * must get back 'inherit', which resolveExamTimer() treats as byte-identical
 * to today's real behavior (the paper's own timer, nothing from this exam
 * row). Only a caller that explicitly asks for 'timed'/'untimed' gets it.
 */

function seed() {
  return createFakeDb({
    nexus_scheduled_classes: [],
    nexus_exams: [],
    nexus_test_placements: [],
  });
}

const BASE_INPUT = {
  classroomIds: ['classroom-1'],
  testId: 'test-1',
  title: 'History of Architecture',
  opensAt: '2026-08-15T04:30:00.000Z',
  closesAt: '2026-08-15T07:30:00.000Z',
};

describe('createExamSeries: timer_mode defaults preserve every existing caller', () => {
  it('defaults to inherit when timerMode is omitted, even if a duration is passed', async () => {
    const db = seed();
    const result = await createExamSeries({ ...BASE_INPUT, durationMinutes: 45 }, db.client);
    expect(result.exams[0].timer_mode).toBe('inherit');
    // The window-clamped duration write is unchanged by this feature -- only
    // which reader treats it as authoritative changes.
    expect(result.exams[0].duration_minutes).toBe(45);
  });

  it('defaults to inherit with a null duration when neither is passed', async () => {
    const db = seed();
    const result = await createExamSeries(BASE_INPUT, db.client);
    expect(result.exams[0].timer_mode).toBe('inherit');
    expect(result.exams[0].duration_minutes).toBeNull();
  });
});

describe('createExamSeries: an explicit timer_mode', () => {
  it('writes "timed" through with its duration, clamped to the window as before', async () => {
    const db = seed();
    const result = await createExamSeries(
      { ...BASE_INPUT, timerMode: 'timed', durationMinutes: 500 },
      db.client,
    );
    expect(result.exams[0].timer_mode).toBe('timed');
    // The window here is 3 hours (180 minutes), so a 500-minute ask is clamped.
    expect(result.exams[0].duration_minutes).toBe(180);
  });

  it('writes "untimed" through and forces duration_minutes null even if one was passed', async () => {
    const db = seed();
    const result = await createExamSeries(
      { ...BASE_INPUT, timerMode: 'untimed', durationMinutes: 60 },
      db.client,
    );
    expect(result.exams[0].timer_mode).toBe('untimed');
    expect(result.exams[0].duration_minutes).toBeNull();
  });
});
