'use client';

import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Typography, Alert, CircularProgress,
  useTheme, useMediaQuery,
  IconButton, CloseIcon,
} from '@neram/ui';
import { getFirebaseAuth } from '@neram/auth';
import type { QuestionPostDisplay } from '@neram/database';

interface DeleteQuestionDialogProps {
  open: boolean;
  onClose: () => void;
  question: QuestionPostDisplay;
  onSubmitted: () => void;
}

export default function DeleteQuestionDialog({
  open,
  onClose,
  question,
  onSubmitted,
}: DeleteQuestionDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError('');

    if (!reason.trim() || reason.trim().length < 5) {
      setError('Please provide a reason (at least 5 characters)');
      return;
    }

    setSubmitting(true);
    try {
      const auth = getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError('Authentication required. Please sign in again.');
        return;
      }

      const res = await fetch(`/api/questions/${question.id}/delete-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit delete request');
      }

      setSuccess(true);
      setTimeout(() => {
        onSubmitted();
        onClose();
        setSuccess(false);
        setReason('');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to submit delete request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setError('');
      setSuccess(false);
      setReason('');
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" component="span" color="error">
          Request Question Deletion
        </Typography>
        {isMobile && (
          <IconButton edge="end" onClick={handleClose} aria-label="close">
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>
      <DialogContent>
        {success ? (
          <Alert severity="success" sx={{ mt: 1 }}>
            Delete request submitted. It will be reviewed by moderators.
          </Alert>
        ) : (
          <>
            <Alert severity="warning" variant="outlined" sx={{ mt: 1, mb: 2 }}>
              Your deletion request will be reviewed by moderators. The question will not be removed immediately.
            </Alert>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              You are requesting to delete: <strong>{question.title}</strong>
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <TextField
              autoFocus={!isMobile}
              fullWidth
              multiline
              minRows={3}
              label="Reason for deletion"
              placeholder="Why do you want to delete this question? (e.g., duplicate, incorrect, personal information...)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              helperText={`${reason.length} characters (min 5)`}
            />
          </>
        )}
      </DialogContent>
      {!success && (
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleSubmit}
            disabled={submitting || reason.trim().length < 5}
            startIcon={submitting ? <CircularProgress size={16} /> : undefined}
          >
            {submitting ? 'Submitting...' : 'Request Deletion'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
