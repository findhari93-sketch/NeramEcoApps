'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, IconButton, Skeleton, Typography, Avatar, Chip, Paper,
  Button, useMediaQuery, useTheme, FormControlLabel, Checkbox,
  Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ReplayIcon from '@mui/icons-material/Replay';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import ImageToggleTabs from '@/components/drawings/ImageToggleTabs';
import AIFeedbackWorkspace, { type WorkspaceData } from '@/components/drawings/AIFeedbackWorkspace';
import CommentSection from '@/components/drawings/CommentSection';
import { useNavBadges } from '@/components/NavBadgeProvider';
import type { DrawingSubmissionWithDetails } from '@neram/database/types';

export default function DrawingReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const { refreshBadges } = useNavBadges();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [submission, setSubmission] = useState<DrawingSubmissionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  // Workspace data managed by AIFeedbackWorkspace, mirrored here for submission
  const workspaceRef = useRef<WorkspaceData>({
    overlayAnnotations: null,
    overlayImageUrl: null,
    correctedImageUrl: null,
    tutorFeedback: '',
    resources: [],
    rating: 0,
  });
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData>(workspaceRef.current);

  const [saving, setSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [error, setError] = useState('');
  const [action, setAction] = useState<'redo' | 'complete'>('complete');
  const [publishToGallery, setPublishToGallery] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const handleDeleteSubmission = async () => {
    setDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      router.push('/teacher/drawing-reviews');
    } catch {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleSaveDraft = async () => {
    setDraftSaving(true);
    setError('');
    try {
      const token = await getToken();
      const ws = workspaceRef.current;
      const res = await fetch(`/api/drawing/submissions/${submission!.id}/review`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutor_rating: ws.rating || null,
          tutor_feedback: ws.tutorFeedback || null,
          reviewed_image_url: ws.overlayImageUrl,
          corrected_image_url: ws.correctedImageUrl,
          ai_overlay_annotations: ws.overlayAnnotations,
          tutor_resources: ws.resources,
          action: 'draft',
        }),
      });
      if (!res.ok) throw new Error('Failed to save draft');
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setDraftSaving(false);
    }
  };

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

  // Initialize workspaceData from submission so ImageToggleTabs shows saved images immediately
  useEffect(() => {
    if (!submission) return;
    const initial: WorkspaceData = {
      overlayAnnotations: (submission as any).ai_overlay_annotations || null,
      overlayImageUrl: submission.reviewed_image_url || null,
      correctedImageUrl: (submission as any).corrected_image_url || null,
      tutorFeedback: submission.tutor_feedback || '',
      resources: (submission.tutor_resources as any) || [],
      rating: submission.tutor_rating || 0,
    };
    workspaceRef.current = initial;
    setWorkspaceData(initial);
    // Read-only by default for already-reviewed submissions; editable for new ones
    const isReviewed = ['reviewed', 'redo', 'completed'].includes(submission.status);
    setIsEditMode(!isReviewed);
  }, [submission?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWorkspaceChange = useCallback((data: WorkspaceData) => {
    workspaceRef.current = data;
    setWorkspaceData(data);
  }, []);

  const handleSaveReview = async (reviewAction: 'redo' | 'complete') => {
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const ws = workspaceRef.current;
      const res = await fetch(`/api/drawing/submissions/${submission!.id}/review`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutor_rating: ws.rating || null,
          tutor_feedback: ws.tutorFeedback || null,
          reviewed_image_url: ws.overlayImageUrl,
          corrected_image_url: ws.correctedImageUrl,
          ai_overlay_annotations: ws.overlayAnnotations,
          tutor_resources: ws.resources,
          action: reviewAction,
        }),
      });
      if (!res.ok) throw new Error('Failed to save review');

      if (publishToGallery && reviewAction === 'complete') {
        await fetch('/api/drawing/gallery/publish', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ submission_id: submission!.id, publish: true }),
        }).catch(() => {});
      }

      refreshBadges();
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
        {!isMobile && <Skeleton variant="rounded" width={400} height="100%" />}
      </Box>
    );
  }

  if (!submission) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">Submission not found</Typography></Box>;
  }

  const timeAgo = getTimeAgo(submission.submitted_at);
  const sub = submission as any;

  // Action button bar (used in both desktop and mobile) — only visible in edit mode
  const actionBar = isEditMode ? (
    <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
      {error && <Typography color="error" variant="caption" sx={{ mb: 0.5, display: 'block' }}>{error}</Typography>}
      {/* Save Draft row */}
      <Button
        variant="outlined"
        fullWidth
        onClick={handleSaveDraft}
        disabled={draftSaving || saving}
        startIcon={draftSaving ? undefined : <SaveOutlinedIcon />}
        color={draftSaved ? 'success' : 'inherit'}
        sx={{ minHeight: 40, textTransform: 'none', fontWeight: 600, mb: 1, fontSize: '0.85rem' }}
      >
        {draftSaving ? 'Saving...' : draftSaved ? 'Draft Saved' : 'Save Draft'}
      </Button>
      {/* Final action row */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="outlined"
          color="warning"
          fullWidth
          onClick={() => { setAction('redo'); handleSaveReview('redo'); }}
          disabled={saving || draftSaving}
          startIcon={<ReplayIcon />}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
        >
          {saving && action === 'redo' ? 'Saving...' : 'Request Redo'}
        </Button>
        <Button
          variant="contained"
          color="success"
          fullWidth
          onClick={() => { setAction('complete'); handleSaveReview('complete'); }}
          disabled={saving || draftSaving}
          startIcon={<CheckCircleOutlineIcon />}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}
        >
          {saving && action === 'complete' ? 'Saving...' : ['reviewed', 'redo', 'completed'].includes(submission.status) ? 'Save Changes' : 'Mark Complete'}
        </Button>
      </Box>
      <FormControlLabel
        control={<Checkbox checked={publishToGallery} onChange={(e) => setPublishToGallery(e.target.checked)} size="small" />}
        label={<Typography variant="caption">Publish to Art Gallery on complete</Typography>}
        sx={{ mt: 0.5, ml: 0 }}
      />
    </Box>
  ) : null;

  // Workspace + comments panel content (shared between desktop right panel and mobile sheet)
  const reviewPanel = (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2, WebkitOverflowScrolling: 'touch' }}>
        {['reviewed', 'redo', 'completed'].includes(submission.status) && isEditMode && (
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#fff8e1' }}>
            <Typography variant="body2" color="warning.dark" fontWeight={600}>
              Editing a reviewed submission. Any changes you save will notify the student.
            </Typography>
          </Paper>
        )}

        {/* Student note if provided */}
        {submission.self_note && (
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#f0f7ff' }}>
            <Typography variant="caption" fontWeight={600} color="primary.dark">Student&apos;s Note</Typography>
            <Typography variant="body2" sx={{ mt: 0.25 }}>{submission.self_note}</Typography>
          </Paper>
        )}

        <AIFeedbackWorkspace
          submission={sub}
          getToken={getToken}
          onChange={handleWorkspaceChange}
          defaultCollapsed={isMobile}
          readOnly={!isEditMode}
        />

        <Box sx={{ mt: 2 }}>
          <CommentSection submissionId={submission.id} getToken={getToken} canComment={true} />
        </Box>
      </Box>
      {actionBar}
    </Box>
  );

  // ===================== MOBILE LAYOUT =====================
  if (isMobile) {
    return (
      <>
        <Box sx={{ mx: -2, mt: -2 }}>
          {/* Header */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
            bgcolor: '#fff', borderBottom: '1px solid', borderColor: 'divider',
            position: 'sticky', top: 0, zIndex: 10,
          }}>
            <IconButton onClick={() => router.push('/teacher/drawing-reviews')} size="small">
              <ArrowBackIcon />
            </IconButton>
            <Avatar
              src={sub.student?.avatar_url || undefined}
              sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.85rem' }}
            >
              {sub.student?.name?.charAt(0) || '?'}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>{sub.student?.name || 'Student'}</Typography>
              <Typography variant="caption" color="text.secondary">{timeAgo}</Typography>
            </Box>
            {submission.question && <CategoryBadge category={submission.question.category} />}
            <IconButton
              size="small"
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              aria-label="More actions"
            >
              <MoreVertIcon />
            </IconButton>
          </Box>

          {submission.question && (
            <Box sx={{ px: 1.5, py: 0.75, bgcolor: '#f5f5f5' }}>
              <Typography variant="caption" sx={{
                display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4,
              }}>
                {submission.question.question_text}
              </Typography>
            </Box>
          )}

          {/* Image with toggle tabs */}
          <Box sx={{ height: '50vh', bgcolor: '#1a1a1a', p: 1 }}>
            <ImageToggleTabs
              originalImageUrl={submission.original_image_url}
              overlayAnnotations={workspaceData.overlayAnnotations || sub.ai_overlay_annotations}
              overlayImageUrl={workspaceData.overlayImageUrl}
              correctedImageUrl={workspaceData.correctedImageUrl}
            />
          </Box>

          {/* Feedback Workspace - visible inline */}
          <Box sx={{ bgcolor: 'background.paper' }}>
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>Feedback Workspace</Typography>
              {!isEditMode && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<EditOutlinedIcon />}
                  onClick={() => setIsEditMode(true)}
                  sx={{ textTransform: 'none', minHeight: 32, fontSize: '0.78rem' }}
                >
                  Edit Review
                </Button>
              )}
            </Box>

            <Box sx={{ p: 2 }}>
              {['reviewed', 'redo', 'completed'].includes(submission.status) && isEditMode && (
                <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#fff8e1' }}>
                  <Typography variant="body2" color="warning.dark" fontWeight={600}>
                    Editing a reviewed submission. Any changes you save will notify the student.
                  </Typography>
                </Paper>
              )}

              {submission.self_note && (
                <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#f0f7ff' }}>
                  <Typography variant="caption" fontWeight={600} color="primary.dark">Student&apos;s Note</Typography>
                  <Typography variant="body2" sx={{ mt: 0.25 }}>{submission.self_note}</Typography>
                </Paper>
              )}

              <AIFeedbackWorkspace
                submission={sub}
                getToken={getToken}
                onChange={handleWorkspaceChange}
                defaultCollapsed={false}
                readOnly={!isEditMode}
              />

              <Box sx={{ mt: 2 }}>
                <CommentSection submissionId={submission.id} getToken={getToken} canComment={true} />
              </Box>
            </Box>

            {actionBar}
          </Box>
        </Box>

        {/* More actions menu */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
        >
          <MenuItem
            onClick={() => { setMenuAnchor(null); setDeleteDialogOpen(true); }}
            sx={{ color: 'error.main' }}
          >
            <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />
            Delete Submission
          </MenuItem>
        </Menu>

        {/* Delete confirmation dialog */}
        <Dialog open={deleteDialogOpen} onClose={() => !deleting && setDeleteDialogOpen(false)}>
          <DialogTitle>Delete Submission?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This will permanently delete the submission and all associated images. This cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancel</Button>
            <Button onClick={handleDeleteSubmission} color="error" variant="contained" disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      </>
    );
  }

  // ===================== DESKTOP LAYOUT =====================
  return (
    <Box sx={{
      mx: { md: -4, sm: -3, xs: -2 },
      mt: { md: -3, xs: -2 },
      mb: { md: -3, xs: -10 },
      display: 'flex',
      height: 'calc(100vh - 64px)',
      overflow: 'hidden',
    }}>
      {/* LEFT: image with toggle tabs */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1.5,
          px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider',
          bgcolor: 'background.paper', flexShrink: 0,
        }}>
          <IconButton onClick={() => router.push('/teacher/drawing-reviews')} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Avatar
            src={sub.student?.avatar_url || undefined}
            sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: '0.9rem' }}
          >
            {sub.student?.name?.charAt(0) || '?'}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>{sub.student?.name || 'Student'}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AccessTimeIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">{timeAgo}</Typography>
            </Box>
          </Box>
          <Box sx={{ flex: 1 }} />
          {submission.question && <CategoryBadge category={submission.question.category} />}
          {submission.attempt_number > 1 && (
            <Chip label={`Attempt #${submission.attempt_number}`} size="small" variant="outlined" />
          )}
          <IconButton
            size="small"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            aria-label="More actions"
          >
            <MoreVertIcon />
          </IconButton>
        </Box>

        {/* Question strip */}
        {submission.question && (
          <Box sx={{ px: 2, py: 0.75, bgcolor: '#f8f8f8', borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            <Typography variant="body2" color="text.secondary">{submission.question.question_text}</Typography>
          </Box>
        )}

        {/* Image with toggle */}
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 1.5, bgcolor: '#e8e8e8' }}>
          <ImageToggleTabs
            originalImageUrl={submission.original_image_url}
            overlayAnnotations={workspaceData.overlayAnnotations || sub.ai_overlay_annotations}
            overlayImageUrl={workspaceData.overlayImageUrl}
            correctedImageUrl={workspaceData.correctedImageUrl}
          />
        </Box>
      </Box>

      {/* RIGHT: AI Feedback Workspace */}
      <Box sx={{
        width: 400, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider',
        bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>Feedback Workspace</Typography>
          {!isEditMode && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditOutlinedIcon />}
              onClick={() => setIsEditMode(true)}
              sx={{ textTransform: 'none', minHeight: 32, fontSize: '0.78rem' }}
            >
              Edit Review
            </Button>
          )}
        </Box>
        {reviewPanel}
      </Box>

      {/* More actions menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => { setMenuAnchor(null); setDeleteDialogOpen(true); }}
          sx={{ color: 'error.main' }}
        >
          <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />
          Delete Submission
        </MenuItem>
      </Menu>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => !deleting && setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Submission?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete the submission and all associated images. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancel</Button>
          <Button onClick={handleDeleteSubmission} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
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
