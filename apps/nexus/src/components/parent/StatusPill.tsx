'use client';

import { Box, useTheme } from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CancelIcon from '@mui/icons-material/CancelOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { tagSx } from '@/components/timetable/timetable-theme';
import type { StatusDescriptor, StatusTone } from '@/lib/parent-status';

/**
 * One state, said twice: as a word and as a shape.
 *
 * Colour alone fails roughly one man in twelve, and it fails everyone reading a
 * printed report or a greyscale screenshot. Every pill therefore carries an icon
 * whose meaning does not depend on hue (tick, warning triangle, cross) alongside
 * the label, and the colour is the third signal rather than the only one.
 *
 * Styling comes from tagSx in the timetable theme, the same helper the student
 * and teacher calendars use, so a parent's "Attended" pill is visually identical
 * to the one their child sees.
 */

const ICONS: Record<StatusTone, typeof CheckCircleIcon> = {
  success: CheckCircleIcon,
  warning: ErrorOutlineIcon,
  error: CancelIcon,
  primary: InfoOutlinedIcon,
  neutral: RemoveCircleOutlineIcon,
};

export default function StatusPill({
  status,
  showIcon = true,
  sx,
}: {
  status: StatusDescriptor | null | undefined;
  showIcon?: boolean;
  sx?: object;
}) {
  const theme = useTheme();
  if (!status) return null;

  const Icon = ICONS[status.tone] ?? InfoOutlinedIcon;

  return (
    <Box
      component="span"
      // The label alone is the accessible name; the icon is decorative because
      // it repeats what the text already says.
      sx={{ ...tagSx(theme, status.tone), ...sx }}
    >
      {showIcon && <Icon aria-hidden sx={{ fontSize: '0.875rem' }} />}
      {status.label}
    </Box>
  );
}
