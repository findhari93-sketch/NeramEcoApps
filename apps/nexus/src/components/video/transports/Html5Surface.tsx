'use client';

import { useEffect, useRef } from 'react';
import type { TextTrackDescriptor, VideoSurfaceProps, VideoTransport } from '../types';

/**
 * The <video> half of the player, fed bytes from our own proxy.
 *
 * Native chrome is off rather than styled, for three reasons that all matter.
 * The native menu offers Download and Picture in picture, both of which hand the
 * file to the student. The native scrubber lets them drag past a checkpoint, and
 * a timeupdate clamp can only pull them back after they have seen where they
 * landed. And the native speed control turns a 45 minute class into 15 minutes.
 *
 * This file knows nothing about checkpoints. It reports what happened and does
 * what it is told; NeramVideoPlayer decides what any of it means.
 */

interface Html5SurfaceProps extends VideoSurfaceProps {
  src: string;
  /** Exposed so callers that already hold a video ref (tests, Focus Mode) keep working. */
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  onClick?: () => void;
  /**
   * Off unless the player says otherwise, and the player only says otherwise for
   * an ungated, unwatermarked clip. A PiP window is drawn by the OS, not by us:
   * the watermark is a DOM sibling and does not travel into it, our control bar
   * is gone, and the window carries its own seek control. On a gated recording
   * that is three protections lost at once.
   */
  allowPictureInPicture?: boolean;
  /**
   * A caption track served from the same grant as the bytes. Never a static or
   * blob URL: on a lecture recording the WebVTT is effectively the transcript,
   * so it needs the same door as the video.
   */
  captions?: { src: string; label: string; lang: string } | null;
}

