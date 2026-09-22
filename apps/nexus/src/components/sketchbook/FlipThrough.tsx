'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Box, Button, Chip, Paper, Skeleton, Typography, EmptyState } from '@neram/ui';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import type { SketchbookFeatureFact, SketchbookInboxRow } from '@neram/database/queries/nexus';
import type { SketchbookReaction } from '@neram/database/types';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useNavBadges } from '@/components/NavBadgeProvider';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import type { StageKey } from '@/lib/student-stage';
import { drawingSourceLabel } from '@/lib/drawing-source';
import { flipReviewHref } from '@/lib/review-context';
import { createHeldSends } from '@/lib/held-sends';
import { BOTTOM_NAV_HEIGHT } from '@/lib/shell-chrome';
import { firstName, REACTION_LABEL } from '@/lib/sketchbook-messages';
import { chatTokenGetter, flipSketch, reactToSketch } from './sketchbook-api';
import TeacherSketchActions from './TeacherSketchActions';

const SEEN_AFTER_MS = 1500;
/** How long a reaction waits before it is sent, so Undo can take it back. A Teams chat cannot be unsent. */
export const UNDO_WINDOW_MS = 4000;
/** The beat between the tap and the next card: long enough to see the choice land. */
export const ADVANCE_AFTER_MS = 250;
/** Images fetched ahead of the card on screen, so the next one is already there. */
const PRELOAD_AHEAD = 2;
const KEY_REACTIONS: Record<string, SketchbookReaction> = { '1': 'heart', '2': 'fire', '3': 'wow' };

type Row = SketchbookInboxRow & { featured: SketchbookFeatureFact[] };
interface Inbox { sketches: Row[]; remaining: number }

/** What is waiting to go to one student. `reaction` undefined means a comment on its own. */
interface PendingSend {
  reaction?: SketchbookReaction;
  comment?: string;
  /** Asked for at the tap, so a send that fires later from a timer never has to prompt. */
  token: Promise<string | null>;
  student: string;
  /** The reaction before this tap, restored by Undo. */
  previous: SketchbookReaction | null;
  /** Later copies of the same sheet taken off the stack by this tap, put back by Undo. */
  dropped: string[];
}

type Status =
  | { kind: 'held'; id: string; text: string }
  | { kind: 'error'; id: string; text: string; send: PendingSend }
  | null;

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

const what = (s: PendingSend) => (s.reaction ? REACTION_LABEL[s.reaction] : 'Comment');

/**
 * One sketch per screen, built to be flipped fast.
 *
 * A reaction answers the tap at once: the card moves on after a short beat and
 * the send waits UNDO_WINDOW_MS behind an Undo, because it becomes a Teams chat
 * to the student and a mis-tap must cost nothing. Anything still held goes out
 * when the teacher leaves the screen or hides the tab. It used to wait for the
 * whole Teams delivery chain with every button locked, then ask for Next.
 *
 * Buttons are the contract; arrow keys and 1/2/3 are conveniences. A card on
 * screen for 1.5 s is "seen" (the physical peek); Next without a reaction is
 * "skipped". The server never downgrades seen. The list is frozen once the
 * fresh inbox arrives, so a background refetch cannot shrink it under the
 * teacher's place. Open review takes the card to the one review screen for
 * stars, words and markup.
 */
