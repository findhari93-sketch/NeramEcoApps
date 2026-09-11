import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AddStudentSheet from './AddStudentSheet';

vi.mock('@/components/AvailableStudentsSection', () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="directory">{embedded ? 'embedded' : 'collapsible'}</div>
  ),
}));

function props() {
  return {
    open: true,
    onClose: vi.fn(),
    classroomId: 'room-1',
    getToken: async () => 'token',
    onEnrolled: vi.fn(),
  };
}

describe('AddStudentSheet', () => {
  it('opens on the directory, embedded, when no account creator is supplied', () => {
    render(<AddStudentSheet {...props()} />);
    expect(screen.getByTestId('directory').textContent).toBe('embedded');
  });

  it('explains the manual route on the Create tab and links back', () => {
    render(<AddStudentSheet {...props()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Create account' }));
    expect(screen.getByText('Create the account in Microsoft first')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Existing Microsoft account' }));
    expect(screen.getByTestId('directory')).toBeTruthy();
  });

  it('opens on the creator when one is supplied', () => {
    render(<AddStudentSheet {...props()} createAccount={<div>creator form</div>} />);
    expect(screen.getByText('creator form')).toBeTruthy();
  });

  it('is a dialog named Add student', () => {
    render(<AddStudentSheet {...props()} />);
    expect(screen.getByRole('dialog', { name: 'Add student' })).toBeTruthy();
  });

  it('lets the creator jump to the Existing tab', () => {
    render(
      <AddStudentSheet
        {...props()}
        createAccount={({ showExisting }) => <button onClick={showExisting}>use existing</button>}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'use existing' }));
    expect(screen.getByTestId('directory')).toBeTruthy();
  });

  it('shows only the creator, without tabs, for one student', () => {
    render(
      <AddStudentSheet {...props()} createOnly title="Create Microsoft account" createAccount={<div>creator form</div>} />,
    );
    expect(screen.getByRole('dialog', { name: 'Create Microsoft account' })).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByText('creator form')).toBeTruthy();
  });

  it('asks before closing over a password nobody copied', () => {
    const p = props();
    render(<AddStudentSheet {...p} guardClose createAccount={<div>password on screen</div>} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(p.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close anyway' }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});
