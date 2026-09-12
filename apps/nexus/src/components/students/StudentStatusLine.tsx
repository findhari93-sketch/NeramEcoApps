'use client';

import { Box, Typography } from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import NoAccountsOutlinedIcon from '@mui/icons-material/NoAccountsOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import AssignmentLateOutlinedIcon from '@mui/icons-material/AssignmentLateOutlined';
import { statusLineOf, type RosterStudent, type StudentActivity } from '@/lib/student-roster-view';

const ICON: Record<StudentActivity, React.ElementType> = {
  active: CheckCircleOutlineIcon,
  inactive: ScheduleOutlinedIcon,
  never_signed_in: PersonOffOutlinedIcon,
  no_microsoft: NoAccountsOutlinedIcon,
};

const TONE_COLOR = {
  neutral: 'text.secondary',
  warning: 'warning.dark',
  error: 'error.main',
} as const;

const TEXT = { fontSize: '0.75rem', lineHeight: 1.4 } as const;

/**
 * One line under a student's name: when they joined, whether they actually use
 * Nexus, and anything missing from their record. Text plus an icon, never colour
 * alone.
 *
 * Deliberately not an avatar ring. The ring already carries the study stage
 * (solid), "not set" (dotted) and dormant (dashed); a fourth meaning would make
 * every one of them ambiguous.
 */
export default function StudentStatusLine({
  student,
  now,
  attendance,
}: {
  student: RosterStudent;
  now: number;
  /** Shown only when the classroom has completed classes; pass null otherwise. */
  attendance?: number | null;
}) {
  const { joined, activity } = statusLineOf(student, now);
  const Icon = ICON[activity.key];

  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', columnGap: 1, rowGap: 0.25, flexWrap: 'wrap', minWidth: 0, mt: 0.25 }}
    >
      {joined && (
        <Typography component="span" sx={{ ...TEXT, color: 'text.secondary' }}>
          {joined}
        </Typography>
      )}
      <Box
        component="span"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: TONE_COLOR[activity.tone] }}
      >
        <Icon aria-hidden sx={{ fontSize: '0.95rem' }} />
        <Typography
          component="span"
          sx={{ ...TEXT, color: 'inherit', fontWeight: activity.tone === 'neutral' ? 500 : 700 }}
        >
          {activity.text}
        </Typography>
      </Box>
      {typeof attendance === 'number' && (
        <Typography component="span" sx={{ ...TEXT, color: 'text.secondary' }}>
          Att {attendance}%
        </Typography>
      )}
      {student.possible_duplicate_of && (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: 'warning.dark' }}>
          <PeopleAltOutlinedIcon aria-hidden sx={{ fontSize: '0.95rem' }} />
          <Typography component="span" sx={{ ...TEXT, color: 'inherit', fontWeight: 700 }}>
            May have two records
          </Typography>
        </Box>
      )}
      {/* Strictly false: an older payload without the check says nothing, rather
          than calling every student formless. */}
      {student.has_application_form === false && (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: 'text.secondary' }}>
          <AssignmentLateOutlinedIcon aria-hidden sx={{ fontSize: '0.95rem' }} />
          <Typography component="span" sx={{ ...TEXT, color: 'inherit', fontWeight: 600 }}>
            No application form
          </Typography>
        </Box>
      )}
    </Box>
  );
}
