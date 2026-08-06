import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import OptionBody from './OptionBody';

/**
 * NXS-0115. A student reported: "when i create test in the option for answer it
 * didnt showing the picture for identifying top view like question". The figure
 * was in the data the whole time; nothing rendered it.
 */
describe('OptionBody', () => {
  it('draws the figure an image option carries', () => {
    render(
      <OptionBody
        option={{ id: 'a', text: 'Option figure (1)', image_url: 'https://cdn.example/top-view-1.png' }}
        letter="A"
      />,
    );
    const img = screen.getByRole('img', { name: 'Option A' });
    expect(img.getAttribute('src')).toBe('https://cdn.example/top-view-1.png');
  });

  it('still shows the option text beside the figure', () => {
    render(
      <OptionBody option={{ id: 'a', text: 'A cube', image_url: 'https://cdn.example/1.png' }} letter="A" />,
    );
    expect(screen.getByText('A cube')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Option A' })).not.toBeNull();
  });

  it('renders text-only options without an empty image element', () => {
    const { container } = render(<OptionBody option={{ id: 'b', text: '1984' }} letter="B" />);
    expect(screen.getByText('1984')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders a figure with no text at all', () => {
    const { container } = render(
      <OptionBody option={{ id: 'c', text: '', image_url: 'https://cdn.example/3.png' }} letter="C" />,
    );
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('renders maths in the option text rather than its delimiters', () => {
    const { container } = render(<OptionBody option={{ id: 'd', text: '$x^2$' }} letter="D" />);
    expect(container.querySelector('.katex')).not.toBeNull();
    expect(container.textContent).not.toContain('$');
  });
});
