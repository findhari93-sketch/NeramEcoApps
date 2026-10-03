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

  it('the Next Monday chip sends words, not an ISO date, and those words parse to the Monday on the chip (item 15)', () => {
    const ask = start({ text: 'remind me to finish the catch-up' }, deps);
    const chip = ask.suggestions.find((c) => c.label === 'Next Monday')!;
    expect(chip.send).toBe('Next Monday');
    // 3 Oct 2026 is a Saturday: the coming Monday is the 5th.
    expect(step(ask.state!, { text: chip.send }, deps).propose?.args).toEqual({ due_on: '2026-10-05', text: 'finish the catch-up' });
    // On a Monday, "Next Monday" is a week away, never today.
    const monday = { ...deps, today: '2026-10-05' };
    const onMonday = start({ text: 'remind me to finish the catch-up' }, monday);
    expect(step(onMonday.state!, { text: 'Next Monday' }, monday).propose?.args).toEqual({ due_on: '2026-10-12', text: 'finish the catch-up' });
  });
});
