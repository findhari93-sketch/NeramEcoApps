'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Drawer,
  Avatar,
  Chip,
  TextField,
  Button,
  IconButton,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReplayIcon from '@mui/icons-material/Replay';
import DownloadIcon from '@mui/icons-material/Download';
import ImageIcon from '@mui/icons-material/Image';
import type { HomeworkItem, StudentItem, SubmissionItem } from './HomeworkGradingGrid';

interface SubmissionReviewPanelProps {
  open: boolean;
  onClose: () => void;
  submission: SubmissionItem | null;
  homework: HomeworkItem | null;
  student: StudentItem | null;
  onReviewed: () => void;
  getToken: () => Promise<string | null>;
}

const STATUS_CHIP_COLOR: Record<string, 'default' | 'success' | 'info' | 'warning' | 'error'> = {
  reviewed: 'success',
  submitted: 'info',
  returned: 'warning',
  viewed: 'default',
  pending: 'default',
};

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i.test(lower);
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function SubmissionReviewPanel({
  open,
  onClose,
  submission,
  homework,
  student,
  onReviewed,
  getToken,
}: SubmissionReviewPanelProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [points, setPoints] = useState<string>('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Reset form when submission changes
  useEffect(() => {
    if (submission) {
      setPoints(submission.points_earned != null ? String(submission.points_earned) : '');
      setFeedback(submission.teacher_feedback || '');
    } else {
      setPoints('');
      setFeedback('');
    }
    setError(null);
  }, [submission]);

  const handleReview = async (status: 'reviewed' | 'returned') => {
    if (!submission || !homework) return;
    setSaving(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const body: Record<string, unknown> = {
        submission_id: submission.id,
        status,
        teacher_feedback: feedback || undefined,
      };

      if (points !== '') {
        const parsed = Number(points);
        if (isNaN(parsed) || parsed < 0) throw new Error('Invalid points value');
        if (homework.max_points && parsed > homework.max_points) {
          throw new Error(`Points cannot exceed ${homework.max_points}`);
        }
        body.points_earned = parsed;
      }

      const res = await fetch(`/api/course-plans/homework/${homework.id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save review');
      }

      onReviewed();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save review');
    } finally {
      setSaving(false);
    }
  };

  const attachments: any[] = submission?.attachments || [];

  const drawerContent = (
    <Box
      sx={{
        width: isMobile ? '100%' : 400,
        height: isMobile ? '90vh' : '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
          Review Submission
        </Typography>
        <IconButton onClick={onClose} sx={{ width: 40, height: 40 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {/* Student info */}
        {student && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar
              src={student.avatar_url || undefined}
              sx={{ width: 40, height: 40 }}
            >
              {getInitials(student.name)}
            </Avatar>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {student.name}
              </Typography>
              {student.email && (
                <Typography variant="caption" color="text.secondary">
                  {student.email}
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {/* Homework info */}
        {homework && (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {homework.title}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
              {homework.type && (
                <Chip label={homework.type} size="small" variant="outlined" sx={{ textTransform: 'capitalize', height: 24 }} />
              )}
              {homework.max_points != null && (
                <Chip label={`${homework.max_points} pts`} size="small" variant="outlined" sx={{ height: 24 }} />
              )}
            </Box>
          </Box>
        )}

        {/* Submission status */}
        {submission && (
          <Box>
            <Chip
              label={submission.status}
              color={STATUS_CHIP_COLOR[submission.status] || 'default'}
              size="small"
              sx={{ textTransform: 'capitalize', fontWeight: 600 }}
            />
            {submission.submitted_at && (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                {new Date(submission.submitted_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </Typography>
            )}
          </Box>
        )}

        {/* Text response */}
        {submission?.text_response && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5, display: 'block' }}>
              Student Response
            </Typography>
            <Box
              sx={{
                p: 1.5,
                bgcolor: 'grey.50',
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {submission.text_response}
              </Typography>
            </Box>
          </Box>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
              Attachments ({attachments.length})
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {attachments.map((att: any, idx: number) => {
                const url = typeof att === 'string' ? att : att?.url || att?.path || '';
                const name = typeof att === 'string' ? `File ${idx + 1}` : att?.name || `File ${idx + 1}`;

                if (isImageUrl(url)) {
                  return (
                    <Box
                      key={idx}
                      onClick={() => setImagePreview(url)}
                      sx={{
                        width: 80,
                        height: 80,
                        borderRadius: 1,
                        overflow: 'hidden',
                        border: '1px solid',
                        borderColor: 'divider',
                        cursor: 'pointer',
                        '&:hover': { opacity: 0.8 },
                      }}
                    >
                      <Box
                        component="img"
                        src={url}
                        alt={name}
                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </Box>
                  );
                }

                return (
                  <Button
                    key={idx}
                    variant="outlined"
                    size="small"
                    startIcon={url.toLowerCase().endsWith('.pdf') ? <DownloadIcon /> : <ImageIcon />}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ textTransform: 'none', minHeight: 48 }}
                  >
                    {name}
                  </Button>
                );
              })}
            </Box>
          </Box>
        )}

        {/* No submission state */}
        {!submission && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No submission yet from this student.
            </Typography>
          </Box>
        )}

        {/* Grading section — only show if there is a submission */}
        {submission && (
          <>
            <Box>
              <TextField
                label={homework?.max_points ? `Points (max ${homework.max_points})` : 'Points'}
                type="number"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                fullWidth
                size="small"
                inputProps={{
                  min: 0,
                  max: homework?.max_points || undefined,
                  step: 1,
                }}
                sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
              />
            </Box>

            <Box>
              <TextField
                label="Teacher Feedback"
                multiline
                minRows={3}
                maxRows={6}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                fullWidth
                size="small"
                placeholder="Write feedback for the student..."
              />
            </Box>
          </>
        )}

        {error && (
          <Typography variant="body2" color="error" sx={{ fontWeight: 600 }}>
            {error}
          </Typography>
        )}
      </Box>

      {/* Actions */}
      {submission && (
        <Box
          sx={{
            p: 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            gap: 1.5,
            flexDirection: isMobile ? 'column' : 'row',
          }}
        >
          <Button
            variant="contained"
            color="success"
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
            onClick={() => handleReview('reviewed')}
            disabled={saving}
            fullWidth={isMobile}
            sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
          >
            Mark Reviewed
          </Button>
          <Button
            variant="outlined"
            color="warning"
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <ReplayIcon />}
            onClick={() => handleReview('returned')}
            disabled={saving}
            fullWidth={isMobile}
            sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
          >
            Return for Revision
          </Button>
        </Box>
      )}

      {/* Image preview overlay */}
      {imagePreview && (
        <Box
          onClick={() => setImagePreview(null)}
          sx={{
            position: 'fixed',
            inset: 0,
            bgcolor: 'rgba(0,0,0,0.85)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            p: 2,
          }}
        >
          <Box
            component="img"
            src={imagePreview}
            alt="Preview"
            sx={{ maxWidth: '95%', maxHeight: '95%', borderRadius: 2 }}
          />
        </Box>
      )}
    </Box>
  );

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderRadius: isMobile ? '16px 16px 0 0' : 0,
          maxHeight: isMobile ? '90vh' : '100vh',
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
