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

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  // The showcase clock runs on requestAnimationFrame + performance.now(), so fake those too.
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
  });
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

    advance(SCENE_DURATION_MS - 100);
    expect(screen.getByText('scenes.review.caption')).toBeTruthy();
    advance(100);
    expect(screen.getByText('scenes.revise.caption')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'pause' }));
    expect(screen.getByRole('button', { name: 'play' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'eyebrow' }).getAttribute('data-motion')).toBe('paused');
    advance(SCENE_DURATION_MS * 2);
    expect(screen.getByText('scenes.revise.caption')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    expect(screen.getByText('scenes.predict.caption')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'previous' }));
    expect(screen.getByText('scenes.review.caption')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'play' }));
    expect(screen.getByRole('region', { name: 'eyebrow' }).getAttribute('data-motion')).toBe('play');
    advance(SCENE_DURATION_MS);
    expect(screen.getByText('scenes.revise.caption')).toBeTruthy();
  });

  it('wraps from the last scene back to the first', () => {
    render(<NexusShowcase />);
    fireEvent.click(screen.getByRole('button', { name: 'previous' }));
    expect(screen.getByText('scenes.live.caption')).toBeTruthy();
    advance(SCENE_DURATION_MS);
    expect(screen.getByText('scenes.review.caption')).toBeTruthy();
  });

  it('jumps to a scene from the tour segments and restarts its clock', () => {
    render(<NexusShowcase />);
    advance(SCENE_DURATION_MS / 2);
    const tab = screen.getByRole('tab', { name: 'scenes.library.label' });
    fireEvent.click(tab);
    expect(screen.getByText('scenes.library.caption')).toBeTruthy();
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tablist', { name: 'tour' })).toBeTruthy();

    // A full interval from the jump, not from the start of the old scene.
    advance(SCENE_DURATION_MS - 100);
    expect(screen.getByText('scenes.library.caption')).toBeTruthy();
    advance(100);
    expect(screen.getByText('scenes.sketchbook.caption')).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(screen.getByText('scenes.live.caption')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Home' });
    expect(screen.getByText('scenes.review.caption')).toBeTruthy();
  });

  it('scales the interval with sceneSeconds', () => {
    render(<NexusShowcase sceneSeconds={4} />);
    advance(4600 - 100);
    expect(screen.getByText('scenes.review.caption')).toBeTruthy();
    // 4.6s is not a whole number of 16ms frames; the switch lands on the next frame.
    advance(100 + 16);
    expect(screen.getByText('scenes.revise.caption')).toBeTruthy();
  });

  it('does not auto-advance under prefers-reduced-motion, but the arrows still work', () => {
    mockMatchMedia(true);
    render(<NexusShowcase />);
    advance(SCENE_DURATION_MS * 3);
    expect(screen.getByText('scenes.review.caption')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'eyebrow' }).getAttribute('data-motion')).toBe('off');
    // Every scene is drawn in its final state: the Review voice note reads 0:24.
    expect(screen.getByText('0:24')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    expect(screen.getByText('scenes.revise.caption')).toBeTruthy();
    expect(screen.getByText('5.0')).toBeTruthy();
  });

  it('plays a film instead of the scenes when one is given', () => {
    const { container } = render(<NexusShowcase videoSrc="/films/nexus.mp4" />);
    expect(container.querySelector('video')?.getAttribute('src')).toBe('/films/nexus.mp4');
    expect(screen.queryByText('scenes.review.caption')).toBeNull();
    expect(screen.queryByRole('button', { name: 'next' })).toBeNull();
  });
});
