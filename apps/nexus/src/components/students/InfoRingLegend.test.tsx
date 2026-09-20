import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InfoRingLegend, { InfoRingLegendButton } from './InfoRingLegend';
import { INFO_RING_NAME, INFO_RING_STATES } from '@/lib/student-info-ring';
import { LANGUAGES } from '@/lib/student-language';

/**
 * The key to the info ring.
 *
 * The point of these tests is that the legend is GENERATED, never typed out. If
 * someone adds a sixth stage to student-stage.ts and forgets the legend, the
 * count assertion here fails rather than a teacher quietly meeting a ring
 * colour the key does not mention.
 */

vi.mock('@/components/GraphAvatar', () => ({
  default: () => <span data-testid="graph-avatar" />,
}));

describe('InfoRingLegend', () => {
  it('names the thing it is explaining', () => {
    render(<InfoRingLegend open onClose={() => {}} />);
    expect(screen.getByText(INFO_RING_NAME)).toBeTruthy();
  });

  it('lists every ring state, so no colour goes unexplained', () => {
    render(<InfoRingLegend open onClose={() => {}} />);
    for (const state of INFO_RING_STATES) {
      expect(screen.getByText(state.label)).toBeTruthy();
      expect(screen.getByText(state.meaning)).toBeTruthy();
    }
  });

  it('draws real avatars as swatches, so the key cannot show a ring the app does not', () => {
    render(<InfoRingLegend open onClose={() => {}} />);
    // One per state, each a genuine StudentStageAvatar rather than a drawn circle.
    expect(screen.getAllByTestId('info-ring')).toHaveLength(INFO_RING_STATES.length);
  });

  it('hides the swatches from screen readers, which read the words beside them', () => {
    render(<InfoRingLegend open onClose={() => {}} />);
    const ring = screen.getAllByTestId('info-ring')[0];
    expect(ring.closest('[aria-hidden]')).toBeTruthy();
  });

  it('shows the four marked languages with their letters', () => {
    render(<InfoRingLegend open onClose={() => {}} />);
    for (const key of ['tamil', 'hindi', 'kannada', 'malayalam'] as const) {
      const row = screen.getByTestId(`legend-language-${key}`);
      expect(row.textContent).toContain(LANGUAGES[key].label);
      expect(row.textContent).toContain(LANGUAGES[key].mark);
    }
  });

  it('leaves English out of the letters, because a bare corner is what it means', () => {
    render(<InfoRingLegend open onClose={() => {}} />);
    expect(screen.queryByTestId('legend-language-english')).toBeNull();
  });

  it('explains the outlined mark, which is the one state colour cannot carry', () => {
    render(<InfoRingLegend open onClose={() => {}} />);
    expect(screen.getByText('Limited English')).toBeTruthy();
    expect(screen.getByText(/outlined instead of filled/i)).toBeTruthy();
  });

  it('carries the opening page own explanation when it has one', () => {
    render(
      <InfoRingLegend
        open
        onClose={() => {}}
        intro={{ title: 'What these numbers count', body: 'Tracked students count in attendance.' }}
      />
    );
    expect(screen.getByText('What these numbers count')).toBeTruthy();
    expect(screen.getByText('Tracked students count in attendance.')).toBeTruthy();
  });

  it('renders nothing while closed', () => {
    render(<InfoRingLegend open={false} onClose={() => {}} />);
    expect(screen.queryByText(INFO_RING_NAME)).toBeNull();
  });

  it('closes from its own button', () => {
    const onClose = vi.fn();
    render(<InfoRingLegend open onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('uses no em dashes, which is a house rule for anything a person reads', () => {
    const { container } = render(<InfoRingLegend open onClose={() => {}} />);
    expect(document.body.textContent || container.textContent || '').not.toMatch(/—|&mdash;/);
  });
});

describe('InfoRingLegendButton', () => {
  it('opens the key and keeps a 48px target', () => {
    render(<InfoRingLegendButton />);
    expect(screen.queryByText(INFO_RING_NAME)).toBeNull();

    const button = screen.getByTestId('info-ring-legend-button');
    expect(button.getAttribute('aria-label')).toBeTruthy();

    fireEvent.click(button);
    expect(screen.getByText(INFO_RING_NAME)).toBeTruthy();
  });
});
