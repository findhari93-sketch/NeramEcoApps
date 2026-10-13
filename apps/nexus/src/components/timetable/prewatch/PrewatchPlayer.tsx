'use client';

/**
 * Plays one "watch before class" video inside Nexus.
 *
 * Asks the play route how (a YouTube id, or a short-lived stream for a
 * SharePoint recording), then hands it to the shared player. The stream runs
 * out every ten minutes for students, so the player gets `renew`, which asks
 * again and keeps the place, the same way RecordingPlayerDialog does.
 *
 * Progress is reported only when `trackProgress` is on (students). The
 * heartbeat's own rules live in the RPC; this only feeds it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, CircularProgress, Typography } from '@neram/ui';
import NeramVideoPlayer from '@/components/video/NeramVideoPlayer';
import { useVideoProgress } from '@/components/video/useVideoProgress';
import { OPEN_GATE } from '@/lib/video-gate';

type Play =
  | { mode: 'youtube'; youtubeId: string; resumeAt: number }
  | { mode: 'html5'; src: string; resumeAt: number };

interface PrewatchPlayerProps {
  classId: string;
  resourceId: string;
  getToken: () => Promise<string | null>;
  trackProgress?: boolean;
  /** Told the length once the player knows it, for the page's own display. */
  onReady?: () => void;
}

export default function PrewatchPlayer({ classId, resourceId, getToken, trackProgress = false, onReady }: PrewatchPlayerProps) {
  const router = useRouter();
  const [play, setPlay] = useState<Play | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catchupUrl, setCatchupUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // A fresh getToken each render must not rebuild the player (it would reload
  // the video and lose the place), so it is read through a ref.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const request = useCallback(async () => {
    const token = await getTokenRef.current();
    if (!token) throw Object.assign(new Error('Your session expired. Sign in again to watch.'), { catchupUrl: null });
    const res = await fetch(`/api/timetable/${classId}/prewatch/${resourceId}/play`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(data.error || 'Could not open this video.'), {
        catchupUrl: typeof data.catchup_url === 'string' ? data.catchup_url : null,
      });
    }
    return data;
  }, [classId, resourceId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCatchupUrl(null);
    try {
      const data = await request();
      setPlay(
        data.mode === 'youtube'
          ? { mode: 'youtube', youtubeId: data.youtubeId, resumeAt: data.resumeAt || 0 }
          : { mode: 'html5', src: data.src, resumeAt: data.resumeAt || 0 },
      );
      onReadyRef.current?.();
    } catch (err) {
      setError((err as Error).message);
      setCatchupUrl((err as { catchupUrl?: string | null }).catchupUrl ?? null);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    setPlay(null);
    void load();
  }, [load]);

  const renew = useMemo(
    () => async () => {
      const data = await request();
      if (data.mode !== 'html5' || !data.src) throw new Error('This video can no longer be streamed.');
      return data.src as string;
    },
    [request],
  );

  const heartbeat = useVideoProgress({
    endpoint: trackProgress ? `/api/timetable/${classId}/prewatch/${resourceId}/progress` : null,
    getToken: () => getTokenRef.current(),
    enabled: trackProgress,
  });

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        bgcolor: '#000',
        borderRadius: { xs: 0, sm: 2 },
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {loading && <CircularProgress size={32} sx={{ color: 'common.white' }} aria-label="Loading the video" />}

      {!loading && error && (
        <Box sx={{ textAlign: 'center', color: 'common.white', px: 3 }} role="alert">
          <Typography variant="body2" sx={{ mb: 2 }}>
            {error}
          </Typography>
          {catchupUrl ? (
            <Button
              variant="contained"
              onClick={() => router.push(catchupUrl)}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
            >
              Do catch-up first
            </Button>
          ) : (
            <Button
              variant="outlined"
              onClick={load}
              sx={{ minHeight: 48, textTransform: 'none', color: 'common.white', borderColor: 'grey.500' }}
            >
              Try again
            </Button>
          )}
        </Box>
      )}

      {!loading && !error && play && (
        <Box sx={{ position: 'absolute', inset: 0 }}>
          <NeramVideoPlayer
            source={play.mode === 'youtube' ? { kind: 'youtube', youtubeId: play.youtubeId } : { kind: 'html5', src: play.src, renew }}
            gate={OPEN_GATE}
            resumeAt={play.resumeAt}
            allowFullscreen
            onTimeUpdate={trackProgress ? heartbeat.onTick : undefined}
          />
        </Box>
      )}
    </Box>
  );
}
