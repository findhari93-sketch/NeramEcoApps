'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Tabs, Tab, Alert, Button, Snackbar, Typography, CircularProgress } from '@neram/ui';
import { SUGGESTION_LABELS } from '@neram/database';
import type { SuggestionKind } from '@neram/database';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import TuneIcon from '@mui/icons-material/Tune';
import RefreshIcon from '@mui/icons-material/Refresh';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { pickParam, sumCounts } from '@/lib/ops-format';
import { OpsPageHeader, EmptyState, OpsSkeleton, FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';
import SuggestionRow, { KIND_ICON, personName, type Suggestion } from '@/components/lifecycle/SuggestionRow';
import ConfirmActionDialog, { type ConfirmActionConfig } from '@/components/lifecycle/ConfirmActionDialog';
import { useAdminProfile } from '@/contexts/AdminProfileContext';

type KindTab = 'all' | SuggestionKind;
const KINDS: readonly SuggestionKind[] = ['check_in_student', 'archive_lead', 'deactivate_account', 'graduate_student'];
const TABS: readonly KindTab[] = ['all', ...KINDS];
const TAB_LABELS: Record<KindTab, string> = {
  all: 'All',
  check_in_student: 'Check in',
  archive_lead: 'Archive leads',
  deactivate_account: 'Turn off sign-in',
  graduate_student: 'Graduate',
};

type Counts = Record<SuggestionKind, number>;

async function postJson(url: string, body: unknown, fallback: string) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || fallback), { status: res.status });
  return data;
}

function LifecycleInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = pickParam(searchParams.get('kind'), TABS, 'all');
  const { supabaseUserId } = useAdminProfile();

  const [items, setItems] = useState<Suggestion[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [dialog, setDialog] = useState<ConfirmActionConfig | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ status: 'open' });
      if (tab !== 'all') params.set('kind', tab);
      const res = await fetch(`/api/lifecycle/suggestions?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load suggestions.');
      setItems(data.suggestions || []);
      setCounts(data.counts || null);
      setNow(new Date());
    } catch (e: any) {
      setError(e?.message || 'Could not load suggestions.');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const setTab = (next: KindTab) => {
    router.replace(next === 'all' ? '/lifecycle' : `/lifecycle?kind=${next}`, { scroll: false });
  };

  /** Drop a closed suggestion from the list and its count. */
  const removeItem = (item: Suggestion) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setCounts((prev) => (prev ? { ...prev, [item.kind]: Math.max(0, (prev[item.kind] || 0) - 1) } : prev));
  };

  /**
   * Close the suggestion. When the action itself already happened, a 409 (someone
   * else closed it first) is not an error for this person: the row just goes.
   */
  const resolve = async (item: Suggestion, status: 'accepted' | 'dismissed', note: string) => {
    try {
      await postJson(`/api/lifecycle/suggestions/${item.id}`, { status, note: note || null }, 'Could not update the suggestion.');
    } catch (e: any) {
      if (e?.status !== 409) throw e;
    }
  };

  const requireAdmin = () => {
    if (!supabaseUserId) throw new Error('Your admin profile is still loading. Try again in a moment.');
    return supabaseUserId;
  };

  const finish = (item: Suggestion, message: string) => {
    removeItem(item);
    setDialog(null);
    setNotice(message);
  };

  const openAction = (item: Suggestion) => {
    const name = personName(item);
    if (item.kind === 'check_in_student') {
      setDialog({
        title: 'Mark as contacted',
        icon: KIND_ICON.check_in_student,
        body: `Record that someone checked in with ${name}. This only closes the suggestion.`,
        confirmLabel: 'Mark as contacted',
        noteLabel: 'What happened',
        notePlaceholder: 'For example: spoke to parent, exams this month, back next week',
        run: async (note) => {
          await resolve(item, 'accepted', note);
          finish(item, `Marked ${name} as contacted.`);
        },
      });
    } else if (item.kind === 'archive_lead') {
      setDialog({
        title: 'Archive this lead',
        icon: KIND_ICON.archive_lead,
        body: (
          <>
            {name} moves out of the active CRM list. Their sign-in keeps working, and you can restore them from the Archived
            view in Users (CRM).
          </>
        ),
        confirmLabel: 'Archive',
        noteLabel: 'Note',
        run: async (note) => {
          const adminId = requireAdmin();
          await postJson(
            `/api/crm/users/${item.user_id}/archive`,
            { adminId, reason: note || `Lifecycle suggestion: ${item.reason}` },
            'Could not archive this lead.',
          );
          await resolve(item, 'accepted', note);
          finish(item, `Archived ${name}.`);
        },
      });
    } else if (item.kind === 'deactivate_account') {
      setDialog({
        title: 'Turn off sign-in',
        icon: KIND_ICON.deactivate_account,
        color: 'error',
        body: (
          <>
            {name} will not be able to sign in to any Neram app. Their record and history stay as they are. You can turn
            sign-in back on from their page in Users (CRM).
          </>
        ),
        confirmLabel: 'Turn off sign-in',
        noteLabel: 'Reason',
        run: async (note) => {
          await postJson(
            `/api/crm/users/${item.user_id}/disable`,
            { adminId: supabaseUserId, reason: note || `Lifecycle suggestion: ${item.reason}` },
            'Could not turn off sign-in.',
          );
          await resolve(item, 'accepted', note);
          finish(item, `Sign-in turned off for ${name}.`);
        },
      });
    }
  };

  const openMarkDone = (item: Suggestion) => {
    const name = personName(item);
    setDialog({
      title: 'Mark graduation as done',
      icon: TaskAltIcon,
      body: `Close this suggestion after you have graduated ${name} on the Alumni page.`,
      confirmLabel: 'Mark done',
      noteLabel: 'Note',
      run: async (note) => {
        await resolve(item, 'accepted', note);
        finish(item, `Closed the graduation suggestion for ${name}.`);
      },
    });
  };

  const openDismiss = (item: Suggestion) => {
    const name = personName(item);
    setDialog({
      title: 'Dismiss suggestion',
      icon: CloseIcon,
      body: `Nothing changes for ${name}. The daily check may suggest this again later if nothing changes.`,
      confirmLabel: 'Dismiss',
      noteLabel: 'Why',
      run: async (note) => {
        await resolve(item, 'dismissed', note);
        finish(item, `Dismissed the suggestion for ${name}.`);
      },
    });
  };

  const refreshSuggestions = async () => {
    setRefreshing(true);
    setError('');
    try {
      const data = await postJson('/api/lifecycle/run', {}, 'Could not refresh suggestions.');
      const added = Number(data.added || 0);
      setNotice(added === 0 ? 'Suggestions are up to date. Nothing new.' : `${added} new ${added === 1 ? 'suggestion' : 'suggestions'} added.`);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not refresh suggestions.');
    } finally {
      setRefreshing(false);
    }
  };

  const total = sumCounts(counts);
  const tabLabel = (t: KindTab) => {
    if (!counts) return TAB_LABELS[t];
    const n = t === 'all' ? total : counts[t] || 0;
    return `${TAB_LABELS[t]} (${n})`;
  };

  return (
    <Box sx={{ maxWidth: 1280 }}>
      <OpsPageHeader
        icon={AutorenewIcon}
        title="Lifecycle suggestions"
        subtitle="These are suggestions from the daily lifecycle rules. Nothing happens to anyone until you choose an action here."
        actions={
          <>
            <Button
              component={Link}
              href="/settings"
              variant="text"
              startIcon={<TuneIcon />}
              sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
            >
              Edit rules
            </Button>
            <Button
              variant="outlined"
              onClick={refreshSuggestions}
              disabled={refreshing}
              startIcon={refreshing ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
              sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
            >
              {refreshing ? 'Refreshing' : 'Refresh suggestions'}
            </Button>
          </>
        }
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tab} onChange={(_, v: KindTab) => setTab(v)} aria-label="Suggestions by kind" variant="scrollable">
          {TABS.map((t) => (
            <Tab key={t} value={t} label={tabLabel(t)} sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600, ...FOCUS_RING }} />
          ))}
        </Tabs>
      </Box>

      {tab !== 'all' && (
        <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ mb: 2 }}>
          {SUGGESTION_LABELS[tab].title}.{' '}
          {tab === 'check_in_student' && 'Call or message the student, then mark them as contacted.'}
          {tab === 'archive_lead' && 'Archiving is reversible and does not turn off sign-in.'}
          {tab === 'deactivate_account' && 'Turning off sign-in is reversible from the person’s CRM page.'}
          {tab === 'graduate_student' && 'Graduate them on the Alumni page, then mark the suggestion as done.'}
        </Alert>
      )}

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" startIcon={<RefreshIcon />} onClick={load} sx={{ textTransform: 'none', ...TARGET_44 }}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {loading ? (
        <Box aria-busy="true" aria-label="Loading suggestions" sx={{ display: 'grid', gap: 1 }}>
          {[0, 1, 2, 3].map((i) => (
            <OpsSkeleton key={i} variant="rounded" height={112} />
          ))}
        </Box>
      ) : items.length === 0 && !error ? (
        <EmptyState
          icon={TaskAltIcon}
          title={tab === 'all' ? 'No open suggestions' : `No open "${TAB_LABELS[tab]}" suggestions`}
          body="The daily check adds new suggestions every morning. Use Refresh suggestions after changing the rules."
        />
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} aria-live="polite">
            {items.length} open {items.length === 1 ? 'suggestion' : 'suggestions'}
            {items.length >= 100 ? ' (showing the newest 100)' : ''}
          </Typography>
          <Box component="ul" sx={{ display: 'grid', gap: 1, p: 0, m: 0 }}>
            {items.map((item) => (
              <SuggestionRow
                key={item.id}
                item={item}
                showKind={tab === 'all'}
                now={now}
                onAction={openAction}
                onMarkDone={openMarkDone}
                onDismiss={openDismiss}
              />
            ))}
          </Box>
        </>
      )}

      <ConfirmActionDialog config={dialog} onClose={() => setDialog(null)} />

      <Snackbar open={!!notice} autoHideDuration={6000} onClose={() => setNotice('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled" onClose={() => setNotice('')} sx={{ width: '100%' }}>
          {notice}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default function LifecyclePage() {
  return (
    <Suspense fallback={<OpsSkeleton variant="rounded" height={320} />}>
      <LifecycleInner />
    </Suspense>
  );
}
