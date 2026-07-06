'use client';

/**
 * Grade one student's submission: view their files, enter marks out of the
 * assignment max, write feedback, then Save review or Request redo. Prev/next
 * arrows let a teacher grade the whole class without leaving the sheet.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Drawer,
  Stack,
  Typography,
  IconButton,
  TextField,
  Button,
  Avatar,
  Chip,
  Divider,
  alpha,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RedoIcon from '@mui/icons-material/Redo';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SubmissionFiles, { type SubmissionFile } from './SubmissionFiles';

export interface ReviewRow {
  student: { id: string; name: string | null; email: string | null; avatar_url: string | null };
  submission: {
    id: string;
    files: SubmissionFile[];
    status: string;
    attempt_number: number;
    marks: number | null;
    feedback: string | null;
    submitted_at: string;
  } | null;
  bucket: 'submitted' | 'late' | 'missing';
}

interface SubmissionReviewSheetProps {
  open: boolean;
  row: ReviewRow | null;
  maxMarks: number;
  busy: boolean;
  onClose: () => void;
  onReview: (submissionId: string, marks: number | null, feedback: string, action: 'complete' | 'redo') => Promise<void>;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export default function SubmissionReviewSheet({
  open,
  row,
  maxMarks,
  busy,
  onClose,
  onReview,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: SubmissionReviewSheetProps) {
  const [marks, setMarks] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setMarks(row?.submission?.marks != null ? String(row.submission.marks) : '');
    setFeedback(row?.submission?.feedback || '');
    setError('');
  }, [row?.submission?.id]);

  const submission = row?.submission ?? null;

  const submit = async (action: 'complete' | 'redo') => {
    if (!submission) return;
    let marksVal: number | null = null;
    if (action === 'complete') {
      if (marks.trim() === '') {
        setError('Enter marks, or use Request redo.');
        return;
      }
      const m = Number(marks);
      if (!Number.isFinite(m) || m < 0 || m > maxMarks) {
        setError(`Marks must be between 0 and ${maxMarks}.`);
        return;
      }
      marksVal = m;
    } else {
      marksVal = marks.trim() === '' ? null : Number(marks);
    }
    setError('');
    await onReview(submission.id, marksVal, feedback.trim(), action);
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { maxHeight: '94vh', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
      }}
    >
      <Box sx={{ p: 2.5, overflowY: 'auto' }}>
        {/* Header + student nav */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <IconButton onClick={onPrev} disabled={!hasPrev} sx={{ minWidth: 44, minHeight: 44 }}>
            <ChevronLeftIcon />
          </IconButton>
          <Avatar src={row?.student.avatar_url || undefined} sx={{ width: 36, height: 36, bgcolor: 'primary.dark' }}>
            {(row?.student.name || '?').slice(0, 1).toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700 }} noWrap>
              {row?.student.name || 'Student'}
            </Typography>
            {submission && (
              <Typography variant="caption" color="text.secondary">
                Attempt {submission.attempt_number} ·{' '}
                {new Date(submission.submitted_at).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Typography>
            )}
          </Box>
          <IconButton onClick={onNext} disabled={!hasNext} sx={{ minWidth: 44, minHeight: 44 }}>
            <ChevronRightIcon />
          </IconButton>
          <IconButton onClick={onClose} sx={{ minWidth: 44, minHeight: 44 }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {!submission ? (
          <Box sx={{ textAlign: 'center', py: 5 }}>
            <Typography color="text.secondary">This student has not submitted yet.</Typography>
          </Box>
        ) : (
          <Stack spacing={2}>
            {row?.bucket === 'late' && (
              <Chip
                label="Submitted late"
                size="small"
                sx={{ width: 'fit-content', bgcolor: alpha('#EF6C00', 0.14), color: '#B54700', fontWeight: 700 }}
              />
            )}
            <SubmissionFiles files={submission.files} />

            <Divider />

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                Marks
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  value={marks}
                  onChange={(e) => setMarks(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputProps={{ inputMode: 'decimal' }}
                  size="small"
                  sx={{ width: 100 }}
                  placeholder="0"
                />
                <Typography color="text.secondary">out of {maxMarks}</Typography>
              </Stack>
            </Box>

            <TextField
              label="Feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              fullWidth
              multiline
              rows={3}
              placeholder="What was good, what to fix..."
            />

            {error && (
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            )}

            <Stack direction="row" spacing={1.5}>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<RedoIcon />}
                disabled={busy}
                onClick={() => submit('redo')}
                sx={{ flex: 1, minHeight: 48 }}
              >
                Request redo
              </Button>
              <Button
                variant="contained"
                startIcon={<CheckCircleOutlineIcon />}
                disabled={busy}
                onClick={() => submit('complete')}
                sx={{ flex: 1, minHeight: 48 }}
              >
                Save review
              </Button>
            </Stack>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}
