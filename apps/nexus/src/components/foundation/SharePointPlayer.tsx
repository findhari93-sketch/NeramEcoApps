'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Typography, CircularProgress } from '@neram/ui';
import type { NexusFoundationSectionWithQuiz } from '@neram/database/types';

interface SharePointPlayerProps {
  videoUrl: string;
  chapterId: string;
  token?: string | null;
  sections?: NexusFoundationSectionWithQuiz[];
  onSectionEnd?: (sectionIndex: number) => void;
  onTimeUpdate?: (seconds: number) => void;
}

/**
 * Converts a SharePoint/Stream video URL to an embeddable format.
 * Kept exported for teacher editor preview pages that still use iframe embedding.
 */
export function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.pathname.includes('embed.aspx')) return url;
    if (u.pathname.includes('stream.aspx')) {
      return url.replace('stream.aspx', 'embed.aspx');
    }
    if (u.pathname.match(/\/:v:\//)) {
      const pathParts = u.pathname.split('/');
      const vIdx = pathParts.indexOf(':v:');
      if (vIdx >= 0 && vIdx + 2 < pathParts.length) {
        const siteName = pathParts[vIdx + 2];
        return `${u.origin}/sites/${siteName}/_layouts/15/stream.aspx?share=${encodeURIComponent(url)}`;
      }
    }
    return url;
  } catch {
    return url;
  }
}

const MAX_RETRIES = 2;

export default function SharePointPlayer({ videoUrl, chapterId, token, sections, onSectionEnd, onTimeUpdate }: SharePointPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCountRef = useRef(0);

  // Section-based quiz triggering (mirrors VideoPlayer.tsx pattern)
  const hasTriggeredQuizRef = useRef<Set<number>>(new Set());
  const isRewatchingRef = useRef(false);
  const rewatchMaxTimeRef = useRef(0);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const onSectionEndRef = useRef(onSectionEnd);
  onSectionEndRef.current = onSectionEnd;

  // Fetch stream URL from API
  const fetchStreamUrl = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/foundation/chapters/${chapterId}/video-embed${token ? `?token=${encodeURIComponent(token)}` : ''}`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      );

      if (res.ok) {
        const data = await res.json();
        setStreamUrl(data.streamUrl);
        retryCountRef.current = 0;
      } else {
        const errData = await res.json().catch(() => ({ error: 'Failed to load video' }));
        setError(errData.error || 'Failed to load video');
      }
    } catch {
      setError('Network error — could not load video');
    } finally {
      setLoading(false);
    }
  }, [chapterId, token]);

  useEffect(() => {
    fetchStreamUrl();
  }, [fetchStreamUrl]);

  // Register player interface on window for section seeking, quiz pause/resume
  useEffect(() => {
    const video = videoRef.current;
    (window as any).__foundationPlayer = {
      type: 'sharepoint',
      seekTo: (seconds: number) => { if (video) video.currentTime = seconds; },
      play: () => { video?.play().catch(() => {}); },
      pause: () => { video?.pause(); },
      getCurrentTime: () => video?.currentTime ?? 0,
      resetSectionTrigger: (index: number) => hasTriggeredQuizRef.current.delete(index),
      setRewatchMode: (enabled: boolean, maxTime: number) => {
        isRewatchingRef.current = enabled;
        rewatchMaxTimeRef.current = maxTime;
      },
    };
    return () => {
      delete (window as any).__foundationPlayer;
    };
  }, [streamUrl]); // Re-register when stream URL changes (video element may remount)

  // Wire timeupdate event + section-end quiz triggering
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handler = () => {
      const time = video.currentTime;
      onTimeUpdate?.(time);

      // Check ALL sections for quiz triggers (same logic as VideoPlayer.tsx)
      const allSections = sectionsRef.current;
      const videoDuration = video.duration || 0;
      if (allSections && onSectionEndRef.current) {
        for (let i = 0; i < allSections.length; i++) {
          const section = allSections[i];
          // Skip sections whose quiz is already passed (e.g. when user seeks forward)
          if (section.quiz_attempt?.passed && !hasTriggeredQuizRef.current.has(i)) {
            hasTriggeredQuizRef.current.add(i);
            continue;
          }
          // For the last section, clamp end_timestamp to (videoDuration - 10)
          const isLastSection = i === allSections.length - 1;
          const effectiveEnd = isLastSection && videoDuration > 0
            ? Math.min(section.end_timestamp_seconds, videoDuration - 10)
            : section.end_timestamp_seconds;
          if (
            time >= effectiveEnd &&
            !hasTriggeredQuizRef.current.has(i)
          ) {
            hasTriggeredQuizRef.current.add(i);
            isRewatchingRef.current = false;
            rewatchMaxTimeRef.current = 0;
            // Don't auto-pause — parent shows a non-blocking quiz notification
            onSectionEndRef.current(i);
            return;
          }
        }
      }

      // Anti-gaming: prevent seeking past section end during rewatch
      if (isRewatchingRef.current && time > rewatchMaxTimeRef.current) {
        video.currentTime = rewatchMaxTimeRef.current - 2;
      }
    };
    // Fallback: trigger any remaining untriggered quiz when video ends
    const endedHandler = () => {
      const allSections = sectionsRef.current;
      if (allSections && onSectionEndRef.current) {
        for (let i = 0; i < allSections.length; i++) {
          // Skip already-passed sections
          if (allSections[i].quiz_attempt?.passed) {
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

  // Handle video error — retry with fresh URL (may have expired)
  const handleVideoError = useCallback(() => {
    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current++;
      console.warn(`Video stream error, retrying (${retryCountRef.current}/${MAX_RETRIES})...`);
      fetchStreamUrl();
    } else {
      setError('Video failed to load. The stream URL may have expired.');
    }
  }, [fetchStreamUrl]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', bgcolor: '#000' }}>
        <CircularProgress size={32} sx={{ color: 'white' }} />
      </Box>
    );
  }

  if (error || !streamUrl) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', bgcolor: '#000', color: 'white', gap: 1, p: 2, textAlign: 'center' }}>
        <Typography variant="body2">{error || 'Could not load video'}</Typography>
        <Typography
          variant="caption"
          component="a"
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: 'primary.light', textDecoration: 'underline' }}
        >
          Watch in SharePoint
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        bgcolor: '#000',
      }}
    >
      <video
        ref={videoRef}
        src={streamUrl}
        controls
        playsInline
        onError={handleVideoError}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    </Box>
  );
}
