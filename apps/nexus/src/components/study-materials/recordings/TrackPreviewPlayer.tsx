'use client';

/**
 * Plays one language's recording to the teacher, draft or not.
 *
 * Through the staff preview route, which serves the video the same way students
 * get it (app-only, through the byte proxy), so a video that plays here is one
 * the server can serve to a student. Grants expire after ten minutes, so an
 * error re-mints and resumes where playback was, at most twice in a row; real
 * playback progress resets that count.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@neram/ui';
import NeramVideoPlayer from '@/components/video/NeramVideoPlayer';
import type { VideoSource, VideoTransport } from '@/components/video/types';
import type { SeekMark } from '@/components/video/controls/SeekBar';
import { OPEN_GATE } from '@/lib/video-gate';
import { authedJson, RecordingsApiError, trackUrl } from './recordings-api';

const MAX_RETRIES = 2;

export interface TrackPreviewPlayerProps {
  fileId: string;
  trackId: string;
  title: string;
  getToken: () => Promise<string | null>;
  marks?: SeekMark[];
  transportRef?: React.MutableRefObject<VideoTransport | null>;
  onTimeUpdate?: (seconds: number, duration: number) => void;
  onLoadedMetadata?: (duration: number) => void;
}

export default function TrackPreviewPlayer({
  fileId,
  trackId,
  title,
  getToken,
  marks,
  transportRef,
  onTimeUpdate,
  onLoadedMetadata,
}: TrackPreviewPlayerProps) {
  const [source, setSource] = useState<VideoSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resumeAt, setResumeAt] = useState(0);
  const retries = useRef(0);
  const lastTime = useRef(0);

  const mint = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authedJson<{ mode: 'proxy' | 'youtube'; src?: string; youtube_id?: string }>(
        getToken,
        `${trackUrl(fileId, trackId)}/preview`,
      );
      setSource(
        data.mode === 'youtube' && data.youtube_id
          ? { kind: 'youtube', youtubeId: data.youtube_id }
          : { kind: 'html5', src: data.src || '' },
      );
    } catch (err) {
      setError(err instanceof RecordingsApiError ? err.message : 'Could not load the video.');
    } finally {
      setLoading(false);
    }
  }, [fileId, trackId, getToken]);

  useEffect(() => {
    retries.current = 0;
    void mint();
  }, [mint]);

  const handleError = useCallback(() => {
    if (retries.current < MAX_RETRIES) {
      retries.current += 1;
      setResumeAt(lastTime.current);
      void mint();
    } else {
      setError('The video stopped loading. Try again.');
    }
  }, [mint]);

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        bgcolor: '#000',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {loading && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress size={32} sx={{ color: 'common.white' }} aria-label="Loading the video" />
        </Box>
      )}

      {!loading && error && (
        <Box
          role="alert"
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            px: 3,
            textAlign: 'center',
            color: 'common.white',
          }}
        >
          <Typography variant="body2">{error}</Typography>
          <Button
            variant="outlined"
            onClick={() => {
              retries.current = 0;
              void mint();
            }}
            sx={{ minHeight: 48, textTransform: 'none', color: 'common.white', borderColor: 'grey.500' }}
          >
            Try again
          </Button>
        </Box>
      )}

      {!loading && !error && source && (
        <Box sx={{ position: 'absolute', inset: 0 }}>
          <NeramVideoPlayer
            source={source}
            gate={OPEN_GATE}
            title={title}
            marks={marks}
            resumeAt={resumeAt}
            allowFullscreen
            transportRef={transportRef}
            onTimeUpdate={(seconds, duration) => {
              if (seconds > lastTime.current + 1) retries.current = 0;
              lastTime.current = seconds;
              onTimeUpdate?.(seconds, duration);
            }}
            onLoadedMetadata={onLoadedMetadata}
            onError={handleError}
          />
        </Box>
      )}
    </Box>
  );
}
