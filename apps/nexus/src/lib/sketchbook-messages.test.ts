import { describe, it, expect } from 'vitest';
import { reactionMessage, featuredMessage, firstName, REACTION_LABEL } from './sketchbook-messages';

describe('sketchbook messages', () => {
  it('labels the three reactions', () => {
    expect(REACTION_LABEL).toEqual({ heart: 'Nice', fire: 'Great', wow: 'Wow' });
  });
  it('takes the first name only', () => {
    expect(firstName('Hari Babu')).toBe('Hari');
    expect(firstName(null)).toBe('Your teacher');
  });
  it('writes the reaction message without em dashes', () => {
    const m = reactionMessage('Hari', 'fire');
    expect(m.subject).toBe('Hari reacted to your sketch');
    expect(m.plain).toBe('Hari said Great to a sketch in your sketchbook. Keep the rhythm going.');
    expect(m.plain).not.toContain('—');
  });
  it('writes the featured message', () => {
    const m = featuredMessage('Hari', 'JEE B.Arch Session 1');
    expect(m.subject).toBe('Your sketch was featured in JEE B.Arch Session 1');
    expect(m.plain).toBe('Hari featured one of your sketches for the whole class to see. Open your sketchbook to find it.');
  });
});
