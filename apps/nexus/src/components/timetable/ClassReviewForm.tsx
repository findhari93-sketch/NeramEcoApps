'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Rating,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@neram/ui';

interface ClassReviewFormProps {
  open: boolean;
  onClose: () => void;
  classTitle: string;
  existingRating?: number;
  existingComment?: string;
  onSubmit: (rating: number, comment: string) => Promise<void>;
}

export default function ClassReviewForm({
  open,
  onClose,
  classTitle,
  existingRating,
  existingComment,
  onSubmit,
}: ClassReviewFormProps) {
  const [rating, setRating] = useState<number | null>(existingRating || null);
  const [comment, setComment] = useState(existingComment || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!rating) return;
    setSubmitting(true);
    try {
      await onSubmit(rating, comment);
      onClose();
    } catch (err) {
      console.error('Failed to submit review:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1 }}>Rate Class</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {classTitle}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Rating
            value={rating}
            onChange={(_, newValue) => setRating(newValue)}
            size="large"
            sx={{ fontSize: 40 }}
          />
          <TextField
            label="Comments (optional)"
            multiline
            rows={3}
            fullWidth
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="How was the class?"
            inputProps={{ style: { minHeight: 24 } }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!rating || submitting}
          sx={{ minHeight: 44 }}
        >
          {submitting ? 'Saving...' : existingRating ? 'Update' : 'Submit'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
