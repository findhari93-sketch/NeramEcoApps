import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DrawingLevelFilterBar from './DrawingLevelFilterBar';

describe('DrawingLevelFilterBar', () => {
  const counts = { top: 6, mid: 14, needs_practice: 9, unrated: 13 };

  it('shows each level with its count, Not rated last', () => {
    render(<DrawingLevelFilterBar value={[]} counts={counts} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Top, 6 students' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not rated, 13 students' })).toBeTruthy();
    const keys = screen.getAllByRole('button').map((b) => b.getAttribute('data-testid'));
    expect(keys).toEqual(['level-chip-top', 'level-chip-mid', 'level-chip-needs_practice', 'level-chip-unrated']);
  });

  it('toggles a level in stable order, whatever the tap order', () => {
    const onChange = vi.fn();
    render(<DrawingLevelFilterBar value={['unrated']} counts={counts} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('level-chip-top'));
    expect(onChange).toHaveBeenCalledWith(['top', 'unrated']);
    expect(screen.getByTestId('level-chip-unrated').getAttribute('aria-pressed')).toBe('true');
  });
});
