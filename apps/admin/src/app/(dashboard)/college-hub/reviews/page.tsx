'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, Chip, Button, CircularProgress,
  Rating, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  Alert, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import StarHalfIcon from '@mui/icons-material/StarHalf';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

type ReviewStatus = 'pending' | 'approved' | 'rejected';

interface ReviewRow {
  id: string;
  reviewer_name: string;
  reviewer_year: string;
  rating_overall: number;
  title: string;
  body: string;
  pros: string;
  cons: string;
  created_at: string;
  colleges: { name: string; slug: string };
}

export default function ReviewModerationPage() {
  const [status, setStatus] = useState<ReviewStatus>('pending');
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/college-hub/reviews?status=${status}`)
      .then((r) => r.json())
      .then((j) => setReviews(j.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const moderate = async (id: string, newStatus: ReviewStatus, reason?: string) => {
    await fetch('/api/college-hub/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus, rejected_reason: reason }),
    });
    setActionMsg(`Review ${newStatus}.`);
    setRejectDialogId(null);
    setRejectReason('');
    load();
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            bgcolor: '#d97706',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <StarHalfIcon sx={{ color: 'white' }} />
        </Box>
        <Typography variant="h5" fontWeight={700}>
          Review Moderation
        </Typography>
      </Stack>

      <ToggleButtonGroup
        value={status}
        exclusive
        onChange={(_, v) => v && setStatus(v)}
        size="small"
        sx={{ mb: 3 }}
      >
        <ToggleButton value="pending">Pending</ToggleButton>
        <ToggleButton value="approved">Approved</ToggleButton>
        <ToggleButton value="rejected">Rejected</ToggleButton>
      </ToggleButtonGroup>

      {actionMsg && (
        <Alert severity="success" onClose={() => setActionMsg('')} sx={{ mb: 2 }}>
          {actionMsg}
        </Alert>
      )}

      {loading && <CircularProgress />}

      {!loading && reviews.length === 0 && (
        <Typography color="text.secondary">No {status} reviews.</Typography>
      )}

      <Stack gap={2}>
        {reviews.map((review) => (
          <Paper key={review.id} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems="flex-start"
              gap={1}
            >
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {review.reviewer_name}
                  </Typography>
                  {review.reviewer_year && (
                    <Chip label={review.reviewer_year} size="small" />
                  )}
                  <Chip
                    label={review.colleges?.name ?? 'Unknown'}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                  <Typography variant="caption" color="text.secondary">
                    {new Date(review.created_at).toLocaleDateString('en-IN')}
                  </Typography>
                </Stack>
                {review.rating_overall && (
                  <Rating value={review.rating_overall} readOnly size="small" />
                )}
                {review.title && (
                  <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5 }}>
                    {review.title}
                  </Typography>
                )}
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5, lineHeight: 1.6 }}
                >
                  {review.body}
                </Typography>
                {review.pros && (
                  <Typography
                    variant="caption"
                    color="success.main"
                    sx={{ display: 'block', mt: 0.5 }}
                  >
                    Pros: {review.pros}
                  </Typography>
                )}
                {review.cons && (
                  <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                    Cons: {review.cons}
                  </Typography>
                )}
              </Box>
              {status === 'pending' && (
                <Stack direction="row" gap={1} sx={{ flexShrink: 0 }}>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    startIcon={<CheckCircleIcon />}
                    onClick={() => moderate(review.id, 'approved')}
                  >
                    Approve
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<CancelIcon />}
                    onClick={() => setRejectDialogId(review.id)}
                  >
                    Reject
                  </Button>
                </Stack>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialogId} onClose={() => setRejectDialogId(null)}>
        <DialogTitle>Reject Review</DialogTitle>
        <DialogContent>
          <TextField
            label="Reason for rejection"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            multiline
            rows={3}
            fullWidth
            size="small"
            sx={{ mt: 1 }}
            placeholder="Spam, inappropriate content, off-topic, etc."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogId(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() =>
              rejectDialogId && moderate(rejectDialogId, 'rejected', rejectReason)
            }
          >
            Reject Review
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
