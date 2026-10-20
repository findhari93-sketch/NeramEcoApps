import { describe, it, expect } from 'vitest';
import { factChips, factsForPrompt, mergeFacts, sanitizeFacts } from './memory';

describe('remembered details', () => {
  it('keeps valid values and drops everything else', () => {
    expect(
      sanitizeFacts({
        board: 'TN_STATE',
        boardMax: 600,
        boardMarks: '540',
        nataScores: [120, 'x', 300, 128],
        community: 'bc',
        city: '  Madurai\u0007 ',
        state: 'Tamil<b>Nadu',
        examYear: 1999,
        password: 'nope',
      })
    ).toEqual({ board: 'TN_STATE', boardMax: 600, boardMarks: 540, nataScores: [120, 128], community: 'BC', city: 'Madurai', state: 'TamilbNadu' });
  });

  it('rejects marks above the board maximum and unknown communities', () => {
    expect(sanitizeFacts({ boardMax: 500, boardMarks: 510, community: 'XYZ' })).toEqual({ boardMax: 500 });
  });

  it('forgets a key set to null and fills the maximum for a new board', () => {
    const f = mergeFacts({ board: 'CBSE', boardMax: 500, boardMarks: 450, community: 'MBC' }, { community: null, board: 'MAHARASHTRA_HSC' });
    expect(f).toEqual({ board: 'MAHARASHTRA_HSC', boardMax: 650, boardMarks: 450 });
  });

  it('is never fooled by non-objects', () => {
    expect(sanitizeFacts(null)).toEqual({});
    expect(sanitizeFacts([1, 2])).toEqual({});
    expect(sanitizeFacts('board=CBSE')).toEqual({});
  });

  it('shows one chip per idea, and the prompt lists what it knows', () => {
    const f = { board: 'TN_STATE' as const, boardMax: 600, boardMarks: 540, nataScores: [110, 128], community: 'BC', city: 'Chennai' };
    expect(factChips(f).map((c) => c.label)).toEqual(['Tamil Nadu State 540/600', 'NATA best 128', 'BC', 'Chennai']);
    expect(factsForPrompt(f)).toContain('TNEA community: BC');
    expect(factsForPrompt({})).toBe('');
  });
});
