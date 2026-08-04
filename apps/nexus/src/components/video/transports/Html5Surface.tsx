'use client';

import { useEffect, useRef } from 'react';
import type { VideoSurfaceProps, VideoTransport } from '../types';

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
}

export default function Html5Surface({
  src,
  events,
  transportRef,
  videoRef: externalRef,
  onClick,
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

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ratechange', onRate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ratechange', onRate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onError);
      if (transportRef.current === transport) transportRef.current = null;
    };
  }, [videoRef, transportRef]);

  return (
    <video
      ref={videoRef as React.RefObject<HTMLVideoElement>}
      src={src}
      playsInline
      preload="metadata"
      controls={false}
      controlsList="nodownload noplaybackrate noremoteplayback"
      disablePictureInPicture
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
    />
  );
}
