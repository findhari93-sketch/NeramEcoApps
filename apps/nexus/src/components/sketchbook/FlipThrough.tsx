'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Chip, Paper, Skeleton, Typography, EmptyState } from '@neram/ui';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import type { SketchbookFeatureFact, SketchbookInboxRow } from '@neram/database/queries/nexus';
import type { DrawingGrade, SketchbookReaction } from '@neram/database/types';
import { DRAWING_GRADE_LABEL, evaluationStatus } from '@neram/database/drawing-grade';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useNavBadges } from '@/components/NavBadgeProvider';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import DrawingLevelControl from '@/components/students/DrawingLevelControl';
import type { StageKey } from '@/lib/student-stage';
import { drawingSourceLabel } from '@/lib/drawing-source';
import { flipReviewHref } from '@/lib/review-context';
import { createHeldSends } from '@/lib/held-sends';
import { BOTTOM_NAV_HEIGHT } from '@/lib/shell-chrome';
import { firstName, REACTION_LABEL } from '@/lib/sketchbook-messages';
import { chatTokenGetter, flipSketch, saveEvaluation } from './sketchbook-api';
import TeacherSketchActions, { DockTool } from './TeacherSketchActions';

const SEEN_AFTER_MS = 1500;
/** How long a save waits after the teacher moves on, so Undo can take it back. A Teams chat cannot be unsent. */
export const UNDO_WINDOW_MS = 4000;
/** The save route's comment cap. */
const COMMENT_MAX = 300;
/** Images fetched ahead of the card on screen, so the next one is already there. */
const PRELOAD_AHEAD = 2;
const KEY_REACTIONS: Record<string, SketchbookReaction> = { '1': 'heart', '2': 'fire', '3': 'wow' };
/** How far a finger must travel sideways on the sketch to flip it. */
export const SWIPE_MIN_PX = 56;

type Row = SketchbookInboxRow & { featured: SketchbookFeatureFact[] };
interface Inbox { sketches: Row[]; remaining: number }

/** What the teacher has chosen on a card and not yet sent. `undefined` means untouched. */
interface Draft {
  grade?: DrawingGrade | null;
  reaction?: SketchbookReaction | null;
  comments: string[];
}

interface Change {
  grade?: DrawingGrade | null;
  reaction?: SketchbookReaction | null;
  comment?: string;
}

/** One save waiting to go to one student. */
interface PendingSend {
  change: Change;
  /** The comment lines in `change.comment`, so Undo can put them back on the card. */
  comments: string[];
  /** Asked for when the teacher moved on, so a send that fires later from a timer never has to prompt. */
  token: Promise<string | null>;
  student: string;
  /** What the drawing held before this save, restored by Undo. */
  previous: { grade: DrawingGrade | null; reaction: SketchbookReaction | null };
  /** Later copies of the same sheet taken off the stack by this save, put back by Undo. */
  dropped: string[];
}

type Status =
  | { kind: 'held'; id: string; text: string }
  | { kind: 'error'; id: string; text: string; send: PendingSend }
  | null;

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

const listed = (parts: string[]) =>
  parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/** "Mid, Wow and comment" */
export function describeChange(c: Change): string {
  const parts: string[] = [];
  if (c.grade !== undefined) parts.push(c.grade ? DRAWING_GRADE_LABEL[c.grade] : 'grade removed');
  if (c.reaction !== undefined) parts.push(c.reaction ? REACTION_LABEL[c.reaction] : 'reaction removed');
  if (c.comment) parts.push('comment');
  return listed(parts);
}

const isEmpty = (c: Change) => c.grade === undefined && c.reaction === undefined && !c.comment;

