import { render, act } from '@testing-library/react';
import { createRef } from 'react';
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';
import NeramVideoPlayer from './NeramVideoPlayer';
import type { VideoGate } from '@/lib/video-gate';

/**
 * The gate a student actually meets, carried over wholesale from
 * ProtectedVideo.test.tsx when that component became the shared player.
 *
 * The bug being prevented: the inline recap player shipped a native
 * <video controls>, so dragging the scrubber past a checkpoint opened the quiz
 * with nothing watched, and because the playhead was never pulled back, passing
 * that one quiz fired every later checkpoint in turn. The whole recap could be
 * cleared in about thirty seconds.
 *
 * These assertions are unchanged from that suite. Only the setup differs: the
 * bounds now arrive as a computed gate rather than as loose numbers, because
 * working out where the boundary is now happens once, in lib/video-gate.ts.
 */

const WATERMARK = { name: 'Test Student', code: 'NX-ABC123' };

/** A gate as computeGate would return it, without needing checkpoint fixtures. */
function gateFor({ unlocked = 120, passed = false }: { unlocked?: number; passed?: boolean } = {}): VideoGate {
  return {
    unlockedUntil: unlocked,
    seekCeiling: unlocked > 0 ? unlocked : Number.POSITIVE_INFINITY,
    activeCheckpointId: passed ? null : 'cp',
    currentSegmentPassed: passed,
    maxRate: passed ? 1.5 : 1,
    allPassed: passed,
  };
}

/** jsdom does not implement playback, so give the element a real backing store. */
function instrument(video: HTMLVideoElement, duration = 600) {
  let time = 0;
  let paused = true;
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => time,
    set: (v: number) => {
      time = v;
    },
  });
  Object.defineProperty(video, 'duration', { configurable: true, get: () => duration });
  Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
  video.play = vi.fn(() => {
    paused = false;
    return Promise.resolve();
  });
  video.pause = vi.fn(() => {
    paused = true;
  });
  return {
    seekTo: (v: number) => {
      time = v;
    },
    isPaused: () => paused,
    now: () => time,
  };
}

function fire(video: HTMLVideoElement, type: string) {
  act(() => {
    video.dispatchEvent(new Event(type));
  });
}

