'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Box, Button, Paper, Tab, Tabs, Typography } from '@neram/ui';
import VideocamIcon from '@mui/icons-material/Videocam';
import SettingsIcon from '@mui/icons-material/Settings';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import RefreshIcon from '@mui/icons-material/Refresh';
import InboxIcon from '@mui/icons-material/Inbox';
import AddIcon from '@mui/icons-material/Add';
import { OpsPageHeader, OpsSkeleton, EmptyState } from '@/components/ops/OpsUi';
import RequestList from '@/components/demo-requests/RequestList';
import RequestPanel from '@/components/demo-requests/RequestPanel';
import DemoSettingsDialog from '@/components/demo-requests/DemoSettingsDialog';
import WhatsAppHealthDialog from '@/components/demo-requests/WhatsAppHealthDialog';
import AddDemoDialog from '@/components/demo-requests/AddDemoDialog';
import type { DemoFollowUpRow, DemoRequest } from '@neram/database';
import type { DeskDetail, DeskList } from '@/components/demo-requests/types';
import { DESK_STAGES, groupByPerson, sortPeople, stageOf, type DeskPerson, type DeskStage } from '@/components/demo-requests/journey';

const EMPTY: Record<DeskStage, { title: string; body: string }> = {
  to_call: { title: 'Nobody to call', body: 'New website requests land here. Call them within 2 hours. Add demo covers WhatsApp and phone enquiries.' },
  scheduled: { title: 'No demos scheduled', body: 'Confirm a request, or use Add demo > Demo planned for one fixed on WhatsApp.' },
  after_demo: { title: 'No follow-ups running', body: 'After a demo, students stay here until they join or say no.' },
  joined: { title: 'Nobody has joined after a demo yet', body: 'Students who enrol after their demo show here.' },
  closed: { title: 'Nothing closed', body: 'Not interested, cancelled and stopped follow-ups are kept here with the reason.' },
};

function stageOfRequest(r: DemoRequest, followUp: DemoFollowUpRow | null | undefined, joinedAt: Record<string, string>): DeskStage {
  return stageOf(r, followUp, r.user_id && r.user_id in joinedAt ? joinedAt[r.user_id] : undefined);
}

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
  const [tab, setTab] = useState<DeskStage>('to_call');
  const [detail, setDetail] = useState<DeskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // A staff-added request with a time already agreed opens Confirm straight away.
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
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

  const people = useMemo(() => (list ? groupByPerson(list.requests) : []), [list]);
  const stageOfPerson = useCallback(
    (p: DeskPerson): DeskStage => stageOfRequest(p.current, list?.followUps?.[p.current.id], list?.joinedAt ?? {}),
    [list],
  );
  const personOf = useCallback(
    (id: string | null) => (id ? people.find((p) => p.current.id === id || p.history.some((h) => h.id === id)) ?? null : null),
    [people],
  );

  // Opening a request from a link (bell, Telegram) jumps to its student's tab once.
  useEffect(() => {
    if (!detail || detail.request.id !== selectedId) return;
    const p = personOf(selectedId);
    setTab(p ? stageOfPerson(p) : stageOfRequest(detail.request, detail.lastFollowUp, list?.joinedAt ?? {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.request.id]);

  const select = (id: string | null) => {
    setConfirmFor(null);
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
      // Follow the student to their new tab (confirmed, held, attended, stopped), so the panel stays in view.
      setTab(stageOfRequest(d.request, d.lastFollowUp, list?.joinedAt ?? {}));
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
    const c: Record<DeskStage, number> = { to_call: 0, scheduled: 0, after_demo: 0, joined: 0, closed: 0 };
    people.forEach((p) => c[stageOfPerson(p)]++);
    return c;
  }, [people, stageOfPerson]);

  const rows = useMemo(
    () => (list ? sortPeople(tab, people.filter((p) => stageOfPerson(p) === tab), list.followUps ?? {}, list.joinedAt ?? {}) : []),
    [list, people, tab, stageOfPerson],
  );
  const selectedPerson = personOf(selectedId);

  const k = list?.kpis;

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto' }}>
      <OpsPageHeader
        icon={VideocamIcon}
        title="Demo classes"
        subtitle="One row per student, from first call to joining. Website requests land in To call; Add demo covers WhatsApp and phone enquiries, planned demos and demos already held. After the demo, students stay in After demo until they join or say no."
        actions={
          <>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)} disabled={!list} sx={{ minHeight: 44 }}>
              Add demo
            </Button>
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
            <Kpi label="Follow-ups due today" value={k.followUpsDue ?? 0} hint={k.today ? `${k.today} demo${k.today === 1 ? '' : 's'} today` : undefined} />
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
        aria-label="Where students are"
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {DESK_STAGES.map((t) => (
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
              people={rows}
              stage={tab}
              selectedId={selectedId}
              onSelect={(id) => select(id)}
              schedule={list.settings.schedule}
              hosts={list.settings.hosts}
              now={now}
              followUps={list.followUps ?? {}}
              joinedAt={list.joinedAt ?? {}}
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
              onOpenRequest={(id) => select(id)}
              related={selectedPerson ? [selectedPerson.current, ...selectedPerson.history].filter((r) => r.id !== selectedId) : []}
              currentId={selectedPerson?.current.id ?? null}
              openConfirm={confirmFor === selectedId}
            />
          </Box>
        )}
      </Box>

      <DemoSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={loadList} />
      <WhatsAppHealthDialog open={healthOpen} onClose={() => setHealthOpen(false)} />
      {list && (
        <AddDemoDialog
          open={addOpen}
          settings={list.settings}
          onClose={() => setAddOpen(false)}
          onAdded={(id, mode, needsConfirm) => {
            setAddOpen(false);
            setTab(mode === 'held' ? 'after_demo' : mode === 'planned' && !needsConfirm ? 'scheduled' : 'to_call');
            loadList();
            select(id);
            if (needsConfirm) setConfirmFor(id);
          }}
          onOpenExisting={(id) => {
            setAddOpen(false);
            const p = personOf(id);
            if (p) setTab(stageOfPerson(p));
            select(id);
          }}
        />
      )}
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
