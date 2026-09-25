'use client';

/**
 * Question Bank > Tag coverage.
 *
 * A teacher built an "Islamic Architecture" class test and the bank offered
 * nothing, while 131 questions named a mosque or a Mughal ruler: half the bank
 * had no topic tag at all. This screen shows that gap and clears it one
 * question at a time, from keyword suggestions only (no AI cost).
 *
 * JOURNEY
 *   In:   the Question Bank tools ("Tag coverage"), or a deep link
 *         `?tag=<slug>` from the test builder's bank picker, with `?from=` set
 *         to the screen that sent the teacher here.
 *   Back: `?from=` when it is a safe teacher path, else the Question Bank.
 *   Done: a finished topic offers the next topic with work, and Back.
 *
 * QUEUE MECHANICS
 *
 * The server returns suggestions in a stable order (strongest first) and drops
 * a question from the list the moment it is accepted or dismissed. A skipped
 * question stays, ahead of everything not yet seen, so the next page is always
 * fetched at offset = number skipped. Writes are optimistic: the card advances
 * at once, the POST runs behind it, and a failed write puts the question back
 * with a message. Every pending write is awaited before the next page is read.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@neram/ui';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { fetchWithToken, useAuthSWR } from '@/lib/nexus-swr';
import { nextTopicWithWork, safeBackHref, TAG_COVERAGE_HOME } from '@/lib/tag-coverage-view';
import CoverageMeter from './CoverageMeter';
import TopicPicker from './TopicPicker';
import ReviewCard, { ReviewCardSkeleton } from './ReviewCard';
import type { CoverageSummary, CoverageTopic, SuggestionItem, SuggestionsResponse } from './types';

const COVERAGE_URL = '/api/question-bank/tag-coverage';
const SUGGESTIONS_URL = '/api/question-bank/tag-coverage/suggestions';
const PAGE_SIZE = 20;

interface QueueState {
  slug: string;
  items: SuggestionItem[];
  index: number;
  skipped: string[];
  reviewed: number;
  /** The queue length when the topic was opened: the "of N" in the progress line. */
  startTotal: number;
  highRemaining: number;
  loading: boolean;
  exhausted: boolean;
  error: string | null;
}

interface Adjustment {
  tagged: number;
  waiting: number;
}

function emptyQueue(slug: string): QueueState {
  return {
    slug,
    items: [],
    index: 0,
    skipped: [],
    reviewed: 0,
    startTotal: 0,
    highRemaining: 0,
    loading: true,
    exhausted: false,
    error: null,
  };
}

function Kbd({ children }: { children: string }) {
  return (
    <Box
      component="kbd"
      aria-hidden
      sx={{
        display: { xs: 'none', md: 'inline-block' },
        ml: 1,
        px: 0.6,
        minWidth: 20,
        border: 1,
        borderColor: 'currentColor',
        borderRadius: 0.75,
        fontSize: '0.7rem',
        lineHeight: '18px',
        fontFamily: 'inherit',
        opacity: 0.8,
      }}
    >
      {children}
    </Box>
  );
}

