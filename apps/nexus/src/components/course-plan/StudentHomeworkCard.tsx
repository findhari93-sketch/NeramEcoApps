'use client';

import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  alpha,
  useTheme,
} from '@neram/ui';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import StarOutlineIcon from '@mui/icons-material/StarOutline';

interface SubmissionData {
  id: string;
  status: string;
  points_earned?: number | null;
  teacher_feedback?: string | null;
  submitted_at?: string | null;
  attachments?: Array<{ url: string; name: string }>;
}

interface HomeworkData {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  due_date?: string | null;
  max_points?: number | null;
}

interface StudentHomeworkCardProps {
  homework: HomeworkData;
  submission: SubmissionData | null;
  onSubmit: (homework: HomeworkData) => void;
}

const TYPE_COLORS: Record<string, string> = {
  drawing: '#9C27B0',
  mcq: '#2196F3',
  study: '#4CAF50',
  review: '#FF9800',
  mixed: '#607D8B',
};

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string }> = {
  pending: { color: '#E65100', bgColor: '#FFF3E0', label: 'Pending' },
  submitted: { color: '#1565C0', bgColor: '#E3F2FD', label: 'Submitted' },
  reviewed: { color: '#2E7D32', bgColor: '#E8F5E9', label: 'Reviewed' },
  returned: { color: '#C62828', bgColor: '#FFEBEE', label: 'Returned' },
};

export default function StudentHomeworkCard({ homework, submission, onSubmit }: StudentHomeworkCardProps) {
  const theme = useTheme();
  const status = submission?.status || 'pending';
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const canSubmit = status === 'pending' || status === 'returned';

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const isOverdue = homework.due_date && new Date(homework.due_date) < new Date() && status === 'pending';

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        borderLeft: `4px solid ${statusCfg.color}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1.5,
            bgcolor: alpha(statusCfg.color, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {status === 'reviewed' ? (
            <CheckCircleOutlineIcon sx={{ fontSize: '1.2rem', color: statusCfg.color }} />
          ) : (
            <AssignmentOutlinedIcon sx={{ fontSize: '1.2rem', color: statusCfg.color }} />
          )}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }} noWrap>
              {homework.title}
            </Typography>
            <Chip
              label={statusCfg.label}
              size="small"
              sx={{
                height: 22,
                fontSize: '0.6rem',
                fontWeight: 700,
                bgcolor: statusCfg.bgColor,
                color: statusCfg.color,
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label={homework.type}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6rem',
                fontWeight: 600,
                bgcolor: alpha(TYPE_COLORS[homework.type] || '#607D8B', 0.1),
                color: TYPE_COLORS[homework.type] || '#607D8B',
              }}
            />
            {homework.due_date && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <AccessTimeIcon sx={{ fontSize: '0.7rem', color: isOverdue ? 'error.main' : 'text.disabled' }} />
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.65rem',
                    color: isOverdue ? 'error.main' : 'text.secondary',
                    fontWeight: isOverdue ? 600 : 400,
                  }}
                >
                  {isOverdue ? 'Overdue' : `Due ${formatDate(homework.due_date)}`}
                </Typography>
              </Box>
            )}
            {homework.max_points != null && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <StarOutlineIcon sx={{ fontSize: '0.7rem', color: 'text.disabled' }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {homework.max_points} pts
                </Typography>
              </Box>
            )}
          </Box>

          {/* Teacher feedback preview for reviewed submissions */}
          {status === 'reviewed' && submission && (
            <Box
              sx={{
                mt: 1,
                p: 1,
                borderRadius: 1.5,
                bgcolor: alpha(theme.palette.success.main, 0.05),
                border: `1px solid ${alpha(theme.palette.success.main, 0.15)}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                <StarOutlineIcon sx={{ fontSize: '0.8rem', color: 'success.main' }} />
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main' }}>
                  {submission.points_earned ?? 0}/{homework.max_points ?? 0} points
                </Typography>
              </Box>
              {submission.teacher_feedback && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                  {submission.teacher_feedback.length > 100
                    ? `${submission.teacher_feedback.slice(0, 100)}...`
                    : submission.teacher_feedback}
                </Typography>
              )}
            </Box>
          )}

          {/* Returned feedback */}
          {status === 'returned' && submission?.teacher_feedback && (
            <Box
              sx={{
                mt: 1,
                p: 1,
                borderRadius: 1.5,
                bgcolor: alpha(theme.palette.error.main, 0.05),
                border: `1px solid ${alpha(theme.palette.error.main, 0.15)}`,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'error.main', fontSize: '0.7rem' }}>
                Feedback: {submission.teacher_feedback}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {canSubmit && (
        <Button
          variant="contained"
          fullWidth
          size="small"
          onClick={() => onSubmit(homework)}
          sx={{
            mt: 1.5,
            textTransform: 'none',
            minHeight: 48,
            borderRadius: 2,
            fontWeight: 600,
            fontSize: '0.85rem',
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' },
          }}
        >
          {status === 'returned' ? 'Resubmit' : 'Submit'}
        </Button>
      )}
    </Paper>
  );
}
