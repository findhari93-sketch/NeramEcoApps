'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Tabs, Tab, Button, Alert, CircularProgress, Snackbar, Typography } from '@neram/ui';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { pickParam } from '@/lib/ops-format';
import { OpsPageHeader, EmptyState, OpsSkeleton, FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';
import PairCard from '@/components/duplicates/PairCard';
import ReviewDrawer from '@/components/duplicates/ReviewDrawer';
import DismissDialog from '@/components/duplicates/DismissDialog';
import { DUPLICATE_TABS, type DuplicateTab, type DuplicatePair } from '@/components/duplicates/types';

const PAGE_SIZE = 50;

const TAB_LABELS: Record<DuplicateTab, string> = {
  open: 'Open',
  merged: 'Merged',
  dismissed: 'Dismissed',
};

function personName(p: DuplicatePair['a']): string {
  if (!p) return 'a deleted record';
  return p.name && p.name !== 'User' ? p.name : p.email || p.phone || 'Unnamed';
}

function DuplicatesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = pickParam(searchParams.get('tab'), DUPLICATE_TABS, 'open');
  const reviewId = searchParams.get('review');
  // Links from a person's User 360 header and from Nexus narrow the queue to them.
  const userParam = searchParams.get('user');
  const userFilter = userParam && /^[0-9a-f-]{36}$/i.test(userParam) ? userParam : null;

  const [pairs, setPairs] = useState<DuplicatePair[]>([]);
  const [total, setTotal] = useState(0);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState('');
  const [dismissTarget, setDismissTarget] = useState<{ id: string; names: string } | null>(null);

  const load = useCallback(
    async (offset = 0) => {
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      setError('');
      try {
        const userQuery = userFilter ? `&user=${userFilter}` : '';
        const res = await fetch(`/api/duplicates?status=${tab}&limit=${PAGE_SIZE}&offset=${offset}${userQuery}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not load the duplicates queue.');
        setPairs((prev) => (offset === 0 ? data.candidates || [] : [...prev, ...(data.candidates || [])]));
        setTotal(data.total || 0);
        setOpenCount(typeof data.openCount === 'number' ? data.openCount : null);
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
  }, [load]);

  const setUrl = (next: { tab?: DuplicateTab; review?: string | null; user?: string | null }, push = false) => {
    const params = new URLSearchParams();
    const t = next.tab ?? tab;
    if (t !== 'open') params.set('tab', t);
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
      setNotice(`${added === 0 ? 'Scan finished. No new pairs found.' : `Scan finished. ${added} new ${added === 1 ? 'pair' : 'pairs'} found.`}${skipped}`);
      if (tab === 'open') load(0);
      else setOpenCount((c) => (c ?? 0) + added);
    } catch (e: any) {
      setError(e?.message || 'The scan did not complete.');
    } finally {
      setScanning(false);
    }
  };

  const afterResolved = (message: string) => {
    setNotice(message);
    load(0);
  };

  const emptyCopy: Record<DuplicateTab, { title: string; body: string }> = {
    open: {
      title: 'No possible duplicates right now',
      body: 'The nightly check found nothing new. Use Scan now after a bulk import or a sign-in problem report.',
    },
    merged: { title: 'No merged pairs yet', body: 'Pairs you merge appear here with the date they were closed.' },
    dismissed: { title: 'No dismissed pairs', body: 'Pairs marked as different people appear here with the reason given.' },
  };

  return (
    <Box sx={{ maxWidth: 1200 }}>
      <OpsPageHeader
        icon={MergeTypeIcon}
        title="Duplicates"
        subtitle="Two records that may belong to one person. Merge them into one, or mark them as different people. Nothing is merged automatically."
        actions={
          <Button
            variant="outlined"
            onClick={scan}
            disabled={scanning}
            startIcon={scanning ? <CircularProgress size={16} color="inherit" /> : <ManageSearchIcon />}
            sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', width: { xs: '100%', md: 'auto' } }}
          >
            {scanning ? 'Scanning' : 'Scan now'}
          </Button>
        }
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v: DuplicateTab) => setUrl({ tab: v, review: null })}
          aria-label="Duplicate pairs by status"
          variant="scrollable"
         
        >
          {DUPLICATE_TABS.map((t) => (
            <Tab
              key={t}
              value={t}
              sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600, ...FOCUS_RING }}
              label={t === 'open' && openCount !== null ? `${TAB_LABELS[t]} (${openCount})` : TAB_LABELS[t]}
            />
          ))}
        </Tabs>
      </Box>

      {userFilter && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              onClick={() => setUrl({ user: null, review: null })}
              sx={{ textTransform: 'none', ...TARGET_44, ...FOCUS_RING }}
            >
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
            <OpsSkeleton key={i} variant="rounded" height={230} />
          ))}
        </Box>
      ) : pairs.length === 0 && !error ? (
        <EmptyState icon={tab === 'open' ? TaskAltIcon : InboxOutlinedIcon} title={emptyCopy[tab].title} body={emptyCopy[tab].body} />
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} aria-live="polite">
            Showing {pairs.length} of {total}
          </Typography>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {pairs.map((pair) => (
              <PairCard
                key={pair.id}
                pair={pair}
                onReview={(p) => setUrl({ review: p.id }, true)}
                onDismiss={(p) => setDismissTarget({ id: p.id, names: `${personName(p.a)} and ${personName(p.b)}` })}
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

      <ReviewDrawer
        candidateId={reviewId}
        onClose={() => setUrl({ review: null })}
        onMerged={() => load(0)}
        onDismissRequest={(id, names) => setDismissTarget({ id, names })}
        onOpenRecord={(userId) => {
          // Drop the closed pair from history first, so Back from the record
          // returns to the list rather than to a pair that no longer exists.
          setUrl({ review: null });
          router.push(`/crm/${userId}`);
        }}
      />

      <DismissDialog
        open={!!dismissTarget}
        candidateId={dismissTarget?.id ?? null}
        names={dismissTarget?.names ?? 'These two records'}
        onClose={() => setDismissTarget(null)}
        onDismissed={() => {
          setDismissTarget(null);
          if (reviewId) setUrl({ review: null });
          afterResolved('Marked as different people. The pair will not be suggested again.');
        }}
      />

      <Snackbar
        open={!!notice}
        autoHideDuration={6000}
        onClose={() => setNotice('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setNotice('')} variant="filled" sx={{ width: '100%' }}>
          {notice}
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
