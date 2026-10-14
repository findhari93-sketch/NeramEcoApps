'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@neram/ui';
import Watermark from './Watermark';
import Html5Surface from './transports/Html5Surface';
import YouTubeSurface from './transports/YouTubeSurface';
import ControlBar from './controls/ControlBar';
import CenterOverlay from './controls/CenterOverlay';
import CheckpointNotice from './controls/CheckpointNotice';
import WatchMoreNotice from './controls/WatchMoreNotice';
import CatchUpChip from './controls/CatchUpChip';
import StreamStoppedNotice from './controls/StreamStoppedNotice';
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
import { clamp, type TimeRange } from './format';
import type { VideoGate } from '@/lib/video-gate';
import type { PlayedRange } from '@/lib/played-ranges';
import { armAndConfirm, grantTtlFromSrc } from '@/lib/video-grant-client';
import { createStepClassifier } from '@/lib/playback-steps';
import type {
  PlaybackEvent,
  TextTrackDescriptor,
  VideoSource,
  VideoSurfaceEvents,
  VideoTransport,
} from './types';

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
 *      That ceiling is the checkpoint, so the owed section is free to drag
 *      through; what a drag cannot buy is the quiz (`gate.quizReady`, NXS-0130).
 *   2. Any seek arriving another way (console, OS media key, a surface we do not
 *      control) is snapped back to the checkpoint boundary on `seeked`, before
 *      the frame it jumped to is painted, and on the next tick for the YouTube
 *      path which has no `seeked`. The boundary, not the played point: that one
 *      trails the playhead by a render while it plays, and snapping to it would
 *      yank a student back mid-sentence.
 *   3. Playback pauses at the boundary and asks the caller to open the quiz, or,
 *      when too little of the section was played, says so and offers the part
 *      that was skipped. There is deliberately no "already fired" latch: a
 *      failed quiz fetch must not retire the checkpoint.
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

/**
 * Renewals in a row that may pass without the picture moving. It bounds a
 * genuinely dead recording, not a long class: real playback refills it.
 */
const MAX_STREAM_RECOVERIES = 4;
/** Played this far past the point a renewal resumed at, the new stream works. */
const RECOVERY_PROGRESS_SECONDS = 3;
/**
 * A stream this old may have outlived its grant (ten minutes), so a long stall
 * on it is treated as expiry even without an error event. A younger stream that
 * stalls is just a slow connection, and reloading would throw its buffer away.
 */
const STALE_STREAM_MS = 9 * 60_000;
const STALL_RECOVERY_MS = 20_000;
/**
 * Fetch the next grant this long before the current one runs out. Generous on
 * purpose: a slow sign-in token or a sleepy phone radio can take a while, and
 * an early refresh costs nothing.
 */
const GRANT_REFRESH_LEAD_MS = 2 * 60_000;
/**
 * When the browser will not send the grant cookie, the fresh URL is swapped in
 * at the next pause, or this close to expiry if the student never pauses.
 */
