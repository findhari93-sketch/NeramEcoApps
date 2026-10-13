import { describe, it, expect } from 'vitest';
import { reactionMessage, evaluationMessage, featuredMessage, firstName, REACTION_LABEL } from './sketchbook-messages';

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
  it('writes one message for a save, from whatever was given', () => {
    expect(evaluationMessage('Hari', { reaction: 'wow', grade: 'mid', comment: 'Softer shadow' })).toEqual({
      subject: 'Hari reacted to your sketch',
      plain: 'Hari said Wow to a sketch in your sketchbook. Grade: Mid. Hari wrote: Softer shadow',
    });
    expect(evaluationMessage('Hari', { reaction: 'fire' }).plain).toBe('Hari said Great to a sketch in your sketchbook. Keep the rhythm going.');
    expect(evaluationMessage('Hari', { grade: 'needs_practice' })).toEqual({
      subject: 'Hari graded your sketch',
      plain: 'Hari graded a sketch in your sketchbook: Needs practice.',
    });
    expect(evaluationMessage('Hari', { comment: 'Softer shadow' })).toEqual({ subject: 'Hari commented on your sketch', plain: 'Softer shadow' });
    for (const m of [evaluationMessage('Hari', { reaction: 'wow', grade: 'top' })]) expect(m.plain).not.toMatch(/—|--/);
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
