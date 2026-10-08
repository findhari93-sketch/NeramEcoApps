import { act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import NexusShowcase, { SCENE_DURATION_MS } from './NexusShowcase';

function mockMatchMedia(reducedMotion: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reducedMotion && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('NexusShowcase', () => {
  it('advances one scene per interval, stops on pause and jumps with the arrows', () => {
    render(<NexusShowcase />);
    expect(screen.getByText('scenes.review.caption')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(SCENE_DURATION_MS);
    });
    expect(screen.getByText('scenes.revise.caption')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'pause' }));
    expect(screen.getByRole('button', { name: 'play' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(SCENE_DURATION_MS * 2);
    });
    expect(screen.getByText('scenes.revise.caption')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    expect(screen.getByText('scenes.predict.caption')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'previous' }));
    expect(screen.getByText('scenes.review.caption')).toBeTruthy();
  });

  it('wraps from the last scene back to the first', () => {
    render(<NexusShowcase />);
    fireEvent.click(screen.getByRole('button', { name: 'previous' }));
    expect(screen.getByText('scenes.live.caption')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(SCENE_DURATION_MS);
    });
    expect(screen.getByText('scenes.review.caption')).toBeTruthy();
  });

  it('does not auto-advance under prefers-reduced-motion, but the arrows still work', () => {
    mockMatchMedia(true);
    render(<NexusShowcase />);
    act(() => {
      vi.advanceTimersByTime(SCENE_DURATION_MS * 3);
    });
    expect(screen.getByText('scenes.review.caption')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'eyebrow' }).getAttribute('data-motion')).toBe('off');
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    expect(screen.getByText('scenes.revise.caption')).toBeTruthy();
  });

  it('plays a film instead of the scenes when one is given', () => {
    const { container } = render(<NexusShowcase videoSrc="/films/nexus.mp4" />);
    expect(container.querySelector('video')?.getAttribute('src')).toBe('/films/nexus.mp4');
    expect(screen.queryByText('scenes.review.caption')).toBeNull();
    expect(screen.queryByRole('button', { name: 'next' })).toBeNull();
  });
});
