import { describe, it, expect } from 'vitest';
import { composeDrawingBriefText } from './drawing-brief-text';

describe('composeDrawingBriefText', () => {
  it('carries the focus points to the reviewer, which is the point of it', () => {
    // The Drawing Review screen reads one text field. Before this, "what to
    // focus on" existed on the assignment and never reached the person marking
    // against it.
    const text = composeDrawingBriefText(
      {
        instructions: 'Recreate the India Gate in one-point perspective.',
        expected_outcome: 'A clean A3 sheet with the arch centred.',
        focus_points: 'Proportion of the arch\nOne vanishing point',
      },
      'India Gate',
    );
    expect(text).toContain('Recreate the India Gate in one-point perspective.');
    expect(text).toContain('Expected outcome:');
    expect(text).toContain('A clean A3 sheet with the arch centred.');
    expect(text).toContain('Focus on:');
    expect(text).toContain('- Proportion of the arch');
    expect(text).toContain('- One vanishing point');
  });

  it('falls back to the title when there is no task text', () => {
    // An untitled block would leave the reviewer with nothing at all.
    expect(composeDrawingBriefText({}, 'Isometric view')).toBe('Isometric view');
    expect(composeDrawingBriefText({ instructions: '   ' }, 'Isometric view')).toBe('Isometric view');
  });

  it('omits blocks that are empty rather than printing empty headings', () => {
    const text = composeDrawingBriefText({ instructions: 'Draw a cube.' }, 'Cube');
    expect(text).toBe('Draw a cube.');
    expect(text).not.toContain('Expected outcome');
    expect(text).not.toContain('Focus on');
  });

  it('drops blank lines instead of turning them into empty bullets', () => {
    const text = composeDrawingBriefText(
      { instructions: 'Draw.', focus_points: 'Line weight\n\n\n   \nShading' },
      'x',
    );
    expect(text).toContain('- Line weight');
    expect(text).toContain('- Shading');
    expect(text).not.toMatch(/-\s*$/m);
  });

  it('does not double a bullet a teacher typed themselves', () => {
    // Teachers reasonably type "- point" out of habit. Two dashes reads as a
    // mistake in the reviewer's pane.
    const text = composeDrawingBriefText(
      { instructions: 'Draw.', focus_points: '- Proportion\n* Contrast\n• Depth' },
      'x',
    );
    expect(text).toContain('- Proportion');
    expect(text).toContain('- Contrast');
    expect(text).toContain('- Depth');
    expect(text).not.toContain('- - ');
    expect(text).not.toContain('- * ');
    expect(text).not.toContain('- • ');
  });

  it('separates blocks with a blank line so the parser sees them as blocks', () => {
    const text = composeDrawingBriefText(
      { instructions: 'Draw.', expected_outcome: 'Clean.', focus_points: 'Lines' },
      'x',
    );
    expect(text.split('\n\n')).toHaveLength(3);
  });
});
