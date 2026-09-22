import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * The one solution-video player, for the question view and the test review.
 *
 * The copy it replaces read YouTube with a private regex that missed
 * m.youtube.com and `watch?feature=share&v=` links, which then fell through to
 * an HTML5 player pointed at a YouTube web page: a black box that never plays.
 */

vi.mock('@/components/video/NeramVideoPlayer', () => ({
  default: (props: { source: unknown; title?: string }) => (
    <div data-testid="player" data-source={JSON.stringify(props.source)} title={props.title} />
  ),
}));

const { default: SolutionVideoPlayer } = await import('./SolutionVideoPlayer');

const sourceOf = () => JSON.parse(screen.getByTestId('player').getAttribute('data-source')!);

describe('SolutionVideoPlayer', () => {
  it.each([
    'https://youtu.be/U1X9MmLh-ZQ',
    'https://m.youtube.com/watch?v=U1X9MmLh-ZQ',
    'https://www.youtube.com/watch?feature=share&v=U1X9MmLh-ZQ',
    'https://youtube.com/shorts/U1X9MmLh-ZQ',
  ])('plays %s as YouTube', (url) => {
    render(<SolutionVideoPlayer url={url} />);
    expect(sourceOf()).toEqual({ kind: 'youtube', youtubeId: 'U1X9MmLh-ZQ' });
  });

  it('plays a SharePoint link as a direct download', () => {
    render(<SolutionVideoPlayer url="https://neramclasses.sharepoint.com/:v:/s/Videos/Eabc" />);
    const source = sourceOf();
    expect(source.kind).toBe('html5');
    expect(source.src).toContain('download=1');
  });

  it('names the player for screen readers', () => {
    render(<SolutionVideoPlayer url="https://youtu.be/U1X9MmLh-ZQ" title="Solution video for part A" />);
    expect(screen.getByTestId('player').getAttribute('title')).toBe('Solution video for part A');
  });
});
