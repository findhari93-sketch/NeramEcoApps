import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StudentRowMenu from './StudentRowMenu';

describe('StudentRowMenu', () => {
  it('lists the actions it is given and runs the chosen one', () => {
    const onCopy = vi.fn();
    render(
      <StudentRowMenu
        title="Dhisha Haribabu"
        items={[
          { key: 'open', label: 'Open profile', icon: <span />, onClick: vi.fn() },
          { key: 'copy', label: 'Copy email', icon: <span />, onClick: onCopy },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Dhisha Haribabu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy email' }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('does not let a click reach the row underneath', () => {
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <StudentRowMenu
          title="Asha"
          items={[{ key: 'open', label: 'Open profile', icon: <span />, onClick: vi.fn() }]}
        />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Asha' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open profile' }));
    expect(onRow).not.toHaveBeenCalled();
  });

  it('renders nothing without actions', () => {
    const { container } = render(<StudentRowMenu title="Asha" items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
