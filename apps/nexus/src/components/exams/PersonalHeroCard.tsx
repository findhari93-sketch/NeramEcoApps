'use client';

import { Box, Typography, Paper, Button, Chip, alpha, useTheme } from '@neram/ui';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import type { NextExam, OverallProgress, ExamAttemptWithDate } from '@/types/unified-exams';

interface PersonalHeroCardProps {
  nextExam: NextExam | null;
  progress: OverallProgress;
  attempts: ExamAttemptWithDate[];
  onPickDate: () => void;
  onSwitchToSchedule: () => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

export default function PersonalHeroCard({ nextExam, progress, attempts, onPickDate, onSwitchToSchedule }: PersonalHeroCardProps) {
  const theme = useTheme();

  const hasAttempts = attempts.length > 0;
  const needsScores = attempts.some(a => a.state === 'completed');
  const allDone = progress.completed > 0 && progress.activated === progress.completed;

  // Determine hero content
  let heroContent: React.ReactNode;

  if (!hasAttempts) {
    // No attempts activated yet
    heroContent = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <CalendarTodayOutlinedIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="body1" fontWeight={600}>Get started with NATA 2026</Typography>
          <Typography variant="caption" color="text.secondary">Select your exam attempts below to begin tracking</Typography>
        </Box>
      </Box>
    );
  } else if (nextExam) {
    // Has an upcoming exam
    heroContent = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: 2,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CalendarTodayOutlinedIcon sx={{ color: 'primary.main' }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body1" fontWeight={700}>{formatDate(nextExam.date)}</Typography>
          <Typography variant="caption" color="text.secondary">
            {nextExam.city || 'City not set'} · Attempt {nextExam.attempt_number}
          </Typography>
        </Box>
        <Chip
          label={nextExam.days_away === 0 ? 'Today!' : `${nextExam.days_away}d`}
          size="small"
          color={nextExam.days_away <= 3 ? 'warning' : 'primary'}
          sx={{ fontWeight: 700, fontSize: '0.8rem' }}
        />
      </Box>
    );
  } else if (needsScores) {
    // Completed but no scores entered
    heroContent = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <EditNoteOutlinedIcon sx={{ fontSize: 32, color: 'success.main' }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="body1" fontWeight={600}>Exam completed</Typography>
          <Typography variant="caption" color="text.secondary">Enter your scores to complete tracking</Typography>
        </Box>
      </Box>
    );
  } else if (allDone && progress.best_score !== null) {
    // All done with scores
    heroContent = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <EmojiEventsOutlinedIcon sx={{ fontSize: 32, color: '#F9C74F' }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="body1" fontWeight={600}>Best Score: {progress.best_score}</Typography>
          <Typography variant="caption" color="text.secondary">{progress.completed} of {progress.total_possible} attempts completed</Typography>
        </Box>
      </Box>
    );
  } else {
    // Has attempts but no dates picked
    heroContent = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <CalendarTodayOutlinedIcon sx={{ fontSize: 32, color: 'warning.main' }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="body1" fontWeight={600}>Pick your exam date</Typography>
          <Typography variant="caption" color="text.secondary">Choose when you want to write NATA</Typography>
        </Box>
        <Button
          size="small"
          variant="contained"
          onClick={onPickDate}
          sx={{ textTransform: 'none', fontWeight: 600, minHeight: 36 }}
        >
          Pick Date
        </Button>
      </Box>
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderLeft: `3px solid ${theme.palette.primary.main}`,
        bgcolor: alpha(theme.palette.primary.main, 0.02),
      }}
    >
      {heroContent}
    </Paper>
  );
}