export default function FlipThrough({ classroomId }: { classroomId: string }) {
  const { getToken, getTeacherToken } = useNexusAuthContext();
  const { refreshBadges } = useNavBadges();
  const { factsFor } = useStudentStageFacts();
  const key = `/api/sketchbook/inbox?classroom=${encodeURIComponent(classroomId)}`;
  // Every mount asks the server (the device cache may hold a list flipped
  // elsewhere), and nothing refetches behind the teacher while they flip.
  const { data, error, isLoading, isValidating, mutate } = useAuthSWR<Inbox>(key, {
    dedupingInterval: 0,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const [deck, setDeck] = useState<{ key: string; rows: Row[]; remaining: number; settled: boolean } | null>(null);
  const [index, setIndex] = useState(0);
  const [local, setLocal] = useState<Record<string, { reaction?: SketchbookReaction | null; featured?: SketchbookFeatureFact[] }>>({});
  const [status, setStatus] = useState<Status>(null);
  // Copies of a sheet already answered in this sitting (the inbox's twin_ids).
  const [dropped, setDropped] = useState<ReadonlySet<string>>(() => new Set());
  const touched = useRef(false);
  const seenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const liveDeck = deck && deck.key === key ? deck : null;
  const rows = useMemo(() => (liveDeck?.rows ?? []).filter((r) => !dropped.has(r.id)), [liveDeck, dropped]);

  // Take the list once the fresh copy is in. A cached copy paints first and is
  // replaced by the fresh one, but only until the teacher starts flipping.
  useEffect(() => {
    if (!data) return;
    setDeck((d) => {
      if (d && d.key === key && (d.settled || touched.current)) return d;
      return { key, rows: data.sketches, remaining: data.remaining || 0, settled: !isValidating };
    });
  }, [data, isValidating, key]);

  const current = rows[index] ?? null;

  const refreshBadgesRef = useRef(refreshBadges);
  refreshBadgesRef.current = refreshBadges;

  const sends = useMemo(
    () =>
      createHeldSends<PendingSend>({
        holdMs: UNDO_WINDOW_MS,
        commit: async (id, s) => {
          await reactToSketch(() => s.token, id, s.reaction, s.comment, { keepalive: true });
        },
        onCommitted: (id) => {
          setStatus((st) => (st && st.kind === 'held' && st.id === id ? null : st));
          refreshBadgesRef.current();
        },
        onError: (id, s) => {
          setStatus({ kind: 'error', id, text: `Could not send ${what(s)} to ${s.student}.`, send: s });
        },
      }),
    [],
  );

  // Held sends go out when the teacher leaves: another screen, a closed tab, a
  // locked phone. Dropping them would be a message the teacher thinks they sent.
  useEffect(() => {
    const flush = () => sends.flush();
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [sends]);

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

  useEffect(() => {
    if (!current) return;
    if (seenTimer.current) clearTimeout(seenTimer.current);
    seenTimer.current = setTimeout(() => { void flipSketch(getToken, current.id, 'seen').catch(() => {}); }, SEEN_AFTER_MS);
    return () => { if (seenTimer.current) clearTimeout(seenTimer.current); };
  }, [current, getToken]);

  // The next images load while the teacher looks at this one.
  useEffect(() => {
    for (let k = 1; k <= PRELOAD_AHEAD; k += 1) {
      const url = rows[index + k]?.original_image_url;
      if (!url || typeof Image === 'undefined') continue;
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    }
  }, [rows, index]);

  /** Move past this sketch after the short beat, unless the teacher already moved. */
  const advancePast = useCallback((id: string) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      setIndex((i) => (rows[i]?.id === id ? i + 1 : i));
    }, ADVANCE_AFTER_MS);
  }, [rows]);

  const hold = useCallback((row: Row, send: Omit<PendingSend, 'token' | 'student' | 'previous' | 'dropped'>) => {
    touched.current = true;
    const previous = (local[row.id]?.reaction ?? row.reaction ?? null) as SketchbookReaction | null;
    const student = firstName(row.student.name) || 'the student';
    // A second photo of this same sheet further down the stack is answered too.
    // Only later ones: taking out a card already passed would shift the teacher's place.
    const here = rows.findIndex((r) => r.id === row.id);
    const twins = (row.twin_ids ?? []).filter((id) => rows.findIndex((r) => r.id === id) > here);
    const pending: PendingSend = { ...send, token: chatTokenGetter(getTeacherToken, getToken)(), student, previous, dropped: twins };
    if (twins.length) setDropped((d) => new Set([...d, ...twins]));
    if (send.reaction) setLocal((m) => ({ ...m, [row.id]: { ...m[row.id], reaction: send.reaction } }));
    sends.hold(row.id, pending);
    setStatus({ kind: 'held', id: row.id, text: `${what(pending)} for ${student}` });
    advancePast(row.id);
  }, [advancePast, getTeacherToken, getToken, local, rows, sends]);

  const react = useCallback((row: Row, reaction: SketchbookReaction, comment?: string) => {
    hold(row, { reaction, comment });
  }, [hold]);

  const undo = useCallback(() => {
    if (!status || status.kind !== 'held') return;
    const send = sends.undo(status.id);
    setStatus(null);
    if (!send) return;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setLocal((m) => ({ ...m, [status.id]: { ...m[status.id], reaction: send.previous } }));
    if (send.dropped.length) setDropped((d) => new Set([...d].filter((id) => !send.dropped.includes(id))));
    const at = rows.findIndex((r) => r.id === status.id);
    if (at >= 0) setIndex(at);
  }, [rows, sends, status]);

  const retry = useCallback(() => {
    if (!status || status.kind !== 'error') return;
    const { id, send } = status;
    setStatus(null);
    sends.sendNow(id, { ...send, token: chatTokenGetter(getTeacherToken, getToken)() });
  }, [getTeacherToken, getToken, sends, status]);

  const next = useCallback(() => {
    if (!current) return;
    touched.current = true;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    const reacted = local[current.id]?.reaction ?? current.reaction;
    if (!reacted && !sends.isHeld(current.id)) {
      void flipSketch(getToken, current.id, 'skipped', { keepalive: true })
        .then(() => refreshBadgesRef.current())
        .catch(() => {});
    }
    setIndex((i) => i + 1);
  }, [current, getToken, local, sends]);

  const previous = useCallback(() => {
    touched.current = true;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const checkAgain = useCallback(async () => {
    touched.current = false;
    setIndex(0);
    setLocal({});
    setDropped(new Set());
    const fresh = await mutate();
    if (fresh) setDeck({ key, rows: fresh.sketches, remaining: fresh.remaining || 0, settled: true });
  }, [key, mutate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); previous(); }
      const reaction = KEY_REACTIONS[e.key];
      if (reaction && current) { e.preventDefault(); react(current, reaction); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, index, next, previous, react]);

  // A rejected fetch also leaves `data` undefined, so without this the skeleton
  // below is what a teacher stares at for ever. fetchWithToken throws on a
  // non-2xx by design, which is the whole reason `error` has to be read here.
  if (error && !data && !liveDeck) {
    return (
      <EmptyState
        title="Could not load the flip through"
        description="Check your connection and try again."
        action={<Button variant="contained" onClick={() => mutate()} sx={{ minHeight: 48 }}>Try again</Button>}
      />
    );
  }
  if (!liveDeck && (isLoading || !data)) {
    return <Skeleton variant="rounded" aria-busy="true" aria-label="Loading sketches" sx={{ height: 'min(70vh, 560px)', borderRadius: 2 }} />;
  }

  const statusBar = status && (
    <Box
      data-testid="flip-status"
      role="status"
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1,
        minHeight: 44, px: 1.5, py: 0.5, mb: 1, borderRadius: 2,
        // Below 900px the card's own buttons sit under the fold and the bottom nav,
        // so the bar floats just above the nav where the thumb already is: Undo is
        // only worth anything if it is on screen in the second after the tap.
        position: { xs: 'fixed', md: 'static' },
        left: { xs: 16, md: 'auto' },
        right: { xs: 16, md: 'auto' },
        bottom: { xs: `calc(${BOTTOM_NAV_HEIGHT + 12}px + env(safe-area-inset-bottom, 0px))`, md: 'auto' },
        zIndex: { xs: 1400, md: 'auto' },
        boxShadow: { xs: 6, md: 0 },
        // Dark text on an opaque light surface in both states: 4.5:1 without a tinted fill.
        border: 1,
        borderColor: status.kind === 'error' ? 'error.main' : 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 600, color: status.kind === 'error' ? 'error.dark' : 'text.primary' }}>
        {status.text}
        {status.kind === 'held' && (
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, fontWeight: 400, color: 'text.secondary' }}> Sending in a moment.</Box>
        )}
      </Typography>
      {status.kind === 'held' ? (
        <Button variant="text" onClick={undo} sx={{ minHeight: 44, flexShrink: 0 }}>Undo</Button>
      ) : (
        <Button variant="outlined" color="error" onClick={retry} sx={{ minHeight: 44, flexShrink: 0 }}>Retry</Button>
      )}
    </Box>
  );

  if (!current) {
    return (
      <Box>
        {statusBar}
        <EmptyState icon={<DoneAllOutlinedIcon />} title="You have flipped through everything."
          description="New sketches appear here as students add them." action={<Button onClick={checkAgain} sx={{ minHeight: 48 }}>Check again</Button>} />
      </Box>
    );
  }

  const fact = factsFor(current.student.id);
  const stage = ((fact?.stage as StageKey) || 'unset') as StageKey;
  const state = local[current.id] || {};
  const total = rows.length + (liveDeck?.remaining || 0);

  return (
    <Paper elevation={0} sx={{ borderRadius: 2, border: 1, borderColor: 'divider', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 'min(70vh, 640px)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
        <StudentStageAvatar stage={stage} dormant={!!fact?.dormant} userId={current.student.id} name={current.student.name} msOid={current.student.ms_oid} fallbackSrc={current.student.avatar_url} size={40} />
        <Box sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>{current.student.name || 'Student'}</Typography>
            <Typography variant="caption" color="text.secondary">{fmt(current.submitted_at)}</Typography>
          </Box>
          {current.source_type !== 'sketchbook' && <Chip size="small" label={drawingSourceLabel(current.source_type)} sx={{ ml: 1, height: 24 }} />}
        </Box>
        <Typography variant="caption" color="text.secondary" aria-live="polite">{index + 1} of {total}</Typography>
      </Box>

      <Box sx={{ flex: 1, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
        <Box component="img" src={current.original_image_url} alt={current.self_note || `Sketch by ${current.student.name || 'student'}`}
          decoding="async"
          sx={{ maxWidth: '100%', maxHeight: 'min(56vh, 520px)', objectFit: 'contain', display: 'block' }} />
      </Box>

      {current.self_note && <Typography variant="body2" sx={{ px: 1.5, pt: 1.5 }}>{current.self_note}</Typography>}

      {/* Sticks above the bottom nav below 900px, as ReviewActionBar does; at bottom 0
          the Previous / Open review / Next row sat underneath the nav on a phone. */}
      <Box sx={{ p: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))', position: 'sticky', bottom: { xs: BOTTOM_NAV_HEIGHT, md: 0 }, bgcolor: 'background.paper' }}>
        <TeacherSketchActions
          key={current.id}
          compact
          sketchId={current.id}
          reaction={(state.reaction as never) ?? current.reaction}
          featured={state.featured ?? current.featured}
          studentName={current.student.name}
          onChanged={(c) => setLocal((m) => ({ ...m, [current.id]: { ...m[current.id], ...c } }))}
          onReact={(r, comment) => react(current, r, comment)}
          onComment={(comment) => hold(current, { comment })}
        />
        {statusBar}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
          <Button variant="text" disabled={index === 0} onClick={previous} sx={{ minHeight: 48, px: 1, whiteSpace: 'nowrap' }}>Previous</Button>
          <Button component={Link} href={flipReviewHref(current.id, classroomId)} variant="outlined" sx={{ minHeight: 48, px: 1.5, whiteSpace: 'nowrap' }}>Open review</Button>
          <Button variant="contained" onClick={next} sx={{ minHeight: 48, minWidth: 88, whiteSpace: 'nowrap' }}>Next</Button>
        </Box>
      </Box>
    </Paper>
  );
}
