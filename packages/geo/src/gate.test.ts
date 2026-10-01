import { describe, it, expect } from 'vitest';
import { scoreGate } from './gate';

describe('scoreGate', () => {
  it('indexes one strong plus one weak fact', () => {
    expect(
      scoreGate([
        { reason: 'centre-near', strength: 'strong' },
        { reason: 'colleges-in-state', strength: 'weak' },
      ])
    ).toEqual({ index: true, score: 3, reasons: ['centre-near', 'colleges-in-state'] });
  });

  it('never indexes on weak facts alone, however many', () => {
    const weak = { reason: 'w', strength: 'weak' as const };
    expect(scoreGate([weak, weak, weak, weak]).index).toBe(false);
  });

  it('needs a score of 3, so one strong fact is not enough', () => {
    expect(scoreGate([{ reason: 's', strength: 'strong' }]).index).toBe(false);
  });

  it('skips empty signals', () => {
    expect(scoreGate([null, false, undefined]).score).toBe(0);
  });
});
