'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, IconButton, Skeleton, Typography, Avatar, Chip, Paper,
  Button, TextField, Rating, useMediaQuery, useTheme, Drawer, ToggleButtonGroup, ToggleButton,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
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
  const [showOriginal, setShowOriginal] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [resources, setResources] = useState<TutorResource[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Mobile: bottom sheet for review controls
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);

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
    // Canvas auto-closes after showing "Saved!" for 800ms
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
      <Box sx={{ display: 'flex', gap: 2, p: 2, height: '80vh' }}>
        <Skeleton variant="rounded" sx={{ flex: 1 }} height="100%" />
        {!isMobile && <Skeleton variant="rounded" width={340} height="100%" />}
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
  const hasSketchOver = !!reviewedImageUrl;
  const displayImageUrl = hasSketchOver && !showOriginal
    ? reviewedImageUrl!
    : submission.original_image_url;

  // Before/After toggle overlay — reused in both layouts
  const beforeAfterToggle = hasSketchOver ? (
    <ToggleButtonGroup
      value={showOriginal ? 'original' : 'reviewed'}
      exclusive
      onChange={(_, v) => { if (v) setShowOriginal(v === 'original'); }}
      size="small"
      sx={{
        position: 'absolute', top: 8, left: 8, zIndex: 2,
        bgcolor: 'rgba(255,255,255,0.92)', borderRadius: 1,
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        '& .MuiToggleButton-root': { py: 0.4, px: 1.5, textTransform: 'none', fontSize: '0.75rem', fontWeight: 600 },
      }}
    >
      <ToggleButton value="original">Original</ToggleButton>
      <ToggleButton value="reviewed">Reviewed</ToggleButton>
    </ToggleButtonGroup>
  ) : null;

  // === Review form (shared between desktop right panel and mobile bottom sheet) ===
  const reviewForm = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {/* Student note */}
        {submission.self_note && (
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#f0f7ff' }}>
            <Typography variant="caption" fontWeight={600} color="primary.dark">
              Student&apos;s Note
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.25 }}>{submission.self_note}</Typography>
          </Paper>
        )}

        {/* Rating */}
        <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          RATING *
        </Typography>
        <Rating
          value={rating}
          onChange={(_, v) => setRating(v || 0)}
          size="large"
          sx={{ mb: 2 }}
        />

        {/* Feedback */}
        <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          FEEDBACK
        </Typography>
        <TextField
          placeholder="Constructive feedback..."
          multiline
          rows={3}
          fullWidth
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          size="small"
          sx={{ mb: 2 }}
        />

        {/* Resource links */}
        <ResourceLinkSearch resources={resources} onChange={setResources} getToken={getToken} />
      </Box>

      {/* Save — pinned to bottom */}
      <Box sx={{ p: 2, pt: 1, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        {error && <Typography color="error" variant="caption" sx={{ mb: 0.5, display: 'block' }}>{error}</Typography>}
        <Button
          variant="contained" fullWidth onClick={handleSaveReview}
          disabled={saving || rating < 1}
          sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
        >
          {saving ? 'Saving...' : 'Save Review'}
        </Button>
      </Box>
    </Box>
  );

  // ===================== MOBILE LAYOUT =====================
  if (isMobile) {
    return (
      <>
        {/* Full-height mobile layout: image fills screen, FAB for review */}
        <Box sx={{
          // Break out of parent padding
          mx: -2, mt: -2, mb: -10,
          display: 'flex', flexDirection: 'column',
          height: 'calc(100vh - 56px)', // subtract top bar height
          overflow: 'hidden', bgcolor: '#1a1a1a',
        }}>
          {/* Compact header */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
            bgcolor: '#fff', flexShrink: 0,
          }}>
            <IconButton onClick={() => router.push('/teacher/drawing-reviews')} size="small">
              <ArrowBackIcon />
            </IconButton>
            <Avatar
              src={submission.student?.avatar_url || undefined}
              sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.85rem' }}
            >
              {submission.student?.name?.charAt(0) || '?'}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {submission.student?.name || 'Student'}
              </Typography>
              <Typography variant="caption" color="text.secondary">{timeAgo}</Typography>
            </Box>
            {submission.question && <CategoryBadge category={submission.question.category} />}
          </Box>

          {/* Question (collapsible — single line with ellipsis) */}
          {submission.question && (
            <Box sx={{ px: 1.5, py: 0.75, bgcolor: '#f5f5f5', flexShrink: 0 }}>
              <Typography variant="caption" sx={{
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4,
              }}>
                {submission.question.question_text}
              </Typography>
            </Box>
          )}

          {/* Image — fills all remaining space */}
          <Box sx={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', position: 'relative', minHeight: 0,
          }}>
            {beforeAfterToggle}
            <Box
              component="img"
              src={displayImageUrl}
              alt="Drawing"
              sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </Box>

          {/* Bottom action bar */}
          <Box sx={{
            display: 'flex', gap: 1, px: 1.5, py: 1, bgcolor: '#fff',
            flexShrink: 0, borderTop: '1px solid', borderColor: 'divider',
          }}>
            <Button
              variant="outlined" startIcon={<BrushOutlinedIcon />}
              onClick={() => setSketchOpen(true)}
              sx={{ flex: 1, textTransform: 'none', minHeight: 44 }}
            >
              Draw Over
            </Button>
            <Button
              variant="contained" onClick={() => setReviewSheetOpen(true)}
              sx={{ flex: 1, textTransform: 'none', minHeight: 44 }}
              startIcon={<StarOutlineIcon />}
            >
              Review
            </Button>
          </Box>
        </Box>

        {/* Review bottom sheet */}
        <Drawer
          anchor="bottom" open={reviewSheetOpen}
          onClose={() => setReviewSheetOpen(false)}
          PaperProps={{ sx: { maxHeight: '85vh', borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}
        >
          {/* Drag handle */}
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'grey.300' }} />
          </Box>
          {reviewForm}
        </Drawer>

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

  // ===================== DESKTOP LAYOUT =====================
  return (
    <>
      <Box sx={{
        // Break out of parent padding to fill the main area edge-to-edge
        mx: { md: -4, sm: -3, xs: -2 },
        mt: { md: -3, xs: -2 },
        mb: { md: -3, xs: -10 },
        display: 'flex',
        height: 'calc(100vh - 64px)', // TopBar is ~64px
        overflow: 'hidden',
      }}>
        {/* LEFT: Image canvas area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* Compact header bar */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5,
            px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider',
            bgcolor: 'background.paper', flexShrink: 0,
          }}>
            <IconButton onClick={() => router.push('/teacher/drawing-reviews')} size="small">
              <ArrowBackIcon />
            </IconButton>
            <Avatar
              src={submission.student?.avatar_url || undefined}
              sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: '0.9rem' }}
            >
              {submission.student?.name?.charAt(0) || '?'}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {submission.student?.name || 'Student'}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">{timeAgo}</Typography>
              </Box>
            </Box>
            <Box sx={{ flex: 1 }} />
            {submission.question && <CategoryBadge category={submission.question.category} />}
            <Button
              variant="contained" size="small" startIcon={<BrushOutlinedIcon />}
              onClick={() => setSketchOpen(true)}
              sx={{ textTransform: 'none', ml: 1 }}
            >
              {reviewedImageUrl ? 'Edit Sketch' : 'Draw Over'}
            </Button>
          </Box>

          {/* Question strip */}
          {submission.question && (
            <Box sx={{
              px: 2, py: 0.75, bgcolor: '#f8f8f8', borderBottom: '1px solid',
              borderColor: 'divider', flexShrink: 0,
            }}>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                {submission.question.question_text}
              </Typography>
            </Box>
          )}

          {/* Drawing image — fills ALL remaining space */}
          <Box sx={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: '#e8e8e8', overflow: 'hidden', minHeight: 0, position: 'relative',
          }}>
            {beforeAfterToggle}
            <Box
              component="img"
              src={displayImageUrl}
              alt="Student drawing"
              sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          </Box>
        </Box>

        {/* RIGHT: Review panel (fixed width, independently scrollable) */}
        <Box sx={{
          width: 340, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider',
          bgcolor: 'background.paper', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <Box sx={{
            px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider',
            flexShrink: 0,
          }}>
            <Typography variant="subtitle2" fontWeight={700}>Review</Typography>
          </Box>
          {reviewForm}
        </Box>
      </Box>

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
