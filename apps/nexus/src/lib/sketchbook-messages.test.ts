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
  it('appreciates the student by name and says where the drawing went', () => {
    const m = featuredMessage('Hari', 'JEE B.Arch Session 1');
    expect(m.subject).toBe('Your drawing is featured in JEE B.Arch Session 1');
    // sendNudge fills {firstName} per recipient, so the token must survive.
    expect(m.plain).toContain('{firstName}');
    expect(m.plain).toContain('Hari chose your drawing to show the class.');
    expect(m.plain).toContain('Inspiration shelf');
    expect(m.teamsText).toBe('Your drawing is featured');
  });

  it('promises no shelf to a student who keeps their drawings off it', () => {
    const m = featuredMessage('Hari', 'JEE B.Arch Session 1', false);
    expect(m.plain).not.toContain('Inspiration');
    // Still praised: the class saw it, which is what was actually true.
    expect(m.plain).toContain('chose your drawing to show the class.');
    expect(m.plain).toContain('Well done.');
  });

  it('keeps every message clear of em dashes', () => {
    for (const m of [featuredMessage('Hari', 'Class'), featuredMessage('Hari', 'Class', false)]) {
      expect(m.subject).not.toContain('—');
      expect(m.plain).not.toContain('—');
    }
  });
});
