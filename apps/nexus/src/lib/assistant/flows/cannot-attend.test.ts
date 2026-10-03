import { describe, expect, it } from 'vitest';
import type { FlowDeps } from './types';
import { start, step } from './cannot-attend';

const today = '2026-10-03';
const deps: FlowDeps = {
  today,
  upcoming: [
    { id: 'k1', title: 'Perspective', classroom_id: 'c1', scheduled_date: '2026-10-04', start_time: '18:00', end_time: '19:30', status: 'scheduled', teams_meeting_url: null },
    { id: 'k2', title: 'Shading', classroom_id: 'c1', scheduled_date: '2026-10-07', start_time: '18:00', end_time: '19:30', status: 'scheduled', teams_meeting_url: null },
  ],
  declined: new Set(),
  now: new Date('2026-10-03T04:30:00Z'),
};

describe('cannot-attend flow', () => {
  it('asks which class, offering the upcoming ones and several days', () => {
    const out = start({ text: "I can't attend" }, deps);
    expect(out.state?.step).toBe('pick-class');
    expect(out.reply).toBe('Which class can you not attend?');
    expect(out.suggestions.map((s) => s.label)).toEqual(['Tomorrow 6:00 pm: Perspective', 'Wednesday 7 Oct 6:00 pm: Shading', 'Several days']);
  });

  it('jumps to the reason when the first message names the day', () => {
    const out = start({ text: "I can't attend tomorrow's class" }, deps);
    expect(out.state).toMatchObject({ step: 'pick-reason', data: { classId: 'k1' } });
    expect(out.reply).toBe('Perspective, tomorrow at 6:00 pm. Why can you not make it?');
    expect(out.suggestions.map((s) => s.label)).toEqual(['Feeling unwell', 'Family commitment', 'School or exam clash', 'Other reason']);
  });

  it('offers the away path when nothing is scheduled', () => {
    const out = start({ text: "I can't come" }, { ...deps, upcoming: [] });
    expect(out.state?.step).toBe('pick-range');
    expect(out.reply).toMatch(/no class in the next two weeks/);
  });

  it('picks a class by chip text, then a reason, then proposes decline_class', () => {
    let out = start({ text: "I can't attend" }, deps);
    out = step(out.state!, { text: 'Wednesday 7 Oct 6:00 pm: Shading' }, deps);
    expect(out.state).toMatchObject({ step: 'pick-reason', data: { classId: 'k2' } });
    out = step(out.state!, { text: 'Family commitment' }, deps);
    expect(out.state).toBeNull();
    expect(out.propose).toEqual({ kind: 'decline_class', args: { class_id: 'k2', reason_code: 'family', note: null }, summary: expect.any(String), fields: expect.any(Array) });
  });

  it('asks for a note on Other and keeps asking until it gets one', () => {
    let out = start({ text: "I can't attend tomorrow" }, deps);
    out = step(out.state!, { text: 'Other reason' }, deps);
    expect(out.state?.step).toBe('note');
    out = step(out.state!, { text: 'ok' }, deps);
    expect(out.state?.step).toBe('note');
    out = step(out.state!, { text: 'Cousin\'s wedding in Madurai' }, deps);
    expect(out.propose?.args).toMatchObject({ reason_code: 'other', note: "Cousin's wedding in Madurai" });
  });

  it('several days: parses a range, then a reason, then proposes declare_away_window', () => {
    let out = start({ text: "I can't attend" }, deps);
    out = step(out.state!, { text: 'Several days' }, deps);
    expect(out.state?.step).toBe('pick-range');
    out = step(out.state!, { text: 'whenever' }, deps);
    expect(out.state?.step).toBe('pick-range');
    expect(out.reply).toMatch(/did not catch the dates/);
    out = step(out.state!, { text: '8 Oct to 12 Oct' }, deps);
    expect(out.state).toMatchObject({ step: 'pick-reason', data: { range: { from: '2026-10-08', to: '2026-10-12' } } });
    out = step(out.state!, { text: 'School or exam clash' }, deps);
    expect(out.propose).toMatchObject({ kind: 'declare_away_window', args: { starts_on: '2026-10-08', ends_on: '2026-10-12', reason_code: 'clash', note: null } });
  });

  it('refuses a range longer than 120 days and a range in the past', () => {
    let out = start({ text: 'mark me away' }, deps);
    out = step(out.state!, { text: 'Several days' }, deps);
    expect(step(out.state!, { text: 'today to 2027-05-01' }, deps).reply).toMatch(/120 days/);
    expect(step(out.state!, { text: '1 Sep 2026 to 2 Sep 2026' }, deps).reply).toMatch(/already passed/);
  });

  it('an unrecognised class answer re-asks instead of guessing', () => {
    let out = start({ text: "I can't attend" }, deps);
    out = step(out.state!, { text: 'the blue one' }, deps);
    expect(out.state?.step).toBe('pick-class');
    expect(out.reply).toMatch(/Tap one of the classes/);
  });

  it('re-asks when the chosen class has dropped off the list before the reason or note step', () => {
    const gone = { ...deps, upcoming: [deps.upcoming[1]] };
    let out = start({ text: "I can't attend tomorrow" }, deps);
    const reasonOut = step(out.state!, { text: 'Feeling unwell' }, gone);
    expect(reasonOut.propose).toBeUndefined();
    expect(reasonOut.reply).toMatch(/no longer on your timetable/);
    expect(reasonOut.state).toMatchObject({ flow: 'cannot-attend', step: 'pick-class' });
    expect(reasonOut.state?.startedAt).toBe(out.state!.startedAt);

    out = step(out.state!, { text: 'Other reason' }, deps);
    expect(out.state?.step).toBe('note');
    const noteOut = step(out.state!, { text: 'Cousin wedding in Madurai' }, gone);
    expect(noteOut.propose).toBeUndefined();
    expect(noteOut.reply).toMatch(/no longer on your timetable/);
    expect(noteOut.state?.flow).toBe('cannot-attend');
  });
});
