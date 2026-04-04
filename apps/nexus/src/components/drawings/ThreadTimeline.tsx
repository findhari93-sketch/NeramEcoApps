'use client';

import { Box, Typography, Paper, Chip, Rating, Avatar } from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReplayIcon from '@mui/icons-material/Replay';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CategoryBadge from './CategoryBadge';
import type { DrawingThreadView } from '@neram/database/types';

interface ThreadTimelineProps {
  thread: DrawingThreadView;
  onAttemptClick: (submissionId: string) => void;
}

export default function ThreadTimeline({ thread, onAttemptClick }: ThreadTimelineProps) {
  const { thread_status, attempts } = thread;

  return (
    <Box sx={{ position: 'relative' }}>
      {/* Vertical line */}
      <Box sx={{
        position: 'absolute', left: 16, top: 20, bottom: 20, width: 2,
        bgcolor: 'divider', zIndex: 0,
      }} />

      {attempts.map((attempt, idx) => {
        const isLatest = idx === attempts.length - 1;
        const statusColor = attempt.status === 'completed' ? 'success.main'
          : attempt.status === 'redo' ? 'warning.main'
          : 'primary.main';

        return (
          <Box key={attempt.id} sx={{ position: 'relative', pl: 5, pb: 2.5 }}>
            {/* Timeline dot */}
            <Box sx={{
              position: 'absolute', left: 8, top: 8,
              width: 18, height: 18, borderRadius: '50%',
              bgcolor: statusColor, zIndex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {attempt.status === 'completed' ? (
                <CheckCircleIcon sx={{ fontSize: 14, color: '#fff' }} />
              ) : attempt.status === 'redo' ? (
                <ReplayIcon sx={{ fontSize: 12, color: '#fff' }} />
              ) : (
                <AccessTimeIcon sx={{ fontSize: 12, color: '#fff' }} />
              )}
            </Box>

            {/* Attempt card */}
            <Paper
              variant="outlined"
              sx={{
                p: 1.5, cursor: 'pointer',
                border: isLatest ? '2px solid' : '1px solid',
                borderColor: isLatest ? 'primary.main' : 'divider',
                '&:hover': { bgcolor: 'action.hover' },
              }}
              onClick={() => onAttemptClick(attempt.id)}
            >
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                {/* Thumbnail */}
                <Box
                  component="img"
                  src={attempt.reviewed_image_url || attempt.original_image_url}
                  alt={`Attempt ${attempt.attempt_number}`}
                  sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                    <Typography variant="body2" fontWeight={600}>
                      Attempt #{attempt.attempt_number}
                    </Typography>
                    <Chip
                      label={attempt.status}
                      size="small"
                      color={attempt.status === 'completed' ? 'success' : attempt.status === 'redo' ? 'warning' : 'default'}
                      sx={{ height: 20, fontSize: '0.65rem' }}
                    />
                  </Box>

                  {attempt.tutor_rating && (
                    <Rating value={attempt.tutor_rating} readOnly size="small" sx={{ fontSize: '0.9rem' }} />
                  )}

                  {attempt.tutor_feedback && (
                    <Typography variant="caption" color="text.secondary" sx={{
                      display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden', mt: 0.25,
                    }}>
                      {attempt.tutor_feedback}
                    </Typography>
                  )}

                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                    {new Date(attempt.submitted_at).toLocaleDateString()}
                  </Typography>
                </Box>
              </Box>

              {/* Comments count */}
              {attempt.comments.length > 0 && (
                <Typography variant="caption" color="primary" sx={{ mt: 0.5, display: 'block' }}>
                  {attempt.comments.length} comment{attempt.comments.length > 1 ? 's' : ''}
                </Typography>
              )}
            </Paper>
          </Box>
        );
      })}

      {/* Thread status banner */}
      {thread_status.status === 'completed' && (
        <Box sx={{
          pl: 5, display: 'flex', alignItems: 'center', gap: 1,
          color: 'success.main', py: 1,
        }}>
          <CheckCircleIcon fontSize="small" />
          <Typography variant="body2" fontWeight={600}>
            Completed after {thread_status.total_attempts} attempt{thread_status.total_attempts > 1 ? 's' : ''}
          </Typography>
        </Box>
      )}

      {thread_status.status === 'redo' && (
        <Box sx={{
          pl: 5, display: 'flex', alignItems: 'center', gap: 1,
          color: 'warning.main', py: 1,
        }}>
          <ReplayIcon fontSize="small" />
          <Typography variant="body2" fontWeight={600}>
            Improvement requested — submit your next attempt
          </Typography>
        </Box>
      )}

      {thread_status.status === 'active' && (
        <Box sx={{
          pl: 5, display: 'flex', alignItems: 'center', gap: 1,
          color: 'text.secondary', py: 1,
        }}>
          <AccessTimeIcon fontSize="small" />
          <Typography variant="body2">
            Pending teacher review
          </Typography>
        </Box>
      )}
    </Box>
  );
}
