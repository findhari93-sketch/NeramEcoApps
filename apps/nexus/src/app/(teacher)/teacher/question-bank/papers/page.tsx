'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Snackbar,
  Alert,
  EmptyState,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@neram/ui';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { QB_CATEGORY_LABELS } from '@neram/database';
import { useStoredViewMode } from '@/hooks/useStoredViewMode';
import {
  PAPER_VIEWS,
  PAPER_VIEW_STORAGE_KEY,
  type PaperActionHandlers,
  type PaperSort,
  type PaperStatus,
  type PaperWithBreakdown,
} from '@/components/question-bank/papers/paperTypes';
import { countBuckets, queryPapers, toRows } from '@/components/question-bank/papers/paperFilters';
import PaperListToolbar from '@/components/question-bank/papers/PaperListToolbar';
import PaperListSkeleton from '@/components/question-bank/papers/PaperListSkeleton';
import PaperTable from '@/components/question-bank/papers/PaperTable';
import PaperGridCard from '@/components/question-bank/papers/PaperGridCard';
import PaperDetailedCard from '@/components/question-bank/papers/PaperDetailedCard';

/**
 * On a phone these share the row and grow to fill it, two per line, instead of
 * spilling past the right edge. On sm and up they keep their natural width.
 */
const HEADER_ACTION_SX = {
  // Grow from the label's own width rather than a fixed basis. A 50% basis
  // fits two per row but breaks "Publish 4 ready" across two lines; sizing from
  // content packs as many as fit and stretches them to fill the row.
  flex: { xs: '1 1 auto', sm: '0 0 auto' },
  whiteSpace: 'nowrap',
  maxWidth: '100%',
  minHeight: { xs: 44, sm: 'auto' },
} as const;

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

  const [view, setView] = useStoredViewMode(PAPER_VIEW_STORAGE_KEY, PAPER_VIEWS, 'table');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PaperStatus>('all');
  const [sort, setSort] = useState<PaperSort>('recent');

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

  // Derived once per fetch, then reused by the counts, the chips and whichever
  // view is showing. Recomputing "activatable is keyed minus active" inside
  // three separate row components is how the three quietly disagree.
  const rows = useMemo(() => toRows(papers), [papers]);
  const counts = useMemo(() => countBuckets(rows), [rows]);
  const visibleRows = useMemo(
    () => queryPapers(rows, { search, status, sort }),
    [rows, search, status, sort],
  );

  const liveCount = counts.live;
  const publishable = counts.ready;

  /**
   * The five mutations, bundled once and handed to whichever view is showing.
   *
   * Rebuilt every render rather than memoised: none of the row components is
   * `React.memo`, so a stable identity would save nothing, and memoising it
   * would pin the handlers to the closure of whichever render last invalidated
   * the dependency list.
   */
  const actions: PaperActionHandlers = {
    onOpen: (paperId) => router.push(`/teacher/question-bank/papers/${paperId}`),
    onActivate: handleActivate,
    onDeactivate: handleDeactivate,
    onSetVisibility: handleSetVisibility,
    onRequestDelete: (paperId, paperLabel, e) => {
      // The row navigates. Without this, deleting a paper also opens it.
      e.stopPropagation();
      setDeleteConfirm({ open: true, paperId, paperLabel });
    },
    actionLoading,
  };

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatus('all');
  }, []);

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
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              justifyContent: { xs: 'flex-start', sm: 'flex-end' },
            }}
          >
            {publishable > 0 && (
              <Button
                variant="outlined"
                size="small"
                color="success"
                startIcon={<VisibilityOutlinedIcon />}
                onClick={handlePublishAll}
                disabled={actionLoading === 'publish-all'}
                sx={{ textTransform: 'none', ...HEADER_ACTION_SX }}
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
              sx={{ textTransform: 'none', ...HEADER_ACTION_SX }}
            >
              Progress
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<UploadFileOutlinedIcon />}
              onClick={() => router.push('/teacher/question-bank/bulk-upload')}
              sx={{ textTransform: 'none', ...HEADER_ACTION_SX }}
            >
              Upload
            </Button>
          </Box>
        }
      />

      {/* The toolbar renders as soon as there is anything to narrow. Hidden
          while loading, so its chip counts do not flash zeroes. */}
      {!loading && papers.length > 0 && (
        <PaperListToolbar
          search={search}
          onSearchChange={setSearch}
          status={status}
          onStatusChange={setStatus}
          counts={counts}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
        />
      )}

      {loading ? (
        <PaperListSkeleton view={view} />
      ) : papers.length === 0 ? (
        <EmptyState
          icon={<DescriptionOutlinedIcon sx={{ fontSize: 64 }} />}
          title="No papers uploaded yet"
          description="Upload a question paper to start building the bank."
          action={
            <Button
              variant="contained"
              startIcon={<UploadFileOutlinedIcon />}
              onClick={() => router.push('/teacher/question-bank/bulk-upload')}
              sx={{ minHeight: 48 }}
            >
              Upload First Paper
            </Button>
          }
        />
      ) : visibleRows.length === 0 ? (
        /* Distinct from having no papers at all. "Upload your first paper" is
           the wrong instruction when there are 26 and the search just does not
           match any of them. */
        <EmptyState
          icon={<SearchOffOutlinedIcon sx={{ fontSize: 64 }} />}
          title="No papers match these filters"
          description={`${papers.length} papers are hidden by the search or status filter.`}
          action={
            <Button variant="outlined" onClick={clearFilters} sx={{ minHeight: 48 }}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          {/* One list, three densities. The rows are identical data; only the
              layout differs, which is the only thing that ever should differ
              between them. */}
          {view === 'table' && (
            <PaperTable rows={visibleRows} actions={actions} formatDate={formatDate} />
          )}

          {view === 'grid' && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                gap: 1.5,
                alignItems: 'stretch',
              }}
            >
              {visibleRows.map(({ paper, stats }) => (
                <PaperGridCard
                  key={paper.id}
                  paper={paper}
                  stats={stats}
                  actions={actions}
                  formatDate={formatDate}
                />
              ))}
            </Box>
          )}

          {view === 'cards' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {visibleRows.map(({ paper, stats }) => (
                <PaperDetailedCard
                  key={paper.id}
                  paper={paper}
                  stats={stats}
                  actions={actions}
                  getCategoryLabel={getCategoryLabel}
                  formatDate={formatDate}
                />
              ))}
            </Box>
          )}
        </>
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
