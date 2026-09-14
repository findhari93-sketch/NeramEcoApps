import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import CelebrateDialog, { describeRepeats } from './CelebrateDialog';

const noop = () => {};

describe('CelebrateDialog', () => {
  it('warns before naming someone who was already congratulated', () => {
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
      screen.getByText('Humaira safrin was already congratulated 4 days ago and will be named again.'),
    ).toBeTruthy();
  });

  it('says nothing about repeats when everyone is new', () => {
    render(<CelebrateDialog open names={['Poheem']} outcome={null} onClose={noop} onSend={noop} />);
    expect(screen.queryByText(/already congratulated/)).toBeNull();
  });

  it('tells the teacher when the post went out but was not recorded', () => {
    render(
      <CelebrateDialog
        open
        names={['Poheem']}
        outcome={{ ok: true, named: ['Poheem'], recorded: false }}
        onClose={noop}
        onSend={noop}
      />,
    );
    expect(screen.getByText('Posted, naming 1 student.')).toBeTruthy();
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
    ).toBe('A, B and C were already congratulated and will be named again.');
  });
});
