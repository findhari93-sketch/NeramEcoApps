import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PresenceStrip from './PresenceStrip';

const HELD = { start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T14:40:00.000Z' };

describe('PresenceStrip', () => {
  it('draws one block per stretch in the room', () => {
    const { container } = render(
      <PresenceStrip
        held={HELD}
        segments={[
          { start: '2026-09-15T13:34:00.000Z', end: '2026-09-15T13:37:00.000Z' },
          { start: '2026-09-15T13:56:00.000Z', end: '2026-09-15T14:40:00.000Z' },
        ]}
        tone="warning"
        label="45 of 70 min. Stepped out 19 min."
      />,
    );
    expect(container.querySelectorAll('[data-segment]').length).toBe(2);
  });

  it('places a block where it happened', () => {
    const { container } = render(
      <PresenceStrip
        held={HELD}
        segments={[{ start: '2026-09-15T14:05:00.000Z', end: '2026-09-15T14:40:00.000Z' }]}
        tone="warning"
        label="35 of 70 min"
      />,
    );
    const seg = container.querySelector('[data-segment]') as HTMLElement;
    // 35 minutes into a 70 minute class, running to the end.
    expect(seg.style.left).toBe('50%');
    expect(seg.style.width).toBe('50%');
  });

  it('carries the spoken description', () => {
    render(<PresenceStrip held={HELD} segments={[]} tone="warning" label="No time recorded" />);
    expect(screen.getByLabelText('No time recorded')).toBeTruthy();
  });

  it('handles malformed dates gracefully', () => {
    const { container } = render(
      <PresenceStrip
        held={{ start: 'invalid-date', end: 'also-invalid' }}
        segments={[{ start: '2026-09-15T14:05:00.000Z', end: '2026-09-15T14:40:00.000Z' }]}
        tone="warning"
        label="Date parsing failed"
      />,
    );
    expect(container.querySelectorAll('[data-segment]').length).toBe(0);
    const segments = container.querySelectorAll('[data-segment]');
    segments.forEach((seg) => {
      const style = (seg as HTMLElement).style;
      expect(style.left).not.toContain('NaN');
      expect(style.width).not.toContain('NaN');
    });
  });

  it('clamps sub-floor segments to minimum width', () => {
    const { container } = render(
      <PresenceStrip
        held={HELD}
        segments={[
          { start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T13:30:30.000Z' },
        ]}
        tone="success"
        label="30 seconds in 70 minute class"
      />,
    );
    const seg = container.querySelector('[data-segment]') as HTMLElement;
    const width = parseFloat(seg.style.width);
    expect(width).toBe(2);
  });

  it('does not clamp segments already above floor', () => {
    const { container } = render(
      <PresenceStrip
        held={HELD}
        segments={[
          { start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T13:31:40.000Z' },
        ]}
        tone="success"
        label="100 seconds in 70 minute class"
      />,
    );
    const seg = container.querySelector('[data-segment]') as HTMLElement;
    const width = parseFloat(seg.style.width);
    expect(width).toBeGreaterThan(2);
  });
});
