import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FollowupGrid from './FollowupGrid';

/**
 * The 2x2 grid shared by the class card and the attendance panel. On the card
 * a corner opens its group; in the panel (compact) a corner is a toggle filter.
 */

const counts = { caught_up: 2, catching_up: 10, caught_up_silent: 0, needs_call: 6 };

describe('FollowupGrid', () => {
  it('labels both axes in words, so colour never carries the meaning alone', () => {
    render(<FollowupGrid counts={counts} />);
    for (const word of ['Caught up', 'Not yet', 'Told us why', 'Said nothing', 'All done', 'Follow up', 'Ask why', 'Needs a call']) {
      expect(screen.getByText(word)).toBeTruthy();
    }
  });

  it('compact: a corner is pressed while it filters, and passes its state up', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<FollowupGrid density="compact" counts={counts} selected={null} onSelect={onSelect} />);
    const cell = screen.getByTestId('followup-cell-needs_call');
    expect(cell.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(cell);
    expect(onSelect).toHaveBeenCalledWith('needs_call');

    rerender(<FollowupGrid density="compact" counts={counts} selected="needs_call" onSelect={onSelect} />);
    expect(screen.getByTestId('followup-cell-needs_call').getAttribute('aria-pressed')).toBe('true');
  });

  it('an empty corner is not a button', () => {
    render(<FollowupGrid density="compact" counts={counts} onSelect={vi.fn()} />);
    expect(screen.queryByTestId('followup-cell-caught_up_silent')).toBeNull();
  });
});
