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
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import TranslateIcon from '@mui/icons-material/Translate';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
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

      const res = await fetch('/api/question-bank/papers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const papersData = json.data || [];

        // Fetch section breakdowns for each paper in parallel
        const enriched = await Promise.all(
          papersData.map(async (paper: NexusQBOriginalPaper) => {
            try {
              const detailRes = await fetch(`/api/question-bank/papers/${paper.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (detailRes.ok) {
                const detailJson = await detailRes.json();
                const questions = detailJson.data?.questions || [];
                const breakdown: Record<string, number> = {};
                let activeCount = 0;
                let hindiCount = 0;
                for (const q of questions) {
                  const cats = q.categories as string[] | null;
                  if (cats && cats.length > 0) {
                    for (const cat of cats) {
                      breakdown[cat] = (breakdown[cat] || 0) + 1;
                    }
                  } else {
                    const fmt = q.question_format || 'OTHER';
                    breakdown[fmt] = (breakdown[fmt] || 0) + 1;
                  }
                  if (q.is_active && q.status === 'active') activeCount++;
                  if ((q as any).question_text_hi) hindiCount++;
                }
                return { ...paper, section_breakdown: breakdown, active_count: activeCount, hindi_count: hindiCount };
              }
            } catch {
              // Ignore errors for individual papers
            }
            return paper;
          })
        );

        setPapers(enriched);
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

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton size="small" onClick={() => router.push('/teacher/question-bank')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1" fontWeight={700} sx={{ flex: 1 }}>
          Uploaded Papers
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<UploadFileOutlinedIcon />}
          onClick={() => router.push('/teacher/question-bank/bulk-upload')}
        >
          Upload
        </Button>
      </Box>

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
                </Typography>

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
                      startIcon={<VisibilityOffOutlinedIcon />}
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
