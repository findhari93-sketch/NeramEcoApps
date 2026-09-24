import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CelebrateDialog, { DEFAULT_NOTE, describeRepeats } from './CelebrateDialog';

const noop = () => {};

describe('CelebrateDialog (personal note)', () => {
  it('warns before sending another note to someone already congratulated', () => {
    render(
      <CelebrateDialog
        open
        names={['Poheem', 'Humaira safrin']}
        repeats={[{ name: 'Humaira safrin', lastAt: new Date(Date.now() - 4 * 86400000).toISOString() }]}
        outcome={null}
        onClose={noop}
        onSend={noop}
      />,
    );
    expect(
      screen.getByText('Humaira safrin was already congratulated 4 days ago and will get another note.'),
    ).toBeTruthy();
  });

  it('says nothing about repeats when everyone is new, and never mentions a group post', () => {
    render(<CelebrateDialog open names={['Poheem']} outcome={null} onClose={noop} onSend={noop} />);
    expect(screen.queryByText(/already congratulated/)).toBeNull();
    expect(screen.queryByText(/channel|group chat|Post to Teams/i)).toBeNull();
  });

  it('sends the prefilled note with one tap', () => {
    const onSend = vi.fn();
    render(<CelebrateDialog open names={['Poheem']} outcome={null} onClose={noop} onSend={onSend} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send note' }));
    expect(onSend).toHaveBeenCalledWith(DEFAULT_NOTE);
  });

  it('tells the teacher when the note went out but was not recorded', () => {
    render(
      <CelebrateDialog
        open
        names={['Poheem']}
        outcome={{ ok: true, named: ['Poheem'], recorded: false }}
        onClose={noop}
        onSend={noop}
      />,
    );
    expect(screen.getByText('Sent to 1 student, each one privately.')).toBeTruthy();
    expect(screen.getByText(/use Mark as congratulated/)).toBeTruthy();
  });
});

describe('describeRepeats', () => {
  it('joins several names without repeating the date for each', () => {
    const at = '2026-09-10T06:00:00+00:00';
    expect(
      describeRepeats([
        { name: 'A', lastAt: at },
        { name: 'B', lastAt: at },
        { name: 'C', lastAt: at },
      ]),
    ).toBe('A, B and C were already congratulated and will get another note.');
  });
});
