'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Paper, Skeleton, Tabs, Tab, Avatar, Chip,
  IconButton, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@neram/ui';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import GalleryFeed from '@/components/drawings/GalleryFeed';
import TagFilterBar from '@/components/drawings/TagFilterBar';
import ViewModeToggle from '@/components/drawings/ViewModeToggle';
import { useDrawingViewMode } from '@/hooks/useDrawingViewMode';
import type { DrawingSubmissionWithDetails, DrawingTag } from '@neram/database/types';

const STATUS_TABS = [
  { value: 'submitted', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'completed', label: 'Completed' },
  { value: 'gallery', label: 'Gallery' },
];

// Sub-filters shown under the Reviewed tab
const REVIEWED_SUB_FILTERS = [
  { value: 'all', label: 'All Reviewed', apiStatus: 'reviewed' },
  { value: 'redo', label: 'Needs Redo', apiStatus: 'redo' },
  { value: 'reviewed', label: 'Feedback Sent', apiStatus: 'reviewed_only' },
];

export default function DrawingReviewsPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [submissions, setSubmissions] = useState<DrawingSubmissionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('submitted');
  const [reviewedSubFilter, setReviewedSubFilter] = useState('all');
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tagSlugs, setTagSlugs] = useState<string[]>([]);
  const [viewMode, setViewMode] = useDrawingViewMode();

  const handleDelete = async () => {
    if (!deleteDialogId) return;
    setDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${deleteDialogId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      setSubmissions((prev) => prev.filter((s) => s.id !== deleteDialogId));
      setDeleteDialogId(null);
    } catch {
      // keep dialog open on failure
    } finally {
      setDeleting(false);
    }
  };

  const fetchQueue = useCallback(async () => {
    if (status === 'gallery') return; // Gallery tab uses GalleryFeed component
    setLoading(true);
    try {
      const token = await getToken();
      // For reviewed tab, apply sub-filter if not 'all'
      let fetchStatus = status;
      if (status === 'reviewed' && reviewedSubFilter === 'redo') fetchStatus = 'redo';
      else if (status === 'reviewed' && reviewedSubFilter === 'reviewed') fetchStatus = 'reviewed_only';

      const params = new URLSearchParams({ status: fetchStatus });
      if (tagSlugs.length > 0) params.set('tags', tagSlugs.join(','));

      const res = await fetch(`/api/drawing/submissions/review-queue?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch {
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, status, reviewedSubFilter, tagSlugs]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const isCompact = viewMode === 'compact';

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Typography variant="h6" fontWeight={700}>Drawing Reviews</Typography>
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
      </Box>

      <Tabs
        value={status}
        onChange={(_, v) => { setStatus(v); setReviewedSubFilter('all'); }}
        sx={{ mb: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none' } }}
      >
        {STATUS_TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>

      {/* Sub-filter chips for Reviewed tab */}
      {status === 'reviewed' && (
        <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          {REVIEWED_SUB_FILTERS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              onClick={() => setReviewedSubFilter(f.value)}
              color={reviewedSubFilter === f.value ? 'primary' : 'default'}
              variant={reviewedSubFilter === f.value ? 'filled' : 'outlined'}
              size="small"
              sx={{ cursor: 'pointer' }}
            />
          ))}
        </Box>
      )}

      {/* Tag filters apply to all tabs except Gallery (Gallery has its own filter bar inside GalleryFeed). */}
      {status !== 'gallery' && (
        <TagFilterBar selected={tagSlugs} onChange={setTagSlugs} />
      )}

      {/* Gallery tab: render GalleryFeed in teacher mode */}
      {status === 'gallery' ? (
        <GalleryFeed getToken={getToken} teacherMode={true} viewMode={viewMode} />
      ) : loading ? (
        Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={80} sx={{ mb: 1 }} />)
      ) : submissions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">
            {status === 'submitted' ? 'No pending reviews' : status === 'completed' ? 'No completed threads' : reviewedSubFilter === 'redo' ? 'No submissions needing redo' : 'No reviewed submissions'}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: isCompact ? 0.75 : 1.5 }}>
          {submissions.map((s) => {
            const thumbSize = isCompact ? 48 : 70;
            const subTags = ((s as any).tags as DrawingTag[] | undefined) || [];
            return (
              <Paper
                key={s.id}
                variant="outlined"
                sx={{ p: isCompact ? 1 : 1.5, cursor: 'pointer', position: 'relative', '&:hover': { bgcolor: 'action.hover' } }}
                onClick={() => router.push(`/teacher/drawing-reviews/${s.id}`)}
              >
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => { e.stopPropagation(); setDeleteDialogId(s.id); }}
                  sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
                  aria-label="Delete submission"
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
                <Box sx={{ display: 'flex', gap: isCompact ? 1 : 1.5 }}>
                  <Box
                    component="img"
                    src={s.original_image_url}
                    alt="Drawing"
                    sx={{ width: thumbSize, height: thumbSize, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                      <Avatar
                        src={s.student?.avatar_url || undefined}
                        sx={{ width: isCompact ? 20 : 24, height: isCompact ? 20 : 24, fontSize: '0.7rem' }}
                      >
                        {s.student?.name?.charAt(0) || '?'}
                      </Avatar>
                      <Typography variant="body2" fontWeight={600} noWrap>{s.student?.name || 'Student'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 0.25, flexWrap: 'wrap' }}>
                      {!isCompact && s.question && <CategoryBadge category={s.question.category} />}
                      {(s as any).thread_info?.total_attempts > 1 && (
                        <Chip
                          label={`Attempt #${(s as any).attempt_number || (s as any).thread_info?.total_attempts}`}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      )}
                      {s.tutor_rating && (
                        <Chip label={`${'★'.repeat(s.tutor_rating)}`} size="small" color="success" sx={{ height: 20 }} />
                      )}
                      {!isCompact && subTags.slice(0, 3).map((t) => (
                        <Chip key={t.id} label={t.label} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                      ))}
                    </Box>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ fontSize: '0.8rem' }}>
                      {s.question?.question_text || 'Free Practice'}
                    </Typography>
                    {!isCompact && (
                      <Typography variant="caption" color="text.secondary">
                        {new Date(s.submitted_at).toLocaleDateString()}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      <Dialog open={!!deleteDialogId} onClose={() => !deleting && setDeleteDialogId(null)}>
        <DialogTitle>Delete Submission?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete the submission and all associated images. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogId(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