const GRANT_SWAP_LEAD_MS = 20_000;
/** A stall once the grant has run out is expiry, not a slow connection. */
const EXPIRED_STALL_MS = 4_000;
/** A refresh that failed (offline, sign-in hiccup) is not retried every tick. */
const GRANT_REFRESH_RETRY_MS = 30_000;
const STREAM_STOPPED_MESSAGE = 'The recording stopped loading.';
/** A move past the checkpoint. The section before it is free; past it is not. */
const LOCKED_MESSAGE = 'Pass this checkpoint quiz to go further.';

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
  /** Stretches already played, drawn on the scrub bar (see usePlayedRanges). */
  watched?: ReadonlyArray<TimeRange>;
  /**
   * A caption track, served through the same grant as the bytes. HTML5 only:
   * YouTube's captions live inside its iframe and are not enumerable.
   *
   * Pass `src` as a function of the stream URL when the track rides the
   * stream's grant, so it follows the stream when the player renews it. A
   * fixed string would keep pointing at the grant that just expired.
   */
  captions?: {
    src: string | ((streamSrc: string) => string | null);
    label: string;
    lang: string;
  } | null;
  /**
   * Never told about the 0:00 a stream reports while it is being renewed: that
   * is the reload, not the student, and a progress heartbeat would save it.
   */
  onTimeUpdate?: (seconds: number, duration: number) => void;
  /**
   * A stretch the student really played, decided here once for every caller
   * (lib/playback-steps.ts): a step counts when real time passed behind it, so
   * a drag never arrives and a late tick on a busy phone still does. This is
   * what the quiz gate and the saved record should grow from.
   */
  onPlayedSpan?: (from: number, to: number) => void;
  /** Stalls, reloads, grant top-ups and discarded jumps, for the heartbeat. */
  onPlaybackEvent?: (event: PlaybackEvent) => void;
  /** Playback reached the end of the checkpoint the student owes. */
  onCheckpointReached?: () => void;
  onLoadedMetadata?: (duration: number) => void;
  /** A skip was refused. Counted server-side as a watch-honesty signal. */
  onBlockedSeek?: () => void;
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
   * Filled in with the player's own actions, for a page control that needs
   * more than raw transport: the catch-up list's "Continue" button.
   */
  actionsRef?: React.MutableRefObject<VideoPlayerActions | null>;
  /**
   * The raw YT.Player, for the one caller that needs more than the transport
   * exposes: the Library's watch tracker attaches to a player instance. YouTube
   * sources only.
   */
  youtubePlayerRef?: React.MutableRefObject<any>;
}

export interface VideoPlayerActions {
  /**
   * Carry on with the section owed: play only the parts missed, or go to the
   * checkpoint when enough has been watched. False when there is nothing owed.
   */
  continueOwed: () => boolean;
}

