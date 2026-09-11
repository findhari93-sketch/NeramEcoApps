import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MatchHighlight from './MatchHighlight';

const marked = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('mark')).map((mark) => mark.textContent);

describe('MatchHighlight', () => {
  it('marks the matched letters and keeps the whole name', () => {
    const { container } = render(<MatchHighlight text="Afrin banu" ranges={[[6, 8]]} />);
    expect(marked(container)).toEqual(['ba']);
    expect(container.textContent).toBe('Afrin banu');
  });

  it('marks each typed word of a multi-word search', () => {
    const { container } = render(
      <MatchHighlight
        text="Bavishiya Senthilkumar"
        ranges={[
          [0, 3],
          [10, 13],
        ]}
      />,
    );
    expect(marked(container)).toEqual(['Bav', 'Sen']);
    expect(container.textContent).toBe('Bavishiya Senthilkumar');
  });

  it('renders plain text when nothing matched letter for letter', () => {
    const { container } = render(<MatchHighlight text="Dhisha Haribabu" ranges={[]} />);
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('Dhisha Haribabu');
  });

  it('survives ranges that overlap, touch or run past the end', () => {
    const { container } = render(
      <MatchHighlight
        text="Ayana"
        ranges={[
          [3, 99],
          [0, 2],
          [1, 3],
        ]}
      />,
    );
    expect(marked(container)).toEqual(['Ayana']);
    expect(container.textContent).toBe('Ayana');
  });
});
