'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, Button, Paper, Tab, Tabs, Typography } from '@neram/ui';
import VideocamIcon from '@mui/icons-material/Videocam';
import SettingsIcon from '@mui/icons-material/Settings';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import RefreshIcon from '@mui/icons-material/Refresh';
import InboxIcon from '@mui/icons-material/Inbox';
import { OpsPageHeader, OpsSkeleton, EmptyState } from '@/components/ops/OpsUi';
import RequestList from '@/components/demo-requests/RequestList';
import RequestPanel from '@/components/demo-requests/RequestPanel';
import DemoSettingsDialog from '@/components/demo-requests/DemoSettingsDialog';
import WhatsAppHealthDialog from '@/components/demo-requests/WhatsAppHealthDialog';
import { DESK_TABS, sortForTab, tabOf, type DeskDetail, type DeskList, type DeskTab } from '@/components/demo-requests/types';

const EMPTY: Record<DeskTab, { title: string; body: string }> = {
  new: { title: 'No new requests', body: 'New demo requests from the website land here. Call them within 2 hours.' },
  followup: { title: 'Nobody waiting on a call back', body: 'Requests you have called but not confirmed show here.' },
  upcoming: { title: 'No confirmed demos', body: 'Confirm a request to create its Teams meeting.' },
  done: { title: 'No finished demos yet', body: 'Mark attendance after each demo to send the thank-you.' },
  closed: { title: 'Nothing closed', body: 'Not interested and cancelled requests are kept here.' },
};

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      <Typography variant="h5" component="p" fontWeight={700}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Paper>
  );
}

function DemoDesk() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get('id');

  const [list, setList] = useState<DeskList | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [tab, setTab] = useState<DeskTab>('new');
  const [detail, setDetail] = useState<DeskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch('/api/demo-requests');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setList(d);
      setListError(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Could not load demo requests');
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetch(`/api/demo-requests/${selectedId}`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Opening a request from a link (bell, Telegram) jumps to its tab once.
  useEffect(() => {
    if (detail && detail.request.id === selectedId) setTab(tabOf(detail.request));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.request.id]);

  const select = (id: string | null) => {
    router.replace(id ? `/demo-classes?id=${encodeURIComponent(id)}` : '/demo-classes', { scroll: false });
  };

  const onAction = async (body: Record<string, unknown>): Promise<string | null> => {
    if (!selectedId) return 'No request selected';
    try {
      const res = await fetch(`/api/demo-requests/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) return d.error || 'Something went wrong';
      setDetail(d);
      setList((prev) =>
        prev ? { ...prev, requests: prev.requests.map((r) => (r.id === d.request.id ? d.request : r)) } : prev,
      );
      loadList();
      return null;
    } catch {
      return 'Network error. Check your connection and try again.';
    }
  };

  const counts = useMemo(() => {
    const c: Record<DeskTab, number> = { new: 0, followup: 0, upcoming: 0, done: 0, closed: 0 };
    list?.requests.forEach((r) => c[tabOf(r)]++);
    return c;
  }, [list]);

  const rows = useMemo(
    () => (list ? sortForTab(tab, list.requests.filter((r) => tabOf(r) === tab)) : []),
    [list, tab],
  );

  const k = list?.kpis;

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto' }}>
      <OpsPageHeader
        icon={VideocamIcon}
        title="Demo classes"
        subtitle="Students pick a day and time on the website and sign in at the end. Call them, confirm a time, and the Teams meeting, Gmail invite and WhatsApp reminders go out by themselves."
        actions={
          <>
            <Button variant="outlined" startIcon={<WhatsAppIcon />} onClick={() => setHealthOpen(true)} sx={{ minHeight: 44 }}>
              WhatsApp status
            </Button>
            <Button variant="outlined" startIcon={<SettingsIcon />} onClick={() => setSettingsOpen(true)} sx={{ minHeight: 44 }}>
              Demo settings
            </Button>
            <Button startIcon={<RefreshIcon />} onClick={loadList} sx={{ minHeight: 44 }}>
              Refresh
            </Button>
          </>
        }
      />

      {list && !list.settings.hosts.length && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" onClick={() => setSettingsOpen(true)}>
              Set up team
            </Button>
          }
        >
          Add the demo team (Hari, Tamil Selvan, Shanthi) in Demo settings, so Confirm can create the Teams meeting and send reminders.
        </Alert>
      )}
      {listError && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={loadList}>Retry</Button>}>
          {listError}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 1.5, mb: 2 }}>
        {k ? (
          <>
            <Kpi label="New, needs a call" value={k.newRequests} />
            <Kpi label="Demos today" value={k.today} />
            <Kpi label="Confirmed, next 7 days" value={k.confirmedNext7} />
            <Kpi label="Attendance, 30 days" value={k.attendanceRate30 === null ? 'No data' : `${k.attendanceRate30}%`} />
            <Kpi label="Enrolled after demo" value={k.enrolled30} hint={`of ${k.requests30} who asked in 30 days`} />
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => <OpsSkeleton key={i} variant="rounded" height={86} />)
        )}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        allowScrollButtonsMobile
        aria-label="Demo request stages"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {DESK_TABS.map((t) => (
          <Tab key={t.id} value={t.id} label={`${t.label} (${counts[t.id]})`} title={t.hint} sx={{ minHeight: 48 }} />
        ))}
      </Tabs>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: selectedId ? 'minmax(0, 7fr) minmax(0, 5fr)' : '1fr' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          {!list ? (
            <OpsSkeleton variant="rounded" height={320} />
          ) : rows.length === 0 ? (
            <EmptyState icon={InboxIcon} title={EMPTY[tab].title} body={EMPTY[tab].body} />
          ) : (
            <RequestList
              rows={rows}
              tab={tab}
              selectedId={selectedId}
              onSelect={(id) => select(id)}
              schedule={list.settings.schedule}
              now={now}
            />
          )}
        </Box>
        {selectedId && list && (
          <Box sx={{ minWidth: 0, position: { lg: 'sticky' }, top: { lg: 80 } }}>
            <RequestPanel
              key={selectedId}
              detail={detail}
              loading={detailLoading}
              settings={list.settings}
              now={now}
              onAction={onAction}
              onClose={() => select(null)}
            />
          </Box>
        )}
      </Box>

      <DemoSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={loadList} />
      <WhatsAppHealthDialog open={healthOpen} onClose={() => setHealthOpen(false)} />
    </Box>
  );
}

export default function DemoClassesPage() {
  return (
    <Suspense fallback={<OpsSkeleton variant="rounded" height={400} />}>
      <DemoDesk />
    </Suspense>
  );
}
