'use client';

import { Box, Typography, Button, Chip, alpha, useTheme } from '@neram/ui';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { ExamAttemptWithDate } from '@/types/unified-exams';

interface AttemptNodeProps {
  attempt: ExamAttemptWithDate;
  onPickDate: () => void;
  onMarkCompleted: (id: string) => void;
  onEnterScores: (id: string) => void;
}

const STATE_COLORS: Record<string, string> = {
  planning: '#9E9E9E',
  applied: '#2196F3',
  completed: '#4CAF50',
  scorecard_uploaded: '#FF9800',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function getStateLabel(state: string): string {
  switch (state) {
    case 'planning': return 'Planning';
    case 'applied': return 'Date Picked';
    case 'completed': return 'Completed';
    case 'scorecard_uploaded': return 'Scores Entered';
    default: return state;
  }
}

export default function AttemptNode({ attempt, onPickDate, onMarkCompleted, onEnterScores }: AttemptNodeProps) {
  const theme = useTheme();
  const color = STATE_COLORS[attempt.state] || '#9E9E9E';
  const isDone = attempt.state === 'completed' || attempt.state === 'scorecard_uploaded';

  return (
    <Box sx={{ display: 'flex', gap: 1.5, py: 1.5 }}>
      {/* Timeline dot */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 0.25 }}>
        {isDone ? (
          <CheckCircleIcon sx={{ fontSize: 20, color }} />
        ) : (
          <FiberManualRecordIcon sx={{ fontSize: 16, color }} />
        )}
        <Box sx={{ flex: 1, width: 2, bgcolor: alpha(theme.palette.divider, 0.5), mt: 0.5 }} />
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="body2" fontWeight={600}>
            Attempt {attempt.attempt_number}
          </Typography>
          <Chip
            label={getStateLabel(attempt.state)}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.65rem',
              fontWeight: 600,
              bgcolor: alpha(color, 0.1),
              color,
            }}
          />
        </Box>

        {/* Date + city info */}
        {attempt.exam_date ? (
          <Typography variant="caption" color="text.secondary">
            {formatDate(attempt.exam_date)}
            {attempt.exam_city ? ` · ${attempt.exam_city}` : ''}
            {attempt.exam_session ? ` · ${attempt.exam_session === 'morning' ? 'AM' : 'PM'}` : ''}
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary">No date selected</Typography>
        )}

        {/* Scores */}
        {attempt.state === 'scorecard_uploaded' && attempt.total_score !== null && (
          <Box sx={{ display: 'flex', gap: 2, mt: 0.75 }}>
            <Typography variant="caption" color="text.secondary">
              Aptitude: <strong>{attempt.aptitude_score}</strong>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Drawing: <strong>{attempt.drawing_score}</strong>
            </Typography>
            <Typography variant="caption" fontWeight={700} color="primary.main">
              Total: {attempt.total_score}
            </Typography>
          </Box>
        )}

        {/* Action buttons */}
        <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
          {attempt.state === 'planning' && !attempt.exam_date && (
            <Button size="small" variant="outlined" onClick={onPickDate}
              sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 32 }}>
              Pick Date
            </Button>
          )}
          {attempt.state === 'applied' && (
            <Button size="small" variant="outlined" onClick={() => onMarkCompleted(attempt.id)}
              sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 32 }}>
              Mark Completed
            </Button>
          )}
          {attempt.state === 'completed' && (
            <Button size="small" variant="contained" onClick={() => onEnterScores(attempt.id)}
              sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 32 }}>
              Enter Scores
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}
