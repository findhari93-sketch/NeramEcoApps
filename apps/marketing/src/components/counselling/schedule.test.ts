import { describe, expect, it } from 'vitest';
import { toTimeline } from './schedule';

const NOW = new Date('2026-06-10T08:00:00Z');

describe('toTimeline', () => {
  it('marks past dates done, the first upcoming one now, the rest next', () => {
    const rows = toTimeline(
      [
        { label: 'Registration opens', dateIso: '2026-05-03', dateDisplay: '03.05.2026', status: 'confirmed' },
        { label: 'Last date to register', dateIso: '2026-06-20', dateDisplay: '20.06.2026', status: 'confirmed' },
        { label: 'Rank list', dateIso: '2026-07-01', dateDisplay: '01.07.2026', status: 'expected' },
      ],
      NOW,
    );
    expect(rows.map((r) => r.state)).toEqual(['done', 'now', 'next']);
    expect(rows[1].note).toBe('In 10 days');
    expect(rows[2].note).toBe('Expected date');
  });

  it('treats a milestone dated today as now', () => {
    const rows = toTimeline([{ label: 'Choice filling', dateIso: '2026-06-10', dateDisplay: '10.06.2026' }], NOW);
    expect(rows[0]).toMatchObject({ state: 'now', note: 'Today' });
  });

  it('never marks a TBD or undated milestone as done or now', () => {
    const rows = toTimeline(
      [
        { label: 'Counselling', dateIso: '2026-01-01', dateDisplay: 'Early 2026', status: 'tbd' },
        { label: 'Results', dateDisplay: 'July 2026' },
      ],
      NOW,
    );
    expect(rows.map((r) => r.state)).toEqual(['next', 'next']);
    expect(rows[0].note).toBe('Date to be announced');
  });

  it('keeps the source note after the derived text', () => {
    const rows = toTimeline(
      [{ label: 'Round 1', dateIso: '2026-12-01', dateDisplay: '01.12.2026', note: 'Per 2025 cycle' }],
      NOW,
    );
    expect(rows[0].note).toBe('Per 2025 cycle');
  });

  it('does not repeat TBD when the date text already says it', () => {
    const rows = toTimeline([{ label: 'Round 1', dateDisplay: 'July 2026 (TBD)', status: 'tbd' }], NOW);
    expect(rows[0].note).toBeUndefined();
  });
});
