'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, Typography, ToggleButton, ToggleButtonGroup, Paper,
  IconButton, Skeleton, Rating, Chip, Drawer, Button,
  useMediaQuery, useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import CommentSection from '@/components/drawings/CommentSection';
import type { DrawingSubmissionWithDetails, TutorResource } from '@neram/database/types';

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [submission, setSubmission] = useState<DrawingSubmissionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOriginal, setShowOriginal] = useState(true);
  const [feedbackSheetOpen, setFeedbackSheetOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const replaceFileRef = useCallback((node: HTMLInputElement | null) => {
    if (node) node.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !submission || submission.status !== 'submitted') return;
      setReplacing(true);
      try {
        const token = await getToken();
        const formData = new FormData();
        formData.append('file', file);
        formData.append('bucket', 'drawing-uploads');
        const uploadRes = await fetch('/api/drawing/upload', {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
        });
        if (!uploadRes.ok) throw new Error('Upload failed');
        const { url } = await uploadRes.json();
        const replaceRes = await fetch('/api/drawing/submissions/thread/manage', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ submission_id: submission.id, new_image_url: url }),
        });
        if (!replaceRes.ok) throw new Error('Replace failed');
        fetchData(); // refresh
      } catch { /* silent */ } finally { setReplacing(false); }
    };
  }, [submission, getToken, fetchData]);

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
    return (
      <Box sx={{ display: 'flex', gap: 2, p: 2, height: '80vh' }}>
        <Skeleton variant="rounded" sx={{ flex: 1 }} height="100%" />
        {!isMobile && <Skeleton variant="rounded" width={320} height="100%" />}
      </Box>
    );
  }

  if (!submission) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">Not found</Typography></Box>;
  }

  const hasReview = submission.status === 'reviewed' || submission.status === 'published';
  const hasSketchOver = !!submission.reviewed_image_url;
  const displayImageUrl = hasSketchOver && !showOriginal
    ? submission.reviewed_image_url!
    : submission.original_image_url;
  const timeAgo = getTimeAgo(submission.submitted_at);

  // Before/After toggle
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
      <ToggleButton value="original">My Drawing</ToggleButton>
      <ToggleButton value="reviewed">Reviewed</ToggleButton>
    </ToggleButtonGroup>
  ) : null;

  // Feedback content (shared between desktop panel and mobile sheet)
  const feedbackContent = hasReview ? (
    <Box sx={{ p: 2 }}>
      {/* Rating */}
      {submission.tutor_rating && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            TUTOR RATING
          </Typography>
          <Rating value={submission.tutor_rating} readOnly size="large" />
        </Box>
      )}

      {/* Written feedback */}
      {submission.tutor_feedback && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            FEEDBACK
          </Typography>
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f8f8f8' }}>
            <Typography variant="body2" sx={{ lineHeight: 1.6 }}>{submission.tutor_feedback}</Typography>
          </Paper>
        </Box>
      )}

      {/* Resource links */}
      {submission.tutor_resources && submission.tutor_resources.length > 0 && (
        <Box>
          <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            RECOMMENDED RESOURCES
          </Typography>
          {submission.tutor_resources.map((r: TutorResource, i: number) => (
            <Paper
              key={i}
              variant="outlined"
              sx={{ p: 1.25, mb: 0.75, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              onClick={() => r.type === 'youtube' ? window.open(r.url, '_blank') : router.push(r.url)}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PlayCircleOutlineIcon sx={{ color: r.type === 'youtube' ? '#ff0000' : 'primary.main', fontSize: 20 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={500} noWrap>{r.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {r.type === 'youtube' ? 'YouTube' : 'Class Recording'}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {/* Self note */}
      {submission.self_note && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            MY NOTE
          </Typography>
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f0f7ff' }}>
            <Typography variant="body2">{submission.self_note}</Typography>
          </Paper>
        </Box>
      )}

      {/* Comments */}
      <Box sx={{ mt: 2 }}>
        <CommentSection
          submissionId={submission.id}
          getToken={getToken}
          canComment={true}
        />
      </Box>
    </Box>
  ) : (
    <Box sx={{ p: 2 }}>
      <Box sx={{ textAlign: 'center', py: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {submission.status === 'submitted'
            ? 'Your drawing is pending review by your tutor.'
            : submission.status === 'redo'
            ? 'Your teacher requested improvements. Submit a new attempt from the question page.'
            : 'No feedback yet.'}
        </Typography>
      </Box>
      <CommentSection
        submissionId={submission.id}
        getToken={getToken}
        canComment={true}
      />
    </Box>
  );

  // ===================== MOBILE =====================
  if (isMobile) {
    return (
      <>
        <Box sx={{
          mx: -1, mt: -1, mb: -10,
          display: 'flex', flexDirection: 'column',
          height: 'calc(100vh - 56px)',
          overflow: 'hidden', bgcolor: '#1a1a1a',
        }}>
          {/* Header */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
            bgcolor: '#fff', flexShrink: 0,
          }}>
            <IconButton onClick={() => router.back()} size="small">
              <ArrowBackIcon />
            </IconButton>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {submission.question?.question_text || 'Free Practice'}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">{timeAgo}</Typography>
                {submission.question && (
                  <CategoryBadge category={submission.question.category} />
                )}
                <Chip
                  label={submission.status}
                  size="small"
                  color={hasReview ? 'success' : submission.status === 'redo' ? 'warning' : 'default'}
                  sx={{ height: 20, fontSize: '0.65rem', ml: 0.5 }}
                />
              </Box>
            </Box>
          </Box>

          {/* Image fills remaining space */}
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

          {/* Hidden file input for replace */}
          <input ref={replaceFileRef} type="file" accept="image/*" style={{ display: 'none' }} id="replace-file-mobile" />

          {/* Bottom bar */}
          <Box sx={{
            display: 'flex', gap: 1, px: 1.5, py: 1, bgcolor: '#fff',
            flexShrink: 0, borderTop: '1px solid', borderColor: 'divider',
          }}>
            {submission.status === 'submitted' && (
              <Button
                variant="outlined" size="small"
                startIcon={<SwapHorizIcon />}
                onClick={() => document.getElementById('replace-file-mobile')?.click()}
                disabled={replacing}
                sx={{ textTransform: 'none', minHeight: 44, minWidth: 'auto', px: 1.5 }}
              >
                {replacing ? '...' : 'Replace'}
              </Button>
            )}
            {hasReview ? (
              <Button
                variant="contained" fullWidth
                startIcon={<ChatBubbleOutlineIcon />}
                onClick={() => setFeedbackSheetOpen(true)}
                sx={{ textTransform: 'none', minHeight: 44 }}
              >
                View Feedback
                {submission.tutor_rating ? ` (${submission.tutor_rating}★)` : ''}
              </Button>
            ) : (
              <Button
                variant="outlined" fullWidth
                startIcon={<ChatBubbleOutlineIcon />}
                onClick={() => setFeedbackSheetOpen(true)}
                sx={{ textTransform: 'none', minHeight: 44 }}
              >
                Comments
              </Button>
            )}
          </Box>
        </Box>

        {/* Feedback bottom sheet */}
        <Drawer
          anchor="bottom" open={feedbackSheetOpen}
          onClose={() => setFeedbackSheetOpen(false)}
          PaperProps={{ sx: { maxHeight: '80vh', borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'grey.300' }} />
          </Box>
          {feedbackContent}
        </Drawer>
      </>
    );
  }

  // ===================== DESKTOP =====================
  return (
    <Box sx={{
      mx: { md: -4, sm: -3, xs: -1 },
      mt: { md: -3, xs: -1 },
      mb: { md: -3, xs: -10 },
      display: 'flex',
      height: 'calc(100vh - 64px)',
      overflow: 'hidden',
    }}>
      {/* LEFT: Image */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1.5,
          px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider',
          bgcolor: 'background.paper', flexShrink: 0,
        }}>
          <IconButton onClick={() => router.back()} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {submission.question?.question_text || 'Free Practice'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AccessTimeIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">{timeAgo}</Typography>
            </Box>
          </Box>
          {submission.question && <CategoryBadge category={submission.question.category} />}
          <Chip
            label={submission.status}
            size="small"
            color={hasReview ? 'success' : submission.status === 'redo' ? 'warning' : 'default'}
          />
          {submission.status === 'submitted' && (
            <>
              <input ref={replaceFileRef} type="file" accept="image/*" style={{ display: 'none' }} id="replace-file-desktop" />
              <Button
                variant="outlined" size="small"
                startIcon={<SwapHorizIcon />}
                onClick={() => document.getElementById('replace-file-desktop')?.click()}
                disabled={replacing}
                sx={{ textTransform: 'none', ml: 'auto' }}
              >
                {replacing ? 'Replacing...' : 'Replace Image'}
              </Button>
            </>
          )}
        </Box>

        {/* Image fills remaining space */}
        <Box sx={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: '#e8e8e8', overflow: 'hidden', minHeight: 0, position: 'relative',
        }}>
          {beforeAfterToggle}
          <Box
            component="img"
            src={displayImageUrl}
            alt="Drawing"
            sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </Box>
      </Box>

      {/* RIGHT: Feedback panel */}
      <Box sx={{
        width: 340, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider',
        bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          <Typography variant="subtitle2" fontWeight={700}>Tutor Feedback</Typography>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {feedbackContent}
        </Box>
        <Box sx={{
          px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider',
          flexShrink: 0,
        }}>
          <Typography variant="caption" color="text.secondary">
            Submitted {new Date(submission.submitted_at).toLocaleDateString()}
            {submission.reviewed_at && ` · Reviewed ${new Date(submission.reviewed_at).toLocaleDateString()}`}
          </Typography>
        </Box>
      </Box>
    </Box>
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
