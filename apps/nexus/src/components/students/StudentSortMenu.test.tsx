import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StudentSortMenu from './StudentSortMenu';

describe('StudentSortMenu', () => {
  it('names the current order and reports a new choice', () => {
    const onChange = vi.fn();
    render(<StudentSortMenu value="name" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Name A to Z' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Newest joined' }));
    expect(onChange).toHaveBeenCalledWith('joined_newest');
  });
});
