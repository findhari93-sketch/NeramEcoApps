'use client';

import { Box, Typography } from '@neram/ui';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import NoPhotographyOutlinedIcon from '@mui/icons-material/NoPhotographyOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import { dormantDetailsOf, type DormantDetailKind, type DormantRow } from '@/lib/not-started';

const ICON: Record<DormantDetailKind, React.ElementType> = {
  paused: PauseCircleOutlineIcon,
  back_in_nexus: LoginOutlinedIcon,
  not_started: HourglassEmptyOutlinedIcon,
  photo_step: NoPhotographyOutlinedIcon,
  teams: GroupsOutlinedIcon,
  reminded: NotificationsNoneOutlinedIcon,
};

/**
 * Why a dormant student is out of the numbers, as visible text under their name.
 *
 * The reason used to live only in the Dormant chip's tooltip, which a phone user
 * never sees and a teacher scanning a list never hovers. Text plus an icon, never
 * colour alone; the wording comes from dormantDetailsOf so every row says the same
 * thing the same way. Renders nothing for a participating student.
 */
export default function DormantDetailLine({ student, now }: { student: DormantRow; now: number }) {
  const details = dormantDetailsOf(student, now);
  if (!details.length) return null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.25, rowGap: 0.25, mt: 0.5, minWidth: 0 }}>
      {details.map((detail) => {
        const Icon = ICON[detail.kind];
        const warning = detail.tone === 'warning';
        return (
          <Box
            key={detail.kind}
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'flex-start',
              gap: 0.4,
              minWidth: 0,
              color: warning ? 'warning.dark' : 'text.secondary',
            }}
          >
            <Icon aria-hidden sx={{ fontSize: '0.95rem', mt: '1px', flexShrink: 0 }} />
            <Typography
              component="span"
              sx={{
                fontSize: '0.75rem',
                lineHeight: 1.4,
                color: 'inherit',
                fontWeight: warning ? 700 : 600,
                // A long reason wraps rather than widening the card.
                overflowWrap: 'anywhere',
              }}
            >
              {detail.text}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
