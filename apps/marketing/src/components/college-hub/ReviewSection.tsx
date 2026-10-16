'use client';

import { useState, useEffect } from 'react';
import {
  Box, Typography, Stack, Rating, Button, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions, Chip, Avatar, Divider,
  CircularProgress, Alert, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import RateReviewIcon from '@mui/icons-material/RateReview';
import type { CollegeReview } from '@/lib/college-hub/types';
import { tokens } from '@/design-system';

const YEAR_OPTIONS = [
  '1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year',
  'Alumni 2020', 'Alumni 2021', 'Alumni 2022', 'Alumni 2023', 'Alumni 2024', 'Alumni 2025',
];

const RATING_LABELS = [
  { key: 'rating_studio',         label: 'Design Studio' },
  { key: 'rating_faculty',        label: 'Faculty' },
  { key: 'rating_campus',         label: 'Campus and Hostel' },
  { key: 'rating_placements',     label: 'Placements' },
  { key: 'rating_value',          label: 'Value for Money' },
  { key: 'rating_infrastructure', label: 'Infrastructure' },
];

interface ReviewSectionProps {
  collegeId: string;
  collegeName: string;
  /** First page rendered on the server (ISR), so review text is in the HTML. */
  initialReviews?: CollegeReview[];
}

function StarDisplay({ value }: { value: number | null | undefined }) {
  if (!value) return null;
  return (
    <Stack direction="row" alignItems="center" gap={0.5}>
      <StarIcon sx={{ fontSize: 14, color: tokens.gold800 }} />
      <Typography variant="caption" fontWeight={700}>{value.toFixed(1)}</Typography>
    </Stack>
  );
}

function ReviewCard({ review }: { review: CollegeReview }) {
  return (
    <Box sx={{ py: 2 }}>
      <Stack direction="row" alignItems="flex-start" gap={2}>
        <Avatar sx={{ bgcolor: tokens.navy700, color: tokens.paper, width: 40, height: 40, fontSize: '1rem' }}>
          {review.reviewer_name.charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="subtitle2" component="p" fontWeight={700}>{review.reviewer_name}</Typography>
            {review.reviewer_year && (
              <Chip label={review.reviewer_year} size="small" sx={{ fontSize: '0.7rem', height: 20 }} />
            )}
            {review.rating_overall && (
              <Stack direction="row" alignItems="center" gap={0.5}>
                <Rating value={review.rating_overall} readOnly size="small" max={5} />
                <Typography variant="caption" color={tokens.inkMuted}>
                  {new Date(review.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </Typography>
              </Stack>
            )}
          </Stack>

          {review.title && (
            <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5 }}>{review.title}</Typography>
          )}

          <Typography variant="body2" color={tokens.inkMuted} sx={{ mt: 0.5, lineHeight: 1.6 }}>
            {review.body}
          </Typography>

          {(review.pros || review.cons) && (
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ mt: 1 }}>
              {review.pros && (
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color={tokens.success} fontWeight={700}>Pros</Typography>
                  <Typography variant="body2" color={tokens.inkMuted} sx={{ fontSize: '0.8rem' }}>{review.pros}</Typography>
                </Box>
              )}
              {review.cons && (
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="error.main" fontWeight={700}>Cons</Typography>
                  <Typography variant="body2" color={tokens.inkMuted} sx={{ fontSize: '0.8rem' }}>{review.cons}</Typography>
                </Box>
              )}
            </Stack>
          )}

          {review.college_reply && (
            <Box sx={{ mt: 1.5, p: 1.5, borderLeft: '3px solid', borderColor: tokens.navy900, bgcolor: tokens.ground, borderRadius: 1 }}>
              <Typography variant="caption" component="p" fontWeight={700} sx={{ m: 0 }}>
                Response from the college
              </Typography>
              <Typography variant="body2" color={tokens.inkMuted} sx={{ mt: 0.25, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {review.college_reply}
              </Typography>
            </Box>
          )}

          {/* Category ratings */}
          <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ mt: 1.5 }}>
            {RATING_LABELS.map(({ key, label }) => {
              const val = review[key as keyof CollegeReview] as number | null | undefined;
              if (!val) return null;
              return (
                <Box key={key}>
                  <Typography variant="caption" color={tokens.inkMuted}>{label}</Typography>
                  <StarDisplay value={val} />
                </Box>
              );
            })}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

export default function ReviewSection({ collegeId, collegeName, initialReviews }: ReviewSectionProps) {
  const [reviews, setReviews] = useState<CollegeReview[]>(initialReviews ?? []);
  const [loading, setLoading] = useState(!initialReviews);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [reviewerName, setReviewerName] = useState('');
  const [reviewerYear, setReviewerYear] = useState('');
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [subRatings, setSubRatings] = useState<Record<string, number | null>>({});
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [pros, setPros] = useState('');
  const [cons, setCons] = useState('');

  useEffect(() => {
    // Server already rendered the first page: skip the duplicate request.
    if (initialReviews) return;
    fetch(`/api/colleges/reviews?college_id=${collegeId}`)
      .then((r) => r.json())
      .then((json) => setReviews(json.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [collegeId, initialReviews]);

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + (r.rating_overall ?? 0), 0) / reviews.length).toFixed(1)
    : null;

  const handleSubmit = async () => {
    if (!reviewerName || !overallRating || reviewBody.length < 30) {
      setSubmitError('Please fill in your name, overall rating, and a review (min 30 chars).');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/colleges/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: collegeId,
          reviewer_name: reviewerName,
          reviewer_year: reviewerYear || null,
          rating_overall: overallRating,
          ...Object.fromEntries(
            Object.entries(subRatings).filter(([, v]) => v !== null)
          ),
          title: reviewTitle || null,
          review_body: reviewBody,
          pros: pros || null,
          cons: cons || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSubmitSuccess(true);
      setDialogOpen(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          {avgRating && (
            <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 0.5 }}>
              <Typography variant="h4" fontWeight={800} color="primary">{avgRating}</Typography>
              <Rating value={parseFloat(avgRating)} readOnly precision={0.1} />
              <Typography variant="body2" color={tokens.inkMuted}>({reviews.length} reviews)</Typography>
            </Stack>
          )}
        </Box>
        <Button
          variant="contained"
          startIcon={<RateReviewIcon />}
          onClick={() => setDialogOpen(true)}
          sx={{ borderRadius: 1 }}
        >
          Write a Review
        </Button>
      </Stack>

      {submitSuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Thank you! Your review has been submitted and will appear after moderation (usually within 24-48 hours).
        </Alert>
      )}

      {loading && <CircularProgress size={24} />}

      {!loading && reviews.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color={tokens.inkMuted} variant="body2">
            No reviews yet. Be the first to share your experience at {collegeName}.
          </Typography>
        </Box>
      )}

      {reviews.map((review, i) => (
        <Box key={review.id}>
          {i > 0 && <Divider />}
          <ReviewCard review={review} />
        </Box>
      ))}

      {/* Submit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Write a Review for {collegeName}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack gap={2.5} sx={{ pt: 1 }}>
            <TextField
              label="Your Name *"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              fullWidth
              size="small"
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Year / Batch</InputLabel>
              <Select
                value={reviewerYear}
                label="Year / Batch"
                onChange={(e) => setReviewerYear(e.target.value)}
              >
                <MenuItem value="">Prefer not to say</MenuItem>
                {YEAR_OPTIONS.map((y) => (
                  <MenuItem key={y} value={y}>{y}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Overall Rating *</Typography>
              <Rating
                value={overallRating}
                onChange={(_, v) => setOverallRating(v)}
                size="large"
              />
            </Box>

            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>Category Ratings (optional)</Typography>
              <Stack gap={1}>
                {RATING_LABELS.map(({ key, label }) => (
                  <Stack key={key} direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" color={tokens.inkMuted}>{label}</Typography>
                    <Rating
                      size="small"
                      value={subRatings[key] ?? null}
                      onChange={(_, v) => setSubRatings((prev) => ({ ...prev, [key]: v }))}
                    />
                  </Stack>
                ))}
              </Stack>
            </Box>

            <TextField
              label="Review Title"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              fullWidth
              size="small"
              inputProps={{ maxLength: 100 }}
            />
            <TextField
              label="Your Review *"
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
              fullWidth
              multiline
              rows={4}
              helperText={`${reviewBody.length}/2000 (min 30 chars)`}
              inputProps={{ maxLength: 2000 }}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <TextField
                label="Pros (optional)"
                value={pros}
                onChange={(e) => setPros(e.target.value)}
                fullWidth
                multiline
                rows={2}
                placeholder="What did you like?"
              />
              <TextField
                label="Cons (optional)"
                value={cons}
                onChange={(e) => setCons(e.target.value)}
                fullWidth
                multiline
                rows={2}
                placeholder="What could be better?"
              />
            </Stack>
            {submitError && <Alert severity="error">{submitError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <CircularProgress size={16} /> : 'Submit Review'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
