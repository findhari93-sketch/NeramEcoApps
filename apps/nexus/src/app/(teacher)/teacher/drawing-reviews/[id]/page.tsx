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
  const [sketchTrigger, setSketchTrigger] = useState(0);

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

  // Action bar: fixed on mobile (above BottomNav), inline on desktop
  const actionBar = isEditMode ? (
    <Box sx={{
      display: 'flex', alignItems: 'center',
      gap: { xs: 0.5, md: 0.75 },
      px: { xs: 1, md: 1 },
      py: 0.75,
      borderTop: '1px solid', borderColor: 'divider',
      bgcolor: 'background.paper',
      // Desktop: inline at bottom of panel
      ...(!isMobile && { flexShrink: 0 }),
      // Mobile: fixed above BottomNav
      ...(isMobile && {
        position: 'fixed',
        bottom: 64, // BottomNav height
        left: 0,
        right: 0,
        zIndex: 10,
        boxShadow: '0 -2px 8px rgba(0,0,0,0.1)',
      }),
    }}>
      {/* Draft: icon-only on mobile, icon+text on desktop */}
      <IconButton
        onClick={handleSaveDraft}
        disabled={draftSaving || saving}
        color={draftSaved ? 'success' : 'default'}
        size="small"
        title={draftSaving ? 'Saving...' : draftSaved ? 'Draft saved!' : 'Save draft'}
        sx={{
          border: '1px solid', borderColor: draftSaved ? 'success.main' : 'divider',
          borderRadius: 1.5, width: 36, height: 36,
          ...(!isMobile && { display: 'none' }),
        }}
      >
        {draftSaved ? <CheckCircleOutlineIcon fontSize="small" /> : <SaveOutlinedIcon fontSize="small" />}
      </IconButton>
      {!isMobile && (
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
      )}

      {/* Redo */}
      <Button
        variant="outlined"
        color="warning"
        size="small"
        onClick={() => { setAction('redo'); handleSaveReview('redo'); }}
        disabled={saving || draftSaving}
        {...(isMobile ? {} : { startIcon: <ReplayIcon /> })}
        sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', minHeight: 36, minWidth: 0, px: { xs: 1.5, md: 2 } }}
      >
        {saving && action === 'redo' ? '...' : 'Redo'}
      </Button>

      {/* Complete / Save: primary action, takes remaining space */}
      <Button
        variant="contained"
        color="success"
        size="small"
        onClick={() => { setAction('complete'); handleSaveReview('complete'); }}
        disabled={saving || draftSaving}
        {...(isMobile ? {} : { startIcon: <CheckCircleOutlineIcon /> })}
        sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', minHeight: 36, flex: 1, px: { xs: 1.5, md: 2 } }}
      >
        {saving && action === 'complete' ? '...' : ['reviewed', 'redo', 'completed'].includes(submission.status) ? 'Save' : 'Complete'}
      </Button>

      {/* Gallery toggle: switch only, no label on mobile */}
      <Switch
        checked={publishToGallery}
        onChange={(e) => setPublishToGallery(e.target.checked)}
        size="small"
        title="Publish to Art Gallery"
      />
      {!isMobile && (
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', lineHeight: 1.2, ml: -0.5 }}>
          Gallery
        </Typography>
      )}
    </Box>
  ) : null;

  // Question text (for prompt context)
  const questionText = submission.question?.question_text || '';

  // Workspace + comments panel content
  const reviewPanel = (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Box sx={{
        flex: 1, overflowY: 'auto', p: 2, WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'thin',
        scrollbarColor: 'transparent transparent',
        '&:hover': { scrollbarColor: 'rgba(0,0,0,0.15) transparent' },
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': {
          background: 'transparent',
          borderRadius: 2,
        },
        '&:hover::-webkit-scrollbar-thumb': {
          background: 'rgba(0,0,0,0.15)',
          '&:hover': { background: 'rgba(0,0,0,0.25)' },
        },
      }}>
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
          sketchTrigger={sketchTrigger}
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
        <Box sx={{ mx: { xs: -2, sm: -3 }, mt: -2, mb: -10 }}>
          {/* Compact header: avatar + name + time + category + menu in one row */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
            bgcolor: '#fff', borderBottom: '1px solid', borderColor: 'divider',
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
          <Box sx={{ height: '50vh', bgcolor: '#1a1a1a', px: 0.5, pt: 0.5, pb: 0.5 }}>
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
              onOpenSketch={() => setSketchTrigger(t => t + 1)}
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
                sketchTrigger={sketchTrigger}
              />

              <Box sx={{ mt: 2 }}>
                <CommentSection submissionId={submission.id} getToken={getToken} canComment={true} />
              </Box>
            </Box>

            {/* Bottom padding to clear fixed action bar (48px) + BottomNav (64px) */}
            <Box sx={{ height: isEditMode ? 120 : 72, flexShrink: 0 }} />
          </Box>
        </Box>

        {/* Fixed action bar above BottomNav */}
        {actionBar}

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
      // Negate parent padding to go edge-to-edge
      mx: { md: -4, sm: -3, xs: -2 },
      mt: { md: -3, xs: -2 },
      mb: { md: -3, xs: -10 },
      display: 'flex',
      height: 'calc(100vh - 64px)',
      overflow: 'hidden',
      // Break out of Container maxWidth on wide screens
      width: { md: 'calc(100% + 64px)', sm: 'calc(100% + 48px)' },
      maxWidth: { md: 'none' },
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
            onOpenSketch={() => setSketchTrigger(t => t + 1)}
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
