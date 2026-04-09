'use client';

import { Box, Typography, Chip, Button, Paper, alpha, useTheme } from '@neram/ui';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';

interface ExamStatusCardProps {
  planState: string | null;
  targetYear: string | null;
  applicationNumber: string | null;
  examDate: string | null;
  examCity: string | null;
  onUpdateStatus: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

export default function ExamStatusCard({
  planState,
  targetYear,
  applicationNumber,
  examDate,
  examCity,
  onUpdateStatus,
}: ExamStatusCardProps) {
  const theme = useTheme();

  // Date booked — most complete state, show green
  if (examDate) {
    return (
      <Paper
        variant="outlined"
        sx={{
          px: 2,
          py: 1.25,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderColor: 'success.main',
          bgcolor: alpha(theme.palette.success.main, 0.04),
        }}
      >
        <EventAvailableOutlinedIcon sx={{ color: 'success.main', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" fontWeight={700} color="success.main" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.6rem' }}>
            My NATA Date
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {formatDate(examDate)}{examCity ? ` in ${examCity}` : ''}
          </Typography>
        </Box>
        <Chip label="Booked" size="small" color="success" />
      </Paper>
    );
  }

  // Not this year
  if (planState === 'not_this_year') {
    return (
      <Paper
        variant="outlined"
        sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: alpha(theme.palette.text.primary, 0.02) }}
      >
        <CalendarMonthOutlinedIcon sx={{ color: 'text.secondary', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.6rem' }}>
            My NATA Plan
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            Writing in {targetYear ?? 'a future year'}
          </Typography>
        </Box>
        <Button size="small" variant="outlined" onClick={onUpdateStatus} sx={{ textTransform: 'none', fontWeight: 600, minHeight: 32, flexShrink: 0 }}>
          Update
        </Button>
      </Paper>
    );
  }

  // Applied
  if (planState === 'applied') {
    return (
      <Paper
        variant="outlined"
        sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: alpha(theme.palette.primary.main, 0.03) }}
      >
        <AssignmentOutlinedIcon sx={{ color: 'primary.main', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" fontWeight={700} color="primary.main" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.6rem' }}>
            My NATA Plan
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            Applied for NATA{applicationNumber ? ` (${applicationNumber})` : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary">Pick a date when available</Typography>
        </Box>
        <Button size="small" variant="outlined" onClick={onUpdateStatus} sx={{ textTransform: 'none', fontWeight: 600, minHeight: 32, flexShrink: 0 }}>
          Update
        </Button>
      </Paper>
    );
  }

  // Planning to write
  if (planState === 'planning_to_write' || planState === 'still_thinking') {
    return (
      <Paper
        variant="outlined"
        sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: alpha(theme.palette.info.main, 0.03) }}
      >
        <PendingOutlinedIcon sx={{ color: 'info.main', flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" fontWeight={700} color="info.main" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.6rem' }}>
            My NATA Plan
          </Typography>
          <Typography variant="body2" fontWeight={600}>Planning to apply for 2025-26</Typography>
        </Box>
        <Button size="small" variant="outlined" onClick={onUpdateStatus} sx={{ textTransform: 'none', fontWeight: 600, minHeight: 32, flexShrink: 0 }}>
          Update
        </Button>
      </Paper>
    );
  }

  // No response yet
  return (
    <Paper
      variant="outlined"
      sx={{
        px: 2,
        py: 1.25,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        borderColor: 'warning.main',
        bgcolor: alpha(theme.palette.warning.main, 0.04),
      }}
    >
      <WarningAmberOutlinedIcon sx={{ color: 'warning.main', flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" fontWeight={700} color="warning.main" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.6rem' }}>
          My NATA Plan
        </Typography>
        <Typography variant="body2" fontWeight={600}>Haven&apos;t declared yet</Typography>
        <Typography variant="caption" color="text.secondary">Let your teacher know your plan</Typography>
      </Box>
      <Button size="small" variant="contained" onClick={onUpdateStatus} sx={{ textTransform: 'none', fontWeight: 600, minHeight: 32, flexShrink: 0 }}>
        Declare Now
      </Button>
    </Paper>
  );
}
