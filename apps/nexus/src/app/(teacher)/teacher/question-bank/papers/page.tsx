'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Skeleton,
  Chip,
  IconButton,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@neram/ui';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import TranslateIcon from '@mui/icons-material/Translate';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { QB_EXAM_TYPE_LABELS, QB_CATEGORY_LABELS } from '@neram/database';
import type { NexusQBOriginalPaper } from '@neram/database';
import PaperProgressBar from '@/components/question-bank/PaperProgressBar';

interface PaperWithBreakdown extends NexusQBOriginalPaper {
  section_breakdown?: Record<string, number>;
  active_count?: number;
  hindi_count?: number;
}

export default function PapersListPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();

  const [papers, setPapers] = useState<PaperWithBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; paperId: string; paperLabel: string }>({
    open: false,
    paperId: '',
    paperLabel: '',
  });
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  async function fetchPapers() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      // One request. This used to fetch every paper's full detail to count
      // categories in the browser, so 26 papers meant 27 round trips.
      const res = await fetch('/api/question-bank/papers?breakdown=1', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setPapers(json.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch papers:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPapers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  async function handleActivate(paperId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setActionLoading(paperId + '-activate');
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/question-bank/papers/${paperId}/activate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setSnackbar({ open: true, message: json.message || 'Questions activated', severity: 'success' });
        fetchPapers();
      } else {
        throw new Error('Failed to activate');
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to activate questions', severity: 'error' });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeactivate(paperId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setActionLoading(paperId + '-deactivate');
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/question-bank/papers/${paperId}/deactivate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setSnackbar({ open: true, message: json.message || 'Questions deactivated', severity: 'success' });
        fetchPapers();
      } else {
        throw new Error('Failed to deactivate');
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to deactivate questions', severity: 'error' });
    } finally {
      setActionLoading(null);
    }
  }

  /**
   * Whether students would get anything from this paper.
   *
   * A hint only. `setPaperStudentVisibility` enforces the same rule server-side
   * and returns its own sentence, which is what gets shown when it refuses.
   */
  function isReadyForStudents(paper: PaperWithBreakdown): boolean {
    return (paper.active_count || 0) > 0 || !!paper.study_file_id;
  }

  async function handleSetVisibility(paperId: string, visible: boolean, e: React.MouseEvent) {
    e.stopPropagation();
    setActionLoading(paperId + '-publish');
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/question-bank/papers/${paperId}/access`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_student_visible: visible }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not change who can see this paper');

      setSnackbar({
        open: true,
        message: visible ? 'Published. Students can see this paper now.' : 'Unpublished. Students can no longer see it.',
        severity: 'success',
      });
      fetchPapers();
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Could not change who can see this paper',
        severity: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePublishAll() {
    setActionLoading('publish-all');
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/question-bank/papers/bulk-publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not publish');

      const { published = 0, skipped = [] } = json.data || {};
      // Say what was refused. A bare "Published 12" reads as "all of them" when
      // 14 were left behind for a reason the teacher can act on.
      const skipNote = skipped.length
        ? ` ${skipped.length} skipped, with no questions and no PDF.`
        : '';
      setSnackbar({
        open: true,
        message: published === 0 && !skipped.length
          ? 'Every ready paper was already published.'
          : `Published ${published}.${skipNote}`,
        severity: 'success',
      });
      fetchPapers();
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'Could not publish',
        severity: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    const paperId = deleteConfirm.paperId;
    setDeleteConfirm({ open: false, paperId: '', paperLabel: '' });
    setActionLoading(paperId + '-delete');
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/question-bank/papers/${paperId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setSnackbar({ open: true, message: json.message || 'Paper deleted', severity: 'success' });
        setPapers((prev) => prev.filter((p) => p.id !== paperId));
      } else {
        throw new Error('Failed to delete');
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to delete paper', severity: 'error' });
    } finally {
      setActionLoading(null);
    }
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const getCategoryLabel = (cat: string) =>
    QB_CATEGORY_LABELS[cat as keyof typeof QB_CATEGORY_LABELS] || cat;

  const liveCount = papers.filter((p) => p.is_student_visible).length;
  const publishable = papers.filter((p) => !p.is_student_visible && isReadyForStudents(p)).length;

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
      <PageHeader
        title="Uploaded papers"
        subtitle={
          loading
            ? undefined
            : `${papers.length} papers · ${liveCount} live for students` +
              (publishable > 0 ? ` · ${publishable} ready to publish` : '')
        }
        breadcrumbs={[{ label: 'Question Bank', href: '/teacher/question-bank' }]}
        backHref="/teacher/question-bank"
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {publishable > 0 && (
              <Button
                variant="outlined"
                size="small"
                color="success"
                startIcon={<VisibilityOutlinedIcon />}
                onClick={handlePublishAll}
                disabled={actionLoading === 'publish-all'}
                sx={{ textTransform: 'none' }}
              >
                {actionLoading === 'publish-all' ? 'Publishing...' : `Publish ${publishable} ready`}
              </Button>
            )}
            {/* The other axis: this list is papers, that page is students. */}
            <Button
              variant="outlined"
              size="small"
              startIcon={<InsightsOutlinedIcon />}
              onClick={() => router.push('/teacher/question-bank/papers/overview')}
              sx={{ textTransform: 'none' }}
            >
              Progress
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<UploadFileOutlinedIcon />}
              onClick={() => router.push('/teacher/question-bank/bulk-upload')}
            >
              Upload
            </Button>
          </Box>
        }
      />

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={140} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : papers.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <DescriptionOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            No papers uploaded yet
          </Typography>
          <Button
            variant="contained"
            startIcon={<UploadFileOutlinedIcon />}
            onClick={() => router.push('/teacher/question-bank/bulk-upload')}
          >
            Upload First Paper
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {papers.map((paper) => {
            const total = paper.questions_parsed || 0;
            const keyed = paper.questions_answer_keyed || 0;
            const complete = paper.questions_complete || 0;
            const draft = total - keyed;
            const answerKeyedOnly = keyed - complete;
            const activeCount = paper.active_count || 0;
            // Activatable = answer_keyed + complete, minus already active
            const activatable = keyed - activeCount;
            const shiftSuffix = paper.shift ? ` (${paper.shift === 'forenoon' ? 'Forenoon' : 'Afternoon'})` : '';
            const paperLabel = `${QB_EXAM_TYPE_LABELS[paper.exam_type] || paper.exam_type} ${paper.year}${paper.session ? ` ${paper.session}` : ''}${shiftSuffix}`;
            const isDeleting = actionLoading === paper.id + '-delete';

            return (
              <Paper
                key={paper.id}
                variant="outlined"
                sx={{
                  p: 2,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                  opacity: isDeleting ? 0.5 : 1,
                }}
                onClick={() => router.push(`/teacher/question-bank/papers/${paper.id}`)}
              >
                {/* Header row */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Chip
                    label={QB_EXAM_TYPE_LABELS[paper.exam_type] || paper.exam_type}
                    size="small"
                    color="primary"
                  />
                  <Typography variant="subtitle1" fontWeight={600}>
                    {paper.year}
                  </Typography>
                  {paper.session && (
                    <Chip
                      label={paper.shift
                        ? `${paper.session} (${paper.shift === 'forenoon' ? 'FN' : 'AN'})`
                        : paper.session}
                      size="small"
                      variant="outlined"
                    />
                  )}
                  {(paper.hindi_count ?? 0) > 0 && (
                    <Chip
                      icon={<TranslateIcon sx={{ fontSize: 14 }} />}
                      label={`हिंदी ${paper.hindi_count}/${total}`}
                      size="small"
                      sx={{
                        bgcolor: '#fff3e0',
                        color: '#e65100',
                        fontWeight: 600,
                        fontSize: '0.65rem',
                        height: 22,
                      }}
                    />
                  )}
                  <Box sx={{ flex: 1 }} />
                  {/* The state teachers kept missing: parsing progress and
                      question activation both look like "done" without it. */}
                  <Chip
                    icon={paper.is_student_visible ? <VisibilityOutlinedIcon /> : <VisibilityOffOutlinedIcon />}
                    label={paper.is_student_visible ? 'Live for students' : 'Not published'}
                    size="small"
                    color={paper.is_student_visible ? 'success' : 'default'}
                    variant={paper.is_student_visible ? 'filled' : 'outlined'}
                    sx={{ height: 22, fontSize: '0.7rem', '& .MuiChip-icon': { fontSize: 14 } }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(paper.created_at)}
                  </Typography>
                </Box>

                {/* Progress bar */}
                <Box sx={{ mb: 1 }}>
                  <PaperProgressBar
                    total={total}
                    draft={draft > 0 ? draft : 0}
                    answerKeyed={answerKeyedOnly > 0 ? answerKeyedOnly : 0}
                    complete={complete - activeCount > 0 ? complete - activeCount : 0}
                    active={activeCount}
                  />
                </Box>

                {/* Stats summary */}
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: 'block' }}>
                  {total} total &middot; {keyed} with answers &middot; {complete} complete{activeCount > 0 ? ` \u00b7 ${activeCount} active` : ''}
                  {paper.study_file_id ? ' \u00b7 PDF linked' : ''}
                </Typography>

                {/* Why Publish is greyed out. A disabled button with no reason
                    is the whole problem this screen had. */}
                {!paper.is_student_visible && !isReadyForStudents(paper) && (
                  <Typography variant="caption" color="warning.main" sx={{ mb: 0.75, display: 'block' }}>
                    Nothing for students yet. Activate a question or link the original PDF.
                  </Typography>
                )}

                {/* Section breakdown */}
                {paper.section_breakdown && Object.keys(paper.section_breakdown).length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                    {Object.entries(paper.section_breakdown).map(([cat, count]) => (
                      <Chip
                        key={cat}
                        label={`${getCategoryLabel(cat)}: ${count}`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 22, fontSize: '0.65rem' }}
                      />
                    ))}
                  </Box>
                )}

                {/* Bulk action buttons */}
                <Box
                  sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* First, because it is the only action here that changes what
                      a student sees. Activate and Deactivate move questions in
                      and out of the bank, which is a different question. */}
                  {paper.is_student_visible ? (
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      startIcon={<VisibilityOffOutlinedIcon />}
                      onClick={(e) => handleSetVisibility(paper.id, false, e)}
                      disabled={actionLoading === paper.id + '-publish'}
                      sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 32 }}
                    >
                      {actionLoading === paper.id + '-publish' ? 'Working...' : 'Unpublish'}
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      disableElevation
                      startIcon={<VisibilityOutlinedIcon />}
                      onClick={(e) => handleSetVisibility(paper.id, true, e)}
                      disabled={actionLoading === paper.id + '-publish' || !isReadyForStudents(paper)}
                      sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 32 }}
                    >
                      {actionLoading === paper.id + '-publish' ? 'Publishing...' : 'Publish to students'}
                    </Button>
                  )}
                  {activatable > 0 && (
                    <Button
                      size="small"
                      variant="outlined"
                      color="success"
                      startIcon={<CheckCircleOutlineIcon />}
                      onClick={(e) => handleActivate(paper.id, e)}
                      disabled={actionLoading === paper.id + '-activate'}
                      sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 32 }}
                    >
                      {actionLoading === paper.id + '-activate' ? 'Activating...' : `Activate ${activatable}`}
                    </Button>
                  )}
                  {activeCount > 0 && (
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      // Not an eye. Deactivating pulls questions out of the
                      // bank; hiding the paper from students is Unpublish.
                      startIcon={<RemoveCircleOutlineIcon />}
                      onClick={(e) => handleDeactivate(paper.id, e)}
                      disabled={actionLoading === paper.id + '-deactivate'}
                      sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 32 }}
                    >
                      {actionLoading === paper.id + '-deactivate' ? 'Deactivating...' : `Deactivate ${activeCount}`}
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteOutlineIcon />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm({ open: true, paperId: paper.id, paperLabel });
                    }}
                    disabled={isDeleting}
                    sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 32 }}
                  >
                    Delete
                  </Button>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, paperId: '', paperLabel: '' })}
      >
        <DialogTitle>Delete Paper?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete <strong>{deleteConfirm.paperLabel}</strong> and all its questions.
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm({ open: false, paperId: '', paperLabel: '' })}>
            Cancel
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
