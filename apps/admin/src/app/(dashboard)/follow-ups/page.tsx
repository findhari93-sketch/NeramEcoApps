'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Tabs, Tab, Alert, Button, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';
import PhoneCallbackIcon from '@mui/icons-material/PhoneCallback';
import PersonIcon from '@mui/icons-material/Person';
import GroupsIcon from '@mui/icons-material/Groups';
import RefreshIcon from '@mui/icons-material/Refresh';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { pickParam } from '@/lib/ops-format';
import { OpsPageHeader, EmptyState, OpsSkeleton, FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';
import FollowUpRow, { type FollowUp } from '@/components/follow-ups/FollowUpRow';
import LogOutcomeDialog from '@/components/follow-ups/LogOutcomeDialog';
import GenerateLinkDialog from '@/components/direct-enrollment/GenerateLinkDialog';
import { useAdminProfile } from '@/contexts/AdminProfileContext';

type Range = 'overdue' | 'today' | 'week' | 'all';
const RANGES: readonly Range[] = ['overdue', 'today', 'week', 'all'];
const RANGE_LABELS: Record<Range, string> = {
  overdue: 'Overdue',
  today: 'Today',
  week: 'This week',
  all: 'All open',
};
type RowType = 'all' | 'demo' | 'callback';
const TYPES: readonly RowType[] = ['all', 'demo', 'callback'];
const TYPE_LABELS: Record<RowType, string> = { all: 'All', demo: 'After demo', callback: 'Callback requests' };
const LIST_LIMIT = 100;

const EMPTY_COPY: Record<Range, { title: string; body: string }> = {
  overdue: { title: 'Nothing overdue', body: 'Every call due before today has been made or closed.' },
  today: { title: 'No calls due today', body: 'Check This week to get ahead, or All open for everything waiting.' },
  week: { title: 'No calls due this week', body: 'New callback requests from the website land here with a due time.' },
  all: { title: 'No open callbacks', body: 'When someone asks for a call back, it appears here.' },
};

function FollowUpsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const range = pickParam(searchParams.get('range'), RANGES, 'today');
  const mine = searchParams.get('mine') === 'true';
  const type = pickParam(searchParams.get('type'), TYPES, 'all');

  const [items, setItems] = useState<FollowUp[]>([]);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logging, setLogging] = useState<FollowUp | null>(null);
  const [linking, setLinking] = useState<FollowUp | null>(null);
  const { supabaseUserId } = useAdminProfile();
  const linkPrefill = useMemo(
    () =>
      linking
        ? {
            studentName: linking.person_name || '',
            studentPhone: linking.person_phone || '',
            userId: linking.user_id || undefined,
            demoRegistrationId: linking.demo_registration_id || undefined,
          }
        : undefined,
    [linking],
  );
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ range });
      if (mine) params.set('mine', 'true');
      if (type !== 'all') params.set('type', type);
      const res = await fetch(`/api/crm/follow-ups?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load follow-ups.');
      setItems(data.followUps || []);
      setDueCount(typeof data.dueCount === 'number' ? data.dueCount : null);
      setNow(new Date());
    } catch (e: any) {
      setError(e?.message || 'Could not load follow-ups.');
    } finally {
      setLoading(false);
    }
  }, [range, mine, type]);

  useEffect(() => {
    load();
  }, [load]);

  const setUrl = (next: { range?: Range; mine?: boolean; type?: RowType }) => {
    const params = new URLSearchParams();
    const r = next.range ?? range;
    const m = next.mine ?? mine;
    const t = next.type ?? type;
    if (r !== 'today') params.set('range', r);
    if (m) params.set('mine', 'true');
    if (t !== 'all') params.set('type', t);
    router.replace(`/follow-ups${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  };

  const overdueInList = items.filter((i) => i.overdue).length;
  const empty = EMPTY_COPY[range];

  return (
    <Box sx={{ maxWidth: 1280 }}>
      <OpsPageHeader
        icon={PhoneCallbackIcon}
        title="Follow-ups"
        subtitle="Open callback requests by due time, in India time. Today also lists anything overdue."
        actions={
          <>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={mine ? 'mine' : 'everyone'}
              onChange={(_, v) => v && setUrl({ mine: v === 'mine' })}
              aria-label="Whose follow-ups"
            >
              <ToggleButton value="mine" sx={{ ...TARGET_44, ...FOCUS_RING, px: 2, textTransform: 'none', gap: 0.75 }}>
                <PersonIcon fontSize="small" aria-hidden />
                Mine
              </ToggleButton>
              <ToggleButton value="everyone" sx={{ ...TARGET_44, ...FOCUS_RING, px: 2, textTransform: 'none', gap: 0.75 }}>
                <GroupsIcon fontSize="small" aria-hidden />
                Everyone
              </ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={type}
              onChange={(_, v) => v && setUrl({ type: v })}
              aria-label="Type of follow-up"
            >
              {TYPES.map((t) => (
                <ToggleButton key={t} value={t} sx={{ ...TARGET_44, ...FOCUS_RING, px: 2, textTransform: 'none' }}>
                  {TYPE_LABELS[t]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Button
              variant="outlined"
              onClick={load}
              disabled={loading}
              startIcon={<RefreshIcon />}
              sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
            >
              Refresh
            </Button>
          </>
        }
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={range}
          onChange={(_, v: Range) => setUrl({ range: v })}
          aria-label="Follow-ups by due date"
          variant="scrollable"
         
        >
          {RANGES.map((r) => (
            <Tab
              key={r}
              value={r}
              sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600, ...FOCUS_RING }}
              label={r === 'today' && dueCount !== null ? `${RANGE_LABELS[r]} (${dueCount})` : RANGE_LABELS[r]}
            />
          ))}
        </Tabs>
      </Box>

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
        <Box aria-busy="true" aria-label="Loading follow-ups" sx={{ display: 'grid', gap: 1 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <OpsSkeleton key={i} variant="rounded" height={96} />
          ))}
        </Box>
      ) : items.length === 0 && !error ? (
        <EmptyState
          icon={EventAvailableIcon}
          title={empty.title}
          body={mine ? `${empty.body} Only calls assigned to you or people you own are shown. Switch to Everyone to see all.` : empty.body}
          action={
            mine ? (
              <Button variant="outlined" onClick={() => setUrl({ mine: false })} sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}>
                Show everyone
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} aria-live="polite">
            {items.length >= LIST_LIMIT ? `Showing the first ${LIST_LIMIT}` : `${items.length} ${items.length === 1 ? 'call' : 'calls'}`}
            {overdueInList > 0 && range !== 'overdue' ? `, ${overdueInList} overdue` : ''}
          </Typography>
          <Box
            aria-hidden
            sx={{
              display: { xs: 'none', md: 'grid' },
              gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1.3fr) minmax(0,1.8fr) minmax(0,1.2fr) 136px',
              gap: 2,
              px: 2.25,
              pb: 0.5,
            }}
          >
            {['Person', 'Due', 'Request', 'Staff', ''].map((h) => (
              <Typography key={h || 'actions'} variant="caption" color="text.secondary" fontWeight={700}>
                {h}
              </Typography>
            ))}
          </Box>
          <Box component="ul" sx={{ display: 'grid', gap: 1, p: 0, m: 0 }}>
            {items.map((item) => (
              <FollowUpRow key={item.callback_id} item={item} now={now} onLogOutcome={item.user_id ? () => setLogging(item) : undefined} onSendLink={item.user_id && supabaseUserId ? () => setLinking(item) : undefined} />
            ))}
          </Box>
        </>
      )}
      <GenerateLinkDialog
        open={!!linking}
        onClose={() => setLinking(null)}
        onSuccess={() => setLinking(null)}
        adminId={supabaseUserId || ''}
        prefillData={linkPrefill}
      />
      <LogOutcomeDialog
        open={!!logging}
        name={logging?.person_name || logging?.person_phone || ''}
        callbackId={logging?.callback_id || ''}
        interest={logging?.interest_level ?? null}
        onClose={() => setLogging(null)}
        onSaved={() => {
          setLogging(null);
          load();
        }}
      />
    </Box>
  );
}

export default function FollowUpsPage() {
  return (
    <Suspense fallback={<OpsSkeleton variant="rounded" height={320} />}>
      <FollowUpsInner />
    </Suspense>
  );
}