export default function NeramVideoPlayer({
  source,
  gate,
  watermark,
  title,
  resumeAt = 0,
  marks,
  watched,
  captions = null,
  onTimeUpdate,
  onPlayedSpan,
  onPlaybackEvent,
  onCheckpointReached,
  onLoadedMetadata,
  onBlockedSeek,
  allowFullscreen = false,
  allowPictureInPicture = false,
  onFullscreenChange,
  videoRef,
  transportRef: externalTransportRef,
  actionsRef,
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
  const activeTrackRef = useRef(activeTrack);
  activeTrackRef.current = activeTrack;

  /**
   * Stream renewal. The caller hands over a src and a way to get a new one; the
   * player decides when that is needed and keeps the student's place across it.
   *
   * `renewed` is keyed by the src it replaced, so a caller that supplies a
   * different video gets that video, not a renewal of the previous one.
   */
  const callerSrc = source.kind === 'html5' ? source.src : null;
  const callerSrcRef = useRef(callerSrc);
  callerSrcRef.current = callerSrc;
  const renewRef = useRef(source.kind === 'html5' ? source.renew : null);
  renewRef.current = source.kind === 'html5' ? source.renew : null;
  const [renewed, setRenewed] = useState<{ from: string; src: string } | null>(null);
  const liveSrc = callerSrc && renewed?.from === callerSrc ? renewed.src : callerSrc;
  const liveSrcRef = useRef(liveSrc);
  liveSrcRef.current = liveSrc;
  /** Bumped to rebuild the <video> for a URL that does not expire but failed anyway. */
  const [reloadKey, setReloadKey] = useState(0);
  const [streamFailure, setStreamFailure] = useState<string | null>(null);
  /** The last position genuinely reached, which is what a renewal resumes. */
  const lastGoodTimeRef = useRef<number | null>(null);
  /**
   * Set from the moment a stream fails until its replacement has loaded and been
   * sent back to the right second. While it is set, ticks are the reload's, not
   * the student's.
   */
  const pendingResumeRef = useRef<{ at: number; play: boolean } | null>(null);
  const recoveredAtRef = useRef<number | null>(null);
  const recoveriesRef = useRef(0);
  const renewingRef = useRef(false);
  const wantsPlayRef = useRef(false);
  const streamStartedAtRef = useRef(Date.now());
  const stalledSinceRef = useRef<number | null>(null);

  /**
   * Grant refresh (lib/video-grant-client.ts). A stream whose URL carries a
   * grant has it topped up every few minutes through a cookie, so the <video>
   * never sees it expire. These are inert for a URL with no grant in it.
   *
   * grantExpiresAtRef: when whatever currently authorises the stream runs out,
   *   by this device's clock (worked out from the grant's lifetime, not its
   *   timestamp, so a phone with the wrong time still refreshes on schedule).
   * cookieWorksRef: whether the browser sends the grant cookie back. Unknown
   *   until the first arm; false sends every refresh down the swap path.
   * pendingSwapRef: a fresh URL waiting for a quiet moment to replace the
   *   current one, when the cookie route is not available.
   */
  const grantExpiresAtRef = useRef<number | null>(null);
  const cookieWorksRef = useRef<boolean | null>(null);
  const refreshingRef = useRef(false);
  const refreshRetryAtRef = useRef(0);
  const pendingSwapRef = useRef<string | null>(null);
  /** The freshest grant URL, for a caption track that has not loaded yet. */
  const [captionGrantSrc, setCaptionGrantSrc] = useState<string | null>(null);

  /**
   * "Play the parts I missed". A snapshot of the stretches taken when it
   * starts (the live list shrinks as they fill), and which one is playing. Any
   * pause or move of the playhead by the student ends it.
   */
  const catchUpRef = useRef<{ stretches: PlayedRange[]; index: number } | null>(null);
  const [catchUpPart, setCatchUpPart] = useState<{ index: number; total: number } | null>(null);

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
  const cbRef = useRef({
    onTimeUpdate,
    onPlayedSpan,
    onPlaybackEvent,
    onCheckpointReached,
    onLoadedMetadata,
    onBlockedSeek,
    onFullscreenChange,
  });
  cbRef.current = {
    onTimeUpdate,
    onPlayedSpan,
    onPlaybackEvent,
    onCheckpointReached,
    onLoadedMetadata,
    onBlockedSeek,
    onFullscreenChange,
  };
  /** One classifier for the life of the player: what counts as played. */
  const stepsRef = useRef(createStepClassifier());
  /** Mirrors play/pause for the classifier, which reads it on every tick. */
  const playingRef = useRef(false);
  const emit = useCallback((event: PlaybackEvent) => cbRef.current.onPlaybackEvent?.(event), []);
  const resumeRef = useRef(resumeAt);
  resumeRef.current = resumeAt;
  /**
   * A place asked for before the stream's metadata arrived: a tap on Continue
   * or a missed part while a slow phone is still loading. Without this the
   * metadata handler sent the student back to the stored resume point and the
   * request was lost.
   */
  const metadataLoadedRef = useRef(false);
  const earlySeekRef = useRef<number | null>(null);
  // One-shot: set only when onLoadedMetadata issues the silent mount-time
  // resume-seek, consumed unconditionally by the very next onTick regardless
  // of what that tick does. A programmatic seek fires a native timeupdate even
  // though nothing has been played (video.paused stays true throughout), so
  // without this, landing resumeAt on or past an owed checkpoint's boundary
  // opens the quiz before the student has watched anything this session. Not
  // a latch: it does not survive past that one tick, so a genuine re-crossing
  // of the boundary for any other reason still fires every time, per rule
  // (d)'s no-latch guarantee above.
  const suppressNextCheckpointRef = useRef(false);
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
      stepsRef.current.markDiscontinuity();
      // A move by the student ends "Play the parts I missed".
      if (catchUpRef.current) {
        catchUpRef.current = null;
        setCatchUpPart(null);
      }
      if (Number.isFinite(ceiling) && seconds > ceiling + 0.5) {
        flashRef.current(LOCKED_MESSAGE);
        cbRef.current.onBlockedSeek?.();
      }
      transport.seek(target);
      setCurrent(target);
      if (!metadataLoadedRef.current) earlySeekRef.current = target;
      // Mid-renewal, the stream reloading underneath would otherwise put them
      // back where it failed rather than where they just asked to go.
      if (pendingResumeRef.current) pendingResumeRef.current.at = target;
    },
    [transportRef, duration],
  );

  /**
   * Get the stream going again from where it stopped.
   *
   * Reached from a media error, from a long stall on a stream old enough to have
   * expired, and from Try again. The place to resume is captured once, at the
   * first failure, from the last position genuinely reached, never from the live
   * playhead: a stream that has just been swapped in reads 0:00 while it loads,
   * and reading it there is what used to rewind a student to the start.
   */
  const recoverStream = useCallback(() => {
    const from = callerSrcRef.current;
    if (!from || renewingRef.current) return;

    if (!pendingResumeRef.current) {
      const transport = transportRef.current;
      pendingResumeRef.current = {
        at: lastGoodTimeRef.current ?? resumeRef.current,
        play: wantsPlayRef.current || (transport ? !transport.isPaused() : false),
      };
    }

    if (recoveriesRef.current >= MAX_STREAM_RECOVERIES) {
      setBuffering(false);
      setStreamFailure(STREAM_STOPPED_MESSAGE);
      return;
    }
    recoveriesRef.current += 1;
    setStreamFailure(null);
    stalledSinceRef.current = null;
    stepsRef.current.markDiscontinuity();
    emit({ type: 'reload' });

    const renew = renewRef.current;
    if (!renew) {
      setReloadKey((k) => k + 1);
      return;
    }

    renewingRef.current = true;
    setBuffering(true);
    renew()
      .then((src) => {
        if (callerSrcRef.current !== from) return;
        if (!src) throw new Error(STREAM_STOPPED_MESSAGE);
        // Handed back the URL already playing: rebuild the element, or the
        // browser has nothing to reload.
        if (src === liveSrcRef.current) setReloadKey((k) => k + 1);
        setRenewed({ from, src });
      })
      .catch((err) => {
        if (callerSrcRef.current !== from) return;
        setBuffering(false);
        setStreamFailure(err instanceof Error && err.message ? err.message : STREAM_STOPPED_MESSAGE);
      })
      .finally(() => {
        renewingRef.current = false;
      });
  }, [transportRef, emit]);

  const retryStream = useCallback(() => {
    recoveriesRef.current = 0;
    recoverStream();
  }, [recoverStream]);

  /**
   * Replace the stream with a fresh URL already in hand, keeping the place.
   * The fallback for a browser that will not send the grant cookie: a reload at
   * a pause is a blink, where letting the grant lapse mid-play was a freeze.
   */
  const swapStream = useCallback(
    (src: string) => {
      const from = callerSrcRef.current;
      if (!from || renewingRef.current || pendingResumeRef.current) return;
      pendingSwapRef.current = null;
      pendingResumeRef.current = {
        at: lastGoodTimeRef.current ?? transportRef.current?.getTime() ?? resumeRef.current,
        play: wantsPlayRef.current,
      };
      stepsRef.current.markDiscontinuity();
      emit({ type: 'reload' });
      if (src === liveSrcRef.current) setReloadKey((k) => k + 1);
      setRenewed({ from, src });
    },
    [transportRef, emit],
  );

  /**
   * Fetch the next grant before this one runs out, and hand it to the proxy as
   * a cookie so the current URL keeps working. When the cookie is not getting
   * through, keep the fresh URL for a swap instead.
   */
  const refreshGrant = useCallback(async () => {
    const renew = renewRef.current;
    const from = callerSrcRef.current;
    if (!renew || !from || refreshingRef.current || renewingRef.current) return;
    refreshingRef.current = true;
    try {
      const fresh = await renew();
      if (callerSrcRef.current !== from) return;
      const ttl = grantTtlFromSrc(fresh);
      if (ttl !== null && cookieWorksRef.current !== false) {
        const ok = await armAndConfirm(fresh);
        if (callerSrcRef.current !== from) return;
        cookieWorksRef.current = ok;
        emit({ type: 'grant_refresh', ok });
        if (ok) {
          grantExpiresAtRef.current = Date.now() + ttl * 1000;
          // A track that is already showing has its file; reloading it every
          // few minutes would only cost a request.
          if (!activeTrackRef.current) setCaptionGrantSrc(fresh);
          return;
        }
      }
      pendingSwapRef.current = fresh;
    } catch {
      // Try again shortly. If the grant lapses first, the expiry stall recovers it.
      refreshRetryAtRef.current = Date.now() + GRANT_REFRESH_RETRY_MS;
      emit({ type: 'grant_refresh', ok: false });
    } finally {
      refreshingRef.current = false;
    }
  }, [emit]);
  // Read by the surface events, which are built once.
  const refreshGrantRef = useRef(refreshGrant);
  refreshGrantRef.current = refreshGrant;

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
      // The checkpoint, not seekCeiling. See rule 2 above.
      const { unlockedUntil, seekCeiling } = gateRef.current;
      const ceiling = unlockedUntil > 0 ? unlockedUntil : seekCeiling;
      if (!Number.isFinite(ceiling)) return false;
      if (time <= ceiling + SEEK_TOLERANCE_SECONDS) return false;
      stepsRef.current.markDiscontinuity();
      transportRef.current?.seek(Math.max(0, ceiling));
      flashRef.current(LOCKED_MESSAGE);
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

  /** A stall is over: report how long the student waited, if they were. */
  const endStall = useCallback(() => {
    const since = stalledSinceRef.current;
    stalledSinceRef.current = null;
    if (since === null || !wantsPlayRef.current) return;
    const seconds = (Date.now() - since) / 1000;
    if (seconds >= 1) emit({ type: 'stall', seconds: Math.round(seconds) });
  }, [emit]);

  const events: VideoSurfaceEvents = useMemo(
    () => ({
      onTick: (seconds, dur) => {
        // A stream being renewed reports 0:00 while it reloads. That is not
        // where the student is, and passing it on would let a heartbeat save it
        // and the gate treat it as a position.
        if (pendingResumeRef.current) return;
        const step = stepsRef.current.observe({
          t: seconds,
          wall: typeof performance !== 'undefined' ? performance.now() : Date.now(),
          playing: playingRef.current,
          rate: speedRef.current,
        });
        if (step.kind === 'played') cbRef.current.onPlayedSpan?.(step.from, step.to);
        else if (step.kind === 'discarded') cbRef.current.onPlaybackEvent?.({ type: 'discarded', seconds: step.seconds });
        lastGoodTimeRef.current = seconds;

        // "Play the parts I missed": at the end of one missed stretch, jump to
        // the next; after the last, go to the checkpoint, where the quiz opens
        // if that was enough and the notice says what is left if it was not.
        const catchUp = catchUpRef.current;
        if (catchUp) {
          const stretch = catchUp.stretches[catchUp.index];
          if (stretch && seconds >= stretch[1] - 0.1) {
            const next = catchUp.stretches.findIndex((r, i) => i > catchUp.index && r[1] > seconds);
            let target: number | null = null;
            if (next >= 0) {
              catchUp.index = next;
              setCatchUpPart({ index: next, total: catchUp.stretches.length });
              if (catchUp.stretches[next][0] > seconds + 0.5) target = catchUp.stretches[next][0];
            } else {
              catchUpRef.current = null;
              setCatchUpPart(null);
              const boundary = gateRef.current.unlockedUntil;
              if (boundary > seconds + 0.5) target = boundary;
            }
            if (target !== null) {
              stepsRef.current.markDiscontinuity();
              transportRef.current?.seek(target);
              setCurrent(target);
              return;
            }
          }
        }
        if (recoveredAtRef.current !== null && seconds >= recoveredAtRef.current + RECOVERY_PROGRESS_SECONDS) {
          recoveriesRef.current = 0;
          recoveredAtRef.current = null;
        }
        if (stalledSinceRef.current !== null && seconds > 0) endStall();
        setCurrent(seconds);
        if (dur > 0) setDuration(dur);
        cbRef.current.onTimeUpdate?.(seconds, dur);

        // Consumed here, unconditionally, before any branch below can return
        // early - so it can only ever suppress the one tick it was set for.
        const suppressCheckpoint = suppressNextCheckpointRef.current;
        suppressNextCheckpointRef.current = false;

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
          // The synthetic tick from the silent mount-time resume-seek must not
          // open the quiz with zero playback (NXS-0120). Nor may an arrival by
          // drag with most of the section unwatched: WatchMoreNotice covers that.
          if (!suppressCheckpoint && gateRef.current.quizReady) cbRef.current.onCheckpointReached?.();
        }
      },
      onSeeked: (seconds) => {
        clampIfBeyond(seconds);
      },
      onSeeking: () => {
        stepsRef.current.markDiscontinuity();
        if (!metadataLoadedRef.current && transportRef.current) earlySeekRef.current = transportRef.current.getTime();
      },
      onPlayingChange: (isPlaying) => {
        playingRef.current = isPlaying;
        // The pause a reload fires is the browser's, not a choice to stop.
        if (!pendingResumeRef.current) wantsPlayRef.current = isPlaying;
        if (!isPlaying && !pendingResumeRef.current && catchUpRef.current) {
          catchUpRef.current = null;
          setCatchUpPart(null);
        }
        setPlaying(isPlaying);
        // Back from a long pause: the grant may have lapsed while nothing was
        // asking for bytes. Top it up now, while the buffer covers the gap.
        const exp = grantExpiresAtRef.current;
        if (isPlaying && exp !== null && exp - Date.now() <= GRANT_REFRESH_LEAD_MS) {
          void refreshGrantRef.current();
        }
      },
      onLoadedMetadata: (dur) => {
        setDuration(dur);
        cbRef.current.onLoadedMetadata?.(dur);
        volumeRef.current.applyToTransport();
        readTracks();
        // A renewed stream goes back to where the old one stopped; a first load
        // goes to the caller's resume point.
        const pending = pendingResumeRef.current;
        // Clamped to how far a control may reach, not trusted as stored. The
        // stored point rises with any seek, so restoring it verbatim resumed a
        // student who had watched 11 seconds on checkpoint 1, and the quiz opened
        // the moment they pressed play (NXS-0130).
        const { seekCeiling } = gateRef.current;
        const ceiling = Number.isFinite(seekCeiling) ? Math.min(seekCeiling, dur) : dur;
        const early = earlySeekRef.current;
        earlySeekRef.current = null;
        metadataLoadedRef.current = true;
        const target = Math.min(pending ? pending.at : early ?? resumeRef.current, ceiling);
        stepsRef.current.markDiscontinuity();
        if (target > 0 && target < dur - 1) {
          suppressNextCheckpointRef.current = true;
          transportRef.current?.seek(target);
        }
        if (pending) {
          pendingResumeRef.current = null;
          recoveredAtRef.current = target;
          lastGoodTimeRef.current = target;
          streamStartedAtRef.current = Date.now();
          if (pending.play) {
            wantsPlayRef.current = true;
            transportRef.current?.play();
          }
        }
      },
      // A checkpoint whose end runs past the file is never reached by the tick
      // handler, so without this the last quiz would simply never open.
      onEnded: () => {
        if (gateRef.current.quizReady) cbRef.current.onCheckpointReached?.();
      },
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
      // Only the <video> surface reports these. A proxied grant lasts ten
      // minutes, so on a long class this is the expected path, not a fault.
      onError: recoverStream,
      onWaiting: () => {
        if (stalledSinceRef.current === null) stalledSinceRef.current = Date.now();
        setBuffering(true);
      },
      onPlayable: () => {
        endStall();
        setBuffering(false);
      },
      onVolumeChange: (value, muted) => volumeRef.current.syncFromSurface(value, muted),
      onPipChange: setPipActive,
      onTextTracksChange: readTracks,
    }),
    [clampIfBeyond, transportRef, readTracks, recoverStream, endStall],
  );

  // One check every few seconds, only while an HTML5 stream is mounted:
  //
  // 1. Refresh the grant ahead of its expiry while the student is watching.
  // 2. Swap in a fresh URL at a pause, or just before expiry, when the cookie
  //    route is not available.
  // 3. A stall on a stream whose grant has run out is expiry, so renew after a
  //    few seconds rather than twenty. And as before, a long stall on an old
  //    stream is treated as expiry too: some browsers answer a refused byte
  //    range by waiting rather than erroring, which left the picture frozen.
  useEffect(() => {
    if (source.kind !== 'html5' || streamFailure) return;
    const id = setInterval(() => {
      const now = Date.now();
      const exp = grantExpiresAtRef.current;

      if (exp !== null && !renewingRef.current && !pendingResumeRef.current) {
        const swap = pendingSwapRef.current;
        if (swap) {
          if (!wantsPlayRef.current || exp - now <= GRANT_SWAP_LEAD_MS) swapStream(swap);
        } else if (
          wantsPlayRef.current &&
          exp - now <= GRANT_REFRESH_LEAD_MS &&
          now >= refreshRetryAtRef.current &&
          document.visibilityState !== 'hidden'
        ) {
          void refreshGrant();
        }
      }

      const since = stalledSinceRef.current;
      if (since === null || renewingRef.current) return;
      if (!wantsPlayRef.current) return;
      if (exp !== null && now >= exp && now - since >= EXPIRED_STALL_MS) {
        recoverStream();
        return;
      }
      if (now - since < STALL_RECOVERY_MS) return;
      if (now - streamStartedAtRef.current < STALE_STREAM_MS) return;
      recoverStream();
    }, 5_000);
    return () => clearInterval(id);
  }, [source.kind, streamFailure, recoverStream, refreshGrant, swapStream]);

  // Every new stream URL starts its own grant clock, and is armed as the cookie
  // straight away, which is also how the player learns whether the browser
  // sends that cookie at all. A URL with no grant in it (YouTube, a blob, a
  // static file) leaves all of this off.
  useEffect(() => {
    // A new <video> source starts without metadata. Its loadedmetadata goes to
    // a renewal's place, or to anything asked for in the meantime.
    metadataLoadedRef.current = false;
    pendingSwapRef.current = null;
    setCaptionGrantSrc(null);
    const ttl = source.kind === 'html5' ? grantTtlFromSrc(liveSrc) : null;
    grantExpiresAtRef.current = ttl !== null ? Date.now() + ttl * 1000 : null;
    if (ttl === null || !liveSrc || cookieWorksRef.current === false) return;
    let cancelled = false;
    void armAndConfirm(liveSrc).then((ok) => {
      if (!cancelled) cookieWorksRef.current = ok;
    });
    return () => {
      cancelled = true;
    };
  }, [liveSrc, source.kind]);

  // A different video from the caller starts clean: no inherited failures, and
  // no resume point carried over from the one before.
  useEffect(() => {
    streamStartedAtRef.current = Date.now();
    lastGoodTimeRef.current = null;
    pendingResumeRef.current = null;
    recoveredAtRef.current = null;
    recoveriesRef.current = 0;
    setStreamFailure(null);
  }, [callerSrc]);

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
   * The ticks that complete a section can land a render before the gate hears
   * about them, so the boundary tick may still have seen quizReady false. When
   * it turns true while the student is sitting at the boundary, open the quiz
   * then rather than leaving them on a notice that no longer applies.
   */
  const quizReadyRef = useRef(gate.quizReady);
  useEffect(() => {
    const was = quizReadyRef.current;
    quizReadyRef.current = gate.quizReady;
    if (!was && gate.quizReady && gate.unlockedUntil > 0 && current >= gate.unlockedUntil) {
      cbRef.current.onCheckpointReached?.();
    }
  }, [gate.quizReady, gate.unlockedUntil, current]);

  const owed = gate.owedWatch;

  /** Move the playhead for the player's own reasons, which never end catch-up. */
  const jumpTo = useCallback(
    (seconds: number) => {
      stepsRef.current.markDiscontinuity();
      transportRef.current?.seek(seconds);
      setCurrent(seconds);
      if (!metadataLoadedRef.current) earlySeekRef.current = seconds;
      if (pendingResumeRef.current) pendingResumeRef.current.at = seconds;
    },
    [transportRef],
  );

  /** Play only the stretches of the owed section that were never played. */
  const playMissed = useCallback((): boolean => {
    const stretches = gateRef.current.owedWatch?.stretches ?? [];
    if (!stretches.length) return false;
    catchUpRef.current = { stretches: stretches.map(([a, b]) => [a, b] as const), index: 0 };
    setCatchUpPart({ index: 0, total: stretches.length });
    jumpTo(stretches[0][0]);
    wantsPlayRef.current = true;
    transportRef.current?.play();
    return true;
  }, [jumpTo, transportRef]);

  /**
   * Enough has been watched: stop replaying and go to the checkpoint. Playing
   * on from there pauses at the boundary and opens the quiz, the same path as
   * arriving there any other way, so nothing about the quiz is special-cased.
   */
  useEffect(() => {
    if (!catchUpRef.current || !gate.quizReady || !(gate.unlockedUntil > 0)) return;
    catchUpRef.current = null;
    setCatchUpPart(null);
    jumpTo(gate.unlockedUntil);
  }, [gate.quizReady, gate.unlockedUntil, jumpTo]);

  const continueOwed = useCallback((): boolean => {
    const g = gateRef.current;
    if (!g.owedWatch || !(g.unlockedUntil > 0)) return false;
    if (!g.quizReady && playMissed()) return true;
    jumpTo(g.quizReady ? g.unlockedUntil : g.owedWatch.sectionStart);
    wantsPlayRef.current = true;
    transportRef.current?.play();
    return true;
  }, [jumpTo, playMissed, transportRef]);

  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = { continueOwed };
    return () => {
      if (actionsRef.current?.continueOwed === continueOwed) actionsRef.current = null;
    };
  }, [actionsRef, continueOwed]);

  /**
   * The quiz is a DOM child of this container while fullscreen, so its taps and
   * swipes bubble into the gesture handlers below. A swipe across the answers
   * would seek the video underneath them.
   */
  const fromOverlay = (e: React.SyntheticEvent) => isInsideVideoOverlayDialog(e.target);

  // The track follows the freshest grant held, not only the one the stream
  // started on: a student who turns captions on twenty minutes in would
  // otherwise ask for them with a grant that ran out ten minutes ago.
  const captionGrant = captionGrantSrc ?? liveSrc;
  const liveCaptions = useMemo(() => {
    if (!captions || !captionGrant) return null;
    if (typeof captions.src === 'string') return captions as { src: string; label: string; lang: string };
    const src = captions.src(captionGrant);
    return src ? { src, label: captions.label, lang: captions.lang } : null;
  }, [captions, captionGrant]);

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
      {source.kind === 'html5' && liveSrc ? (
        <Html5Surface
          key={reloadKey}
          src={liveSrc}
          events={events}
          transportRef={transportRef}
          videoRef={videoRef}
          onClick={togglePlay}
          allowPictureInPicture={pipPermitted}
          captions={liveCaptions}
        />
      ) : source.kind === 'youtube' ? (
        <YouTubeSurface
          youtubeId={source.youtubeId}
          events={events}
          transportRef={transportRef}
          rawPlayerRef={youtubePlayerRef}
          onClick={togglePlay}
        />
      ) : null}

      {watermark && <Watermark name={watermark.name} code={watermark.code} />}

      {streamFailure && <StreamStoppedNotice message={streamFailure} onRetry={retryStream} />}

      {title && fullscreen.isFullscreen && chrome.visible && <TitleBar title={title} />}

      {nudge ? <Nudge message={nudge} /> : catchUpPart && <CatchUpChip index={catchUpPart.index} total={catchUpPart.total} />}

      {atCheckpoint && gate.quizReady && <CheckpointNotice />}
      {atCheckpoint && !gate.quizReady && owed && (
        <WatchMoreNotice
          watchedSeconds={owed.watchedSeconds}
          requiredSeconds={owed.requiredSeconds}
          sectionSeconds={owed.sectionEnd - owed.sectionStart}
          parts={owed.stretches.length}
          missingSeconds={owed.missingSeconds}
          onPlayMissed={owed.stretches.length > 0 ? playMissed : null}
        />
      )}

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
        watched={watched}
        marks={marks}
        onSeek={requestSeek}
        onRefusedSeek={() => {
          flash(LOCKED_MESSAGE);
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
