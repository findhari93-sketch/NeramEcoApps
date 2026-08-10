import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MathField from './MathField';

describe('MathField', () => {
  it('keeps LaTeX source in the field and typesets it in the preview', () => {
    const { container } = render(
      <MathField label="Question text" value={'If $c = 1$ then'} onChange={() => {}} />,
    );
    // The editable field still holds the raw source, because that is what saves.
    expect((screen.getByLabelText('Question text') as HTMLTextAreaElement).value).toBe(
      'If $c = 1$ then',
    );
    // The preview has typeset it.
    expect(container.querySelector('.katex')).not.toBeNull();
  });

  it('reports every keystroke to the caller', () => {
    const onChange = vi.fn();
    render(<MathField label="Option A" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Option A'), { target: { value: '$x^2$' } });
    expect(onChange).toHaveBeenCalledWith('$x^2$');
  });

  it('shows no preview for text with no math, so plain rows stay short', () => {
    const { container } = render(
      <MathField label="Question text" value="Plaster of Paris is used for" onChange={() => {}} />,
    );
    expect(container.querySelector('[data-testid="math-preview"]')).toBeNull();
  });

  it('previews a malformed formula rather than hiding the problem', () => {
    const { container } = render(
      <MathField label="Question text" value={'$\\frac{1}{$'} onChange={() => {}} />,
    );
    expect(container.querySelector('[data-testid="math-preview"]')).not.toBeNull();
  });
});
