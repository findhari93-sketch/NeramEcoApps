'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@neram/ui';
import Watermark from './Watermark';
import Html5Surface from './transports/Html5Surface';
import YouTubeSurface from './transports/YouTubeSurface';
import ControlBar from './controls/ControlBar';
import CenterOverlay from './controls/CenterOverlay';
import CheckpointNotice from './controls/CheckpointNotice';
import Nudge from './controls/Nudge';
import TitleBar from './controls/TitleBar';
import type { SeekMark } from './controls/SeekBar';
import { VIDEO_OVERLAY_DIALOG_ATTR, isInsideVideoOverlayDialog } from './overlay-dialog';
import useFullscreen, { PSEUDO_FULLSCREEN_Z_INDEX } from './hooks/useFullscreen';
import usePlayerChrome from './hooks/usePlayerChrome';
import useBuffered from './hooks/useBuffered';
import useVolume from './hooks/useVolume';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import useTouchGestures from './hooks/useTouchGestures';
import { clamp } from './format';
import type { VideoGate } from '@/lib/video-gate';
import type { TextTrackDescriptor, VideoSource, VideoSurfaceEvents, VideoTransport } from './types';

/**
 * The one video player in Nexus.
 *
 * Every video a student sees goes through here: gated class recaps, gated
 * Foundation chapters, and ungated library clips. The chrome, the watermark, the
 * anti-skip behaviour and the progress reporting are written once, so a fix to
 * any of them reaches every screen. Before this there were nine files rendering
 * video, the gating rules were written out four times, and the YouTube copy of
 * them was a release behind.
 *
 * What it does NOT do is decide the rules. `gate` comes in already computed by
 * lib/video-gate.ts, which is pure and tested on its own. This component only
 * enforces what it is handed:
 *
 *   1. Every control that can move the playhead calls `requestSeek`, which
 *      clamps to `gate.seekCeiling` before the transport ever sees it. The scrub
 *      bar additionally cannot express the gesture: its thumb sticks at the lock.
 *   2. Any seek arriving another way (console, OS media key, a surface we do not
 *      control) is snapped back on `seeked`, before the frame it jumped to is
 *      painted, and on the next tick for the YouTube path which has no `seeked`.
 *   3. Playback pauses at the boundary and asks the caller to open the quiz.
 *      There is deliberately no "already fired" latch: a failed quiz fetch must
 *      not retire the checkpoint.
 *   4. The rate ceiling is enforced on the element, not just in the UI, because
 *      the rate can be changed from a console without touching our buttons.
 *
 * FOUR RULES FOR THE FILES UNDER controls/ AND hooks/, so enforcement stays in
 * one place as this grows:
 *
 *   a. Nothing under controls/ imports VideoTransport or touches transportRef.
 *      This file is the only one that calls seek/play/pause/setRate/setVolume.
 *   b. Nothing under controls/ imports VideoGate. They receive the two numbers
 *      they need and may not recompute a boundary.
 *   c. clampIfBeyond lives here and is the only snap-back.
 *   d. Every seek-producing hook takes a single onSeek prop, and this file passes
 *      it a function that has already clamped.
 *
 * Rule (a) is enforced by ESLint, not by good intentions: see the
 * no-restricted-syntax entry for src/components/video/{controls,hooks}.
 *
 * None of this is a security boundary, and it does not pretend to be. Anyone
 * with devtools can call play() at any rate they like. The real guarantees are
 * server-side: the quiz route decides whether a checkpoint is passed, and the
 * byte proxy decides who gets the file at all.
 */