beforeAll(() => {
  // Referenced by the controls-fade timer and the nudge toast.
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

beforeEach(() => {
  vi.clearAllMocks();
});

function setup(
  opts: { unlocked?: number; passed?: boolean; resumeAt?: number; onLoadedMetadata?: () => void } = {},
) {
  const ref = createRef<HTMLVideoElement>() as React.MutableRefObject<HTMLVideoElement | null>;
  const onCheckpointReached = vi.fn();
  const onTimeUpdate = vi.fn();
  const onBlockedSeek = vi.fn();
  const gate = gateFor(opts);
  const utils = render(
    <NeramVideoPlayer
      source={{ kind: 'html5', src: 'blob:stream' }}
      gate={gate}
      videoRef={ref}
      watermark={WATERMARK}
      resumeAt={opts.resumeAt}
      onCheckpointReached={onCheckpointReached}
      onTimeUpdate={onTimeUpdate}
      onBlockedSeek={onBlockedSeek}
      onLoadedMetadata={opts.onLoadedMetadata}
    />,
  );
  const video = ref.current!;
  const ctl = instrument(video, 600);
  return { ...utils, video, ctl, ref, gate, onCheckpointReached, onTimeUpdate, onBlockedSeek };
}

describe('NeramVideoPlayer: the scrub track cannot express a skip', () => {
  it('bounds the slider at the unlocked checkpoint, not the duration', () => {
    const { container, video } = setup({ unlocked: 120 });
    fire(video, 'loadedmetadata'); // duration 600
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
    expect(Number(slider.max)).toBe(120);
  });

  it('grows the track only as far as the next checkpoint when one is passed', () => {
    const { container, video, rerender, ref } = setup({ unlocked: 120 });
    fire(video, 'loadedmetadata');
    rerender(
      <NeramVideoPlayer
        source={{ kind: 'html5', src: 'blob:stream' }}
        gate={gateFor({ unlocked: 300 })}
        videoRef={ref}
        watermark={WATERMARK}
      />,
    );
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(Number(slider.max)).toBe(300);
    expect(Number(slider.max)).toBeLessThan(600);
  });

  it('never offers native controls, download, or picture in picture', () => {
    const { video } = setup();
    // controls={false} means the attribute is absent, which is what matters:
    // the native scrubber is the thing that let a student drag past a gate.
    expect(video.hasAttribute('controls')).toBe(false);
    expect(video.getAttribute('controlslist')).toContain('nodownload');
    expect(video.hasAttribute('disablepictureinpicture')).toBe(true);
  });
});

describe('NeramVideoPlayer: a seek that arrives another way is snapped back', () => {
  it('pulls the playhead back to the boundary on seeked', () => {
    const { video, ctl } = setup({ unlocked: 120 });
    ctl.seekTo(500);
    fire(video, 'seeked');
    expect(ctl.now()).toBe(120);
  });

  it('forgives a two second overshoot so ordinary playback is not fought', () => {
    const { video, ctl } = setup({ unlocked: 120 });
    ctl.seekTo(121);
    fire(video, 'seeked');
    expect(ctl.now()).toBe(121);
  });

  it('does not let a banked position raise the limit above the boundary', () => {
    // The regression this guards: the old inline player banked whatever position
    // the student dragged to, and that value was fed back in as `furthest`,
    // which was OR'd into the seek limit. A skip could therefore authorise
    // itself on the next visit. computeGate now refuses to read it at all.
    const { video, ctl } = setup({ unlocked: 120 });
    ctl.seekTo(3000);
    fire(video, 'seeked');
    expect(ctl.now()).toBe(120);
  });

  it('reports a refused skip so it can be counted against the student', () => {
    const { video, ctl, onBlockedSeek } = setup({ unlocked: 120 });
    ctl.seekTo(500);
    fire(video, 'seeked');
    expect(onBlockedSeek).toHaveBeenCalledTimes(1);
  });
});

describe('NeramVideoPlayer: the boundary holds', () => {
  it('pauses and opens the quiz when playback reaches the checkpoint', () => {
    const { video, ctl, onCheckpointReached } = setup({ unlocked: 120 });
    ctl.seekTo(120.5);
    fire(video, 'timeupdate');
    expect(ctl.isPaused()).toBe(true);
    expect(onCheckpointReached).toHaveBeenCalledTimes(1);
  });

  it('re-fires if playback somehow resumes, because there is no one-shot latch', () => {
    // The old player latched each checkpoint as "triggered" on first fire. A
    // failed quiz fetch, or a play press during the async gap, retired that
    // checkpoint for the rest of the session and the student sailed past it.
    const { video, ctl, onCheckpointReached } = setup({ unlocked: 120 });
    ctl.seekTo(120.5);
    fire(video, 'timeupdate');
    video.play();
    ctl.seekTo(121);
    fire(video, 'timeupdate');
    expect(onCheckpointReached).toHaveBeenCalledTimes(2);
    expect(ctl.isPaused()).toBe(true);
  });

  it('opens the last quiz when a checkpoint end runs past the file', () => {
    // A recording trimmed after the recap was built. The boundary is never
    // reached by playback, so without the ended fallback the video just stops
    // and the final checkpoint never opens.
    const { video, onCheckpointReached } = setup({ unlocked: 9999 });
    fire(video, 'ended');
    expect(onCheckpointReached).toHaveBeenCalledTimes(1);
  });

  it('reports progress upward on every tick', () => {
    const { video, ctl, onTimeUpdate } = setup({ unlocked: 120 });
    ctl.seekTo(30);
    fire(video, 'timeupdate');
    expect(onTimeUpdate).toHaveBeenCalledWith(30, 600);
  });
});

describe('NeramVideoPlayer: resuming', () => {
  it('clamps a stored resume point to the boundary', () => {
    // resume_at is whatever the player last banked. The old inline player could
    // bank a position past an unpassed checkpoint, so restoring it verbatim
    // would drop the student straight back where they should not be.
    const { video, ctl } = setup({ unlocked: 120, resumeAt: 400 });
    fire(video, 'loadedmetadata');
    expect(ctl.now()).toBe(120);
  });

  it('honours a resume point that is inside the unlocked stretch', () => {
    const { video, ctl } = setup({ unlocked: 300, resumeAt: 90 });
    fire(video, 'loadedmetadata');
    expect(ctl.now()).toBe(90);
  });

  it('reports the duration it found', () => {
    const onLoadedMetadata = vi.fn();
    const { video } = setup({ onLoadedMetadata });
    fire(video, 'loadedmetadata');
    expect(onLoadedMetadata).toHaveBeenCalledWith(600);
  });
});

describe('NeramVideoPlayer: speed', () => {
  it('holds the rate at 1x until the checkpoint is passed', () => {
    const { video } = setup({ passed: false });
    video.playbackRate = 2;
    fire(video, 'ratechange');
    expect(video.playbackRate).toBe(1);
  });

  it('allows faster revision once every checkpoint is passed', () => {
    const { video } = setup({ passed: true });
    video.playbackRate = 1.5;
    fire(video, 'ratechange');
    expect(video.playbackRate).toBe(1.5);
  });
});
