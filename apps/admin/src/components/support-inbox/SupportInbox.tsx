'use client';

/**
 * Support tickets: a split inbox. Queues on the left, the open ticket on the
 * right; below 1200px one pane at a time with an explicit Back.
 *
 * The view lives in the URL (?queue, ?ticket, ?q, ?assignee, ?source,
 * ?category, ?priority), so the bell's ?ticket=NERAM-TKT-00001 links, Back
 * and refresh all land on the same ticket. Every move goes through one
 * PATCH with an action; a 409 means someone else moved it first, and the
 * pane reloads to show the latest.
 *
 * Structure copied from components/aintra-inbox/AintraInbox.tsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, IconButton, Snackbar, Tooltip, Typography, useMediaQuery } from '@neram/ui';
import { useTheme } from '@mui/material/styles';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import RefreshIcon from '@mui/icons-material/Refresh';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined';
import type { SupportTicketDetail, SupportTicketListItem, SupportTicketQueueCounts, SupportTicketResolutionCode } from '@neram/database';
import { ticketStaffQueueOf, type TicketMove } from '@neram/database/support-ticket-status';
import { EmptyState, OpsPageHeader, TARGET_44 } from '@/components/ops/OpsUi';
import { useAdminBadges } from '@/contexts/AdminBadgesContext';
import { DEFAULT_INBOX_STATE, inboxSearch, parseInboxUrl, type InboxUrlState } from '@/lib/support-inbox/inbox-url';
import { ARIA_KEYS, shortcutFor, stepIndex } from '@/lib/support-inbox/keyboard';
import { buildSupportTicketMarkdown } from '@/lib/support-inbox/report-markdown';
import { copyScreenshotsToClipboard } from '@/lib/support-inbox/screenshot-clipboard';
import { screenshotUrlsOf } from '@/lib/support-inbox/screenshots';
import {
  TicketApiError,
  fetchTicketDetail,
  fetchTicketList,
  fetchTicketStaff,
  patchTicket,
  postTicketMessage,
  type StaffOption,
  type TicketRequesterSummary,
} from './api';
import { InboxFilters, QueueTabs } from './QueueTabs';
import { ShortcutsDialog } from './ShortcutsDialog';
import { TicketDetail, TicketDetailSkeleton, type DetailHandlers } from './TicketDetail';
import { TicketList } from './TicketList';
import type { ComposerMode } from './TicketComposer';

export const CHANGED_SNACK = 'This ticket changed. Showing the latest.';

type Snack = { message: string; severity: 'success' | 'error' | 'info' };

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function sameRef(ticket: { id: string; ticket_number: string } | null, ref: string | null): boolean {
  if (!ticket || !ref) return false;
  return ticket.id === ref || ticket.ticket_number === ref;
}

export default function SupportInbox() {
  const theme = useTheme();
  const split = useMediaQuery(theme.breakpoints.up('lg'));
  const wide = useMediaQuery(theme.breakpoints.up('xl'));

  const [view, setView] = useState<InboxUrlState>(DEFAULT_INBOX_STATE);
  const [ready, setReady] = useState(false);
  const [searchQ, setSearchQ] = useState(''); // debounced copy of view.q drives the list

  const [tickets, setTickets] = useState<SupportTicketListItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [counts, setCounts] = useState<SupportTicketQueueCounts | null>(null);

  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [requester, setRequester] = useState<TicketRequesterSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>('reply');
  const [helpOpen, setHelpOpen] = useState(false);
  const [snack, setSnack] = useState<Snack | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const detailPaneRef = useRef<HTMLDivElement | null>(null);
  const followQueueOnce = useRef(false);
  const listSeq = useRef(0);
  const detailSeq = useRef(0);

  const { refresh: refreshBadges } = useAdminBadges();
  const notify = useCallback((message: string, severity: Snack['severity'] = 'success') => setSnack({ message, severity }), []);

  // Read the view from the URL once (useSearchParams would need its own Suspense boundary).
  useEffect(() => {
    const parsed = parseInboxUrl(window.location.search);
    const params = new URLSearchParams(window.location.search);
    // A bell link names a ticket but not a queue: once it loads, show the queue it sits in.
    followQueueOnce.current = !!parsed.ticket && !params.get('queue');
    setView(parsed);
    setSearchQ(parsed.q);
    setReady(true);
  }, []);

  // ...and write it back on every change.
  useEffect(() => {
    if (!ready) return;
    const url = `${window.location.pathname}${inboxSearch(view)}`;
    window.history.replaceState(null, '', url);
  }, [ready, view]);

  // Debounce search typing.
  useEffect(() => {
    const t = setTimeout(() => setSearchQ(view.q), 300);
    return () => clearTimeout(t);
  }, [view.q]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetchTicketStaff()
      .then((r) => {
        setStaff(r.staff);
        setMeId(r.me.id);
      })
      .catch(() => setStaff([]));
  }, []);

  const listState = useMemo(() => ({ ...view, q: searchQ, ticket: null }), [view.queue, view.assignee, view.source, view.category, view.priority, searchQ]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadList = useCallback(
    async (opts: { quiet?: boolean } = {}) => {
      const seq = ++listSeq.current;
      if (!opts.quiet) setListLoading(true);
      setListError(null);
      try {
        const res = await fetchTicketList(listState, 1, true);
        if (seq !== listSeq.current) return;
        setTickets(res.data);
        setHasMore(res.hasMore);
        setPage(1);
        if (res.counts) setCounts(res.counts);
      } catch (e) {
        if (seq !== listSeq.current) return;
        setListError(e instanceof Error ? e.message : 'Could not load tickets');
      } finally {
        if (seq === listSeq.current) setListLoading(false);
      }
    },
    [listState]
  );

  useEffect(() => {
    if (ready) loadList();
  }, [ready, loadList]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const res = await fetchTicketList(listState, page + 1, false);
      setTickets((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...res.data.filter((t) => !seen.has(t.id))];
      });
      setHasMore(res.hasMore);
      setPage((p) => p + 1);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not load more tickets', 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [listState, page, notify]);

  const loadDetail = useCallback(
    async (ref: string, opts: { quiet?: boolean } = {}) => {
      const seq = ++detailSeq.current;
      if (!opts.quiet) {
        setDetailLoading(true);
        setDetail(null);
      }
      setDetailError(null);
      try {
        const res = await fetchTicketDetail(ref, true);
        if (seq !== detailSeq.current) return;
        setDetail(res.data);
        setRequester(res.requester);
        // The unread dot clears as soon as the ticket is open.
        setTickets((prev) => prev.map((t) => (t.id === res.data.id ? { ...t, staff_seen_at: res.data.staff_seen_at } : t)));
        if (followQueueOnce.current) {
          followQueueOnce.current = false;
          const queue = ticketStaffQueueOf(res.data.status);
          setView((v) => (v.queue === queue ? v : { ...v, queue }));
        }
      } catch (e) {
        if (seq !== detailSeq.current) return;
        setDetailError(e instanceof TicketApiError && e.status === 404 ? 'This ticket does not exist, or it was removed.' : e instanceof Error ? e.message : 'Could not load the ticket');
      } finally {
        if (seq === detailSeq.current) setDetailLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!ready) return;
    if (!view.ticket) {
      setDetail(null);
      setRequester(null);
      setDetailError(null);
      return;
    }
    if (sameRef(detail, view.ticket)) return;
    loadDetail(view.ticket);
    setComposerMode('reply');
  }, [ready, view.ticket]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchView = useCallback((patch: Partial<InboxUrlState>) => setView((v) => ({ ...v, ...patch })), []);

  const select = useCallback(
    (t: { ticket_number: string }) => {
      patchView({ ticket: t.ticket_number });
      detailPaneRef.current?.scrollTo?.({ top: 0 });
    },
    [patchView]
  );

  const back = useCallback(() => patchView({ ticket: null }), [patchView]);

  /** After any change: the pane, the list, the counts and the sidebar badges. */
  const afterChange = useCallback(
    (fresh: SupportTicketDetail | null) => {
      if (fresh) {
        setDetail(fresh);
        // Move the row at once from the ticket the server just returned. The
        // refresh below confirms it, but on staging it landed a step late (the
        // first move after a token renewal), which left a started ticket under New.
        const stillListed =
          (view.queue === 'all' || ticketStaffQueueOf(fresh.status) === view.queue) &&
          !(view.assignee === 'unassigned' && fresh.assigned_to);
        setTickets((prev) =>
          prev.flatMap((t) => {
            if (t.id !== fresh.id) return [t];
            if (!stillListed) return [];
            return [
              {
                ...t,
                status: fresh.status,
                priority: fresh.priority,
                category: fresh.category,
                assigned_to: fresh.assigned_to,
                assignee_name: fresh.assignee_name,
                resolution_code: fresh.resolution_code,
                auto_close_at: fresh.auto_close_at,
                closed_at: fresh.closed_at,
                last_reply_at: fresh.last_reply_at,
                last_reply_by: fresh.last_reply_by,
                staff_seen_at: fresh.staff_seen_at,
                reopen_count: fresh.reopen_count,
              },
            ];
          })
        );
      }
      loadList({ quiet: true });
      refreshBadges(true);
    },
    [loadList, refreshBadges, view.queue, view.assignee]
  );

  const onConflict = useCallback(() => {
    notify(CHANGED_SNACK, 'info');
    if (detail) loadDetail(detail.id, { quiet: true });
    loadList({ quiet: true });
    refreshBadges(true);
  }, [detail, loadDetail, loadList, notify, refreshBadges]);

  const runPatch = useCallback(
    async (body: Record<string, unknown>, success: string): Promise<true | 'closed' | { error: string }> => {
      if (!detail) return 'closed';
      setBusy(true);
      try {
        const res = await patchTicket(detail.id, body);
        afterChange(res.data);
        notify(success);
        return true;
      } catch (e) {
        if (e instanceof TicketApiError && e.conflict) {
          onConflict();
          return 'closed';
        }
        const message = e instanceof Error ? e.message : 'Could not update the ticket';
        if (e instanceof TicketApiError && e.status === 400) return { error: message };
        notify(message, 'error');
        return { error: message };
      } finally {
        setBusy(false);
      }
    },
    [detail, afterChange, notify, onConflict]
  );

  const MOVE_DONE: Record<TicketMove, string> = {
    start: 'Started. It is in progress and yours.',
    assign: 'Assignment saved',
    request_info: 'Question sent. Waiting on the requester.',
    resume: 'Back in progress',
    resolve: 'Resolved. The requester is asked to confirm.',
    close: 'Ticket closed',
    confirm: 'Marked confirmed and closed',
    reopen: 'Ticket reopened',
  };

  const handlers: DetailHandlers = {
    onMove: (move, payload) => runPatch({ action: move, ...(payload || {}) }, MOVE_DONE[move]),
    onField: (field, value) => {
      if (detail && detail[field] === value) return;
      runPatch({ action: field, value }, field === 'priority' ? 'Priority changed' : 'Category changed');
    },
    onAssign: (assignee) => {
      runPatch({ action: 'assign', assignee_id: assignee }, assignee ? 'Assignment saved' : 'Unassigned');
    },
    onSend: async ({ content, internal, then, resolution_code }) => {
      if (!detail) return false;
      setBusy(true);
      try {
        const res = await postTicketMessage(detail.id, { content, internal, then, resolution_code });
        afterChange(res.ticket);
        notify(internal ? 'Internal note added' : then === 'ask' ? 'Sent. Waiting on the requester.' : then === 'resolve' ? 'Sent and resolved' : 'Reply sent');
        return true;
      } catch (e) {
        if (e instanceof TicketApiError && e.conflict) {
          onConflict();
          return false;
        }
        notify(e instanceof Error ? e.message : 'Could not send', 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    onCopyForClaude: async () => {
      if (!detail) return;
      const ok = await copyText(buildSupportTicketMarkdown(detail, { adminUrl: window.location.origin }));
      const shots = (detail.screenshot_urls || []).length;
      notify(
        ok
          ? shots
            ? 'Copied for Claude Code. Paste it, then use Copy images for the screenshots.'
            : 'Copied for Claude Code. Paste it into Claude Code.'
          : 'Could not copy. Your browser blocked the clipboard.',
        ok ? 'success' : 'error'
      );
    },
    onCopyImages: () => {
      if (!detail) return;
      const urls = screenshotUrlsOf(detail);
      if (urls.length === 0) return;
      // Called straight from the click: Safari needs the clipboard write tied to the gesture.
      copyScreenshotsToClipboard(urls, `${detail.ticket_number}-screenshots.png`)
        .then((how) => notify(how === 'clipboard' ? 'Screenshots copied. Paste them into Claude Code.' : 'Your browser cannot copy images, so they were downloaded.'))
        .catch(() => notify('Could not copy the screenshots', 'error'));
    },
    onCopyNumber: async () => {
      if (!detail) return;
      const ok = await copyText(detail.ticket_number);
      notify(ok ? `${detail.ticket_number} copied` : 'Could not copy', ok ? 'success' : 'error');
    },
    onOpenTicket: (ticketNumber) => patchView({ ticket: ticketNumber }),
    onBack: split ? undefined : back,
  };

  // Keyboard shortcuts.
  const selectedIndex = detail ? tickets.findIndex((t) => t.id === detail.id) : -1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (helpOpen || document.querySelector('.MuiDialog-root, .MuiPopover-root')) return;
      const action = shortcutFor(e);
      if (!action) return;
      if (action === 'next' || action === 'prev') {
        const i = stepIndex(selectedIndex, tickets.length, action === 'next' ? 1 : -1);
        if (i < 0 || i === selectedIndex) return;
        e.preventDefault();
        const t = tickets[i];
        select(t);
        document.querySelector(`[data-ticket="${t.id}"]`)?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (action === 'reply' || action === 'note') {
        if (!detail) return;
        e.preventDefault();
        setComposerMode(action === 'reply' ? 'reply' : 'note');
        setTimeout(() => composerRef.current?.focus(), 0);
        return;
      }
      if (action === 'search') {
        e.preventDefault();
        if (!split && view.ticket) back();
        setTimeout(() => searchRef.current?.focus(), 0);
        return;
      }
      if (action === 'back') {
        if (!split && view.ticket) {
          e.preventDefault();
          back();
        }
        return;
      }
      if (action === 'help') {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen, selectedIndex, tickets, detail, select, split, view.ticket, back]);

  const filtered = !!(view.q.trim() || view.assignee || view.source || view.category || view.priority);
  const backHref = `/support-tickets${inboxSearch({ ...view, ticket: null })}`;

  const listPane = (
    <Box
      component="section"
      aria-label="Ticket list"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: split ? '100%' : 'auto',
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <QueueTabs queue={view.queue} counts={counts} onQueue={(queue) => patchView({ queue })} />
      <InboxFilters ref={searchRef} state={view} counts={counts} onChange={patchView} />
      <Box aria-live="polite" sx={{ flex: 1, overflow: split ? 'auto' : 'visible', minHeight: 0 }}>
        <TicketList
          tickets={tickets}
          loading={listLoading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          error={listError}
          queue={view.queue}
          filtered={filtered}
          selectedId={detail?.id ?? null}
          onSelect={select}
          onLoadMore={loadMore}
          onRetry={() => loadList()}
          now={now}
        />
      </Box>
    </Box>
  );

  const detailBody = detailError ? (
    <Box sx={{ p: 2 }}>
      <Alert
        severity="error"
        action={
          <Button color="inherit" onClick={() => view.ticket && loadDetail(view.ticket)} sx={{ minHeight: 44 }}>
            Try again
          </Button>
        }
      >
        {detailError}
      </Alert>
    </Box>
  ) : detail ? (
    <TicketDetail
      ref={composerRef}
      ticket={detail}
      requester={requester}
      staff={staff}
      meId={meId}
      busy={busy}
      composerMode={composerMode}
      onComposerMode={setComposerMode}
      backHref={backHref}
      now={now}
      wide={wide}
      handlers={handlers}
    />
  ) : detailLoading || view.ticket ? (
    <TicketDetailSkeleton />
  ) : (
    <Box sx={{ p: 3 }}>
      <EmptyState
        icon={TouchAppOutlinedIcon}
        title="Pick a ticket"
        body="Choose one from the list, or press J to open the first. Press ? for every shortcut."
      />
    </Box>
  );

  const detailPane = (
    <Box
      ref={detailPaneRef}
      component="section"
      aria-label="Ticket detail"
      sx={{
        minHeight: 0,
        height: split ? '100%' : 'auto',
        overflow: split ? 'auto' : 'visible',
        bgcolor: 'background.default',
        border: 1,
        borderColor: 'divider',
        borderRadius: 3,
        '@media (prefers-reduced-motion: no-preference)': { scrollBehavior: 'smooth' },
      }}
    >
      {detailBody}
    </Box>
  );

  return (
    <Box>
      <OpsPageHeader
        icon={SupportAgentIcon}
        title="Support tickets"
        subtitle={
          counts
            ? `${counts.new} new, ${counts.in_progress} in progress, ${counts.waiting + counts.to_confirm} waiting on requesters${counts.unread ? `, ${counts.unread} with a new reply` : ''}`
            : 'Tickets from the Tools App, Nexus and the website'
        }
        actions={
          <>
            <Tooltip title="Keyboard shortcuts">
              <IconButton onClick={() => setHelpOpen(true)} aria-label="Keyboard shortcuts" aria-keyshortcuts={ARIA_KEYS.help} sx={{ width: 44, height: 44 }}>
                <KeyboardIcon />
              </IconButton>
            </Tooltip>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => {
                loadList();
                if (detail) loadDetail(detail.id, { quiet: true });
              }}
              sx={{ ...TARGET_44, fontWeight: 600 }}
            >
              Refresh
            </Button>
          </>
        }
      />

      {split ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: '380px minmax(0,1fr)', gap: 2, height: 'calc(100vh - 160px)', minHeight: 560 }}>
          {listPane}
          {detailPane}
        </Box>
      ) : view.ticket ? (
        detailPane
      ) : (
        listPane
      )}

      {!split && !view.ticket && tickets.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Tip: J and K move between tickets, R replies. Press ? for all shortcuts.
        </Typography>
      )}

      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      <Snackbar open={!!snack} autoHideDuration={4500} onClose={() => setSnack(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack?.severity ?? 'success'} variant="filled" onClose={() => setSnack(null)} role="status">
          {snack?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