/** Ordinary playback overshoots the boundary slightly; do not fight it. */
const SEEK_TOLERANCE_SECONDS = 2;
/** Filtered by `gate.maxRate`, so an owed checkpoint leaves only 1x. */
const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export interface NeramVideoPlayerProps {
  source: VideoSource;
  gate: VideoGate;
  /** Identity burned over the picture. Omit for staff preview. */
  watermark?: { name: string; code: string } | null;
  /** Shown over the picture in fullscreen only. */
  title?: string;
  /** Where to pick up. Always re-clamped to the gate, never trusted as stored. */
  resumeAt?: number;
  /** Checkpoint positions drawn on the scrub bar. */
  marks?: SeekMark[];
  /**
   * A caption track, served through the same grant as the bytes. HTML5 only:
   * YouTube's captions live inside its iframe and are not enumerable.
   */
  captions?: { src: string; label: string; lang: string } | null;
  onTimeUpdate?: (seconds: number, duration: number) => void;
  /** Playback reached the end of the checkpoint the student owes. */
  onCheckpointReached?: () => void;
  onLoadedMetadata?: (duration: number) => void;
  /** A skip was refused. Counted server-side as a watch-honesty signal. */
  onBlockedSeek?: () => void;
  onError?: () => void;
  allowFullscreen?: boolean;
  /**
   * Off by default, and it must stay off wherever the video is gated or
   * watermarked. A PiP window is drawn by the OS: the watermark is a DOM sibling
   * and does not travel into it, the control bar is gone, and the window has its
   * own seek. The player refuses to honour this when there is a watermark or a
   * ceiling, so a caller cannot enable it by mistake.
   */
  allowPictureInPicture?: boolean;
  /**
   * Fires with the player's container while it is fullscreen by either route,
   * native or the CSS fallback, and null otherwise. Hand it to a useState setter
   * and pass the result to QuizModal's `container`.
   *
   * Required in practice for any gated caller. In native fullscreen the browser
   * paints only the fullscreen element's subtree, so a quiz portalled to
   * document.body does not render: the student hits a checkpoint, playback
   * pauses, and nothing appears. If a gated caller omits this, the player exits
   * fullscreen at the boundary rather than showing them a dead screen.
   */
  onFullscreenChange?: (el: HTMLElement | null) => void;
  /** For callers that already hold a video element ref. HTML5 sources only. */
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  /**
   * Filled in with the live transport so a parent can drive playback, whichever
   * source is in use. This is how the checkpoint list's "Watch" buttons work on
   * both paths; previously each player registered its own global handle and the
   * YouTube one had a different set of methods.
   */
  transportRef?: React.MutableRefObject<VideoTransport | null>;
  /**
   * The raw YT.Player, for the one caller that needs more than the transport
   * exposes: the Library's watch tracker attaches to a player instance. YouTube
   * sources only.
   */
  youtubePlayerRef?: React.MutableRefObject<any>;
}

