'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Typography, CircularProgress } from '@neram/ui';

interface SharePointPlayerProps {
  videoUrl: string;
  chapterId: string;
  token?: string | null;
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

export default function SharePointPlayer({ videoUrl, chapterId, token, onTimeUpdate }: SharePointPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCountRef = useRef(0);

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
    };
    return () => {
      delete (window as any).__foundationPlayer;
    };
  }, [streamUrl]); // Re-register when stream URL changes (video element may remount)

  // Wire timeupdate event
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !onTimeUpdate) return;

    const handler = () => onTimeUpdate(video.currentTime);
    video.addEventListener('timeupdate', handler);
    return () => video.removeEventListener('timeupdate', handler);
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
