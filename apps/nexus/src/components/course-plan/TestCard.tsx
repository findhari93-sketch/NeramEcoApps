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
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';

interface TestData {
  id: string;
  title: string;
  description?: string | null;
  scope_description?: string | null;
  scheduled_date?: string | null;
  question_count?: number | null;
  duration_minutes?: number | null;
  test_id?: string | null;
  week?: { id: string; week_number: number; title: string } | null;
  max_marks?: number | null;
}

interface TestCardProps {
  test: TestData;
  isPast: boolean;
}

export default function TestCard({ test, isPast }: TestCardProps) {
  const theme = useTheme();

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        borderLeft: `4px solid ${isPast ? theme.palette.grey[400] : theme.palette.primary.main}`,
        opacity: isPast ? 0.85 : 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1.5,
            bgcolor: alpha(isPast ? theme.palette.grey[500] : theme.palette.primary.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <QuizOutlinedIcon
            sx={{
              fontSize: '1.2rem',
              color: isPast ? 'text.secondary' : 'primary.main',
            }}
          />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }} noWrap>
              {test.title}
            </Typography>
            {test.week && (
              <Chip
                label={test.week.title || `Week ${test.week.week_number}`}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.6rem',
                  fontWeight: 600,
                  bgcolor: alpha(theme.palette.info.main, 0.1),
                  color: 'info.main',
                }}
              />
            )}
          </Box>

          {/* Meta info row */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
            {test.scheduled_date && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <CalendarTodayOutlinedIcon sx={{ fontSize: '0.7rem', color: 'text.disabled' }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {formatDate(test.scheduled_date)}
                </Typography>
              </Box>
            )}
            {test.question_count != null && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <AssignmentOutlinedIcon sx={{ fontSize: '0.7rem', color: 'text.disabled' }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {test.question_count} questions
                </Typography>
              </Box>
            )}
            {test.duration_minutes != null && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <TimerOutlinedIcon sx={{ fontSize: '0.7rem', color: 'text.disabled' }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {test.duration_minutes} min
                </Typography>
              </Box>
            )}
          </Box>

          {/* Scope description */}
          {test.scope_description && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontSize: '0.7rem',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {test.scope_description}
            </Typography>
          )}

          {/* Action */}
          {!isPast && (
            <Box sx={{ mt: 1.5 }}>
              {test.test_id ? (
                <Button
                  variant="contained"
                  size="small"
                  href={`/student/tests/${test.test_id}`}
                  sx={{
                    textTransform: 'none',
                    minHeight: 40,
                    borderRadius: 2,
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    px: 2.5,
                    boxShadow: 'none',
                    '&:hover': { boxShadow: 'none' },
                  }}
                >
                  Start Test
                </Button>
              ) : (
                <Chip
                  label="Coming soon"
                  size="small"
                  sx={{
                    height: 28,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    bgcolor: alpha(theme.palette.grey[500], 0.1),
                    color: 'text.secondary',
                  }}
                />
              )}
            </Box>
          )}

          {isPast && (
            <Box sx={{ mt: 1 }}>
              <Chip
                label="Not taken"
                size="small"
                sx={{
                  height: 24,
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  bgcolor: alpha(theme.palette.grey[500], 0.1),
                  color: 'text.secondary',
                }}
              />
            </Box>
          )}
        </Box>
      </Box>
    </Paper>
  );
}