/**
 * One sketch per screen, built to be flipped fast.
 *
 * Nothing leaves the device on a tap. The grade, the reaction and any comment
 * build a draft for the card, and the teacher can change their mind freely.
 * Moving off the card (Next, Previous, a swipe either way) saves the draft as
 * ONE request and one message to the student, held UNDO_WINDOW_MS behind an
 * Undo, because it becomes a Teams chat and a mis-swipe must cost nothing.
 * Anything still held, and the draft on screen, goes out when the teacher
 * leaves the screen or hides the tab.
 *
 * A drawing is evaluated once it has a grade and a reaction; the status chip on
 * the card says which is still missing. A half done drawing stays in the list
 * (listUnflipped) until someone finishes it.
 *
 * Buttons are the contract; arrow keys and 1/2/3 are conveniences. A card on
 * screen for 1.5 s is "seen" (the physical peek); Next with nothing given is
 * "skipped". The list is frozen once the fresh inbox arrives, so a background
 * refetch cannot shrink it under the teacher's place. Open review takes the
 * card to the one review screen for words and markup.
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
  // What this sitting has saved on a drawing (optimistically), over what the inbox said.
  const [local, setLocal] = useState<Record<string, {
    reaction?: SketchbookReaction | null; grade?: DrawingGrade | null; featured?: SketchbookFeatureFact[]; comments?: string[];
  }>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [status, setStatus] = useState<Status>(null);
  // Copies of a sheet already evaluated in this sitting (the inbox's twin_ids).
  const [dropped, setDropped] = useState<ReadonlySet<string>>(() => new Set());
  const touched = useRef(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const seenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          await saveEvaluation(() => s.token, id, s.change, { keepalive: true });
        },
        onCommitted: (id) => {
          setStatus((st) => (st && st.kind === 'held' && st.id === id ? null : st));
          refreshBadgesRef.current();
        },
        onError: (id, s) => {
          setStatus({ kind: 'error', id, text: `Could not send to ${s.student}.`, send: s });
        },
      }),
    [],
  );

  /** What the drawing holds now: saved in this sitting, else what the inbox said. */
  const savedOf = useCallback((row: Row) => {
    const l = local[row.id];
    return {
      reaction: (l?.reaction !== undefined ? l.reaction : row.reaction ?? null) as SketchbookReaction | null,
      grade: (l?.grade !== undefined ? l.grade : row.drawing_grade ?? null) as DrawingGrade | null,
    };
  }, [local]);

  /**
   * Save the card's draft as one held send, if it changes anything. Returns
   * whether something was sent. A save still held for this drawing (the teacher
   * came back inside the Undo window) is folded in, so it stays one message.
   */
  const commit = useCallback((row: Row): boolean => {
    const draft = drafts[row.id];
    if (!draft) return false;
    setDrafts((d) => { const { [row.id]: _gone, ...rest } = d; return rest; });
    const saved = savedOf(row);
    const change: Change = {};
    if (draft.grade !== undefined && draft.grade !== saved.grade) change.grade = draft.grade;
    if (draft.reaction !== undefined && draft.reaction !== saved.reaction) change.reaction = draft.reaction;
    const before = sends.peek(row.id);
    const comments = [...(before?.comments ?? []), ...draft.comments];
    const merged: Change = { ...before?.change, ...change };
    delete merged.comment;
    const comment = comments.join('\n').slice(0, COMMENT_MAX);
    if (comment) merged.comment = comment;
    if (isEmpty(change) && draft.comments.length === 0) return false;

    touched.current = true;
    const after = { reaction: merged.reaction !== undefined ? merged.reaction : saved.reaction, grade: merged.grade !== undefined ? merged.grade : saved.grade };
    const student = firstName(row.student.name) || 'the student';
    // Once evaluated, a second photo of this same sheet further down the stack
    // is answered too. Only later ones: taking out a card already passed would
    // shift the teacher's place.
    const here = rows.findIndex((r) => r.id === row.id);
    const twins = after.reaction && after.grade
      ? (row.twin_ids ?? []).filter((id) => rows.findIndex((r) => r.id === id) > here)
      : [];
    const pending: PendingSend = {
      change: merged,
      comments,
      token: chatTokenGetter(getTeacherToken, getToken)(),
      student,
      previous: before ? before.previous : saved,
      dropped: [...(before?.dropped ?? []), ...twins],
    };
    if (twins.length) setDropped((d) => new Set([...d, ...twins]));
    setLocal((m) => {
      const cur = m[row.id] ?? {};
      return { ...m, [row.id]: { ...cur, reaction: after.reaction, grade: after.grade, comments: [...(cur.comments ?? []), ...draft.comments] } };
    });
    sends.hold(row.id, pending);
    setStatus({ kind: 'held', id: row.id, text: `Sending to ${student}: ${describeChange(merged)}` });
    return true;
  }, [drafts, getTeacherToken, getToken, rows, savedOf, sends]);

  // Held sends, and the draft on screen, go out when the teacher leaves: another
  // screen, a closed tab, a locked phone. Dropping them would be a message the
  // teacher thinks they sent. Refs, so the listeners never go stale.
  const leaveRef = useRef(() => {});
  leaveRef.current = () => {
    if (current) commit(current);
    sends.flush();
  };
  useEffect(() => {
    const flush = () => leaveRef.current();
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [sends]);

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

  const editDraft = useCallback((row: Row, edit: (d: Draft) => Draft) => {
    touched.current = true;
    setDrafts((m) => ({ ...m, [row.id]: edit(m[row.id] ?? { comments: [] }) }));
  }, []);

  const setGrade = useCallback((row: Row, grade: DrawingGrade | null) => editDraft(row, (d) => ({ ...d, grade })), [editDraft]);
  const setReaction = useCallback((row: Row, reaction: SketchbookReaction | null, comment?: string) =>
    editDraft(row, (d) => ({ ...d, reaction, comments: comment ? [...d.comments, comment] : d.comments })), [editDraft]);
  const addComment = useCallback((row: Row, comment: string) => editDraft(row, (d) => ({ ...d, comments: [...d.comments, comment] })), [editDraft]);

  const undo = useCallback(() => {
    if (!status || status.kind !== 'held') return;
    const id = status.id;
    const send = sends.undo(id);
    setStatus(null);
    if (!send) return;
    // Back to the card as it was just before the swipe: the choices still made, nothing sent.
    setLocal((m) => {
      const cur = m[id] ?? {};
      const comments = [...(cur.comments ?? [])];
      for (const c of send.comments) { const at = comments.lastIndexOf(c); if (at >= 0) comments.splice(at, 1); }
      return { ...m, [id]: { ...cur, reaction: send.previous.reaction, grade: send.previous.grade, comments } };
    });
    setDrafts((m) => ({
      ...m,
      [id]: {
        ...(send.change.grade !== undefined ? { grade: send.change.grade } : {}),
        ...(send.change.reaction !== undefined ? { reaction: send.change.reaction } : {}),
        comments: send.comments,
      },
    }));
    if (send.dropped.length) setDropped((d) => new Set([...d].filter((x) => !send.dropped.includes(x))));
    const at = rows.findIndex((r) => r.id === id);
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
    const sent = commit(current);
    const saved = savedOf(current);
    // Passed with nothing given: a skip, for this teacher only.
    if (!sent && !saved.reaction && !saved.grade && !sends.isHeld(current.id)) {
      void flipSketch(getToken, current.id, 'skipped', { keepalive: true })
        .then(() => refreshBadgesRef.current())
        .catch(() => {});
    }
    setIndex((i) => i + 1);
  }, [commit, current, getToken, savedOf, sends]);

  const previous = useCallback(() => {
    touched.current = true;
    if (current) commit(current);
    setIndex((i) => Math.max(0, i - 1));
  }, [commit, current]);

  const checkAgain = useCallback(async () => {
    touched.current = false;
    setIndex(0);
    setLocal({});
    setDrafts({});
    setDropped(new Set());
    const fresh = await mutate();
    if (fresh) setDeck({ key, rows: fresh.sketches, remaining: fresh.remaining || 0, settled: true });
  }, [key, mutate]);

  const shownReaction = current
    ? (drafts[current.id]?.reaction !== undefined ? drafts[current.id].reaction! : savedOf(current).reaction)
    : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); previous(); }
      const reaction = KEY_REACTIONS[e.key];
      if (reaction && current) { e.preventDefault(); setReaction(current, shownReaction === reaction ? null : reaction); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, index, next, previous, setReaction, shownReaction]);

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

  // Undo is only worth anything if it is on screen in the second after the
  // swipe, so below 900px the bar floats where the thumb already is. On the
  // card it rides on top of the sticky dock (over the bottom edge of the
  // sketch), so it can never cover Previous or Next. With no card left it
  // floats above the nav, where the dock would have been.
  const statusBar = (anchor: 'dock' | 'screen') => status && (
    <Box
      data-testid="flip-status"
      role="status"
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1,
        minHeight: 44, px: 1.5, py: 0.5, borderRadius: 2,
        mb: 1,
        position: { xs: anchor === 'dock' ? 'absolute' : 'fixed', md: 'static' },
        left: { xs: anchor === 'dock' ? 12 : 16, md: 'auto' },
        right: { xs: anchor === 'dock' ? 12 : 16, md: 'auto' },
        bottom: {
          xs: anchor === 'dock' ? '100%' : `calc(${BOTTOM_NAV_HEIGHT + 12}px + env(safe-area-inset-bottom, 0px))`,
          md: 'auto',
        },
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
        {statusBar('screen')}
        <EmptyState icon={<DoneAllOutlinedIcon />} title="You have flipped through everything."
          description="New sketches appear here as students add them." action={<Button onClick={checkAgain} sx={{ minHeight: 48 }}>Check again</Button>} />
      </Box>
    );
  }

  const fact = factsFor(current.student.id);
  const stage = ((fact?.stage as StageKey) || 'unset') as StageKey;
  const state = local[current.id] || {};
  const draft = drafts[current.id];
  const saved = savedOf(current);
  const shownGrade = draft?.grade !== undefined ? draft.grade : saved.grade;
  const total = rows.length + (liveDeck?.remaining || 0);
  const sentComments = state.comments ?? [];
  const draftComments = draft?.comments ?? [];
  const comments = [...sentComments, ...draftComments];
  const evaluation = evaluationStatus({ reaction: shownReaction, drawing_grade: shownGrade });
  // Always on the card, so the first tap never pushes the sketch down.
  const statusChip = {
    not_started: 'Not evaluated',
    evaluated: 'Evaluated',
    needs_grade: 'Needs grade',
    needs_reaction: 'Needs reaction',
  }[evaluation];

  // Swipe on the sketch flips it, like any photo viewer: left for Next, right
  // for Previous. Either way the card's draft is saved. The buttons stay the
  // contract; this only saves a reach. Mostly-vertical moves are left alone so
  // the page still scrolls.
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!swipeStart.current || !t) return;
    const dx = t.clientX - swipeStart.current.x;
    const dy = t.clientY - swipeStart.current.y;
    setDrag(Math.abs(dx) > Math.abs(dy) ? dx : 0);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = swipeStart.current;
    const t = e.changedTouches[0];
    swipeStart.current = null;
    setDrag(0);
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) next();
    else if (index > 0) previous();
  };

  return (
    <Paper elevation={0} sx={{ borderRadius: 2, border: 1, borderColor: 'divider', overflow: 'clip', display: 'flex', flexDirection: 'column', minHeight: 'min(70vh, 640px)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
        <StudentStageAvatar stage={stage} dormant={!!fact?.dormant} userId={current.student.id} name={current.student.name} msOid={current.student.ms_oid} fallbackSrc={current.student.avatar_url} size={40} />
        <Box sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>{current.student.name || 'Student'}</Typography>
            <Typography variant="caption" color="text.secondary">{fmt(current.submitted_at)}</Typography>
            {/* The student's overall level (the standard this sheet is judged
                against; managers change it here), then where THIS drawing stands. */}
            <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
              <DrawingLevelControl studentId={current.student.id} studentName={current.student.name} source="flip" />
              <Chip
                data-testid="flip-evaluation"
                size="small"
                variant="outlined"
                label={statusChip}
                icon={evaluation === 'evaluated'
                  ? <CheckCircleRoundedIcon sx={{ color: 'success.main' }} />
                  : <RadioButtonUncheckedRoundedIcon sx={{ color: evaluation === 'not_started' ? 'text.secondary' : 'warning.main' }} />}
                sx={{ height: 28, fontWeight: 600, color: 'text.primary' }}
              />
            </Box>
          </Box>
          {current.source_type !== 'sketchbook' && <Chip size="small" label={drawingSourceLabel(current.source_type)} sx={{ ml: 1, height: 24 }} />}
        </Box>
        <Typography variant="caption" color="text.secondary" aria-live="polite">{index + 1} of {total}</Typography>
      </Box>

      <Box
        data-testid="flip-sketch"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => { swipeStart.current = null; setDrag(0); }}
        sx={{
          flex: 1, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 280, overflow: 'hidden',
          // Vertical scroll and pinch stay the browser's; sideways is the flip.
          touchAction: 'pan-y pinch-zoom',
        }}
      >
        <Box component="img" src={current.original_image_url} alt={current.self_note || `Sketch by ${current.student.name || 'student'}`}
          decoding="async"
          draggable={false}
          sx={{
            maxWidth: '100%', objectFit: 'contain', display: 'block', userSelect: 'none',
            // On a phone the sketch takes what the card header, the dock (grade,
            // reactions, tools) and the app chrome leave, so the whole card fits
            // once the page is scrolled to it.
            maxHeight: { xs: 'max(260px, calc(100dvh - 400px))', md: 'min(56vh, 520px)' },
            // Follows the finger at half speed so a swipe feels held, not thrown.
            transform: drag ? `translateX(${drag / 2}px)` : 'none',
            transition: drag ? 'none' : 'transform 180ms ease-out',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }} />
      </Box>

      {current.self_note && <Typography variant="body2" sx={{ px: 1.5, pt: 1.5 }}>{current.self_note}</Typography>}

      {/* What the teacher wrote stays on the card under the sketch. */}
      {comments.length > 0 && (
        <Box data-testid="flip-comments" sx={{ px: 1.5, pt: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
            <ChatBubbleOutlineOutlinedIcon aria-hidden sx={{ fontSize: 20, color: 'text.secondary', mt: 0.25 }} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
                {comments.length > 1 ? 'Your comments' : 'Your comment'}
              </Typography>
              {comments.map((c, i) => (
                <Typography key={i} variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mt: i ? 0.5 : 0 }}>{c}</Typography>
              ))}
              {draftComments.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Sent with the grade and reaction when you move on.
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* The dock: grade, reactions, then one row of labelled tools. Below
          900px it sits in the flow at the foot of the card: the teacher shell's
          <main> is its own (never scrolling) scroll box, so sticky there could
          only slide the dock up over the comment above it. Relative, so the
          Undo bar can still ride on top of it. */}
      <Box sx={{
        position: { xs: 'relative', md: 'sticky' }, bottom: { xs: 'auto', md: 0 }, zIndex: 2,
        px: 1.5, pt: 1.25, pb: 'calc(10px + env(safe-area-inset-bottom))',
        bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider',
      }}>
        {statusBar('dock')}
        <TeacherSketchActions
          key={current.id}
          compact
          sketchId={current.id}
          grade={shownGrade}
          onGrade={(g) => setGrade(current, g)}
          reaction={shownReaction}
          featured={state.featured ?? current.featured}
          studentName={current.student.name}
          onChanged={(c) => setLocal((m) => ({ ...m, [current.id]: { ...m[current.id], ...c } }))}
          onReact={(r, comment) => setReaction(current, r, comment)}
          onComment={(comment) => addComment(current, comment)}
          dock={{
            before: <DockTool icon={<ChevronLeftRoundedIcon />} label="Previous" disabled={index === 0} onClick={previous} />,
            after: (
              <>
                <DockTool icon={<RateReviewOutlinedIcon />} label="Review" ariaLabel="Open review" href={flipReviewHref(current.id, classroomId)} />
                <DockTool icon={<ChevronRightRoundedIcon />} label="Next" emphasis onClick={next} />
              </>
            ),
          }}
        />
      </Box>
    </Paper>
  );
}
