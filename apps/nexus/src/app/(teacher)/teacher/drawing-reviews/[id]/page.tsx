'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, IconButton, Skeleton, Typography, Avatar, Chip, Paper,
  Button, TextField, Rating, Divider, useMediaQuery, useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import DifficultyChip from '@/components/drawings/DifficultyChip';
import SketchOverCanvas from '@/components/drawings/SketchOverCanvas';
import ResourceLinkSearch from '@/components/drawings/ResourceLinkSearch';
import type { DrawingSubmissionWithDetails, TutorResource } from '@neram/database/types';

export default function DrawingReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [submission, setSubmission] = useState<DrawingSubmissionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  // Review state
  const [sketchOpen, setSketchOpen] = useState(false);
  const [reviewedImageUrl, setReviewedImageUrl] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [resources, setResources] = useState<TutorResource[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const s = data.submission || null;
      setSubmission(s);
      if (s) {
        setReviewedImageUrl(s.reviewed_image_url);
        setRating(s.tutor_rating || 0);
        setFeedback(s.tutor_feedback || '');
        setResources(s.tutor_resources || []);
      }
    } catch {
      setSubmission(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSketchSave = async (blob: Blob) => {
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', blob, 'review.png');
      formData.append('bucket', 'drawing-reviewed');

      const res = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json();
      setReviewedImageUrl(url);
      setSketchOpen(false);
    } catch {
      setError('Failed to save sketch');
    }
  };

  const handleSaveReview = async () => {
    if (rating < 1) { setError('Please provide a rating'); return; }
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${submission!.id}/review`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutor_rating: rating,
          tutor_feedback: feedback || null,
          reviewed_image_url: reviewedImageUrl,
          tutor_resources: resources,
        }),
      });
      if (!res.ok) throw new Error('Failed to save review');
      router.push('/teacher/drawing-reviews');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', gap: 3, p: 3 }}>
        <Skeleton variant="rounded" width="60%" height={500} />
        <Skeleton variant="rounded" width="40%" height={500} />
      </Box>
    );
  }

  if (!submission) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Submission not found</Typography>
      </Box>
    );
  }

  const timeAgo = getTimeAgo(submission.submitted_at);

  // === LEFT PANEL: Image + Question ===
  const leftPanel = (
    <Box sx={{
      flex: { xs: 'none', md: 1 },
      display: 'flex', flexDirection: 'column',
      height: { md: 'calc(100vh - 72px)' },
      overflow: 'hidden',
    }}>
      {/* Student info header */}
      <Box sx={{ px: 2, pt: 2, pb: 1.5, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <IconButton onClick={() => router.push('/teacher/drawing-reviews')} size="small" sx={{ mr: -0.5 }}>
            <ArrowBackIcon />
          </IconButton>
          <Avatar
            src={submission.student?.avatar_url || undefined}
            sx={{ width: 40, height: 40, bgcolor: 'primary.main', fontSize: '1rem' }}
          >
            {submission.student?.name?.charAt(0) || '?'}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={600} lineHeight={1.2}>
              {submission.student?.name || 'Student'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
              <AccessTimeIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">{timeAgo}</Typography>
            </Box>
          </Box>
          {submission.question && (
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <CategoryBadge category={submission.question.category} />
              <DifficultyChip difficulty={submission.question.difficulty_tag} />
            </Box>
          )}
        </Box>

        {/* Question text */}
        {submission.question && (
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
            <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
              {submission.question.question_text}
            </Typography>
            {submission.question.objects.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                {submission.question.objects.map((obj) => (
                  <Chip key={obj} label={obj} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 22 }} />
                ))}
              </Box>
            )}
          </Paper>
        )}
      </Box>

      {/* Drawing image — fills remaining space, fits vertically */}
      <Box sx={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: '#f0f0f0', mx: 2, mb: 2, borderRadius: 1, overflow: 'hidden',
        position: 'relative', minHeight: { xs: 300, md: 0 },
      }}>
        <Box
          component="img"
          src={reviewedImageUrl || submission.original_image_url}
          alt="Student drawing"
          sx={{
            maxWidth: '100%', maxHeight: '100%',
            objectFit: 'contain',
          }}
        />
        {/* Draw over button overlaid on image */}
        <Button
          variant="contained"
          startIcon={<BrushOutlinedIcon />}
          onClick={() => setSketchOpen(true)}
          sx={{
            position: 'absolute', bottom: 12, right: 12,
            textTransform: 'none', minHeight: 40,
            bgcolor: 'rgba(0,0,0,0.75)', '&:hover': { bgcolor: 'rgba(0,0,0,0.9)' },
          }}
        >
          {reviewedImageUrl ? 'Edit Sketch' : 'Draw Over'}
        </Button>
      </Box>
    </Box>
  );

  // === RIGHT PANEL: Review controls ===
  const rightPanel = (
    <Box sx={{
      width: { xs: '100%', md: 360 },
      flexShrink: 0,
      height: { md: 'calc(100vh - 72px)' },
      overflow: 'auto',
      borderLeft: { md: '1px solid' },
      borderColor: { md: 'divider' },
      display: 'flex', flexDirection: 'column',
    }}>
      <Box sx={{ p: 2.5, flex: 1 }}>
        {/* Student note */}
        {submission.self_note && (
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2.5, bgcolor: 'info.50' }}>
            <Typography variant="caption" fontWeight={600} color="info.dark">Student&apos;s Note</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>{submission.self_note}</Typography>
          </Paper>
        )}

        {/* Rating */}
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Rating *
          </Typography>
          <Rating
            value={rating}
            onChange={(_, v) => setRating(v || 0)}
            size="large"
            sx={{ fontSize: '2rem' }}
          />
        </Box>

        {/* Feedback */}
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Feedback
          </Typography>
          <TextField
            placeholder="Share constructive feedback about their drawing..."
            multiline
            rows={4}
            fullWidth
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            size="small"
          />
        </Box>

        {/* Resource links */}
        <Box sx={{ mb: 2.5 }}>
          <ResourceLinkSearch
            resources={resources}
            onChange={setResources}
            getToken={getToken}
          />
        </Box>
      </Box>

      {/* Save button — sticky at bottom */}
      <Box sx={{
        p: 2, borderTop: '1px solid', borderColor: 'divider',
        bgcolor: 'background.paper', flexShrink: 0,
        position: 'sticky', bottom: 0,
      }}>
        {error && (
          <Typography color="error" variant="caption" sx={{ mb: 1, display: 'block' }}>
            {error}
          </Typography>
        )}
        <Button
          variant="contained"
          fullWidth
          onClick={handleSaveReview}
          disabled={saving || rating < 1}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
        >
          {saving ? 'Saving Review...' : 'Save Review'}
        </Button>
      </Box>
    </Box>
  );

  return (
    <>
      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        height: { md: 'calc(100vh - 72px)' },
        overflow: { md: 'hidden' },
      }}>
        {leftPanel}
        {rightPanel}
      </Box>

      {/* Sketch overlay */}
      {sketchOpen && (
        <SketchOverCanvas
          imageUrl={submission.original_image_url}
          onSave={handleSketchSave}
          onClose={() => setSketchOpen(false)}
        />
      )}
    </>
  );
}

/** Simple relative time formatter */
function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}
