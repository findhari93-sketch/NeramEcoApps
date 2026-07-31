'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Typography, CircularProgress } from '@neram/ui';
import RecapYouTubePlayer from './RecapYouTubePlayer';

/**
 * Grant renewals are routine on a long class, so this has to allow several.
 * It bounds genuine failure, not expiry: the counter resets as soon as playback
 * actually advances.
 */
const MAX_RETRIES = 4;

export interface RecapPlayerSection {
  id: string;
  end_timestamp_seconds: number;
  passed: boolean;
}

interface RecapPlayerProps {
  recapId: string;
  token?: string | null;
  sections: RecapPlayerSection[];
  onSectionEnd: (sectionIndex: number) => void;
  /** Fires on every playback tick. `duration` is 0 until metadata has loaded. */
  onTimeUpdate?: (seconds: number, duration: number) => void;
}

/**
 * Gated player for a class recording. Two sources:
 *   - SharePoint (Teams recording) streamed as a native <video>.
 *   - YouTube (the durable unlisted backup) via the YouTube IFrame API.
 * Both mirror the Foundation SharePointPlayer gating: auto-pause at each
 * checkpoint end, fire onSectionEnd so a mandatory quiz can open, and clamp
 * seeking past the checkpoint end during a rewatch (anti-skip). Both expose the
 * same control handle on window.__recapPlayer so the page logic is unchanged.
 */
