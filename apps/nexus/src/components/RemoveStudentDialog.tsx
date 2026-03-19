'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Avatar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Alert,
} from '@neram/ui';
import type { RemovalReasonCategory } from '@neram/database';

const REASON_LABELS: Record<RemovalReasonCategory, string> = {
  fee_nonpayment: 'Did not pay fees',
  course_completed: 'Completed the course',
  college_admitted: 'Got into college',
  self_withdrawal: 'Student withdrew',
  disciplinary: 'Disciplinary reasons',
  other: 'Other reason',
};

interface StudentToRemove {
  enrollmentId: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
}

interface RemoveStudentDialogProps {
  open: boolean;
  onClose: () => void;
  students: StudentToRemove[];
  classroomId: string;
  onRemoved: () => void;
  getToken: () => Promise<string | null>;
}

export default function RemoveStudentDialog({
  open,
  onClose,
  students,
  classroomId,
  onRemoved,
  getToken,
}: RemoveStudentDialogProps) {
  const [reasonCategory, setReasonCategory] = useState<RemovalReasonCategory | ''>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const canSubmit =
    reasonCategory !== '' &&
    (reasonCategory !== 'other' || notes.trim().length > 0) &&
    !submitting;

  const handleRemove = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`/api/classrooms/${classroomId}/enrollments`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enrollment_ids: students.map((s) => s.enrollmentId),
          reason_category: reasonCategory,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove students');
      }

      onRemoved();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove students');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setReasonCategory('');
    setNotes('');
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          mx: { xs: 1 },
          width: { xs: 'calc(100% - 16px)' },
          maxHeight: { xs: '90vh' },
        },
      }}
    >
      <DialogTitle sx={{ color: 'error.main' }}>
        Remove {students.length} Student{students.length !== 1 ? 's' : ''}
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 1.5, sm: 3 } }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Student list */}
        <List dense sx={{ maxHeight: 180, overflow: 'auto', mb: 2 }}>
          {students.map((student) => (
            <ListItem key={student.enrollmentId} sx={{ minHeight: 48 }}>
              <ListItemAvatar>
                <Avatar src={student.avatar_url || undefined} sx={{ width: 36, height: 36 }}>
                  {getInitials(student.name)}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={student.name}
                secondary={student.email}
                primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
                secondaryTypographyProps={{ noWrap: true, variant: 'caption' }}
              />
            </ListItem>
          ))}
        </List>

        {/* Reason selection */}
        <FormControl fullWidth size="small" sx={{ mb: 2 }} required>
          <InputLabel shrink>Reason for Removal</InputLabel>
          <Select
            value={reasonCategory}
            label="Reason for Removal"
            onChange={(e) => setReasonCategory(e.target.value as RemovalReasonCategory)}
            displayEmpty
          >
            <MenuItem value="" disabled>
              <em>Select a reason</em>
            </MenuItem>
            {(Object.keys(REASON_LABELS) as RemovalReasonCategory[]).map((key) => (
              <MenuItem key={key} value={key}>{REASON_LABELS[key]}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Notes */}
        <TextField
          fullWidth
          size="small"
          label={reasonCategory === 'other' ? 'Reason Details (required)' : 'Additional Notes (optional)'}
          multiline
          minRows={2}
          maxRows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          required={reasonCategory === 'other'}
          placeholder={reasonCategory === 'other' ? 'Please specify the reason...' : 'Any additional notes...'}
        />

        <Box sx={{ mt: 2, p: 1.5, bgcolor: 'warning.50', borderRadius: 1, border: '1px solid', borderColor: 'warning.200' }}>
          <Typography variant="caption" color="text.secondary">
            Removed students will appear in the History tab. You can restore them later if needed.
            Their progress and attendance data will be preserved.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleRemove}
          disabled={!canSubmit}
        >
          {submitting
            ? 'Removing...'
            : `Remove ${students.length} Student${students.length !== 1 ? 's' : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
