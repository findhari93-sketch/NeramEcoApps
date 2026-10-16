'use client';

/**
 * Aintra Inbox: what people ask Aintra (the marketing site's AI assistant),
 * what it answered, and who they are.
 *
 *   Conversations    list, transcript with review tools, person panel
 *   People & leads   one row per person with intent and lead stage
 *   Insights         sources, intents, places and the questions it gets wrong
 *
 * One request loads every conversation (no answer text); a transcript loads
 * when a chat is opened. The view lives in the URL (?tab, ?c, ?seg, ?status,
 * ?q, ?range), so Back and a shared link return to the same place.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Drawer, IconButton, Snackbar, Tab, Tabs, Tooltip, useMediaQuery } from '@neram/ui';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import DownloadIcon from '@mui/icons-material/Download';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CloseIcon from '@mui/icons-material/Close';
import { useTheme } from '@mui/material/styles';
import { OpsPageHeader, TARGET_44 } from '@/components/ops/OpsUi';
import { withTurns } from '@/lib/aintra-inbox/build';
import type { InsightRange } from '@/lib/aintra-inbox/insights';
import type { InboxConversation, InboxPayload, InboxPerson, InboxTurn, Nudge } from '@/lib/aintra-inbox/types';
import ConversationList, { matchesQuery, matchesSegment, matchesStatus, type Segment, type StatusFilter } from './ConversationList';
import InsightsTab from './InsightsTab';
import PeopleTab from './PeopleTab';
import PersonPanel from './PersonPanel';
import Transcript from './Transcript';

type InboxTab = 'conversations' | 'people' | 'insights';

const TABS: InboxTab[] = ['conversations', 'people', 'insights'];
const SEGMENTS: Segment[] = ['all', 'user', 'guest'];
const STATUSES: StatusFilter[] = ['all', 'queue', 'review', 'error', 'none'];
const RANGES: InsightRange[] = ['30', '180', 'all'];
const QUEUE_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface AiHealth {
  blocked: boolean;
  since: string | null;
  failedCalls: number;
}

const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

export default function AintraInbox() {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('lg')); // three panes
  const medium = useMediaQuery(theme.breakpoints.up('md')); // list + transcript, person in a drawer

  const [tab, setTab] = useState<InboxTab>('conversations');
  const [segment, setSegment] = useState<Segment>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<InsightRange>('30');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [data, setData] = useState<InboxPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [turns, setTurns] = useState<InboxTurn[] | null>(null);
  const [turnsLoading, setTurnsLoading] = useState(false);
  const [turnsError, setTurnsError] = useState<string | null>(null);
  const [personOpen, setPersonOpen] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [snack, setSnack] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const turnCache = useRef(new Map<string, InboxTurn[]>());
  const now = useMemo(() => (data ? new Date(data.generatedAt) : new Date()), [data]);

  const notify = useCallback((message: string, severity: 'success' | 'error' = 'success') => setSnack({ message, severity }), []);

  // Read the view from the URL once (useSearchParams would need a Suspense boundary for the build).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setTab(pick(p.get('tab'), TABS, 'conversations'));
    setSegment(pick(p.get('seg'), SEGMENTS, 'all'));
    setStatus(pick(p.get('status'), STATUSES, 'all'));
    setRange(pick(p.get('range'), RANGES, '30'));
    setQuery(p.get('q') ?? '');
    setSelectedId(p.get('c'));
    // The old Chat History "Locations" view lives in Insights now.
    if (p.get('view') === 'locations') setTab('insights');
    setReady(true);
  }, []);

  // ...and write it back on every change.
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    const set = (k: string, v: string | null, dflt: string) => (v && v !== dflt ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    set('tab', tab, 'conversations');
    set('seg', segment, 'all');
    set('status', status, 'all');
    set('range', range, '30');
    set('q', query.trim() || null, '');
    set('c', selectedId, '');
    url.searchParams.delete('view');
    window.history.replaceState(null, '', url.toString());
  }, [ready, tab, segment, status, range, query, selectedId]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/aintra-inbox');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load conversations');
      setData(json as InboxPayload);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load conversations');
    }
  }, []);

  useEffect(() => {
    load();
    fetch('/api/ai-health')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setAiHealth(j && typeof j.blocked === 'boolean' ? j : null))
      .catch(() => setAiHealth(null));
  }, [load]);

  const conversations = data?.conversations ?? [];
  const people = data?.people ?? [];
  const loading = !data && !loadError;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => matchesSegment(c, segment) && matchesStatus(c, status) && matchesQuery(c, q));
  }, [conversations, segment, status, query]);

  // Keep a chat selected: the URL's, else the first one the filters show.
  useEffect(() => {
    if (!data || !ready) return;
    if (selectedId && conversations.some((c) => c.id === selectedId)) return;
    setSelectedId(visible[0]?.id ?? null);
  }, [data, ready, selectedId, conversations, visible]);

  const selected = useMemo(() => conversations.find((c) => c.id === selectedId) ?? null, [conversations, selectedId]);
  const person = useMemo(() => (selected ? people.find((p) => p.key === selected.personKey) ?? null : null), [people, selected]);

  // Load the transcript for the selected chat (cached for the visit).
  useEffect(() => {
    if (!selectedId) {
      setTurns(null);
      return;
    }
    const cached = turnCache.current.get(selectedId);
    if (cached) {
      setTurns(cached);
      setTurnsError(null);
      return;
    }
    let cancelled = false;
    setTurns(null);
    setTurnsLoading(true);
    setTurnsError(null);
    fetch(`/api/aintra-inbox/conversation/${encodeURIComponent(selectedId)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Could not load this conversation');
        return j.turns as InboxTurn[];
      })
      .then((t) => {
        if (cancelled) return;
        turnCache.current.set(selectedId, t);
        setTurns(t);
      })
      .catch((e) => !cancelled && setTurnsError(e instanceof Error ? e.message : 'Could not load this conversation'))
      .finally(() => !cancelled && setTurnsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const onTurnChange = useCallback(
    (t: InboxTurn) => {
      if (!selectedId) return;
      const next = (turnCache.current.get(selectedId) ?? []).map((x) => (x.id === t.id ? t : x));
      turnCache.current.set(selectedId, next);
      setTurns(next);
      setData((d) => (d ? { ...d, conversations: d.conversations.map((c) => (c.id === selectedId ? withTurns(c, next) : c)) } : d));
    },
    [selectedId]
  );

  const onNudge = useCallback((personKey: string, n: Nudge | null) => {
    setData((d) => (d ? { ...d, people: d.people.map((p) => (p.key === personKey ? { ...p, nudge: n } : p)) } : d));
  }, []);

  const openChat = useCallback((id: string) => {
    setTab('conversations');
    setSegment('all');
    setStatus('all');
    setQuery('');
    setSelectedId(id);
    setMobileDetail(true);
  }, []);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setMobileDetail(true);
  }, []);

  // Review queue: the same turns the sidebar badge counts (last 30 days, wrong or unanswered, not corrected).
  const reviewQueue = useMemo(
    () =>
      conversations
        .filter((c) => now.getTime() - Date.parse(c.lastAt) <= QUEUE_DAYS_MS)
        .reduce((n, c) => n + c.reviewCount + c.errorCount, 0),
    [conversations, now]
  );

  const staleWarning = useMemo(() => {
    const newest = conversations[0];
    if (!newest) return null;
    const hours = (now.getTime() - Date.parse(newest.lastAt)) / 3600000;
    if (hours > 48) return `No new Aintra chats in ${Math.floor(hours / 24)} days. If the site has visitors, chat logging may be broken: check the marketing app's Vercel logs.`;
    return null;
  }, [conversations, now]);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/chatbot-logs/export');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const match = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
      a.download = match ? match[1] : 'aintra-conversations.md';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify('Markdown export downloaded');
    } catch {
      notify('Could not download the export', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const panel = (
    <PersonPanel person={person as InboxPerson | null} conversation={selected as InboxConversation | null} onNudge={onNudge} notify={notify} />
  );

  const list = (
    <ConversationList
      loading={loading}
      conversations={conversations}
      segment={segment}
      onSegment={setSegment}
      status={status}
      onStatus={setStatus}
      query={query}
      onQuery={setQuery}
      selectedId={selectedId}
      onSelect={select}
      now={now}
    />
  );

  const transcript = (
    <Transcript
      conversation={selected}
      turns={turns}
      loading={turnsLoading || (loading && !!selectedId)}
      error={turnsError}
      onTurnChange={onTurnChange}
      notify={notify}
      onShowPerson={wide ? undefined : () => setPersonOpen(true)}
      onBack={medium ? undefined : () => setMobileDetail(false)}
    />
  );

  return (
    <Box>
      <OpsPageHeader
        icon={MoveToInboxIcon}
        title="Aintra Inbox"
        subtitle="What people ask Aintra, what it answers, and who they are"
        actions={
          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
            <Button
              color="error"
              variant={reviewQueue ? 'contained' : 'outlined'}
              disableElevation
              onClick={() => {
                setTab('conversations');
                setSegment('all');
                setQuery('');
                setStatus('queue');
                setSelectedId(null);
              }}
              sx={{ ...TARGET_44, fontWeight: 600 }}
            >
              Review queue{data ? ` · ${reviewQueue}` : ''}
            </Button>
            <Tooltip title="Every conversation as Markdown, grouped by chat">
              <span>
                <Button variant="outlined" startIcon={<DownloadIcon />} onClick={download} disabled={downloading} sx={{ ...TARGET_44, fontWeight: 600 }}>
                  {downloading ? 'Preparing…' : 'Download .md'}
                </Button>
              </span>
            </Tooltip>
          </Box>
        }
      />

      {aiHealth?.blocked && aiHealth.since && (
        <Alert
          severity="error"
          icon={<ErrorOutlineIcon />}
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" sx={{ minHeight: 44, whiteSpace: 'nowrap' }}>
              Open AI Studio
            </Button>
          }
        >
          <strong>
            Gemini credits ran out on{' '}
            {new Date(aiHealth.since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}.
          </strong>{' '}
          {aiHealth.failedCalls} AI {aiHealth.failedCalls === 1 ? 'reply has' : 'replies have'} failed since, across Aintra and Nexus. Visitors are being sent to
          WhatsApp. Top up the prepay balance on the billing account in Google AI Studio.
        </Alert>
      )}
      {staleWarning && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {staleWarning}
        </Alert>
      )}
      {loadError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" onClick={load} sx={{ minHeight: 44 }}>
              Try again
            </Button>
          }
        >
          {loadError}
        </Alert>
      )}
      {data?.truncated && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Showing the most recent conversations only. Use Download .md for the full history.
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={(_, v: InboxTab) => setTab(v)}
        aria-label="Aintra Inbox views"
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="conversations" label="Conversations" sx={{ ...TARGET_44, fontWeight: 600 }} />
        <Tab value="people" label="People & leads" sx={{ ...TARGET_44, fontWeight: 600 }} />
        <Tab value="insights" label="Insights" sx={{ ...TARGET_44, fontWeight: 600 }} />
      </Tabs>

      {tab === 'conversations' && (
        <>
          {medium ? (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: wide ? '360px minmax(0,1fr) 300px' : '340px minmax(0,1fr)',
                gap: 2,
                height: 'calc(100vh - 230px)',
                minHeight: 560,
              }}
            >
              {list}
              {transcript}
              {wide && (
                <Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'auto', minHeight: 0 }}>{panel}</Box>
              )}
            </Box>
          ) : (
            <Box sx={{ height: 'calc(100vh - 200px)', minHeight: 520 }}>{mobileDetail && selected ? transcript : list}</Box>
          )}
          {!wide && (
            <Drawer anchor="right" open={personOpen} onClose={() => setPersonOpen(false)} PaperProps={{ sx: { width: { xs: '100%', sm: 360 } } }}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 0.5 }}>
                <IconButton aria-label="Close profile" onClick={() => setPersonOpen(false)} sx={{ width: 44, height: 44 }}>
                  <CloseIcon />
                </IconButton>
              </Box>
              {panel}
            </Drawer>
          )}
        </>
      )}

      {tab === 'people' && <PeopleTab people={people} loading={loading} segment={segment} onSegment={setSegment} onOpenChat={openChat} now={now} />}

      {tab === 'insights' && (
        <InsightsTab conversations={conversations} people={people} loading={loading} range={range} onRange={setRange} onOpenChat={openChat} now={now} />
      )}

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.severity ?? 'success'} variant="filled" onClose={() => setSnack(null)}>
          {snack?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
