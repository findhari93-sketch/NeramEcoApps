import { render, act, screen, fireEvent } from '@testing-library/react';
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

/** The scrub bar reads a real rect. jsdom lays nothing out, so supply one. */
const RAIL_WIDTH = 600;
function railAt(): HTMLElement {
  const rail = screen.getByTestId('seek-rail');
  rail.getBoundingClientRect = () =>
    ({ left: 0, width: RAIL_WIDTH, top: 0, height: 44, right: RAIL_WIDTH, bottom: 44, x: 0, y: 0 }) as DOMRect;
  return rail;
}

/** clientX for a given time, given the stubbed rect and a 600s video. */
function xForSeconds(seconds: number, duration = 600): number {
  return (seconds / duration) * RAIL_WIDTH;
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
  // jsdom implements neither, and the scrub bar captures the pointer so a drag
  // that leaves the element keeps tracking.
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  // jsdom has no PointerEvent either, and without it testing-library falls back
  // to a bare Event, so clientX never reaches the handler and every pointer test
  // silently seeks to zero. MouseEvent carries the coordinates.
  if (!(window as unknown as { PointerEvent?: unknown }).PointerEvent) {
    (window as unknown as { PointerEvent: unknown }).PointerEvent = window.MouseEvent;
  }
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
  /**
   * These two replace a pair that asserted `slider.max === 120` on the MUI
   * Slider this bar grew out of. That Slider ended AT the boundary, which made
   * the skip unexpressible but also hid the rest of the lecture: a student saw a
   * bar that stopped early with no explanation.
   *
   * The bar now spans the whole video and draws the lock, so `max` is the real
   * duration and is no longer where the guarantee lives. These assert the
   * guarantee itself instead: the playhead does not move past the boundary. That
   * is what the original bug actually was, so this is the stronger test.
   */
  it('shows the whole video and says where the lock is', () => {
    const { video } = setup({ unlocked: 120 });
    fire(video, 'loadedmetadata'); // duration 600
    const bar = screen.getByRole('slider', { name: /seek/i });
    expect(Number(bar.getAttribute('aria-valuemax'))).toBe(600);
    expect(bar.getAttribute('aria-valuetext')).toContain('Locked after 2 minutes');
    expect(screen.getByTestId('seek-locked-region')).toBeTruthy();
  });

  it('refuses to move the playhead past the boundary, however it is asked', () => {
    const { video, ctl, onBlockedSeek } = setup({ unlocked: 120 });
    fire(video, 'loadedmetadata');
    act(() => {
      fireEvent.keyDown(railAt(), { key: 'End' });
    });
    expect(ctl.now()).toBe(120);
    expect(ctl.now()).toBeLessThan(600);
    expect(onBlockedSeek).toHaveBeenCalledTimes(1);
  });

  it('grows the reachable stretch when a checkpoint is passed, but no further', () => {
    const { video, ctl, rerender, ref } = setup({ unlocked: 120 });
    fire(video, 'loadedmetadata');
    rerender(
      <NeramVideoPlayer
        source={{ kind: 'html5', src: 'blob:stream' }}
        gate={gateFor({ unlocked: 300 })}
        videoRef={ref}
        watermark={WATERMARK}
      />,
    );
    act(() => {
      fireEvent.keyDown(railAt(), { key: 'End' });
    });
    expect(ctl.now()).toBe(300);
    expect(ctl.now()).toBeLessThan(600);
  });

  it('lands a pointer press in the locked region on the boundary, not past it', () => {
    const { video, ctl, onBlockedSeek } = setup({ unlocked: 120 });
    fire(video, 'loadedmetadata');
    const rail = railAt();
    act(() => {
      fireEvent.pointerDown(rail, { pointerId: 1, clientX: xForSeconds(500) });
      fireEvent.pointerUp(rail, { pointerId: 1, clientX: xForSeconds(500) });
    });
    expect(ctl.now()).toBe(120);
    expect(onBlockedSeek).toHaveBeenCalled();
  });

  it('honours a press inside the unlocked stretch', () => {
    const { video, ctl, onBlockedSeek } = setup({ unlocked: 300 });
    fire(video, 'loadedmetadata');
    const rail = railAt();
    act(() => {
      fireEvent.pointerDown(rail, { pointerId: 1, clientX: xForSeconds(60) });
      fireEvent.pointerUp(rail, { pointerId: 1, clientX: xForSeconds(60) });
    });
    expect(ctl.now()).toBe(60);
    expect(onBlockedSeek).not.toHaveBeenCalled();
  });

  it('counts one refusal for a whole drag, not one per pointermove', () => {
    // useVideoProgress treats refusals as a watch-honesty signal. Committing on
    // every move would post them in the dozens for a single gesture, which is
    // why pointermove updates a local value and only pointerup commits.
    const { video, onBlockedSeek } = setup({ unlocked: 120 });
    fire(video, 'loadedmetadata');
    const rail = railAt();
    act(() => {
      fireEvent.pointerDown(rail, { pointerId: 1, clientX: xForSeconds(100) });
      fireEvent.pointerMove(rail, { pointerId: 1, clientX: xForSeconds(200) });
      fireEvent.pointerMove(rail, { pointerId: 1, clientX: xForSeconds(350) });
      fireEvent.pointerMove(rail, { pointerId: 1, clientX: xForSeconds(500) });
      fireEvent.pointerUp(rail, { pointerId: 1, clientX: xForSeconds(500) });
    });
    expect(onBlockedSeek).toHaveBeenCalledTimes(1);
  });

  it('reads the ceiling live, so a drag cannot outrun a gate that just changed', () => {
    // The gateRef discipline exists for exactly this. A commit that closed over
    // the gate at pointerdown would use a stale boundary.
    const { video, ctl, rerender, ref } = setup({ unlocked: 120 });
    fire(video, 'loadedmetadata');
    const rail = railAt();
    act(() => {
      fireEvent.pointerDown(rail, { pointerId: 1, clientX: xForSeconds(100) });
    });
    rerender(
      <NeramVideoPlayer
        source={{ kind: 'html5', src: 'blob:stream' }}
        gate={gateFor({ unlocked: 300 })}
        videoRef={ref}
        watermark={WATERMARK}
      />,
    );
    act(() => {
      fireEvent.pointerUp(railAt(), { pointerId: 1, clientX: xForSeconds(500) });
    });
    expect(ctl.now()).toBe(300);
  });

  it('never offers native controls, download, or picture in picture', () => {
    const { video } = setup();
    // controls={false} means the attribute is absent, which is what matters:
    // the native scrubber is the thing that let a student drag past a gate.
    expect(video.hasAttribute('controls')).toBe(false);
    expect(video.getAttribute('controlslist')).toContain('nodownload');
    expect(video.hasAttribute('disablepictureinpicture')).toBe(true);
  });

  it('keeps picture in picture off even when a caller asks for it on a gated video', () => {
    // The caller does not get the final say. A PiP window is drawn by the OS:
    // the watermark does not travel into it and the control bar is gone.
    const ref = createRef<HTMLVideoElement>() as React.MutableRefObject<HTMLVideoElement | null>;
    render(
      <NeramVideoPlayer
        source={{ kind: 'html5', src: 'blob:stream' }}
        gate={gateFor({ unlocked: 120 })}
        videoRef={ref}
        watermark={WATERMARK}
        allowPictureInPicture
      />,
    );
    expect(ref.current!.hasAttribute('disablepictureinpicture')).toBe(true);
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

describe('NeramVideoPlayer: keyboard', () => {
  it('clamps a forward jump to the boundary and reports the refusal', () => {
    const { video, ctl, onBlockedSeek, container } = setup({ unlocked: 120 });
    fire(video, 'loadedmetadata');
    ctl.seekTo(115);
    const player = container.firstElementChild as HTMLElement;
    act(() => {
      fireEvent.keyDown(player, { key: 'l' }); // forward 10s, would reach 125
    });
    expect(ctl.now()).toBe(120);
    expect(onBlockedSeek).toHaveBeenCalledTimes(1);
  });

  it('does not bind percentage jumps while a checkpoint binds', () => {
    // 9 would cross a whole lecture in one keystroke. The clamp would catch it,
    // but a shortcut whose only outcome is a refusal is not a shortcut.
    const { video, ctl, container } = setup({ unlocked: 120 });
    fire(video, 'loadedmetadata');
    ctl.seekTo(30);
    act(() => {
      fireEvent.keyDown(container.firstElementChild as HTMLElement, { key: '9' });
    });
    expect(ctl.now()).toBe(30);
  });

  it('is reachable by keyboard at all', () => {
    // With controls={false} the <video> is not focusable, which is why there
    // were no shortcuts before this. The container carries the tabindex.
    const { container } = setup();
    expect((container.firstElementChild as HTMLElement).getAttribute('tabindex')).toBe('0');
  });
});

describe('NeramVideoPlayer: fullscreen host', () => {
  it('publishes nothing while it is not fullscreen', () => {
    const onFullscreenChange = vi.fn();
    const ref = createRef<HTMLVideoElement>() as React.MutableRefObject<HTMLVideoElement | null>;
    render(
      <NeramVideoPlayer
        source={{ kind: 'html5', src: 'blob:stream' }}
        gate={gateFor({ unlocked: 120 })}
        videoRef={ref}
        watermark={WATERMARK}
        allowFullscreen
        onFullscreenChange={onFullscreenChange}
      />,
    );
    // The quiz must portal to document.body until there is a fullscreen subtree
    // to portal into. null is how the caller is told that.
    expect(onFullscreenChange).toHaveBeenCalledWith(null);
  });

  it('clears the host on unmount, so a caller cannot portal into a dead node', () => {
    const onFullscreenChange = vi.fn();
    const ref = createRef<HTMLVideoElement>() as React.MutableRefObject<HTMLVideoElement | null>;
    const { unmount } = render(
      <NeramVideoPlayer
        source={{ kind: 'html5', src: 'blob:stream' }}
        gate={gateFor({ unlocked: 120 })}
        videoRef={ref}
        watermark={WATERMARK}
        allowFullscreen
        onFullscreenChange={onFullscreenChange}
      />,
    );
    onFullscreenChange.mockClear();
    unmount();
    expect(onFullscreenChange).toHaveBeenCalledWith(null);
  });
});

describe('NeramVideoPlayer: buffering', () => {
  it('shows a spinner while the proxy stalls, and clears it when data arrives', () => {
    // The byte proxy answers at most 4MB per request, so a weak connection
    // stalls often. With nothing on screen a stall looked like a freeze, and a
    // reload throws away the buffer and starts the stall again.
    const { video } = setup();
    fire(video, 'waiting');
    expect(screen.getByRole('status', { name: /buffering/i })).toBeTruthy();
    fire(video, 'playing');
    expect(screen.queryByRole('status', { name: /buffering/i })).toBeNull();
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
