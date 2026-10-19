'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Tabs,
  Tab,
  Button,
  Alert,
  AlertTitle,
  CircularProgress,
  Snackbar,
  Typography,
  Switch,
  FormControlLabel,
  Paper,
  Checkbox,
} from '@neram/ui';
import { UNDO_WINDOW_DAYS } from '@neram/database/duplicate-evidence';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import { pickParam } from '@/lib/ops-format';
import { OpsPageHeader, EmptyState, OpsSkeleton, FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';
import PairCard from '@/components/duplicates/PairCard';
import ReviewDrawer from '@/components/duplicates/ReviewDrawer';
import DismissDialog from '@/components/duplicates/DismissDialog';
import BulkMergeDialog from '@/components/duplicates/BulkMergeDialog';
import {
  DUPLICATE_TABS,
  type BulkMergeResponse,
  type DuplicateTab,
  type QueuePair,
  type TabCounts,
} from '@/components/duplicates/types';

const PAGE_SIZE = 50;
const BULK_CHUNK = 25;

const TAB_LABELS: Record<DuplicateTab, string> = {
  ready: 'Ready to merge',
  review: 'Needs review',
  auto: 'Merged automatically',
  history: 'History',
};

function personName(p: QueuePair['a']): string {
  if (!p) return 'a deleted record';
  return p.name && p.name !== 'User' ? p.name : p.email || p.phone || 'an unnamed record';
}

type Notice = { message: string; severity: 'success' | 'info' | 'error'; undoLogId?: string | null };

function DuplicatesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = pickParam(searchParams.get('tab'), DUPLICATE_TABS, 'ready');
  const reviewId = searchParams.get('review');
  // Links from a person's User 360 header and from Nexus narrow the queue to them.
  const userParam = searchParams.get('user');
  const userFilter = userParam && /^[0-9a-f-]{36}$/i.test(userParam) ? userParam : null;

  const [pairs, setPairs] = useState<QueuePair[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<TabCounts | null>(null);
  const [autoMerge, setAutoMerge] = useState<boolean | null>(null);
  const [savingSetting, setSavingSetting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dismissTarget, setDismissTarget] = useState<{ id: string; names: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [busy, setBusy] = useState<Record<string, 'merge' | 'undo'>>({});
  const [focusIndex, setFocusIndex] = useState(-1);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);

  const load = useCallback(
    async (offset = 0) => {
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      setError('');
      try {
        const userQuery = userFilter ? `&user=${userFilter}` : '';
        const res = await fetch(`/api/duplicates?tab=${tab}&limit=${PAGE_SIZE}&offset=${offset}${userQuery}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not load the duplicates queue.');
        setPairs((prev) => (offset === 0 ? data.candidates || [] : [...prev, ...(data.candidates || [])]));
        setTotal(data.total || 0);
        if (data.counts) setCounts(data.counts);
        if (data.settings) setAutoMerge(Boolean(data.settings.autoMergeEnabled));
        if (offset === 0) setSelected(new Set());
      } catch (e: any) {
        setError(e?.message || 'Could not load the duplicates queue.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [tab, userFilter],
  );

  useEffect(() => {
    load(0);
    setFocusIndex(-1);
  }, [load]);

  const setUrl = (next: { tab?: DuplicateTab; review?: string | null; user?: string | null }, push = false) => {
    const params = new URLSearchParams();
    const t = next.tab ?? tab;
    if (t !== 'ready') params.set('tab', t);
    const u = next.user === undefined ? userFilter : next.user;
    if (u) params.set('user', u);
    const r = next.review === undefined ? reviewId : next.review;
    if (r) params.set('review', r);
    const url = `/duplicates${params.toString() ? `?${params.toString()}` : ''}`;
    if (push) router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  };

  const scan = async () => {
    setScanning(true);
    setError('');
    try {
      const res = await fetch('/api/duplicates/scan', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The scan did not complete.');
      const added = Number(data.added || 0);
      const skipped = data.entra?.skipped ? ' The Microsoft directory check was skipped this time.' : '';
      setNotice({
        severity: 'success',
        message: `${added === 0 ? 'Scan finished. Every pair is up to date.' : `Scan finished. ${added} ${added === 1 ? 'pair' : 'pairs'} found or updated.`}${skipped}`,
      });
      load(0);
    } catch (e: any) {
      setError(e?.message || 'The scan did not complete.');
    } finally {
      setScanning(false);
    }
  };

  const toggleAutoMerge = async (next: boolean) => {
    setSavingSetting(true);
    try {
      const res = await fetch('/api/duplicates/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoMergeEnabled: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The setting was not saved.');
      setAutoMerge(next);
      setNotice({
        severity: 'success',
        message: next
          ? 'Automatic merging is on. Safe pairs now merge overnight and right after sign-in or enrolment.'
          : 'Automatic merging is off. Ready pairs wait here for a click.',
      });
    } catch (e: any) {
      setNotice({ severity: 'error', message: e?.message || 'The setting was not saved.' });
    } finally {
      setSavingSetting(false);
    }
  };

  const mergeOne = async (pair: QueuePair) => {
    setBusy((b) => ({ ...b, [pair.id]: 'merge' }));
    try {
      const res = await fetch(`/api/duplicates/${pair.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The merge did not complete. Nothing was changed.');
      setNotice({
        severity: 'success',
        message: `Merged ${personName(pair.a)} and ${personName(pair.b)}.`,
        undoLogId: data.logId ?? null,
      });
      load(0);
    } catch (e: any) {
      setNotice({ severity: 'error', message: e?.message || 'The merge did not complete.' });
    } finally {
      setBusy((b) => {
        const { [pair.id]: _gone, ...rest } = b;
        return rest;
      });
    }
  };

  const undoByLog = async (logId: string, pairId?: string) => {
    if (pairId) setBusy((b) => ({ ...b, [pairId]: 'undo' }));
    try {
      const res = await fetch(`/api/duplicates/merges/${logId}/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The undo did not complete.');
      setNotice({ severity: 'info', message: 'Merge undone. Both records are back, and the pair is in Needs review.' });
      load(0);
    } catch (e: any) {
      setNotice({ severity: 'error', message: e?.message || 'The undo did not complete.' });
    } finally {
      if (pairId) {
        setBusy((b) => {
          const { [pairId]: _gone, ...rest } = b;
          return rest;
        });
      }
    }
  };

  const selectable = useMemo(() => pairs.filter((p) => p.status === 'open' && p.a && p.b), [pairs]);
  const selectedPairs = useMemo(() => selectable.filter((p) => selected.has(p.id)), [selectable, selected]);
  const allSelected = selectable.length > 0 && selectedPairs.length === selectable.length;

  const toggleSelect = (pair: QueuePair) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pair.id)) next.delete(pair.id);
      else next.add(pair.id);
      return next;
    });

  const runBulk = async () => {
    setBulkBusy(true);
    const ids = selectedPairs.map((p) => p.id);
    const merged: BulkMergeResponse['merged'] = [];
    const failed: BulkMergeResponse['failed'] = [];
    try {
      for (let i = 0; i < ids.length; i += BULK_CHUNK) {
        const res = await fetch('/api/duplicates/bulk-merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ids.slice(i, i + BULK_CHUNK) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'The merges did not complete.');
        merged.push(...(data.merged || []));
        failed.push(...(data.failed || []));
      }
      setNotice({
        severity: failed.length ? 'info' : 'success',
        message:
          `Merged ${merged.length} ${merged.length === 1 ? 'pair' : 'pairs'}.` +
          (failed.length ? ` ${failed.length} could not be merged and stay in the list: ${failed[0].error}` : '') +
          ` Undo any of them from History or Merged automatically for ${UNDO_WINDOW_DAYS} days.`,
      });
    } catch (e: any) {
      setNotice({ severity: 'error', message: `${e?.message || 'The merges did not complete.'} ${merged.length ? `${merged.length} merged before it stopped.` : ''}` });
    } finally {
      setBulkBusy(false);
      setBulkOpen(false);
      load(0);
    }
  };

  // Keyboard: J / K move between pairs, X selects, Enter opens the review.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (reviewId || bulkOpen || dismissTarget) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('input, textarea, [contenteditable="true"], [role="dialog"]') || e.metaKey || e.ctrlKey || e.altKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'j' && key !== 'k' && key !== 'x' && key !== 'enter') return;
      if (pairs.length === 0) return;
      if (key === 'j' || key === 'k') {
        e.preventDefault();
        const next = Math.min(pairs.length - 1, Math.max(0, focusIndex + (key === 'j' ? 1 : -1)));
        setFocusIndex(next);
        cardRefs.current[next]?.focus();
        cardRefs.current[next]?.scrollIntoView({ block: 'nearest' });
        return;
      }
      const pair = pairs[focusIndex];
      if (!pair || pair.status !== 'open' || !pair.a || !pair.b) return;
      if (key === 'x') {
        e.preventDefault();
        toggleSelect(pair);
      } else if (key === 'enter' && target === cardRefs.current[focusIndex]) {
        e.preventDefault();
        setUrl({ review: pair.id }, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const emptyCopy: Record<DuplicateTab, { title: string; body: string }> = {
    ready: {
      title: 'Nothing waiting to merge',
      body: counts?.review
        ? `${counts.review} ${counts.review === 1 ? 'pair needs' : 'pairs need'} a person's decision. Open Needs review.`
        : 'Pairs that pass every check appear here. Use Scan now after a bulk import.',
    },
    review: {
      title: 'Nothing needs review',
      body: 'Pairs that could be siblings, a shared phone or two different people wait here for a decision.',
    },
    auto: {
      title: 'No automatic merges yet',
      body: autoMerge
        ? 'Safe pairs merge overnight and right after sign-in or enrolment. They appear here with Undo.'
        : 'Turn on Merge automatically to let safe pairs merge on their own.',
    },
    history: { title: 'No history yet', body: 'Pairs merged by staff and pairs marked as different people appear here.' },
  };

  const tabLabel = (t: DuplicateTab) => {
    const n = counts ? (t === 'history' ? null : counts[t]) : null;
    return n === null ? TAB_LABELS[t] : `${TAB_LABELS[t]} (${n})`;
  };

  return (
    <Box sx={{ maxWidth: 1200, pb: selectedPairs.length ? 10 : 0 }}>
      <OpsPageHeader
        icon={MergeTypeIcon}
        title="Duplicates"
        subtitle="Two records that belong to one person or one family. Safe pairs merge into one record so nobody calls the same family twice. Every merge can be undone for 30 days."
        actions={
          <>
            <Paper variant="outlined" sx={{ px: 1.5, borderRadius: 1.5, display: 'flex', alignItems: 'center', minHeight: 44 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={!!autoMerge}
                    disabled={autoMerge === null || savingSetting}
                    onChange={(_, v) => toggleAutoMerge(v)}
                    inputProps={{ 'aria-describedby': 'auto-merge-help' }}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      Merge automatically
                    </Typography>
                    <Typography id="auto-merge-help" variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
                      {autoMerge ? 'On: safe pairs merge on their own' : 'Off: ready pairs wait for a click'}
                    </Typography>
                  </Box>
                }
                sx={{ m: 0, gap: 0.5 }}
              />
            </Paper>
            <Button
              variant="outlined"
              onClick={scan}
              disabled={scanning}
              startIcon={scanning ? <CircularProgress size={16} color="inherit" /> : <ManageSearchIcon />}
              sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
            >
              {scanning ? 'Scanning' : 'Scan now'}
            </Button>
          </>
        }
      />

      {tab === 'ready' && !loading && autoMerge === false && (counts?.ready ?? 0) > 0 && (
        <Alert
          severity="info"
          icon={<AutoModeIcon />}
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              variant="outlined"
              onClick={() => {
                setSelected(new Set(selectable.map((p) => p.id)));
                setBulkOpen(true);
              }}
              disabled={selectable.length === 0}
              sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', whiteSpace: 'nowrap' }}
            >
              Merge all {selectable.length}
            </Button>
          }
        >
          <AlertTitle>
            {counts?.ready} {counts?.ready === 1 ? 'pair passed' : 'pairs passed'} every check
          </AlertTitle>
          Check a few below, then merge them all. Turn on Merge automatically and new ones will merge on their own.
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v: DuplicateTab) => setUrl({ tab: v, review: null })}
          aria-label="Duplicate pairs"
          variant="scrollable"
          allowScrollButtonsMobile
        >
          {DUPLICATE_TABS.map((t) => (
            <Tab key={t} value={t} sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600, ...FOCUS_RING }} label={tabLabel(t)} />
          ))}
        </Tabs>
      </Box>

      {userFilter && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" onClick={() => setUrl({ user: null, review: null })} sx={{ textTransform: 'none', ...TARGET_44, ...FOCUS_RING }}>
              Show everyone
            </Button>
          }
        >
          Showing pairs for one person only.
        </Alert>
      )}

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" startIcon={<RefreshIcon />} onClick={() => load(0)} sx={{ textTransform: 'none', ...TARGET_44 }}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {loading ? (
        <Box aria-busy="true" aria-label="Loading pairs" sx={{ display: 'grid', gap: 1.5 }}>
          {[0, 1, 2].map((i) => (
            <OpsSkeleton key={i} variant="rounded" height={260} />
          ))}
        </Box>
      ) : pairs.length === 0 && !error ? (
        <EmptyState
          icon={tab === 'ready' || tab === 'review' ? TaskAltIcon : InboxOutlinedIcon}
          title={emptyCopy[tab].title}
          body={emptyCopy[tab].body}
          action={
            tab === 'ready' && (counts?.review ?? 0) > 0 ? (
              <Button variant="outlined" onClick={() => setUrl({ tab: 'review' })} sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}>
                Open Needs review
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            {selectable.length > 0 && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={allSelected}
                    indeterminate={selectedPairs.length > 0 && !allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((p) => p.id)))}
                    sx={{ width: 44, height: 44, ...FOCUS_RING }}
                  />
                }
                label={<Typography variant="body2">Select all shown</Typography>}
                sx={{ m: 0 }}
              />
            )}
            <Typography variant="body2" color="text.secondary" aria-live="polite">
              Showing {pairs.length} of {total}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', display: { xs: 'none', md: 'block' } }}>
              Keys: J and K to move, X to select, Enter to review
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {pairs.map((pair, i) => (
              <PairCard
                key={pair.id}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                pair={pair}
                tab={tab}
                selected={selected.has(pair.id)}
                focused={focusIndex === i}
                busy={busy[pair.id] ?? null}
                onFocusCard={() => setFocusIndex(i)}
                onToggleSelect={toggleSelect}
                onReview={(p) => setUrl({ review: p.id }, true)}
                onMerge={mergeOne}
                onDismiss={(p) => setDismissTarget({ id: p.id, names: `${personName(p.a)} and ${personName(p.b)}` })}
                onUndo={(p) => p.merge_log_id && undoByLog(p.merge_log_id, p.id)}
              />
            ))}
          </Box>
          {pairs.length < total && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                variant="outlined"
                onClick={() => load(pairs.length)}
                disabled={loadingMore}
                startIcon={loadingMore ? <CircularProgress size={16} color="inherit" /> : undefined}
                sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
              >
                {loadingMore ? 'Loading' : 'Load more'}
              </Button>
            </Box>
          )}
        </>
      )}

      {selectedPairs.length > 0 && (
        <Paper
          elevation={6}
          role="region"
          aria-label="Selected pairs"
          sx={{
            position: 'sticky',
            bottom: 16,
            mt: 2,
            px: 2,
            py: 1,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            zIndex: 20,
          }}
        >
          <Typography variant="body2" fontWeight={700} sx={{ flex: 1, minWidth: 140 }}>
            {selectedPairs.length} selected
          </Typography>
          <Button onClick={() => setSelected(new Set())} sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}>
            Clear
          </Button>
          <Button
            variant="contained"
            startIcon={<MergeTypeIcon />}
            onClick={() => setBulkOpen(true)}
            sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
          >
            Merge {selectedPairs.length}
          </Button>
        </Paper>
      )}

      <ReviewDrawer
        candidateId={reviewId}
        onClose={() => setUrl({ review: null })}
        onMerged={() => load(0)}
        onUndone={() => load(0)}
        onDismissRequest={(id, names) => setDismissTarget({ id, names })}
        onOpenRecord={(userId) => {
          // Drop the closed pair from history first, so Back from the record
          // returns to the list rather than to a pair that no longer exists.
          setUrl({ review: null });
          router.push(`/crm/${userId}`);
        }}
      />

      <BulkMergeDialog
        open={bulkOpen}
        pairs={selectedPairs}
        busy={bulkBusy}
        onCancel={() => setBulkOpen(false)}
        onConfirm={runBulk}
      />

      <DismissDialog
        open={!!dismissTarget}
        candidateId={dismissTarget?.id ?? null}
        names={dismissTarget?.names ?? 'These two records'}
        onClose={() => setDismissTarget(null)}
        onDismissed={() => {
          setDismissTarget(null);
          if (reviewId) setUrl({ review: null });
          setNotice({ severity: 'success', message: 'Marked as different people. The pair will not be suggested again.' });
          load(0);
        }}
      />

      <Snackbar
        open={!!notice}
        autoHideDuration={notice?.undoLogId ? 10000 : 6000}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setNotice(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={notice?.severity || 'success'}
          onClose={() => setNotice(null)}
          variant="filled"
          sx={{ width: '100%', alignItems: 'center' }}
          action={
            notice?.undoLogId ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  const id = notice.undoLogId!;
                  setNotice(null);
                  undoByLog(id);
                }}
                sx={{ ...TARGET_44, textTransform: 'none', fontWeight: 700 }}
              >
                Undo
              </Button>
            ) : undefined
          }
        >
          {notice?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default function DuplicatesPage() {
  return (
    <Suspense fallback={<OpsSkeleton variant="rounded" height={320} />}>
      <DuplicatesInner />
    </Suspense>
  );
}
