'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  IconButton,
  Skeleton,
  Drawer,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import NeramVideoPlayer from '@/components/video/NeramVideoPlayer';
import { renewFromEmbed } from '@/components/video/renew-from-embed';
import { videoOverlayDialogProps } from '@/components/video/overlay-dialog';
import type { VideoTransport } from '@/components/video/types';
import { OPEN_GATE, type VideoGate } from '@/lib/video-gate';
import { useAuthFetch } from '@/components/curriculum/shared';
import type { SkippedPart } from '@/lib/trim-skipped-parts';

/**
 * Plays one pause the trim skipped, from the untrimmed Teams recording.
 *
 * The recap plays speaking only (founder, 2026-10-16). A student who wants to
 * see what was on screen in a skipped pause taps "Watch it" in the player, and
 * this opens: a bottom sheet on a phone, a dialog on a laptop. The class stays
 * paused behind it, and "Back to class" picks up exactly where it was.
 *
 * What it will not do:
 *   - give credit. It carries no watch session, so the checkpoints and the
 *     saved place stay on the trimmed recording the student is passing;
 *   - let the original be used to look past a locked checkpoint. Playback
 *     stops at the end of the skipped part. Everything before it the student
 *     has already reached, because the chip only appears once they have played
 *     past the join.
 */
export interface SkippedPartSheetProps {
  recapId: string;
  part: SkippedPart | null;
  onClose: () => void;
  /** The fullscreen player's container while it is fullscreen, as for the quiz. */
  container?: HTMLElement | null;
}

/** Seconds of the original shown before the skipped part, for context. */
const LEAD_IN = 2;
/** And after it, so the class is seen picking up again. */
const LEAD_OUT = 1;

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function SkippedPartSheet({ recapId, part, onClose, container }: SkippedPartSheetProps) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const open = part !== null;
  const titleId = 'skipped-part-title';

  return phone ? (
    // A plain drawer, not a swipeable one: a swipe on the video seeks, and a
    // sheet that also closed on a downward swipe would fight it.
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      container={container ?? undefined}
      PaperProps={{
        ...videoOverlayDialogProps,
        'aria-labelledby': titleId,
        sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, pb: 'env(safe-area-inset-bottom)' },
      } as any}
    >
      {part && <SheetBody recapId={recapId} part={part} onClose={onClose} titleId={titleId} />}
    </Drawer>
  ) : (
    <Dialog
      open={open}
      onClose={onClose}
      container={container ?? undefined}
      maxWidth="md"
      fullWidth
      aria-labelledby={titleId}
      PaperProps={{ ...videoOverlayDialogProps, sx: { borderRadius: 3 } } as any}
    >
      {part && <SheetBody recapId={recapId} part={part} onClose={onClose} titleId={titleId} />}
    </Dialog>
  );
}

function SheetBody({
  recapId,
  part,
  onClose,
  titleId,
}: {
  recapId: string;
  part: SkippedPart;
  onClose: () => void;
  titleId: string;
}) {
  const authFetch = useAuthFetch();
  const transportRef = useRef<VideoTransport | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [watermark, setWatermark] = useState<{ name: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  const url = `/api/student/class-recaps/${recapId}/video-embed?variant=original`;
  const renew = useMemo(() => renewFromEmbed(authFetch, url), [authFetch, url]);

  const start = Math.max(0, part.from - LEAD_IN);
  const end = part.to + LEAD_OUT;
  // Stops at the end of the skipped part and never offers a quiz there.
  const gate = useMemo<VideoGate>(
    () => ({ ...OPEN_GATE, unlockedUntil: end, seekCeiling: end, quizReady: false }),
    [end],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await authFetch(url);
      setWatermark(data.watermark || { name: 'Neram student', code: 'NX-000000' });
      setStreamUrl(data.streamUrl || data.src || null);
      if (!data.streamUrl && !data.src) setError('The full recording is not available for this class.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the full recording.');
    }
  }, [authFetch, url]);

  useEffect(() => {
    load();
  }, [load]);

  // The student tapped "Watch it", so start it. A browser that refuses (the tap
  // was too long ago) leaves the play button, which is fine.
  const onLoaded = useCallback(() => {
    transportRef.current?.play();
  }, []);

  const onTimeUpdate = useCallback((seconds: number) => {
    if (seconds >= end - 0.25) setEnded(true);
  }, [end]);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, pt: { xs: 1.5, sm: 2.5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id={titleId} variant="h6" component="h2" sx={{ fontWeight: 800, fontSize: { xs: 17, sm: 19 } }}>
            The part we skipped
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {clock(part.to - part.from)} with nobody speaking, from the full recording.
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Back to class" sx={{ width: 48, height: 48, mt: -0.5, mr: -1 }}>
          <CloseRoundedIcon />
        </IconButton>
      </Box>

      <Box
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: '#000',
        }}
      >
        {error ? (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
              p: 2,
              textAlign: 'center',
              color: '#fff',
            }}
          >
            <Typography variant="body2">{error}</Typography>
            <Button
              variant="outlined"
              onClick={load}
              sx={{ minHeight: 44, textTransform: 'none', color: '#fff', borderColor: 'rgba(255,255,255,0.5)' }}
            >
              Try again
            </Button>
          </Box>
        ) : streamUrl && watermark ? (
          <NeramVideoPlayer
            source={{ kind: 'html5', src: streamUrl, renew }}
            gate={gate}
            transportRef={transportRef}
            watermark={watermark}
            resumeAt={start}
            onLoadedMetadata={onLoaded}
            onTimeUpdate={onTimeUpdate}
            lockLabel="The skipped part ends at the lock."
          />
        ) : (
          <Skeleton variant="rectangular" sx={{ position: 'absolute', inset: 0, bgcolor: 'grey.900' }} />
        )}
      </Box>

      <Typography variant="body2" color="text.secondary" role="status" sx={{ mt: 1.5 }}>
        {ended
          ? 'That is the end of the skipped part.'
          : 'This does not count towards your checkpoints. The class waits where you left it.'}
      </Typography>

      <Button
        variant="contained"
        fullWidth
        onClick={onClose}
        sx={{ mt: 2, minHeight: 48, textTransform: 'none', fontWeight: 800, borderRadius: 99 }}
      >
        Back to class
      </Button>
    </Box>
  );
}
