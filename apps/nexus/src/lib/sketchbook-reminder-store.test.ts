import { describe, it, expect, vi } from 'vitest';

vi.mock('@neram/database', () => ({ getSupabaseAdminClient: vi.fn() }));

import { foldReminderCycle, type ReminderLogRow } from './sketchbook-reminder-store';

const row = (over: Partial<ReminderLogRow>): ReminderLogRow => ({
  kind: 'auto', cycleStart: '2026-09-12', step: 1, sentOn: '2026-09-15', channel: 'teams+inapp', ...over,
});

describe('foldReminderCycle', () => {
  it('has nothing to say about a student who was never reminded', () => {
    expect(foldReminderCycle([])).toBeNull();
  });

  it('counts automatic steps for "Needs a call" but every reminder for "reminded N times"', () => {
    const facts = foldReminderCycle([
      row({ step: 1, sentOn: '2026-09-15' }),
      row({ kind: 'teacher', step: null, sentOn: '2026-09-16', channel: 'chat+inapp' }),
      row({ step: 2, sentOn: '2026-09-18', channel: 'inapp' }),
    ]);
    expect(facts).toEqual({
      cycleStart: '2026-09-12', autoSteps: 2, sentThisCycle: 3, lastSentOn: '2026-09-18', lastChannel: 'inapp',
    });
  });

  it('counts only the newest quiet stretch, but still reports the last send', () => {
    const facts = foldReminderCycle([
      row({ cycleStart: '2026-09-01', step: 1, sentOn: '2026-09-04' }),
      row({ cycleStart: '2026-09-01', step: 2, sentOn: '2026-09-07' }),
      row({ cycleStart: '2026-09-12', step: 1, sentOn: '2026-09-15', channel: 'chat+inapp' }),
    ]);
    expect(facts?.cycleStart).toBe('2026-09-12');
    expect(facts?.autoSteps).toBe(1);
    expect(facts?.sentThisCycle).toBe(1);
    expect(facts?.lastSentOn).toBe('2026-09-15');
    expect(facts?.lastChannel).toBe('chat+inapp');
  });

  it('reads a send still waiting on its receipt as no channel, never as a failure', () => {
    expect(foldReminderCycle([row({ channel: null })])?.lastChannel).toBeNull();
    expect(foldReminderCycle([row({ channel: undefined })])?.lastChannel).toBeNull();
  });
});
