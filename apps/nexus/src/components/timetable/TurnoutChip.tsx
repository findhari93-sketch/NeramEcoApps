'use client';

import { Box, useTheme } from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { turnoutVerdict, type Turnout, type TurnoutKey } from '@/lib/class-availability';
import { tagSx, type TagTone } from './timetable-theme';
import type { RsvpSummary } from '@/app/api/timetable/rsvp-dashboard/route';

/**
 * Is this day worth running, as one chip.
 *
 * Three things carry the verdict and any one of them is enough on its own: the
 * word, the icon and the tone. A teacher who cannot tell the amber from the
 * green still reads "Very thin", and a screen reader gets the word because the
 * icon is aria-hidden and the text is real text rather than a background.
 *
 * The tones come from tagSx, which takes its text colour from `.dark` on each
 * palette entry rather than `.main`. That is load-bearing for the thin case:
 * the theme's `warning.main` on its own tint sits near 3.5:1, under the 4.5:1
 * this has to clear.
 */
const TONE: Record<TurnoutKey, TagTone> = {
  good: 'success',
  thin: 'warning',
  very_thin: 'error',
  empty: 'neutral',
};

const ICON: Record<TurnoutKey, typeof CheckCircleOutlineIcon> = {
  good: CheckCircleOutlineIcon,
  thin: TrendingDownIcon,
  very_thin: WarningAmberIcon,
  empty: RemoveCircleOutlineIcon,
};

/**
 * Takes either the summary or a verdict already computed from the realistic
 * headcount. Both routes end at the same thresholds in class-availability, so a
 * caller choosing one over the other changes which number is judged, never how.
 */
export default function TurnoutChip({
  summary,
  verdict: given,
}: {
  summary?: RsvpSummary;
  verdict?: Turnout;
}) {
  const theme = useTheme();
  const verdict = given ?? (summary ? turnoutVerdict(summary) : null);
  if (!verdict) return null;
  const Icon = ICON[verdict.key];

  return (
    <Box component="span" data-turnout={verdict.key} sx={tagSx(theme, TONE[verdict.key])}>
      <Icon aria-hidden sx={{ fontSize: 14 }} />
      {verdict.label}
    </Box>
  );
}