export default function RecapPlayer({
  recapId,
  token,
  sections,
  onSectionEnd,
  onTimeUpdate,
}: RecapPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCountRef = useRef(0);
  /** Playhead to restore after a silent grant renewal. */
  const resumeAtRef = useRef(0);
  const wasPlayingRef = useRef(false);

  const hasTriggeredQuizRef = useRef<Set<number>>(new Set());
  const isRewatchingRef = useRef(false);
  const rewatchMaxTimeRef = useRef(0);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const onSectionEndRef = useRef(onSectionEnd);
  onSectionEndRef.current = onSectionEnd;
  // Held in a ref, not read from the closure, so an inline arrow from the page
  // does not re-register the timeupdate listener on every render.
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  const fetchStreamUrl = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/student/class-recaps/${recapId}/video-embed${token ? `?token=${encodeURIComponent(token)}` : ''}`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.video_source === 'youtube') {
          setYoutubeId(data.youtube_id);
          setStreamUrl(null);
        } else {
          setStreamUrl(data.streamUrl);
          setYoutubeId(null);
        }
        // Deliberately NOT resetting the retry counter here. A successful mint
        // says nothing about whether the video then plays, and resetting on the
        // fetch turns "fails instantly, every time" into an endless refetch loop.
        // It resets on real playback progress instead, in the timeupdate handler.
      } else {
        const errData = await res.json().catch(() => ({ error: 'Failed to load recording' }));
        setError(errData.error || 'Failed to load recording');
      }
    } catch {
      setError('Network error, could not load the recording');
    } finally {
      setLoading(false);
    }
  }, [recapId, token]);

  useEffect(() => {
    fetchStreamUrl();
  }, [fetchStreamUrl]);

  // Register the control handle (namespaced for recaps). SharePoint only; the
  // YouTube player registers its own handle.
  useEffect(() => {
    if (!streamUrl) return;
    const video = videoRef.current;
    (window as any).__recapPlayer = {
      seekTo: (seconds: number) => {
        if (video) video.currentTime = seconds;
      },
      play: () => {
        video?.play().catch(() => {});
      },
      pause: () => {
        video?.pause();
      },
      getCurrentTime: () => video?.currentTime ?? 0,
      resetSectionTrigger: (index: number) => hasTriggeredQuizRef.current.delete(index),
      setRewatchMode: (enabled: boolean, maxTime: number) => {
        isRewatchingRef.current = enabled;
        rewatchMaxTimeRef.current = maxTime;
      },
    };
    return () => {
      delete (window as any).__recapPlayer;
    };
  }, [streamUrl]);

  // timeupdate: quiz-trigger at checkpoint end + anti-skip during rewatch.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    const handler = () => {
      const time = video.currentTime;
      const allSections = sectionsRef.current;
      const videoDuration = Number.isFinite(video.duration) ? video.duration : 0;
      onTimeUpdateRef.current?.(time, videoDuration);

      // Playback is genuinely progressing, so whatever went wrong before is
      // behind us and the retry budget is refilled. Anchored here rather than on
      // a successful fetch so a video that mints fine but never plays still
      // gives up instead of refetching forever.
      if (time > 0) retryCountRef.current = 0;

      if (allSections && onSectionEndRef.current) {
        for (let i = 0; i < allSections.length; i++) {
          const section = allSections[i];
          // Already-passed checkpoints never re-trigger (e.g. when seeking forward).
          if (section.passed && !hasTriggeredQuizRef.current.has(i)) {
            hasTriggeredQuizRef.current.add(i);
            continue;
          }
          const isLastSection = i === allSections.length - 1;
          const effectiveEnd =
            isLastSection && videoDuration > 0
              ? Math.min(section.end_timestamp_seconds, videoDuration - 5)
              : section.end_timestamp_seconds;
          if (time >= effectiveEnd && !hasTriggeredQuizRef.current.has(i)) {
            hasTriggeredQuizRef.current.add(i);
            isRewatchingRef.current = false;
            rewatchMaxTimeRef.current = 0;
            video.pause();
            onSectionEndRef.current(i);
            return;
          }
        }
      }

      // Anti-gaming: block seeking past the checkpoint end during a rewatch.
      if (isRewatchingRef.current && time > rewatchMaxTimeRef.current) {
        video.currentTime = Math.max(0, rewatchMaxTimeRef.current - 2);
      }
    };

    const endedHandler = () => {
      const allSections = sectionsRef.current;
      if (allSections && onSectionEndRef.current) {
        for (let i = 0; i < allSections.length; i++) {
          if (allSections[i].passed) {
            hasTriggeredQuizRef.current.add(i);
            continue;
          }
          if (!hasTriggeredQuizRef.current.has(i)) {
            hasTriggeredQuizRef.current.add(i);
            onSectionEndRef.current(i);
            break;
          }
        }
      }
    };

    video.addEventListener('timeupdate', handler);
    video.addEventListener('ended', endedHandler);
    return () => {
      video.removeEventListener('timeupdate', handler);
      video.removeEventListener('ended', endedHandler);
    };
  }, [streamUrl]);

  /**
   * A streaming grant lasts ten minutes, so a class longer than that WILL fail
   * mid-playback: the browser asks for the next byte range with an expired token
   * and gets a 401. That is expected, not exceptional, so recover silently.
   * Remember where they were, mint a fresh grant, and seek back on reload, which
   * makes an expiry invisible apart from a moment of buffering.
   */
  const handleVideoError = useCallback(() => {
    if (retryCountRef.current >= MAX_RETRIES) {
      setError('The recording failed to load. Please refresh the page.');
      return;
    }
    retryCountRef.current++;
    resumeAtRef.current = videoRef.current?.currentTime ?? 0;
    wasPlayingRef.current = !(videoRef.current?.paused ?? true);
    fetchStreamUrl();
  }, [fetchStreamUrl]);

  /** Restore the playhead after a silent re-mint. */
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    const resumeAt = resumeAtRef.current;
    if (!video || resumeAt <= 0) return;
    resumeAtRef.current = 0;
    try {
      video.currentTime = resumeAt;
    } catch {
      // Seeking before the browser is ready is harmless; playback starts at 0.
    }
    if (wasPlayingRef.current) video.play().catch(() => {});
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', bgcolor: '#000' }}>
        <CircularProgress size={32} sx={{ color: 'white' }} />
      </Box>
    );
  }

  if (youtubeId) {
    return (
      <RecapYouTubePlayer
        youtubeId={youtubeId}
        sections={sections}
        onSectionEnd={onSectionEnd}
        onTimeUpdate={onTimeUpdate}
      />
    );
  }

  if (error || !streamUrl) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', bgcolor: '#000', color: 'white', gap: 1, p: 2, textAlign: 'center' }}>
        <Typography variant="body2">{error || 'Could not load the recording'}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: '#000' }}>
      <video
        ref={videoRef}
        src={streamUrl}
        controls
        playsInline
        onError={handleVideoError}
        onLoadedMetadata={handleLoadedMetadata}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </Box>
  );
}
