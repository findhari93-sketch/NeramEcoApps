import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import WhatToFixList from './WhatToFixList';
import RubricBreakdown from './RubricBreakdown';

const NOTES = [
  { id: 'a', number: 1, text: 'Vanishing lines drift', region: { id: 'a', x: 0.1, y: 0.1, width: 0.2, height: 0.2, comment: 'Vanishing lines drift' } },
  { id: 'n1', number: 2, text: 'Shade the right face', region: null },
];

describe('WhatToFixList', () => {
  it('renders nothing without notes', () => {
    const { container } = render(<WhatToFixList notes={[]} activeId={null} onSelect={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('makes a pinned note a toggle, and lists an unpinned one as text', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<WhatToFixList notes={NOTES} activeId={null} onSelect={onSelect} />);
    const pinned = screen.getByRole('button', { name: /Note 1: Vanishing lines drift/ });
    expect(pinned.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pinned);
    expect(onSelect).toHaveBeenCalledWith('a');

    expect(screen.getByText('Shade the right face')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Shade the right face/ })).toBeNull();

    rerender(<WhatToFixList notes={NOTES} activeId="a" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Note 1/ }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});

describe('RubricBreakdown', () => {
  const criteria = [
    { key: 'composition', title: 'Composition', hint: 'How it sits on the sheet' },
    { key: 'proportion', title: 'Proportion and scale', hint: 'Sizes' },
    { key: 'line_quality', title: 'Line quality', hint: 'Strokes' },
  ];

  it('shows only the criteria that were scored, as meters', () => {
    render(<RubricBreakdown criteria={criteria} bands={{ composition: 4, proportion: 2 }} />);
    const meters = screen.getAllByRole('meter');
    expect(meters).toHaveLength(2);
    expect(meters[0].getAttribute('aria-label')).toBe('Composition: 4 out of 5');
    expect(meters[1].getAttribute('aria-valuenow')).toBe('2');
    expect(screen.queryByText('Line quality')).toBeNull();
  });

  it('renders nothing when nothing was scored', () => {
    const { container } = render(<RubricBreakdown criteria={criteria} bands={{}} />);
    expect(container.innerHTML).toBe('');
  });
});
