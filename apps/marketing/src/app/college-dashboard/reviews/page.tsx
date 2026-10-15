'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Rating, Skeleton, Stack, TextField, Typography } from '@mui/material';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import { useCollegeDashboard } from '../context';
import { Card, EmptyState, PageHeader, formatDay } from '../ui';
import { can } from '@/lib/college-dashboard/permissions';

interface Review {
  id: string;
  reviewer_name: string;
  reviewer_year: string | null;
  rating_overall: number | null;
  title: string | null;
  body: string;
  pros: string | null;
  cons: string | null;
  created_at: string;
  college_reply: string | null;
  college_reply_at: string | null;
  college_reply_by: string | null;
}

function ReviewCard({ review, editable, onReply }: { review: Review; editable: boolean; onReply: (reply: string) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review.college_reply ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (text: string) => {
    setBusy(true);
    setError('');
    const err = await onReply(text);
    setBusy(false);
    if (err) setError(err);
    else setEditing(false);
  };

  return (
    <Card>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
        {review.rating_overall != null && <Rating value={review.rating_overall} readOnly size="small" aria-label={`${review.rating_overall} out of 5`} />}
        <Typography sx={{ fontWeight: 700 }}>{review.reviewer_name}</Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
          {[review.reviewer_year, formatDay(review.created_at)].filter(Boolean).join(' · ')}
        </Typography>
      </Stack>
      {review.title && <Typography sx={{ mt: 1, fontWeight: 600 }}>{review.title}</Typography>}
      <Typography sx={{ mt: 0.5, fontSize: 15, whiteSpace: 'pre-wrap' }}>{review.body}</Typography>
      {(review.pros || review.cons) && (
        <Box sx={{ mt: 1, fontSize: 14, color: 'text.secondary' }}>
          {review.pros && <div>Liked: {review.pros}</div>}
          {review.cons && <div>Could be better: {review.cons}</div>}
        </Box>
      )}

      {review.college_reply && !editing && (
        <Box sx={{ mt: 1.5, p: 1.5, borderLeft: '3px solid', borderColor: 'primary.main', bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.25 }}>
            Your reply{review.college_reply_by ? `, by ${review.college_reply_by}` : ''} · {formatDay(review.college_reply_at)}
          </Typography>
          <Typography sx={{ fontSize: 14.5, whiteSpace: 'pre-wrap' }}>{review.college_reply}</Typography>
        </Box>
      )}

      {editing ? (
        <Box sx={{ mt: 1.5 }}>
          <TextField
            label="Your public reply"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            inputProps={{ maxLength: 1500 }}
            helperText="Everyone can read this under the review. Thank the student, answer the point they raised, and keep it short."
          />
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
          <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 1 }}>
            <Button onClick={() => { setEditing(false); setDraft(review.college_reply ?? ''); }} disabled={busy} sx={{ minHeight: 44 }}>
              Cancel
            </Button>
            <Button variant="contained" onClick={() => void send(draft)} disabled={busy || !draft.trim()} sx={{ minHeight: 44 }}>
              {busy ? 'Posting' : 'Post reply'}
            </Button>
          </Stack>
        </Box>
      ) : (
        editable && (
          <Stack direction="row" gap={1} sx={{ mt: 1.25 }}>
            <Button variant="outlined" onClick={() => setEditing(true)} sx={{ minHeight: 44, textTransform: 'none' }}>
              {review.college_reply ? 'Edit reply' : 'Reply'}
            </Button>
            {review.college_reply && (
              <Button color="error" onClick={() => void send('')} disabled={busy} sx={{ minHeight: 44, textTransform: 'none' }}>
                Remove reply
              </Button>
            )}
          </Stack>
        )
      )}
    </Card>
  );
}

export default function CollegeReviewsPage() {
  const { api, collegeAdmin } = useCollegeDashboard();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState('');
  const editable = can(collegeAdmin?.role, 'reply_reviews');

  const load = useCallback(async () => {
    const r = await api<{ data: Review[] }>('/api/college-dashboard/reviews');
    if (r.ok) setReviews(r.data.data);
    else setError(r.data.error ?? 'Could not load reviews.');
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Stack gap={2}>
      <PageHeader
        title="Student reviews"
        intro="Reviews are written by students and checked by Neram Classes. You cannot change or hide them, but you can post one public reply to each."
      />
      {error && <Alert severity="error">{error}</Alert>}
      {!reviews && !error && [0, 1].map((i) => <Skeleton key={i} variant="rounded" height={140} />)}
      {reviews && reviews.length === 0 && (
        <EmptyState icon={<RateReviewOutlinedIcon />} title="No reviews yet" text="Ask your current students and alumni to review your college on your Neram Classes page. Honest reviews help students choose." />
      )}
      {reviews?.map((r) => (
        <ReviewCard
          key={r.id}
          review={r}
          editable={editable}
          onReply={async (reply) => {
            const res = await api('/api/college-dashboard/reviews', { method: 'PATCH', body: { id: r.id, reply } });
            if (!res.ok) return res.data.error ?? 'Could not post the reply.';
            await load();
            return null;
          }}
        />
      ))}
    </Stack>
  );
}
