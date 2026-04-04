'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, Typography, ToggleButton, ToggleButtonGroup, Paper,
  IconButton, Skeleton, Rating, Chip, Divider,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { DrawingSubmissionWithDetails, TutorResource } from '@neram/database/types';

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [submission, setSubmission] = useState<DrawingSubmissionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'original' | 'feedback'>('original');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSubmission(data.submission || null);
    } catch {
      setSubmission(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <Box sx={{ p: 2 }}><Skeleton height={400} /></Box>;
  }

  if (!submission) {
    return <Box sx={{ p: 2, textAlign: 'center' }}><Typography color="text.secondary">Not found</Typography></Box>;
  }

  const hasReview = submission.status === 'reviewed' || submission.status === 'published';

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 800, mx: 'auto' }}>
      <IconButton onClick={() => router.back()} sx={{ mb: 1 }}><ArrowBackIcon /></IconButton>

      {hasReview && (
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_, v) => v && setView(v)}
          size="small"
          sx={{ mb: 2 }}
        >
          <ToggleButton value="original" sx={{ textTransform: 'none', px: 2 }}>
            My Drawing
          </ToggleButton>
          <ToggleButton value="feedback" sx={{ textTransform: 'none', px: 2 }}>
            Tutor Feedback
          </ToggleButton>
        </ToggleButtonGroup>
      )}

      <Box
        component="img"
        src={view === 'feedback' && submission.reviewed_image_url
          ? submission.reviewed_image_url
          : submission.original_image_url}
        alt="Drawing"
        sx={{ width: '100%', borderRadius: 1, bgcolor: 'grey.50', mb: 2 }}
      />

      {view === 'original' && submission.self_note && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
          <Typography variant="caption" fontWeight={600}>My Note</Typography>
          <Typography variant="body2">{submission.self_note}</Typography>
        </Paper>
      )}

      {view === 'feedback' && hasReview && (
        <>
          {submission.tutor_rating && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Typography variant="subtitle2">Rating:</Typography>
              <Rating value={submission.tutor_rating} readOnly size="small" />
            </Box>
          )}

          {submission.tutor_feedback && (
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
              <Typography variant="caption" fontWeight={600}>Tutor Feedback</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>{submission.tutor_feedback}</Typography>
            </Paper>
          )}

          {submission.tutor_resources && submission.tutor_resources.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Recommended Resources
              </Typography>
              {submission.tutor_resources.map((r: TutorResource, i: number) => (
                <Paper
                  key={i}
                  variant="outlined"
                  sx={{ p: 1.5, mb: 1, cursor: 'pointer' }}
                  onClick={() => {
                    if (r.type === 'youtube') {
                      window.open(r.url, '_blank');
                    } else {
                      router.push(r.url);
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PlayCircleOutlineIcon sx={{ color: r.type === 'youtube' ? '#ff0000' : 'primary.main' }} />
                    <Box>
                      <Typography variant="body2" fontWeight={500}>{r.title}</Typography>
                      <Chip
                        label={r.type === 'youtube' ? 'YouTube' : 'Class Recording'}
                        size="small"
                        variant="outlined"
                        sx={{ mt: 0.25 }}
                      />
                    </Box>
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </>
      )}

      <Divider sx={{ my: 2 }} />
      <Typography variant="caption" color="text.secondary">
        Submitted {new Date(submission.submitted_at).toLocaleDateString()}
        {submission.reviewed_at && ` · Reviewed ${new Date(submission.reviewed_at).toLocaleDateString()}`}
      </Typography>
    </Box>
  );
}
