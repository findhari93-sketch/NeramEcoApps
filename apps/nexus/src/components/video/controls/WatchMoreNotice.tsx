'use client';

import { Box, Button, Typography } from '@neram/ui';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { formatClock } from '../format';

/**
 * Why the video stopped at a checkpoint without opening its quiz.
 *
 * The owed section can be dragged through freely, so a student can arrive at
 * the checkpoint having watched very little of it. The quiz waits for most of
 * the section to have been played, and this says so, with how far along they
 * are and one press back to the part they skipped. Without the button the only
 * way forward would be guessing where on the bar the gap was.
 *
 * Same layer and look as CheckpointNotice. The card takes pointer events (it
 * has a button); the dimmed backdrop does not, so a tap on the picture still
 * reaches it.
 */

export interface WatchMoreNoticeProps {
  watchedSeconds: number;
  requiredSeconds: number;
  sectionSeconds: number;
  /** Null hides the button: nothing worth naming is missing, just a little short. */
  onPlayMissed: (() => void) | null;
}

export default function WatchMoreNotice({
  watchedSeconds,
  requiredSeconds,
  sectionSeconds,
  onPlayMissed,
}: WatchMoreNoticeProps) {
  const pct = sectionSeconds > 0 ? Math.min(100, Math.round((watchedSeconds / sectionSeconds) * 100)) : 0;
  const needPct = sectionSeconds > 0 ? Math.round((requiredSeconds / sectionSeconds) * 100) : 0;
  return (
    <Box
      role="status"
      sx={{
        position: 'absolute',
        inset: 0,
        // Above every control the player draws, below the quiz itself (10).
        zIndex: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'rgba(0,0,0,0.45)',
        pointerEvents: 'none',
        px: 2,
      }}
    >
      <Box
        sx={{
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
          maxWidth: 420,
          width: '100%',
          px: 2.5,
          py: 1.75,
          borderRadius: 3,
          bgcolor: 'rgba(0,0,0,0.82)',
          color: '#fff',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <VisibilityRoundedIcon sx={{ fontSize: 28, flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.3 }}>
              Watch a bit more to unlock the quiz
            </Typography>
            <Typography sx={{ fontSize: '0.85rem', lineHeight: 1.45, color: 'rgba(255,255,255,0.82)' }}>
              You have watched {pct}% of this section ({formatClock(watchedSeconds)} of{' '}
              {formatClock(sectionSeconds)}). The quiz opens at {needPct}%.
            </Typography>
          </Box>
        </Box>
        {onPlayMissed && (
          <Button
            variant="contained"
            onClick={onPlayMissed}
            startIcon={<PlayArrowRoundedIcon />}
            sx={{
              alignSelf: 'flex-start',
              minHeight: 48,
              textTransform: 'none',
              fontWeight: 700,
              '&:focus-visible': { outline: '2px solid #fff', outlineOffset: 2 },
            }}
          >
            Play the part I missed
          </Button>
        )}
      </Box>
    </Box>
  );
}
