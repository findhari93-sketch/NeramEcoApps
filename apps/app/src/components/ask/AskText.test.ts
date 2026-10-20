import { describe, it, expect } from 'vitest';
import { toBlocks } from './AskText';

describe('answer text blocks', () => {
  it('splits paragraphs and bullet lists', () => {
    expect(toBlocks('Your cutoff is **308**.\n\n- Above the 45% rule\n- Best of two attempts\nNext step: check colleges.')).toEqual([
      { kind: 'p', text: 'Your cutoff is **308**.' },
      { kind: 'ul', items: ['Above the 45% rule', 'Best of two attempts'] },
      { kind: 'p', text: 'Next step: check colleges.' },
    ]);
  });

  it('flattens headings into bold lines and keeps numbered lists', () => {
    expect(toBlocks('## Steps\n1. Enter marks\n2. Add NATA')).toEqual([
      { kind: 'p', text: '**Steps**' },
      { kind: 'ol', items: ['Enter marks', 'Add NATA'] },
    ]);
  });
});