export default function Html5Surface({
  src,
  events,
  transportRef,
  videoRef: externalRef,
  onClick,
  allowPictureInPicture = false,
  captions = null,
}: Html5SurfaceProps) {
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = externalRef ?? internalRef;

  // Held in a ref so an inline arrow from the parent does not re-register every
  // listener on every render.
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const readTracks = (): TextTrackDescriptor[] => {
      const out: TextTrackDescriptor[] = [];
      const list = video.textTracks;
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (t.kind !== 'subtitles' && t.kind !== 'captions') continue;
        out.push({ id: t.id || String(i), label: t.label || t.language || 'Captions', lang: t.language });
      }
      return out;
    };

    const transport: VideoTransport = {
      play: () => {
        video.play().catch(() => {});
      },
      pause: () => video.pause(),
      seek: (seconds) => {
        video.currentTime = seconds;
      },
      getTime: () => video.currentTime,
      getDuration: () => (Number.isFinite(video.duration) ? video.duration : 0),
      setRate: (rate) => {
        video.playbackRate = rate;
      },
      isPaused: () => video.paused,

      getBuffered: () => {
        const out: Array<readonly [number, number]> = [];
        // TimeRanges.start(i) throws IndexSizeError if the media resets between
        // reading `length` and calling it. That is not hypothetical here: the
        // recap re-mints its grant mid-class and swaps `src` underneath us.
        try {
          const ranges = video.buffered;
          for (let i = 0; i < ranges.length; i++) out.push([ranges.start(i), ranges.end(i)] as const);
        } catch {
          return [];
        }
        return out;
      },

      setVolume: (value) => {
        video.volume = Math.min(1, Math.max(0, value));
      },
      getVolume: () => video.volume,
      setMuted: (muted) => {
        video.muted = muted;
      },
      isMuted: () => video.muted,
      isVolumeSettable: () => {
        // iOS ignores a write to `volume` silently and reports the old value
        // back, so probing is the only honest test. Restore whatever we found.
        const before = video.volume;
        const probe = before > 0.5 ? 0.4 : 0.6;
        try {
          video.volume = probe;
          const settable = Math.abs(video.volume - probe) < 0.01;
          video.volume = before;
          return settable;
        } catch {
          return false;
        }
      },

      supportsPictureInPicture: () =>
        allowPictureInPicture &&
        typeof document !== 'undefined' &&
        // Firefox has its own PiP and does not expose this flag. Feature detect,
        // never sniff the UA: a false negative just hides a button.
        !!document.pictureInPictureEnabled &&
        typeof video.requestPictureInPicture === 'function',
      enterPictureInPicture: () => video.requestPictureInPicture().then(() => undefined),
      exitPictureInPicture: () => document.exitPictureInPicture(),

      getTextTracks: readTracks,
      setTextTrack: (id) => {
        const list = video.textTracks;
        for (let i = 0; i < list.length; i++) {
          const t = list[i];
          if (t.kind !== 'subtitles' && t.kind !== 'captions') continue;
          // 'hidden' rather than 'disabled': a disabled track stops firing cue
          // events, and turning it back on then reloads the file.
          t.mode = (t.id || String(i)) === id ? 'showing' : 'hidden';
        }
      },
      getActiveTextTrack: () => {
        const list = video.textTracks;
        for (let i = 0; i < list.length; i++) {
          if (list[i].mode === 'showing') return list[i].id || String(i);
        }
        return null;
      },
    };
    transportRef.current = transport;

    const duration = () => (Number.isFinite(video.duration) ? video.duration : 0);

    const onTime = () => eventsRef.current.onTick(video.currentTime, duration());
    const onSeeked = () => eventsRef.current.onSeeked(video.currentTime);
    const onRate = () => eventsRef.current.onRateChange(video.playbackRate);
    const onPlay = () => eventsRef.current.onPlayingChange(true);
    const onPause = () => eventsRef.current.onPlayingChange(false);
    // A checkpoint whose end runs past the file is never reached by the tick
    // handler, so without this the last quiz would never open: the video would
    // simply play out and stop.
    const onEnded = () => eventsRef.current.onEnded();
    const onMeta = () => eventsRef.current.onLoadedMetadata(duration());
    const onError = () => eventsRef.current.onError();
    const onWaiting = () => eventsRef.current.onWaiting();
    const onPlayable = () => eventsRef.current.onPlayable();
    const onVolume = () => eventsRef.current.onVolumeChange(video.volume, video.muted);
    const onPipEnter = () => eventsRef.current.onPipChange(true);
    const onPipLeave = () => eventsRef.current.onPipChange(false);
    const onTracks = () => eventsRef.current.onTextTracksChange();

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ratechange', onRate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onError);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onWaiting);
    video.addEventListener('playing', onPlayable);
    video.addEventListener('canplay', onPlayable);
    video.addEventListener('volumechange', onVolume);
    video.addEventListener('enterpictureinpicture', onPipEnter);
    video.addEventListener('leavepictureinpicture', onPipLeave);
    video.textTracks?.addEventListener?.('change', onTracks);
    video.textTracks?.addEventListener?.('addtrack', onTracks);

    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ratechange', onRate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onError);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onWaiting);
      video.removeEventListener('playing', onPlayable);
      video.removeEventListener('canplay', onPlayable);
      video.removeEventListener('volumechange', onVolume);
      video.removeEventListener('enterpictureinpicture', onPipEnter);
      video.removeEventListener('leavepictureinpicture', onPipLeave);
      video.textTracks?.removeEventListener?.('change', onTracks);
      video.textTracks?.removeEventListener?.('addtrack', onTracks);
      if (transportRef.current === transport) transportRef.current = null;
    };
  }, [videoRef, transportRef, allowPictureInPicture]);

  return (
    <video
      ref={videoRef as React.RefObject<HTMLVideoElement>}
      src={src}
      playsInline
      preload="metadata"
      controls={false}
      controlsList="nodownload noplaybackrate noremoteplayback"
      // controlsList only hides menu items. AirPlay is a separate route off the
      // device entirely, and mirroring carries the picture past the watermark.
      // Spread because it is not in React's typed attribute set; the dash keeps
      // React from stripping it.
      {...({ 'x-webkit-airplay': 'deny' } as Record<string, string>)}
      disablePictureInPicture={!allowPictureInPicture}
      disableRemotePlayback
      onClick={onClick}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        cursor: 'pointer',
      }}
    >
      {captions && (
        <track
          kind="subtitles"
          src={captions.src}
          srcLang={captions.lang}
          label={captions.label}
          // Never `default`: an auto-showing track is a surprise, and the player
          // restores the student's own last choice instead.
        />
      )}
    </video>
  );
}
