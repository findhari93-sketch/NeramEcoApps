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
 * the section to have been played. This says how far along they are and offers
 * one press that plays only the parts they missed, then opens the quiz as soon
 * as enough is covered.
 *
 * It used to offer "Play the part I missed", which went to the first gap and
 * played straight on to the checkpoint. One skipped minute early in a section
 * meant replaying the whole rest of it, and a student on a weak connection did
 * that several times over (Inaya, 2026-10-12).
 *
 * Sized for a phone first: a 16:9 player on a 375px screen is about 211px tall,
 * so the card is one sentence, a thin bar and one 48px button. The bar has the
 * quiz mark on it and the sentence says the same in words, so nothing relies on
 * colour alone.
 *
 * Same layer and look as CheckpointNotice. The card takes pointer events (it
 * has a button); the dimmed backdrop does not, so a tap on the picture still
 * reaches it.
 */

export interface WatchMoreNoticeProps {
  watchedSeconds: number;
  requiredSeconds: number;
  sectionSeconds: number;
  /** How many separate stretches are missing, and how long they come to. */
  parts: number;
  missingSeconds: number;
  /** Null hides the button: nothing worth naming is missing, just a little short. */
  onPlayMissed: (() => void) | null;
}

/** Short enough for one line on a 375px phone, where the card is about 300px wide. */
export function playMissedLabel(parts: number, missingSeconds: number): string {
  const what = parts === 1 ? 'the missed part' : `${parts} missed parts`;
  return `Play ${what} (${formatClock(missingSeconds)})`;
}

export default function WatchMoreNotice({
  watchedSeconds,
  requiredSeconds,
  sectionSeconds,
  parts,
  missingSeconds,
  onPlayMissed,
}: WatchMoreNoticeProps) {
  const pct = sectionSeconds > 0 ? Math.min(100, Math.round((watchedSeconds / sectionSeconds) * 100)) : 0;
  const needPct = sectionSeconds > 0 ? Math.min(100, Math.round((requiredSeconds / sectionSeconds) * 100)) : 0;
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
        px: { xs: 1.5, sm: 2 },
      }}
    >
      <Box
        sx={{
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: 1, sm: 1.25 },
          maxWidth: 440,
          width: '100%',
          px: { xs: 2, sm: 2.5 },
          py: { xs: 1.5, sm: 1.75 },
          borderRadius: 3,
          bgcolor: 'rgba(0,0,0,0.85)',
          color: '#fff',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <VisibilityRoundedIcon aria-hidden sx={{ fontSize: 26, flexShrink: 0, mt: 0.25 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: '0.95rem', sm: '1rem' }, lineHeight: 1.3 }}>
              Watch a bit more to unlock the quiz
            </Typography>
            <Typography sx={{ fontSize: '0.85rem', lineHeight: 1.45, color: 'rgba(255,255,255,0.88)' }}>
              You have watched {pct}% of this section. The quiz opens at {needPct}%.
            </Typography>
          </Box>
        </Box>

        {/* The words above carry the meaning; this is the same thing at a glance. */}
        <Box aria-hidden sx={{ position: 'relative', height: 6, borderRadius: 99, bgcolor: 'rgba(255,255,255,0.22)' }}>
          <Box
            sx={{
              width: `${pct}%`,
              height: '100%',
              borderRadius: 99,
              bgcolor: '#fff',
              transition: 'width 250ms ease-out',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              top: -3,
              left: `calc(${needPct}% - 1px)`,
              width: 2,
              height: 12,
              borderRadius: 1,
              bgcolor: '#FFD54F',
            }}
          />
        </Box>

        {onPlayMissed && parts > 0 && (
          <Button
            variant="contained"
            onClick={onPlayMissed}
            startIcon={<PlayArrowRoundedIcon />}
            sx={{
              alignSelf: { xs: 'stretch', sm: 'flex-start' },
              minHeight: 48,
              textTransform: 'none',
              fontWeight: 700,
              '&:focus-visible': { outline: '2px solid #fff', outlineOffset: 2 },
            }}
          >
            {playMissedLabel(parts, missingSeconds)}
          </Button>
        )}
      </Box>
    </Box>
  );
}