export default function NeramVideoPlayer({
  source,
  gate,
  watermark,
  title,
  resumeAt = 0,
  marks,
  captions = null,
  onTimeUpdate,
  onCheckpointReached,
  onLoadedMetadata,
  onBlockedSeek,
  onError,
  allowFullscreen = false,
  allowPictureInPicture = false,
  onFullscreenChange,
  videoRef,
  transportRef: externalTransportRef,
  youtubePlayerRef,
}: NeramVideoPlayerProps) {
  const internalTransportRef = useRef<VideoTransport | null>(null);
  const transportRef = externalTransportRef ?? internalTransportRef;
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [buffering, setBuffering] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);
  const [pipActive, setPipActive] = useState(false);
  const [tracks, setTracks] = useState<ReadonlyArray<TextTrackDescriptor>>([]);
  const [activeTrack, setActiveTrack] = useState<string | null>(null);

  // A PiP window escapes the watermark and the control bar, so the decision is
  // not left to the caller alone: a gated or watermarked video refuses it here.
  const pipPermitted =
    allowPictureInPicture && !watermark && !Number.isFinite(gate.seekCeiling);

  const chrome = usePlayerChrome(playing);
  const volume = useVolume(transportRef);
  const buffered = useBuffered(transportRef, duration > 0);
  const fullscreen = useFullscreen(containerRef, {
    enabled: allowFullscreen,
    onHostChange: onFullscreenChange,
  });

  // Read inside listeners that are registered once, so they always see the
  // latest gate without re-registering on every render.
  const gateRef = useRef(gate);
  gateRef.current = gate;
  const cbRef = useRef({ onTimeUpdate, onCheckpointReached, onLoadedMetadata, onBlockedSeek, onError, onFullscreenChange });
  cbRef.current = { onTimeUpdate, onCheckpointReached, onLoadedMetadata, onBlockedSeek, onError, onFullscreenChange };
  const resumeRef = useRef(resumeAt);
  resumeRef.current = resumeAt;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const flash = useCallback((msg: string) => {
    setNudge(msg);
    setTimeout(() => setNudge(null), 2200);
  }, []);
  const flashRef = useRef(flash);
  flashRef.current = flash;

  /**
   * The one clamp every control goes through. Rule (d).
   *
   * A refused seek lands ON the boundary rather than being dropped: that is
   * where the checkpoint opens, and a control that does nothing at all reads as
   * broken.
   */
  const requestSeek = useCallback(
    (seconds: number) => {
      const transport = transportRef.current;
      if (!transport) return;
      const ceiling = gateRef.current.seekCeiling;
      const upper = Number.isFinite(ceiling) ? ceiling : duration || seconds;
      const target = clamp(seconds, 0, upper);
      if (Number.isFinite(ceiling) && seconds > ceiling + 0.5) {
        flashRef.current('Finish this section before skipping ahead.');
        cbRef.current.onBlockedSeek?.();
      }
      transport.seek(target);
      setCurrent(target);
    },
    [transportRef, duration],
  );

  /**
   * Snap a seek back to the ceiling. Shared by the `seeked` listener (the <video>
   * path, which catches it before the frame paints) and the tick handler (the
   * YouTube path, which has no seeked event and can only poll).
   *
   * This is the second line of defence, not the first. The scrub bar and
   * requestSeek make the skip unexpressible; this catches whatever arrives from
   * a console, an OS media key, or a surface we do not control.
   */
  const clampIfBeyond = useCallback(
    (time: number): boolean => {
      const ceiling = gateRef.current.seekCeiling;
      if (!Number.isFinite(ceiling)) return false;
      if (time <= ceiling + SEEK_TOLERANCE_SECONDS) return false;
      transportRef.current?.seek(Math.max(0, ceiling));
      flashRef.current('Finish this section before skipping ahead.');
      cbRef.current.onBlockedSeek?.();
      return true;
    },
    [transportRef],
  );

  const readTracks = useCallback(() => {
    const transport = transportRef.current;
    if (!transport) return;
    setTracks(transport.getTextTracks());
    setActiveTrack(transport.getActiveTextTrack());
  }, [transportRef]);

  const events: VideoSurfaceEvents = useMemo(
    () => ({
      onTick: (seconds, dur) => {
        setCurrent(seconds);
        if (dur > 0) setDuration(dur);
        cbRef.current.onTimeUpdate?.(seconds, dur);

        if (clampIfBeyond(seconds)) {
          transportRef.current?.pause();
          return;
        }
        // The boundary. No "already fired" latch: if playback resumes for any
        // reason it pauses again on the next tick, which is what stops a
        // checkpoint being retired by a failed quiz fetch.
        const unlocked = gateRef.current.unlockedUntil;
        if (unlocked > 0 && seconds >= unlocked) {
          transportRef.current?.pause();
          // Safety net for rule (d)'s companion: a gated caller that forgot
          // onFullscreenChange would otherwise strand the student staring at a
          // paused video with the quiz rendering into a document.body the
          // browser is not painting. Leaving fullscreen makes it visible again.
          if (!cbRef.current.onFullscreenChange && document.fullscreenElement === containerRef.current) {
            void document.exitFullscreen?.()?.catch(() => {});
          }
          cbRef.current.onCheckpointReached?.();
        }
      },
      onSeeked: (seconds) => {
        clampIfBeyond(seconds);
      },
      onPlayingChange: setPlaying,
      onLoadedMetadata: (dur) => {
        setDuration(dur);
        cbRef.current.onLoadedMetadata?.(dur);
        volumeRef.current.applyToTransport();
        readTracks();
        // Clamped to the boundary, not trusted as stored. The old inline player
        // banked whatever position the student dragged the native scrubber to,
        // so restoring it verbatim would hand the skip straight back.
        const unlocked = gateRef.current.unlockedUntil;
        const ceiling = unlocked > 0 ? Math.min(unlocked, dur) : dur;
        const target = Math.min(resumeRef.current, ceiling);
        if (target > 0 && target < dur - 1) transportRef.current?.seek(target);
      },
      // A checkpoint whose end runs past the file is never reached by the tick
      // handler, so without this the last quiz would simply never open.
      onEnded: () => cbRef.current.onCheckpointReached?.(),
      onRateChange: (rate) => {
        const max = gateRef.current.maxRate;
        if (rate > max) {
          transportRef.current?.setRate(max);
          setSpeed(max);
          flashRef.current('Full speed unlocks once you pass this checkpoint.');
        } else {
          setSpeed(rate);
        }
      },
      onError: () => cbRef.current.onError?.(),
      onWaiting: () => setBuffering(true),
      onPlayable: () => setBuffering(false),
      onVolumeChange: (value, muted) => volumeRef.current.syncFromSurface(value, muted),
      onPipChange: setPipActive,
      onTextTracksChange: readTracks,
    }),
    [clampIfBeyond, transportRef, readTracks],
  );

  // Pull the rate down the moment the ceiling drops, without waiting for the
  // student to touch anything.
  useEffect(() => {
    if (speed > gate.maxRate) {
      transportRef.current?.setRate(gate.maxRate);
      setSpeed(gate.maxRate);
    }
  }, [gate.maxRate, speed, transportRef]);

  // visibilitychange, deliberately not window blur. Blur also fires when the
  // quiz sheet takes focus, when devtools opens, and on every alt-tab preview,
  // and pausing on all of those is hostile. Visibility catches the real set:
  // tab switch, minimise, phone lock, app switch.
  //
  // PiP is the exception: the whole point of a PiP window is to keep watching
  // while the tab is hidden, so pausing there would break the feature we just
  // enabled.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && !document.pictureInPictureElement) {
        transportRef.current?.pause();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [transportRef]);

  const togglePlay = useCallback(() => {
    const transport = transportRef.current;
    if (!transport) return;
    if (transport.isPaused()) transport.play();
    else transport.pause();
  }, [transportRef]);

  const skip = useCallback(
    (delta: number) => {
      const transport = transportRef.current;
      if (!transport) return;
      requestSeek(transport.getTime() + delta);
    },
    [transportRef, requestSeek],
  );

  const setRate = useCallback(
    (rate: number) => {
      const capped = Math.min(rate, gateRef.current.maxRate);
      transportRef.current?.setRate(capped);
      setSpeed(capped);
    },
    [transportRef],
  );

  const cycleSpeed = useCallback(
    (direction: 1 | -1) => {
      const allowed = SPEED_OPTIONS.filter((s) => s <= gateRef.current.maxRate);
      const at = allowed.indexOf(speedRef.current);
      const next = allowed[clamp(at + direction, 0, allowed.length - 1)] ?? 1;
      setRate(next);
    },
    [setRate],
  );

  const toggleCaptions = useCallback(() => {
    const transport = transportRef.current;
    if (!transport) return;
    const available = transport.getTextTracks();
    if (!available.length) return;
    const next = transport.getActiveTextTrack() ? null : available[0].id;
    transport.setTextTrack(next);
    setActiveTrack(next);
  }, [transportRef]);

  const setTrack = useCallback(
    (id: string | null) => {
      transportRef.current?.setTextTrack(id);
      setActiveTrack(id);
    },
    [transportRef],
  );

  const togglePip = useCallback(() => {
    const transport = transportRef.current;
    if (!transport) return;
    if (pipActive) void transport.exitPictureInPicture().catch(() => {});
    else void transport.enterPictureInPicture().catch(() => {});
  }, [transportRef, pipActive]);

  /**
   * The OS media keys and the lock-screen controls are a seek path like any
   * other, and one we do not own. Registering them is what routes them through
   * the clamp; leaving them unregistered lets the platform set currentTime
   * directly, which only the `seeked` snap-back would catch, and only on the
   * HTML5 path.
   */
  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms?.setActionHandler) return;
    const time = () => transportRef.current?.getTime() ?? 0;
    try {
      ms.setActionHandler('seekforward', () => requestSeek(time() + 10));
      ms.setActionHandler('seekbackward', () => requestSeek(time() - 10));
      ms.setActionHandler('seekto', (d) => requestSeek(d.seekTime ?? time()));
      ms.setActionHandler('play', () => transportRef.current?.play());
      ms.setActionHandler('pause', () => transportRef.current?.pause());
    } catch {
      /* Older browsers reject unknown actions one at a time. */
    }
    return () => {
      try {
        ms.setActionHandler('seekforward', null);
        ms.setActionHandler('seekbackward', null);
        ms.setActionHandler('seekto', null);
        ms.setActionHandler('play', null);
        ms.setActionHandler('pause', null);
      } catch {
        /* Nothing to undo. */
      }
    };
  }, [requestSeek, transportRef]);

  useKeyboardShortcuts(containerRef, {
    enabled: true,
    // One keystroke would cross a whole gated lecture, so these bind only where
    // there is no boundary to cross.
    allowPercentageJumps: !Number.isFinite(gate.seekCeiling),
    actions: {
      togglePlay,
      seekTo: requestSeek,
      getTime: () => transportRef.current?.getTime() ?? 0,
      getDuration: () => duration,
      adjustVolume: (delta) => volume.setVolume(volume.volume + delta),
      toggleMute: volume.toggleMute,
      toggleFullscreen: fullscreen.toggle,
      toggleCaptions,
      cycleSpeed,
    },
  });

  // Restores whatever the student had chosen, not 1x: someone watching at 1.5x
  // who holds to skim should not be dropped back to normal when they let go.
  const rateBeforeHold = useRef(1);

  const gestures = useTouchGestures(containerRef, {
    toggleChrome: chrome.toggle,
    seekTo: requestSeek,
    getTime: () => transportRef.current?.getTime() ?? 0,
    getSeekCeiling: () => gate.seekCeiling,
    adjustVolume: (delta) => volume.setVolume(volume.volume + delta),
    setTemporaryRate: (rate) => {
      if (rate === null) {
        setRate(rateBeforeHold.current);
        return;
      }
      rateBeforeHold.current = speedRef.current;
      setRate(rate);
    },
    maxRate: gate.maxRate,
    volumeSettable: volume.settable,
  });

  // State rather than a read of transportRef during render: the transport does
  // not exist on the first paint, and a ref read would never re-render to show
  // the button once it does.
  const [pipSupported, setPipSupported] = useState(false);
  useEffect(() => {
    setPipSupported(pipPermitted && !!transportRef.current?.supportsPictureInPicture());
  }, [pipPermitted, duration, transportRef]);

  /**
   * Whether something has portalled a dialog into this container. The checkpoint
   * quiz does exactly that while the player is fullscreen, and once it is up it
   * explains the pause better than the notice does, so the notice steps aside
   * rather than repeating itself beside the panel.
   *
   * A MutationObserver rather than a prop, because a portal into this node is
   * not a render of this component and a caller should not have to tell the
   * player something it can see for itself.
   */
  const [overlayOpen, setOverlayOpen] = useState(false);
  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof MutationObserver === 'undefined') return;
    const read = () => setOverlayOpen(!!node.querySelector(`[${VIDEO_OVERLAY_DIALOG_ATTR}]`));
    read();
    const observer = new MutationObserver(read);
    observer.observe(node, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  /**
   * Playback has stopped at a checkpoint and nothing has covered the picture
   * yet. Derived rather than stored, so it clears itself: passing the quiz hands
   * the caller a new gate with a later boundary, and this is false on the next
   * render with no reset to forget.
   */
  const atCheckpoint =
    gate.unlockedUntil > 0 && !playing && current >= gate.unlockedUntil && !overlayOpen;

  /**
   * The quiz is a DOM child of this container while fullscreen, so its taps and
   * swipes bubble into the gesture handlers below. A swipe across the answers
   * would seek the video underneath them.
   */
  const fromOverlay = (e: React.SyntheticEvent) => isInsideVideoOverlayDialog(e.target);

  return (
    <Box
      ref={containerRef}
      tabIndex={0}
      onMouseMove={chrome.bump}
      onTouchStart={(e) => {
        if (fromOverlay(e)) return;
        chrome.bump();
        gestures.handlers.onTouchStart(e);
      }}
      onTouchMove={(e) => {
        if (fromOverlay(e)) return;
        gestures.handlers.onTouchMove(e);
      }}
      onTouchEnd={(e) => {
        if (fromOverlay(e)) return;
        gestures.handlers.onTouchEnd(e);
      }}
      onContextMenu={(e) => e.preventDefault()}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        bgcolor: '#000',
        overflow: 'hidden',
        outline: 'none',
        // The player is focusable so it can answer the keyboard at all: with
        // controls={false} a <video> is not, which is why there were no
        // shortcuts before. A visible ring is the other half of that.
        '&:focus-visible': { boxShadow: 'inset 0 0 0 3px rgba(66,165,245,0.9)' },
        // Stops iOS offering "Save Video" on a long press.
        WebkitTouchCallout: 'none',
        // NEVER add transform, filter, backdrop-filter, will-change or contain
        // to this element. Any of them makes it the containing block for its
        // fixed-position descendants, at which point `overflow: hidden` starts
        // clipping the checkpoint quiz that fullscreen portals in here.
        ...(fullscreen.isPseudo
          ? {
              position: 'fixed',
              inset: 0,
              width: '100vw',
              // dvh, not vh: on iOS Safari the toolbar eats about 60px of vh and
              // the control bar ends up under it.
              height: '100dvh',
              zIndex: PSEUDO_FULLSCREEN_Z_INDEX,
            }
          : null),
      }}
    >
      {source.kind === 'html5' ? (
        <Html5Surface
          src={source.src}
          events={events}
          transportRef={transportRef}
          videoRef={videoRef}
          onClick={togglePlay}
          allowPictureInPicture={pipPermitted}
          captions={captions}
        />
      ) : (
        <YouTubeSurface
          youtubeId={source.youtubeId}
          events={events}
          transportRef={transportRef}
          rawPlayerRef={youtubePlayerRef}
          onClick={togglePlay}
        />
      )}

      {watermark && <Watermark name={watermark.name} code={watermark.code} />}

      {title && fullscreen.isFullscreen && chrome.visible && <TitleBar title={title} />}

      {nudge && <Nudge message={nudge} />}

      {atCheckpoint && <CheckpointNotice />}

      <CenterOverlay
        playing={playing}
        buffering={buffering}
        ripple={gestures.ripple}
        holdingSpeed={gestures.holdingSpeed}
        speed={speed}
        onTogglePlay={togglePlay}
      />

      <ControlBar
        visible={chrome.visible}
        playing={playing}
        current={current}
        duration={duration}
        seekCeiling={gate.seekCeiling}
        buffered={buffered}
        marks={marks}
        onSeek={requestSeek}
        onRefusedSeek={() => {
          flash('Finish this section before skipping ahead.');
          cbRef.current.onBlockedSeek?.();
        }}
        onScrubbingChange={chrome.setScrubbing}
        onTogglePlay={togglePlay}
        onSkip={skip}
        speed={speed}
        maxRate={gate.maxRate}
        onSpeedChange={setRate}
        volume={volume.volume}
        muted={volume.muted}
        volumeSettable={volume.settable}
        onVolumeChange={volume.setVolume}
        onToggleMute={volume.toggleMute}
        tracks={tracks}
        activeTrack={activeTrack}
        onTrackChange={setTrack}
        showFullscreen={allowFullscreen}
        isFullscreen={fullscreen.isFullscreen}
        onToggleFullscreen={fullscreen.toggle}
        showPip={pipSupported}
        pipActive={pipActive}
        onTogglePip={togglePip}
        menuContainer={fullscreen.isFullscreen ? containerRef.current : null}
      />
    </Box>
  );
}
