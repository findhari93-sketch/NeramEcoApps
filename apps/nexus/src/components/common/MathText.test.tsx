import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import MathText from './MathText';

/**
 * Search highlighting has to survive contact with LaTeX.
 *
 * Question text is a mix of prose and formulas ("...normal lines to the
 * parabola $y^2=2x$..."). A naive highlighter runs over the whole string and
 * can drop a <mark> inside the `$...$`, which corrupts the LaTeX; KaTeX then
 * gives up and renders the formula as red raw source. These tests pin the
 * boundary: prose is marked, maths is never touched.
 */
describe('MathText highlighting', () => {
  it('marks a matched term in plain prose', () => {
    const { container } = render(<MathText text="the parabola case" highlight={['parabola']} />);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('parabola');
  });

  it('marks a PREFIX, because the engine matches prefixes', () => {
    // The reported query was "lines parabo". Highlighting nothing because
    // "parabo" is not a whole word would hide why the row matched.
    const { container } = render(<MathText text="normal lines to the parabola" highlight={['lines', 'parabo']} />);
    expect(container.querySelectorAll('mark')).toHaveLength(2);
  });

  it('never injects a mark inside a formula', () => {
    // "y" appears inside $y^2=2x$. If the highlighter reached in there, KaTeX
    // would receive broken source.
    const { container } = render(
      <MathText text={'lines to the parabola $y^2=2x$ here'} highlight={['y', 'parabola']} />,
    );
    const katex = container.querySelector('.katex');
    expect(katex).not.toBeNull();
    expect(katex!.querySelector('mark')).toBeNull();
  });

  it('does not fall back to red raw source when highlighting', () => {
    // The red monospace span is MathText's own render-failure fallback, so its
    // presence is the signal that the LaTeX got corrupted.
    const { container } = render(
      <MathText text={'area of $\\frac{5}{2}$ region'} highlight={['area', 'frac']} />,
    );
    expect(container.querySelector('span[style*="color: #d32f2f"]')).toBeNull();
  });

  it('is inert when no terms are given, so normal rendering is unchanged', () => {
    const { container } = render(<MathText text="the parabola case" />);
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });

  it('ignores single-character terms that would light up the whole page', () => {
    const { container } = render(<MathText text="a b c area" highlight={['a', 'area']} />);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('area');
  });

  it('treats a term with regex metacharacters as literal text', () => {
    const { container } = render(<MathText text="50% of cases" highlight={['50%', '.*']} />);
    // Must not throw, and must not match everything.
    expect(container.textContent).toContain('50% of cases');
    expect(container.querySelectorAll('mark')).toHaveLength(1);
  });
});
