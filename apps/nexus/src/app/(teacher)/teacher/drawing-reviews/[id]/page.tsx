'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, IconButton, Skeleton, Typography, Avatar, Chip, Paper,
  Button, useMediaQuery, useTheme, Switch, Snackbar,
  Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
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
import type { RegionAnnotation } from '@/lib/drawing-prompt-templates';

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

  // Region annotations for ImageToggleTabs
  const [regionAnnotations, setRegionAnnotations] = useState<RegionAnnotation[]>([]);

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
          ai_overlay_annotations: regionAnnotations.length > 0 ? regionAnnotations : null,
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

  // Initialize workspaceData from submission
  useEffect(() => {
    if (!submission) return;
    const initial: WorkspaceData = {
      overlayAnnotations: null,
      overlayImageUrl: submission.reviewed_image_url || null,
      correctedImageUrl: (submission as any).corrected_image_url || null,
      tutorFeedback: submission.tutor_feedback || '',
      resources: (submission.tutor_resources as any) || [],
      rating: submission.tutor_rating || 0,
    };
    workspaceRef.current = initial;
    setWorkspaceData(initial);

    // Restore region annotations from ai_overlay_annotations if they have the new shape
    const saved = (submission as any).ai_overlay_annotations;
    if (Array.isArray(saved) && saved.length > 0 && saved[0]?.x !== undefined) {
      setRegionAnnotations(saved as RegionAnnotation[]);
    }

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
          ai_overlay_annotations: regionAnnotations.length > 0 ? regionAnnotations : null,
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

  // Compact action bar
  const actionBar = isEditMode ? (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 0.75, p: 1,
      borderTop: '1px solid', borderColor: 'divider', flexShrink: 0,
      bgcolor: 'background.paper',
    }}>
      <Button
        variant="outlined"
        size="small"
        onClick={handleSaveDraft}
        disabled={draftSaving || saving}
        startIcon={draftSaved ? <CheckCircleOutlineIcon /> : <SaveOutlinedIcon />}
        color={draftSaved ? 'success' : 'inherit'}
        sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', minHeight: 36, minWidth: 0 }}
      >
        {draftSaving ? '...' : draftSaved ? 'Saved!' : 'Draft'}
      </Button>
      <Button
        variant="outlined"
        color="warning"
        size="small"
        onClick={() => { setAction('redo'); handleSaveReview('redo'); }}
        disabled={saving || draftSaving}
        startIcon={<ReplayIcon />}
        sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', minHeight: 36, minWidth: 0 }}
      >
        {saving && action === 'redo' ? '...' : 'Redo'}
      </Button>
      <Button
        variant="contained"
        color="success"
        size="small"
        onClick={() => { setAction('complete'); handleSaveReview('complete'); }}
        disabled={saving || draftSaving}
        startIcon={<CheckCircleOutlineIcon />}
        sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', minHeight: 36, flex: 1 }}
      >
        {saving && action === 'complete' ? '...' : ['reviewed', 'redo', 'completed'].includes(submission.status) ? 'Save' : 'Complete'}
      </Button>
      <Box sx={{ display: 'flex', alignItems: 'center', ml: 0.5 }}>
        <Switch
          checked={publishToGallery}
          onChange={(e) => setPublishToGallery(e.target.checked)}
          size="small"
          title="Publish to Art Gallery"
        />
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', lineHeight: 1.2 }}>
          Gallery
        </Typography>
      </Box>
    </Box>
  ) : null;

  // Question text (for prompt context)
  const questionText = submission.question?.question_text || '';

  // Workspace + comments panel content
  const reviewPanel = (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2, WebkitOverflowScrolling: 'touch' }}>
        {['reviewed', 'redo', 'completed'].includes(submission.status) && isEditMode && (
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#fff8e1' }}>
            <Typography variant="body2" color="warning.dark" fontWeight={600}>
              Editing a reviewed submission. Changes will notify the student.
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
          {/* Compact header: avatar + name + time + category + menu in one row */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
            bgcolor: '#fff', borderBottom: '1px solid', borderColor: 'divider',
            position: 'sticky', top: 0, zIndex: 10,
          }}>
            <IconButton onClick={() => router.push('/teacher/drawing-reviews')} size="small" sx={{ p: 0.5 }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            <Avatar
              src={sub.student?.avatar_url || undefined}
              sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: '0.75rem' }}
            >
              {sub.student?.name?.charAt(0) || '?'}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: '0.82rem' }}>
                  {sub.student?.name || 'Student'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                  {timeAgo}
                </Typography>
              </Box>
              {/* Question text inline, truncated */}
              {questionText && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: '0.68rem', lineHeight: 1.3 }}>
                  {questionText}
                </Typography>
              )}
            </Box>
            {submission.question && <CategoryBadge category={submission.question.category} />}
            <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Image with toggle tabs + region annotations */}
          <Box sx={{ height: '50vh', bgcolor: '#1a1a1a', p: 1 }}>
            <ImageToggleTabs
              originalImageUrl={submission.original_image_url}
              overlayAnnotations={(sub.ai_overlay_annotations as any) || undefined}
              overlayImageUrl={workspaceData.overlayImageUrl}
              correctedImageUrl={workspaceData.correctedImageUrl}
              isEditMode={isEditMode}
              regionAnnotations={regionAnnotations}
              onRegionAnnotationsChange={setRegionAnnotations}
              questionCategory={submission.question?.category}
              questionContext={questionText}
            />
          </Box>

          {/* Feedback Workspace */}
          <Box sx={{ bgcolor: 'background.paper' }}>
            <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1, fontSize: '0.85rem' }}>Feedback</Typography>
              {!isEditMode && (
                <Button
                  size="small" variant="outlined" startIcon={<EditOutlinedIcon />}
                  onClick={() => setIsEditMode(true)}
                  sx={{ textTransform: 'none', minHeight: 28, fontSize: '0.72rem' }}
                >
                  Edit
                </Button>
              )}
            </Box>

            <Box sx={{ p: 1.5 }}>
              {['reviewed', 'redo', 'completed'].includes(submission.status) && isEditMode && (
                <Paper variant="outlined" sx={{ p: 1, mb: 1.5, bgcolor: '#fff8e1' }}>
                  <Typography variant="caption" color="warning.dark" fontWeight={600}>
                    Editing reviewed submission. Changes will notify student.
                  </Typography>
                </Paper>
              )}

              {submission.self_note && (
                <Paper variant="outlined" sx={{ p: 1, mb: 1.5, bgcolor: '#f0f7ff' }}>
                  <Typography variant="caption" fontWeight={600} color="primary.dark">Student&apos;s Note</Typography>
                  <Typography variant="body2" sx={{ mt: 0.25, fontSize: '0.82rem' }}>{submission.self_note}</Typography>
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

            {/* Sticky bottom action bar */}
            {actionBar}
          </Box>
        </Box>

        {/* More actions menu */}
        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
          <MenuItem onClick={() => { setMenuAnchor(null); setDeleteDialogOpen(true); }} sx={{ color: 'error.main' }}>
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

        {/* Error snackbar */}
        <Snackbar
          open={!!error}
          autoHideDuration={5000}
          onClose={() => setError('')}
          message={error}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        />
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
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" fontWeight={600} noWrap>{sub.student?.name || 'Student'}</Typography>
              <Typography variant="caption" color="text.secondary">{timeAgo}</Typography>
            </Box>
            {questionText && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {questionText}
              </Typography>
            )}
          </Box>
          {submission.question && <CategoryBadge category={submission.question.category} />}
          {submission.attempt_number > 1 && (
            <Chip label={`Attempt #${submission.attempt_number}`} size="small" variant="outlined" />
          )}
          <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <MoreVertIcon />
          </IconButton>
        </Box>

        {/* Image with toggle + region annotations */}
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 1.5, bgcolor: '#e8e8e8' }}>
          <ImageToggleTabs
            originalImageUrl={submission.original_image_url}
            overlayAnnotations={(sub.ai_overlay_annotations as any) || undefined}
            overlayImageUrl={workspaceData.overlayImageUrl}
            correctedImageUrl={workspaceData.correctedImageUrl}
            isEditMode={isEditMode}
            regionAnnotations={regionAnnotations}
            onRegionAnnotationsChange={setRegionAnnotations}
            questionCategory={submission.question?.category}
            questionContext={questionText}
          />
        </Box>
      </Box>

      {/* RIGHT: Feedback Workspace */}
      <Box sx={{
        width: 400, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider',
        bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1, fontSize: '0.85rem' }}>Feedback</Typography>
          {!isEditMode && (
            <Button
              size="small" variant="outlined" startIcon={<EditOutlinedIcon />}
              onClick={() => setIsEditMode(true)}
              sx={{ textTransform: 'none', minHeight: 28, fontSize: '0.75rem' }}
            >
              Edit
            </Button>
          )}
        </Box>
        {reviewPanel}
      </Box>

      {/* More actions menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => { setMenuAnchor(null); setDeleteDialogOpen(true); }} sx={{ color: 'error.main' }}>
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

      {/* Error snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={() => setError('')}
        message={error}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
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
