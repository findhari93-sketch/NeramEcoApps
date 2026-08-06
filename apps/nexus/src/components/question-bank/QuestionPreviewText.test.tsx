import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuestionPreviewText, { stripMathDelimiters } from './QuestionPreviewText';

/**
 * The defect this component was written for: a teacher's question list printed
 * `$||adj(10 A^2)||^3 = 2^m \cdot 5^n$` at them, dollar signs and all, because
 * the row rendered the stem through a plain Typography.
 */
describe('QuestionPreviewText', () => {
  it('renders LaTeX rather than printing its delimiters', () => {
    const { container } = render(
      <QuestionPreviewText text={'If $||adj(10 A^2)||^3 = 2^m \\cdot 5^n$, find m.'} />,
    );
    // KaTeX has taken the formula.
    expect(container.querySelector('.katex')).not.toBeNull();
    // And no raw delimiter survived into the visible text.
    expect(container.textContent).not.toContain('$');
  });

  it('leaves an ordinary stem alone', () => {
    render(<QuestionPreviewText text="First Pritzker Award was given in which year?" />);
    expect(screen.getByText('First Pritzker Award was given in which year?')).not.toBeNull();
  });

  it('names an image-only question instead of rendering an empty row', () => {
    render(<QuestionPreviewText text={null} />);
    expect(screen.getByText('Image-based question')).not.toBeNull();
  });

  it('clamps to one line so a long formula cannot widen its row', () => {
    const { container } = render(<QuestionPreviewText text={'$x^2 + y^2 = z^2$'} />);
    const root = container.firstElementChild as HTMLElement;
    const styles = getComputedStyle(root);
    expect(styles.whiteSpace).toBe('nowrap');
    expect(styles.overflow).toBe('hidden');
    expect(styles.textOverflow).toBe('ellipsis');
    // Without min-width:0 the row cannot shrink inside a flex parent, which is
    // exactly how the page came to scroll sideways on a phone.
    expect(parseInt(styles.minWidth, 10)).toBe(0);
  });
});

describe('stripMathDelimiters', () => {
  it('unwraps inline and block maths', () => {
    expect(stripMathDelimiters('If $a^2$ then $$b^2$$ holds')).toBe('If a^2 then b^2 holds');
  });

  it('keeps a real currency dollar that was escaped', () => {
    expect(stripMathDelimiters('costs \\$40')).toBe('costs $40');
  });

  it('collapses whitespace so a tooltip stays one line', () => {
    expect(stripMathDelimiters('a\n\n  b')).toBe('a b');
  });
});
