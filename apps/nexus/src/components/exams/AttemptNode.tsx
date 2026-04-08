'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  alpha,
  useTheme,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  TextField,
  Drawer,
  useMediaQuery,
  Divider,
} from '@neram/ui';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import type { ExamAttemptWithDate } from '@/types/unified-exams';

interface AttemptNodeProps {
  attempt: ExamAttemptWithDate;
  onPickDate: () => void;
  onMarkCompleted: (id: string) => void;
  onEnterScores: (id: string) => void;
  onDeleteDate?: (id: string, reason: string) => void;
  onEditDate?: (id: string) => void;
}

const STATE_COLORS: Record<string, string> = {
  planning: '#9E9E9E',
  applied: '#2196F3',
  completed: '#4CAF50',
  scorecard_uploaded: '#FF9800',
};

const DELETION_REASONS = [
  'Wrong date selected',
  'Applied to a different date',
  'Not writing this attempt',
  'Other',
];

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

function RemoveDateSheet({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [reason, setReason] = useState('');
  const [otherText, setOtherText] = useState('');
  const [removing, setRemoving] = useState(false);

  const handleConfirm = async () => {
    const finalReason = reason === 'Other' ? otherText.trim() || 'Other' : reason;
    if (!finalReason) return;
    setRemoving(true);
    try {
      await onConfirm(finalReason);
    } finally {
      setRemoving(false);
      setReason('');
      setOtherText('');
    }
  };

  const content = (
    <Box sx={{ p: 3 }}>
      {isMobile && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Box sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.15) }} />
        </Box>
      )}

      <Typography variant="h6" fontWeight={700} gutterBottom>
        Remove Exam Date
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Select a reason for removing this exam date. Your teacher will be able to see this.
      </Typography>

      <FormControl fullWidth size="small" sx={{ mb: reason === 'Other' ? 2 : 0 }}>
        <InputLabel>Reason</InputLabel>
        <Select
          value={reason}
          label="Reason"
          onChange={e => setReason(e.target.value)}
        >
          {DELETION_REASONS.map(r => (
            <MenuItem key={r} value={r}>{r}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {reason === 'Other' && (
        <TextField
          fullWidth
          size="small"
          label="Please specify"
          value={otherText}
          onChange={e => setOtherText(e.target.value)}
          multiline
          rows={2}
        />
      )}

      <Box sx={{ display: 'flex', gap: 1.5, mt: 3 }}>
        <Button
          variant="outlined"
          fullWidth
          onClick={onClose}
          sx={{ textTransform: 'none' }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          fullWidth
          disabled={!reason || removing}
          onClick={handleConfirm}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          {removing ? 'Removing...' : 'Remove Date'}
        </Button>
      </Box>
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}
      >
        {content}
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ p: 0 }} />
      <DialogContent sx={{ p: 0 }}>{content}</DialogContent>
      <DialogActions sx={{ p: 0 }} />
    </Dialog>
  );
}

export default function AttemptNode({ attempt, onPickDate, onMarkCompleted, onEnterScores, onDeleteDate, onEditDate }: AttemptNodeProps) {
  const theme = useTheme();
  const [removeOpen, setRemoveOpen] = useState(false);
  const color = STATE_COLORS[attempt.state] || '#9E9E9E';
  const isDone = attempt.state === 'completed' || attempt.state === 'scorecard_uploaded';
  const hasDate = !!attempt.exam_date;
  const canEdit = hasDate && attempt.state !== 'scorecard_uploaded' && (onDeleteDate || onEditDate);

  return (
    <>
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
            {/* Edit button shown when attempt has a date and isn't fully done */}
            {canEdit && (
              <IconButton
                size="small"
                onClick={() => onEditDate ? onEditDate(attempt.id) : setRemoveOpen(true)}
                sx={{
                  ml: 'auto',
                  width: 28,
                  height: 28,
                  color: 'text.secondary',
                  '&:hover': { color: 'primary.main' },
                }}
              >
                <EditOutlinedIcon sx={{ fontSize: '0.9rem' }} />
              </IconButton>
            )}
          </Box>

          {/* Date + city info */}
          {attempt.exam_date ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">
                {formatDate(attempt.exam_date)}
                {attempt.exam_city ? ` · ${attempt.exam_city}` : ''}
                {attempt.exam_session ? ` · ${attempt.exam_session === 'morning' ? 'AM' : 'PM'}` : ''}
              </Typography>
              {onDeleteDate && hasDate && attempt.state !== 'scorecard_uploaded' && (
                <Typography
                  variant="caption"
                  color="error.main"
                  onClick={() => setRemoveOpen(true)}
                  sx={{ cursor: 'pointer', textDecoration: 'underline', ml: 0.5, fontWeight: 500 }}
                >
                  Remove
                </Typography>
              )}
            </Box>
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

      <Divider sx={{ ml: 4.5, opacity: 0.5 }} />

      <RemoveDateSheet
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        onConfirm={async (reason) => {
          if (onDeleteDate) {
            await onDeleteDate(attempt.id, reason);
          }
          setRemoveOpen(false);
        }}
      />
    </>
  );
}
