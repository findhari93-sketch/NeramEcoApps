'use client';

/**
 * The one line on a test card that says where the student stands.
 *
 * It replaces four separate signals that used to be derived independently and
 * could disagree: a chip in the card's corner, a yellow banner in the middle, a
 * progress bar, and the button's label. A student had to assemble all four into
 * an answer to one question, and on 26 cards in production the answer came out
 * self-contradictory: a banner promising the test would open once they caught
 * up, directly above a disabled button saying "Closed".
 *
 * There is nothing to decide here. The sentence and the tone both arrive
 * resolved from the server (student-test-card-state.ts), so this renders and
 * nothing more. Keep it that way: a second derivation is how the contradiction
 * came back.
 */

import { Box, Typography } from '@neram/ui';
import LockClockOutlinedIcon from '@mui/icons-material/LockClockOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import type { StudentTestCard, StudentTestTone } from '@/lib/student-test-card-state';

/**
 * Colour is never the only carrier. Each state also has its own icon and its
 * own sentence, so the strip reads the same to a student who cannot tell the
 * tints apart.
 */
const ICONS: Record<StudentTestCard['state'], typeof ScheduleOutlinedIcon> = {
  open: PlayCircleOutlineIcon,
  reopened: LockOpenOutlinedIcon,
  upcoming: ScheduleOutlinedIcon,
  locked: LockClockOutlinedIcon,
  awaiting_teacher: HourglassEmptyOutlinedIcon,
  closed: EventBusyOutlinedIcon,
  missed: EventBusyOutlinedIcon,
  done: CheckCircleOutlineIcon,
};

/**
 * Tints, not fills. The text sits on the page background at full contrast and
 * the tint only marks the block, so the 4.5:1 floor holds in both themes
 * without a second palette.
 */
const TONES: Record<StudentTestTone, { bg: string; fg: string }> = {
  urgent: { bg: 'error.light', fg: 'error.dark' },
  attention: { bg: 'warning.light', fg: 'warning.dark' },
  positive: { bg: 'success.light', fg: 'success.dark' },
  neutral: { bg: 'action.hover', fg: 'text.secondary' },
};

export default function TestStatusStrip({ card }: { card: StudentTestCard }) {
  const Icon = ICONS[card.state];
  const tone = TONES[card.tone];

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        alignItems: 'flex-start',
        p: 1,
        borderRadius: 1.5,
        bgcolor: tone.bg,
      }}
    >
      <Icon sx={{ fontSize: 16, mt: '2px', flexShrink: 0, color: tone.fg }} />
      <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.45, color: 'text.primary' }}>
        {card.reason}
      </Typography>
    </Box>
  );
}
