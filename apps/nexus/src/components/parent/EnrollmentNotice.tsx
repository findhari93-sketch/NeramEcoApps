'use client';

import { Box, Typography, alpha, useTheme } from '@neram/ui';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import HistoryToggleOffIcon from '@mui/icons-material/HistoryToggleOff';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { EnrollmentNotice as Notice } from '@/lib/parent-enrollment';

/**
 * Why this page's numbers look the way they do.
 *
 * A parent reported that their child was in neither the "submitted" nor the
 * "not submitted" list for an assignment. Both lists were right: a dormant
 * student is deliberately excluded from every roster metric. Without this
 * banner the honest answer is indistinguishable from a bug, and the parent has
 * no way to find out which it is.
 *
 * Deliberately NOT an MUI Alert. An Alert reads as an error the parent caused,
 * and its default severity colours put "your child is paused" in the same
 * visual register as a failed form submission. This is an explanation, so it
 * gets a calm tinted card with room for a full sentence.
 *
 * Renders nothing when the child is simply active, so every caller can mount it
 * unconditionally and never branch.
 */

const ICONS = {
  dormant: PauseCircleOutlineIcon,
  removed: HistoryToggleOffIcon,
  late_joiner: InfoOutlinedIcon,
} as const;

export default function EnrollmentNotice({
  notice,
  sx,
}: {
  notice: Notice | null | undefined;
  sx?: object;
}) {
  const theme = useTheme();
  if (!notice) return null;

  const Icon = ICONS[notice.kind] ?? InfoOutlinedIcon;

  // Tone drives colour, but colour is never the only signal: the icon and the
  // headline say the same thing, so this reads correctly in greyscale and to a
  // colourblind parent.
  const accent =
    notice.tone === 'warning'
      ? theme.palette.warning.main
      : notice.tone === 'info'
        ? theme.palette.info.main
        : theme.palette.text.secondary;

  return (
    <Box
      role="status"
      sx={{
        display: 'flex',
        gap: 1.5,
        p: { xs: 2, sm: 2.25 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(accent, 0.32),
        bgcolor: alpha(accent, theme.palette.mode === 'light' ? 0.07 : 0.14),
        ...sx,
      }}
    >
      <Icon sx={{ color: accent, fontSize: 22, flexShrink: 0, mt: '1px' }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.35 }}>
          {notice.headline}
        </Typography>
        <Typography
          sx={{
            mt: 0.5,
            fontSize: 14,
            lineHeight: 1.55,
            color: 'text.secondary',
          }}
        >
          {notice.detail}
        </Typography>
      </Box>
    </Box>
  );
}
