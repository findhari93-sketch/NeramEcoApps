import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FaqList from './FaqList';

const items = [
  { question: 'Is NATA online?', answer: 'Part B is online.' },
  { question: 'How many attempts?', answer: 'Up to two in Phase 1.' },
  { question: 'Is drawing tested?', answer: 'Yes, in Part A.' },
];

describe('FaqList', () => {
  it('opens the first answer by default and keeps the rest in the DOM, hidden', () => {
    render(<FaqList items={items} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0].getAttribute('aria-expanded')).toBe('true');
    expect(buttons[1].getAttribute('aria-expanded')).toBe('false');
    // Closed answers are still in the HTML for crawlers
    expect(screen.getByText('Up to two in Phase 1.', { selector: 'div[hidden]' })).toBeTruthy();
  });

  it('keeps only one answer open at a time', () => {
    render(<FaqList items={items} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[2]);
    expect(buttons[2].getAttribute('aria-expanded')).toBe('true');
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false');
    expect(screen.getAllByRole('region')).toHaveLength(1);
  });

  it('closes the open answer when its question is clicked again', () => {
    render(<FaqList items={items} />);
    const first = screen.getAllByRole('button')[0];
    fireEvent.click(first);
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryAllByRole('region')).toHaveLength(0);
  });

  it('wires each question to its answer', () => {
    render(<FaqList items={items} />);
    const first = screen.getAllByRole('button')[0];
    const region = screen.getByRole('region');
    expect(first.getAttribute('aria-controls')).toBe(region.id);
    expect(region.getAttribute('aria-labelledby')).toBe(first.id);
  });
});
