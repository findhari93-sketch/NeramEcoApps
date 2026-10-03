import { describe, expect, it } from 'vitest';
import { start, step } from './remind-me';

const today = '2026-10-03';
const deps = { today, now: new Date('2026-10-03T04:30:00Z'), upcoming: [], declined: new Set<string>() };

describe('remind-me flow', () => {
  it('proposes straight away when the message has both the day and the task', () => {
    const out = start({ text: 'remind me tomorrow to finish the catch-up' }, deps);
    expect(out.state).toBeNull();
    expect(out.propose).toMatchObject({ kind: 'set_reminder', args: { due_on: '2026-10-04', text: 'finish the catch-up' } });
    const alt = start({ text: 'Remind me to bring the sketchbook on friday' }, deps);
    expect(alt.propose?.args).toEqual({ due_on: '2026-10-09', text: 'bring the sketchbook' });
  });

  it('asks for the day when only the task is given', () => {
    const out = start({ text: 'remind me to finish the catch-up' }, deps);
    expect(out.state).toMatchObject({ step: 'when', data: { text: 'finish the catch-up' } });
    expect(out.suggestions.map((s) => s.label)).toEqual(['Tomorrow', 'Day after tomorrow', 'Next Monday']);
    const next = step(out.state!, { text: 'Day after tomorrow' }, deps);
    expect(next.propose?.args).toEqual({ due_on: '2026-10-05', text: 'finish the catch-up' });
  });

  it('asks for the task when only the day is given, and re-asks on an unreadable day', () => {
    let out = start({ text: 'remind me on friday' }, deps);
    expect(out.state).toMatchObject({ step: 'what', data: { due_on: '2026-10-09' } });
    out = step(out.state!, { text: 'submit the shading sheet' }, deps);
    expect(out.propose?.args).toEqual({ due_on: '2026-10-09', text: 'submit the shading sheet' });

    let bare = start({ text: 'remind me' }, deps);
    expect(bare.state?.step).toBe('when');
    bare = step(bare.state!, { text: 'sometime' }, deps);
    expect(bare.state?.step).toBe('when');
    expect(bare.reply).toMatch(/did not catch the day/);
  });

  it('refuses a day in the past', () => {
    const out = start({ text: 'remind me yesterday to breathe' }, deps);
    expect(out.state?.step).toBe('when');
    expect(out.reply).toMatch(/already passed/);
  });
});