export default function TagCoverageWorkspace() {
  const { getToken } = useNexusAuthContext();

  // Read after mount, never in a useState initialiser: the server render has no
  // window, and a first client render that differs from it is hydration error #418.
  const [backHref, setBackHref] = useState(TAG_COVERAGE_HOME);
  const [requestedSlug, setRequestedSlug] = useState<string | null>(null);
  const [urlRead, setUrlRead] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBackHref(safeBackHref(params.get('from')));
    setRequestedSlug(params.get('tag'));
    setUrlRead(true);
  }, []);

  const coverage = useAuthSWR<{ data: CoverageSummary }>(COVERAGE_URL, { revalidateOnFocus: false });
  const summary = coverage.data?.data ?? null;

  // Local moves of the numbers since the summary was last read, so the meter
  // and the topic counts react to every Accept without re-reading the bank.
  const [adjust, setAdjust] = useState<Record<string, Adjustment>>({});
  const [taggedDelta, setTaggedDelta] = useState(0);
  useEffect(() => {
    setAdjust({});
    setTaggedDelta(0);
  }, [coverage.data]);

  const topics: CoverageTopic[] = useMemo(() => {
    if (!summary) return [];
    return summary.topics.map((t) => {
      const a = adjust[t.tag_id];
      if (!a) return t;
      return {
        ...t,
        tagged_count: Math.max(0, t.tagged_count + a.tagged),
        suggestion_count: Math.max(0, t.suggestion_count + a.waiting),
      };
    });
  }, [summary, adjust]);

  const [selected, setSelected] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueState | null>(null);
  const queueRef = useRef<QueueState | null>(null);
  queueRef.current = queue;
  const pending = useRef(new Set<Promise<unknown>>());
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [confirmAll, setConfirmAll] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const topic = topics.find((t) => t.slug === selected) ?? null;
  const current = queue && !queue.loading ? queue.items[queue.index] ?? null : null;

  // ── Picking the first topic ─────────────────────────────────────────────────
  useEffect(() => {
    if (!urlRead || selected || topics.length === 0) return;
    const wanted = requestedSlug ? topics.find((t) => t.slug === requestedSlug) : null;
    const first = wanted ?? topics.find((t) => t.suggestion_count > 0) ?? topics[0];
    setSelected(first.slug);
  }, [urlRead, selected, topics, requestedSlug]);

  // ── Loading a page of the queue ─────────────────────────────────────────────
  const loadPage = useCallback(
    async (slug: string, offset: number, fresh: boolean) => {
      setQueue((q) => (fresh || !q || q.slug !== slug ? emptyQueue(slug) : { ...q, loading: true, error: null }));
      try {
        await Promise.allSettled([...pending.current]);
        const res = await fetchWithToken<SuggestionsResponse>(
          `${SUGGESTIONS_URL}?tag=${encodeURIComponent(slug)}&limit=${PAGE_SIZE}&offset=${offset}`,
          getToken,
        );
        const { items, total, high_confidence_total } = res.data;
        setQueue((q) => {
          if (!q || q.slug !== slug) return q;
          if (fresh) {
            return {
              ...emptyQueue(slug),
              items,
              startTotal: total,
              highRemaining: high_confidence_total,
              loading: false,
              exhausted: items.length === 0,
            };
          }
          return {
            ...q,
            items: [...q.items, ...items],
            highRemaining: high_confidence_total,
            loading: false,
            exhausted: items.length === 0,
          };
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not load suggestions';
        setQueue((q) => (q && q.slug === slug ? { ...q, loading: false, error: message } : q));
      }
    },
    [getToken],
  );

  useEffect(() => {
    if (!selected) return;
    loadPage(selected, 0, true);
    // Keep the address bar shareable: ?tag= follows the topic, ?from= stays.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tag', selected);
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      /* the address bar is a convenience only */
    }
  }, [selected, loadPage]);

  // Ran out of loaded cards: fetch the next page, past the ones skipped.
  useEffect(() => {
    if (!queue || queue.loading || queue.error || queue.exhausted) return;
    if (queue.index < queue.items.length) return;
    loadPage(queue.slug, queue.skipped.length, false);
  }, [queue, loadPage]);

  // Every new card starts with only the topic's own tag switched on. The other
  // matches are one tap away, off by default, because a single loose word
  // ("century") is not enough to tag a question without a person saying so.
  useEffect(() => {
    if (current && topic) setSelectedTags(new Set([topic.tag_id]));
  }, [current?.id, topic?.tag_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A finished topic re-reads the true numbers once the writes have landed.
  const finished = !!queue && !queue.loading && !queue.error && queue.exhausted && queue.index >= queue.items.length;
  useEffect(() => {
    if (!finished) return;
    Promise.allSettled([...pending.current]).then(() => coverage.mutate());
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Writes ──────────────────────────────────────────────────────────────────
  const post = useCallback(
    async (body: unknown) => {
      const token = await getToken();
      const res = await fetch(SUGGESTIONS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || `Could not save (${res.status})`);
      return json as { data: Record<string, number> };
    },
    [getToken],
  );

  const track = useCallback((p: Promise<unknown>) => {
    pending.current.add(p);
    p.finally(() => pending.current.delete(p));
    return p;
  }, []);

  const bump = useCallback((changes: Array<[string, Partial<Adjustment>]>, sign: 1 | -1) => {
    setAdjust((prev) => {
      const next = { ...prev };
      for (const [tagId, c] of changes) {
        const a = next[tagId] ?? { tagged: 0, waiting: 0 };
        next[tagId] = { tagged: a.tagged + sign * (c.tagged ?? 0), waiting: a.waiting + sign * (c.waiting ?? 0) };
      }
      return next;
    });
  }, []);

  /** Advance past the current card; on a failed write, put it back. */
  const decide = useCallback(
    (kind: 'accept' | 'dismiss') => {
      const q = queueRef.current;
      if (!q || !topic) return;
      const item = q.items[q.index];
      if (!item) return;

      const others = [...selectedTags].filter((id) => id !== topic.tag_id);
      const acceptIds = kind === 'accept' ? [...selectedTags] : others;
      const dismissTopic = kind === 'dismiss' || !selectedTags.has(topic.tag_id);
      if (kind === 'accept' && acceptIds.length === 0) return;

      const changes: Array<[string, Partial<Adjustment>]> = [];
      for (const id of acceptIds) {
        const also = item.also_suggested.some((t) => t.tag_id === id);
        changes.push([id, { tagged: 1, waiting: id === topic.tag_id || also ? -1 : 0 }]);
      }
      if (dismissTopic) changes.push([topic.tag_id, { waiting: -1 }]);
      const movesMeter = acceptIds.length > 0 && !item.has_topic_tag;

      setQueue((cur) =>
        cur && cur.slug === q.slug
          ? {
              ...cur,
              index: cur.index + 1,
              reviewed: cur.reviewed + 1,
              highRemaining: Math.max(0, cur.highRemaining - (item.confidence === 'high' ? 1 : 0)),
            }
          : cur,
      );
      bump(changes, 1);
      if (movesMeter) setTaggedDelta((d) => d + 1);

      const writes: Promise<unknown>[] = [];
      if (acceptIds.length > 0) {
        writes.push(post({ action: 'accept', pairs: acceptIds.map((tag_id) => ({ question_id: item.id, tag_id })) }));
      }
      if (dismissTopic) {
        writes.push(post({ action: 'dismiss', pairs: [{ question_id: item.id, tag_id: topic.tag_id }] }));
      }

      track(
        Promise.all(writes).catch((err) => {
          bump(changes, -1);
          if (movesMeter) setTaggedDelta((d) => d - 1);
          setQueue((cur) => {
            if (!cur || cur.slug !== q.slug) return cur;
            const items = [...cur.items];
            items.splice(cur.index, 0, item);
            return {
              ...cur,
              items,
              reviewed: Math.max(0, cur.reviewed - 1),
              highRemaining: cur.highRemaining + (item.confidence === 'high' ? 1 : 0),
            };
          });
          setToast({
            severity: 'error',
            message: `${err instanceof Error ? err.message : 'Could not save'}. The question is back in the queue.`,
          });
        }),
      );
    },
    [topic, selectedTags, post, track, bump],
  );

  const skip = useCallback(() => {
    const q = queueRef.current;
    const item = q?.items[q.index];
    if (!q || !item) return;
    setQueue((cur) =>
      cur && cur.slug === q.slug ? { ...cur, index: cur.index + 1, skipped: [...cur.skipped, item.id] } : cur,
    );
  }, []);

  const reviewSkipped = useCallback(() => {
    if (selected) loadPage(selected, 0, true);
  }, [selected, loadPage]);

  const acceptAllHigh = useCallback(async () => {
    if (!topic) return;
    setBulkBusy(true);
    try {
      await Promise.allSettled([...pending.current]);
      const res = await post({ action: 'accept_all_high', tag_id: topic.tag_id });
      const n = res.data.accepted ?? 0;
      setToast({
        severity: 'success',
        message: n === 1 ? `Tagged 1 question as ${topic.label}.` : `Tagged ${n} questions as ${topic.label}.`,
      });
      setConfirmAll(false);
      await coverage.mutate();
      loadPage(topic.slug, 0, true);
    } catch (err) {
      setToast({ severity: 'error', message: err instanceof Error ? err.message : 'Could not tag them' });
    } finally {
      setBulkBusy(false);
    }
  }, [topic, post, coverage, loadPage]);

  // ── Keyboard: A accept, S skip, N not this topic ────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (confirmAll || !current) return;
      const key = e.key.toLowerCase();
      if (key === 'a') {
        e.preventDefault();
        decide('accept');
      } else if (key === 's') {
        e.preventDefault();
        skip();
      } else if (key === 'n') {
        e.preventDefault();
        decide('dismiss');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, confirmAll, decide, skip]);

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  const next = nextTopicWithWork(topics, selected);
  const skippedCount = queue?.skipped.length ?? 0;
  const progressPct =
    queue && queue.startTotal > 0 ? Math.min(100, Math.round((queue.reviewed / queue.startTotal) * 100)) : 0;
  const topicAccepted = !!topic && selectedTags.has(topic.tag_id);

  return (
    <Box sx={{ px: { xs: 0, md: 1 }, py: 2, maxWidth: 1200, mx: 'auto', minWidth: 0 }}>
      <PageHeader
        title="Tag coverage"
        subtitle="Give untagged questions a topic, so topic filters and tests can find them. Suggestions come from the words in each question."
        // The last crumb names the Back arrow ("Back to Question Bank"), so it is the parent, not this page.
        breadcrumbs={[{ label: 'Question Bank', href: '/teacher/question-bank' }]}
        backHref={backHref}
      />

      {coverage.error && !summary ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => coverage.mutate()} sx={{ minHeight: 44 }}>
              Try again
            </Button>
          }
        >
          {coverage.error.message || 'Could not load tag coverage.'}
        </Alert>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '280px minmax(0, 1fr)' },
            gap: { xs: 2, md: 3 },
            alignItems: 'start',
          }}
        >
          <Box sx={{ display: 'grid', gap: 2, minWidth: 0, position: { md: 'sticky' }, top: { md: 16 } }}>
            <CoverageMeter
              total={summary?.total ?? null}
              tagged={summary ? summary.tagged + taggedDelta : null}
              loading={!summary}
            />
            <TopicPicker topics={topics} selected={selected} loading={!summary} onSelect={setSelected} />
          </Box>

          <Box component="section" aria-labelledby="tag-review-heading" sx={{ minWidth: 0 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              justifyContent="space-between"
              alignItems={{ xs: 'stretch', sm: 'center' }}
              sx={{ mb: 1.5 }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography id="tag-review-heading" variant="h6" component="h2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                  {topic ? topic.label : 'Review'}
                </Typography>
                {queue && queue.startTotal > 0 && (
                  <Typography variant="body2" color="text.secondary" aria-live="polite">
                    {queue.reviewed} of {queue.startTotal} reviewed
                    {skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}
                  </Typography>
                )}
              </Box>
              {topic && queue && queue.highRemaining > 0 && !finished && (
                <Button
                  variant="outlined"
                  startIcon={<DoneAllOutlinedIcon />}
                  onClick={() => setConfirmAll(true)}
                  sx={{ display: { xs: 'none', md: 'inline-flex' }, minHeight: 44, flexShrink: 0 }}
                >
                  Accept all {queue.highRemaining} strong matches
                </Button>
              )}
            </Stack>

            {queue && queue.startTotal > 0 && (
              <LinearProgress
                variant="determinate"
                value={progressPct}
                aria-label={`${progressPct}% of this topic reviewed`}
                sx={{ height: 4, borderRadius: 2, mb: 2 }}
              />
            )}

            {queue?.error ? (
              <Alert
                severity="error"
                action={
                  <Button
                    color="inherit"
                    onClick={() => loadPage(queue.slug, queue.skipped.length, queue.items.length === 0)}
                    sx={{ minHeight: 44 }}
                  >
                    Try again
                  </Button>
                }
              >
                {queue.error}
              </Alert>
            ) : !summary || !queue || (queue.loading && !current) ? (
              <ReviewCardSkeleton />
            ) : current && topic ? (
              <>
                <ReviewCard
                  item={current}
                  topic={{ tag_id: topic.tag_id, label: topic.label }}
                  selectedTagIds={selectedTags}
                  onToggleTag={toggleTag}
                />
                {/* Thumb reach on a phone: fixed above the 64px bottom navigation.
                    Fixed, not sticky: a layout ancestor clips overflow, which
                    turns sticky into static, and the bar then sat below the
                    fold (measured at y=1242 on an 812px screen). Same approach
                    as StickyWizardBar. Inline under the card from md up. */}
                <Box aria-hidden sx={{ display: { xs: 'block', md: 'none' }, height: 88 }} />
                <Paper
                  elevation={0}
                  role="group"
                  aria-label="Decide on this question"
                  sx={{
                    position: { xs: 'fixed', md: 'static' },
                    left: { xs: 8, md: 'auto' },
                    right: { xs: 8, md: 'auto' },
                    bottom: { xs: 'calc(72px + env(safe-area-inset-bottom, 0px))', md: 'auto' },
                    zIndex: (t) => t.zIndex.appBar - 1,
                    boxShadow: { xs: 3, md: 0 },
                    mt: 1.5,
                    p: 1,
                    borderRadius: 2,
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1.3fr 1.3fr',
                    gap: 1,
                  }}
                >
                  <Button variant="text" color="inherit" onClick={skip} sx={{ minHeight: 48 }}>
                    Skip
                    <Kbd>S</Kbd>
                  </Button>
                  <Button variant="outlined" color="inherit" onClick={() => decide('dismiss')} sx={{ minHeight: 48, lineHeight: 1.2 }}>
                    Not this topic
                    <Kbd>N</Kbd>
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => decide('accept')}
                    disabled={selectedTags.size === 0}
                    sx={{ minHeight: 48 }}
                  >
                    {topicAccepted ? 'Accept' : 'Save tags'}
                    <Kbd>A</Kbd>
                  </Button>
                </Paper>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: { xs: 'none', md: 'block' }, mt: 1 }}
                >
                  Keys: A accepts, S skips, N says it is not this topic.
                </Typography>
              </>
            ) : queue.loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }} aria-busy="true">
                <CircularProgress size={28} aria-label="Loading more suggestions" />
              </Box>
            ) : (
              <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, borderRadius: 2, textAlign: 'center' }}>
                <TaskAltOutlinedIcon color="success" sx={{ fontSize: 48, mb: 1 }} aria-hidden />
                <Typography variant="h6" component="p" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {skippedCount > 0
                    ? `You have been through every suggestion for ${topic?.label ?? 'this topic'}`
                    : `Every suggestion for ${topic?.label ?? 'this topic'} is reviewed`}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, maxWidth: 460, mx: 'auto' }}>
                  {skippedCount > 0
                    ? `${skippedCount} skipped ${skippedCount === 1 ? 'question is' : 'questions are'} still waiting. Come back to them now or later.`
                    : 'Nothing left to suggest from the words in these questions. Questions can still be tagged by hand on the Questions page.'}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="center">
                  {skippedCount > 0 && (
                    <Button variant="outlined" onClick={reviewSkipped} sx={{ minHeight: 48 }}>
                      Review the {skippedCount} skipped
                    </Button>
                  )}
                  {next && (
                    <Button
                      variant="contained"
                      endIcon={<ArrowForwardOutlinedIcon />}
                      onClick={() => setSelected(next.slug)}
                      sx={{ minHeight: 48 }}
                    >
                      Next topic: {next.label} ({next.suggestion_count})
                    </Button>
                  )}
                  <Button component={Link} href={backHref} variant="text" sx={{ minHeight: 48 }}>
                    {backHref === TAG_COVERAGE_HOME ? 'Back to Question Bank' : 'Go back'}
                  </Button>
                </Stack>
              </Paper>
            )}
          </Box>
        </Box>
      )}

      <Dialog open={confirmAll} onClose={() => !bulkBusy && setConfirmAll(false)} aria-labelledby="accept-all-title">
        <DialogTitle id="accept-all-title">
          Tag {queue?.highRemaining ?? 0} questions as {topic?.label}?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            These are the questions that mention two or more different words linked to {topic?.label}. The tag is
            added to each one; no existing tag is removed. Questions with only one clue stay in the queue for you to
            check.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setConfirmAll(false)} disabled={bulkBusy} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={acceptAllHigh}
            disabled={bulkBusy}
            startIcon={bulkBusy ? <CircularProgress size={16} color="inherit" /> : <DoneAllOutlinedIcon />}
            sx={{ minHeight: 44 }}
          >
            {bulkBusy ? 'Tagging' : 'Tag them all'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled" sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
