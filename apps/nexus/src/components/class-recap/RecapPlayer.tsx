'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Typography, CircularProgress } from '@neram/ui';
import RecapYouTubePlayer from './RecapYouTubePlayer';

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
  onTimeUpdate?: (seconds: number) => void;
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

  const hasTriggeredQuizRef = useRef<Set<number>>(new Set());
  const isRewatchingRef = useRef(false);
  const rewatchMaxTimeRef = useRef(0);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const onSectionEndRef = useRef(onSectionEnd);
  onSectionEndRef.current = onSectionEnd;

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
        retryCountRef.current = 0;
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
      onTimeUpdate?.(time);

      const allSections = sectionsRef.current;
      const videoDuration = video.duration || 0;
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
  }, [streamUrl, onTimeUpdate]);

  const handleVideoError = useCallback(() => {
    if (retryCountRef.current < 2) {
      retryCountRef.current++;
      fetchStreamUrl();
    } else {
      setError('The recording failed to load. Its secure link may have expired, please refresh.');
    }
  }, [fetchStreamUrl]);

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
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </Box>
  );
}
