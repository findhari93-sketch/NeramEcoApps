import { Box } from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { AI_STATUS_LABEL, type AiStatus } from '@/lib/aiarchitek/content';

const ICON = {
  free: CheckCircleOutlineIcon,
  classroom: SchoolOutlinedIcon,
  beta: ScienceOutlinedIcon,
  'coming-soon': ScheduleIcon,
} as const;

// The colour only tints the border and icon; the label stays text.primary so it
// reads at full contrast and the status never depends on colour alone.
const TONE: Record<AiStatus, string> = {
  free: 'success.main',
  classroom: 'primary.main',
  beta: 'warning.dark',
  'coming-soon': 'text.secondary',
};

export function StatusChip({ status }: { status: AiStatus }) {
  const Icon = ICON[status];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.25,
        border: '1px solid',
        borderColor: TONE[status],
        borderRadius: 999,
        fontSize: '0.8125rem',
        fontWeight: 600,
        color: 'text.primary',
        bgcolor: 'background.paper',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon aria-hidden sx={{ fontSize: 16, color: TONE[status] }} />
      {AI_STATUS_LABEL[status]}
    </Box>
  );
}
