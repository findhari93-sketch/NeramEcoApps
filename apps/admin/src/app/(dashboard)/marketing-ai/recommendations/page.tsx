'use client';

/**
 * Marketing Intelligence: Recommendations. The approval queue. Filter by
 * state and category, open one in the drawer (?id= keeps it linkable), or
 * select several and decide together. Desktop first, usable from 900px.
 * Entered from the sidebar or the Overview; Back goes to the Overview.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, Button, Checkbox, MenuItem, Paper, Snackbar, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import TimelineIcon from '@mui/icons-material/Timeline';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import { EmptyState, FOCUS_RING, OpsPageHeader, OpsSkeleton, StatusChip, TARGET_44 } from '@/components/ops/OpsUi';
import { AdminOnly, ConfirmDialog, ModeBanner } from '@/components/marketing-ai/Parts';
import RecommendationDrawer from '@/components/marketing-ai/RecommendationDrawer';
import { api, CATEGORY_LABEL, EXECUTABLE, PRIORITY_TONE, STATUS_LABEL, when } from '@/components/marketing-ai/format';

const VIEWS = [
  { value: 'pending', label: 'Needs approval' },
  { value: 'progress', label: 'Approved or failed' },
  { value: 'done', label: 'Done' },
] as const;

export default function RecommendationsPage() {
  return (
    <Suspense fallback={<OpsSkeleton variant="rounded" height={400} />}>
      <RecommendationsInner />
    </Suspense>
  );
}

function RecommendationsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = (VIEWS.find((v) => v.value === params.get('view'))?.value ?? 'pending') as (typeof VIEWS)[number]['value'];
  const category = params.get('category') || '';
  const openId = params.get('id');

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<null | 'approve' | 'reject'>(null);
  const [toast, setToast] = useState<string | null>(null);

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const load = useCallback(() => {
    let cancelled = false;
    setError(null);
    api(`/api/marketing-ai/recommendations?status=${view}${category ? `&category=${category}` : ''}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError({ message: e.message, status: e.status }));
    return () => {
      cancelled = true;
    };
  }, [view, category]);

  useEffect(() => {
    setData(null);
    setSelected([]);
    return load();
  }, [load]);

  const items: any[] = useMemo(() => data?.items ?? [], [data]);
  const selectable = useMemo(() => items.filter((i) => i.status === 'pending_approval').map((i) => i.id), [items]);

  if (error?.status === 403) return <AdminOnly />;

  const runBulk = async (kind: 'approve' | 'reject', note: string) => {
    let ok = 0;
    const failures: string[] = [];
    for (const id of selected) {
      const item = items.find((i) => i.id === id);
      try {
        const r = await api(`/api/marketing-ai/recommendations/${id}/${kind}`, {
          method: 'POST',
          body: JSON.stringify({ note: note || undefined, execute: kind === 'approve' && EXECUTABLE.includes(item?.category) }),
        });
        if (r.execution?.status === 'failed') failures.push(`${item?.title}: ${r.execution.message}`);
        else ok++;
      } catch (e: any) {
        failures.push(`${item?.title}: ${e.message}`);
      }
    }
    setBulk(null);
    setSelected([]);
    setToast(failures.length ? `${ok} done, ${failures.length} failed. ${failures[0]}` : `${ok} ${kind === 'approve' ? 'approved' : 'rejected'}.`);
    load();
  };

  return (
    <Box>
      <OpsPageHeader
        icon={FactCheckOutlinedIcon}
        title="Recommendations"
        subtitle="What the Google Ads agent found, with the numbers behind each one. Nothing changes in Google Ads until you approve it, unless a category is on automatic."
        actions={
          <Button component={Link} href="/marketing-ai" sx={TARGET_44}>
            Back to overview
          </Button>
        }
      />
      {data?.connection && <ModeBanner mode={data.connection.mode} mutationsAllowed={data.connection.mutationsAllowed} missing={[]} />}

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v) => v && setParam({ view: v, id: null })} aria-label="Which recommendations">
          {VIEWS.map((v) => (
            <ToggleButton key={v.value} value={v.value} sx={TARGET_44}>
              {v.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField select size="small" label="Type" value={category} onChange={(e) => setParam({ category: e.target.value || null })} sx={{ minWidth: 180 }}>
          <MenuItem value="">All types</MenuItem>
          {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
            <MenuItem key={k} value={k}>
              {label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {selected.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', position: 'sticky', top: 8, zIndex: 10 }}>
          <Typography variant="body2" fontWeight={700} sx={{ mr: 1 }}>
            {selected.length} selected
          </Typography>
          <Button variant="contained" sx={TARGET_44} onClick={() => setBulk('approve')}>
            Approve and apply
          </Button>
          <Button color="error" sx={TARGET_44} onClick={() => setBulk('reject')}>
            Reject
          </Button>
          <Button sx={TARGET_44} onClick={() => setSelected([])}>
            Clear
          </Button>
        </Paper>
      )}

      {error && <Alert severity="error">{error.message}</Alert>}
      {!data && !error && (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <OpsSkeleton key={i} variant="rounded" height={92} />
          ))}
        </Box>
      )}

      {data && items.length === 0 && (
        <EmptyState
          icon={TaskAltIcon}
          title={view === 'pending' ? 'Nothing waiting for approval' : 'Nothing here'}
          body={view === 'pending' ? 'The agent analyses the account every morning at 6:30. You can also run an audit from the Overview.' : 'Try another view or type.'}
          action={
            <Button component={Link} href="/marketing-ai" sx={TARGET_44}>
              Go to overview
            </Button>
          }
        />
      )}

      {items.length > 0 && (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {view === 'pending' && selectable.length > 1 && (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Checkbox
                checked={selected.length === selectable.length}
                indeterminate={selected.length > 0 && selected.length < selectable.length}
                onChange={(e) => setSelected(e.target.checked ? selectable : [])}
                inputProps={{ 'aria-label': 'Select all' }}
              />
              <Typography variant="body2">Select all {selectable.length}</Typography>
            </Box>
          )}
          {items.map((r) => {
            const status = STATUS_LABEL[r.status] ?? { label: r.status, tone: 'neutral' as const };
            const canSelect = r.status === 'pending_approval';
            return (
              <Paper key={r.id} variant="outlined" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.5, borderRadius: 2, borderColor: r.priority === 'critical' ? 'error.main' : 'divider' }}>
                {canSelect && (
                  <Checkbox
                    checked={selected.includes(r.id)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))}
                    inputProps={{ 'aria-label': `Select ${r.title}` }}
                  />
                )}
                <Box
                  role="button"
                  tabIndex={0}
                  onClick={() => setParam({ id: r.id })}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setParam({ id: r.id }))}
                  sx={{ flex: 1, minWidth: 0, cursor: 'pointer', borderRadius: 1, ...FOCUS_RING }}
                >
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 0.75 }}>
                    <StatusChip icon={FlagOutlinedIcon} tone={PRIORITY_TONE[r.priority]} label={r.priority} />
                    <StatusChip icon={CategoryOutlinedIcon} label={CATEGORY_LABEL[r.category] ?? r.category} />
                    {view !== 'pending' && <StatusChip icon={TimelineIcon} tone={status.tone} label={status.label} />}
                  </Box>
                  <Typography fontWeight={700} sx={{ wordBreak: 'break-word' }}>
                    {r.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {r.reason}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Raised {when(r.created_at)}
                    {r.decided_at ? `, decided ${when(r.decided_at)}${r.decided_by === 'autopilot' ? ' by autopilot' : ''}` : ''}
                  </Typography>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      <RecommendationDrawer
        id={openId}
        connection={data?.connection ?? null}
        onClose={() => setParam({ id: null })}
        onChanged={(m) => {
          setToast(m);
          load();
        }}
      />

      <ConfirmDialog
        open={bulk === 'approve'}
        title={`Approve ${selected.length} recommendation${selected.length > 1 ? 's' : ''}?`}
        body={<Typography variant="body2">Blocks, pauses and budget changes among them are applied straight away, each with its own safety checks and Undo. Advice is recorded as accepted.</Typography>}
        confirmLabel="Approve and apply"
        onCancel={() => setBulk(null)}
        onConfirm={(note) => runBulk('approve', note)}
      />
      <ConfirmDialog
        open={bulk === 'reject'}
        title={`Reject ${selected.length} recommendation${selected.length > 1 ? 's' : ''}?`}
        body={<Typography variant="body2">None of them will be raised again for 30 days.</Typography>}
        confirmLabel="Reject"
        tone="error"
        withNote
        onCancel={() => setBulk(null)}
        onConfirm={(note) => runBulk('reject', note)}
      />
      <Snackbar open={!!toast} autoHideDuration={7000} onClose={() => setToast(null)} message={toast} />
    </Box>
  );
}
