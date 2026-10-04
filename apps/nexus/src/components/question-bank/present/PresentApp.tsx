'use client';

/**
 * Present to class: one question bank question at a time on the shared Teams
 * screen, exactly as students see it, driving the Answer Pad.
 *
 * One button does the next thing: Start (asks it on the pad with its paper
 * number, and starts the timer), Close now (or the timer runs out), Reveal
 * (graded with the bank's answer), Next. Space presses it; Left and Right move
 * between questions without asking; the grid jumps anywhere.
 *
 * The answer never reaches this screen before Reveal: the deck carries none,
 * and the pad's key is read from the bank on the server. Students' names are
 * never shown here either. The Teams console keeps working beside it on the
 * same session.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Skeleton, Snackbar, Stack, Typography } from '@neram/ui';
import FigureViewer from '@/components/question-bank/FigureViewer';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import { PadClientError, padFetch } from '@/lib/pad/client/pad-fetch';
import { browserHost } from '@/lib/pad/client/pad-host';
import { promptTitle } from '@/lib/pad/client/format';
import { secondsLeft as secondsUntil, useServerNow } from '@/lib/pad/client/server-clock';
import type { AnswerType, TeacherSnapshot } from '@/lib/pad/client/types';
import type { DeckItem } from '@/lib/qb-present/deck';
import { usePadSnapshot } from '@/components/answer-pad/usePadSnapshot';
import PresentControlBar from './PresentControlBar';
import PresentStage, { type StageSolution } from './PresentStage';
import QuestionGrid from './QuestionGrid';
import { ConnectPadDialog, KeyPickerDialog, PadChip, type LiveSessionInfo } from './PadControls';
import { gridStatuses, safeBackHref, stageView, type PadLink } from './present-model';

export interface PresentSource {
  paperId: string | null;
  ids: string[] | null;
  startAt: string | null;
  back: string | null;
}

interface Deck {
  title: string;
  items: DeckItem[];
}

const TIMER_KEY = 'neram.present.timer';
const SPREAD_KEY = 'neram.present.spread';
const IDLE_MS = 3_000;
/** Answers are taken for 2 seconds after zero (a tap on its way); close just after. */
const CLOSE_AFTER_ZERO_MS = 2_500;
const FIND_SESSION_MS = 8_000;

function readStored(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : Number(raw);
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Private window: the choice lasts for this visit only.
  }
}

function refusalMessage(err: unknown): string {
  if (err instanceof PadClientError) {
    if (err.offline) return 'No connection. Check the internet and try again.';
    switch (err.code) {
      case 'SESSION_NOT_LIVE':
        return 'That Answer Pad round has ended. Connect the pad again.';
      case 'KEY_REQUIRED':
        return 'Choose the answer first.';
      case 'NOT_LATEST_PROMPT':
        return 'A newer question is already on the pad.';
      default:
        return err.message || 'That did not work. Please try again.';
    }
  }
  return 'That did not work. Please try again.';
}

export default function PresentApp({ source }: { source: PresentSource }) {
  const router = useRouter();
  const { tokenReady, getToken } = useNexusAuthContext();
  const host = useMemo(() => browserHost(getToken), [getToken]);

  // ── The deck ──────────────────────────────────────────────────────────────
  const deckKey = source.paperId
    ? `/api/question-bank/present?paper=${encodeURIComponent(source.paperId)}`
    : source.ids?.length
      ? `/api/question-bank/present?ids=${source.ids.map(encodeURIComponent).join(',')}`
      : null;
  const deckQuery = useAuthSWR<Deck>(tokenReady ? deckKey : null, { revalidateOnFocus: false, revalidateIfStale: false });
  const items = useMemo(() => deckQuery.data?.items ?? [], [deckQuery.data]);

  const [index, setIndex] = useState(0);
  const startedAtRef = useRef(false);
  useEffect(() => {
    if (startedAtRef.current || !items.length) return;
    startedAtRef.current = true;
    const at = source.startAt ? items.findIndex((i) => i.id === source.startAt) : -1;
    if (at > 0) setIndex(at);
  }, [items, source.startAt]);
  const item = items[Math.min(index, Math.max(items.length - 1, 0))] ?? null;

  // The open question stays in the address, so a reload comes back to it.
  useEffect(() => {
    if (!item) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('q') === item.id) return;
    url.searchParams.set('q', item.id);
    window.history.replaceState(window.history.state, '', url.toString());
  }, [item]);

  // ── The pad ───────────────────────────────────────────────────────────────
  const [pad, setPad] = useState<PadLink>({ kind: 'checking' });
  const [padAvailable, setPadAvailable] = useState(true);
  const [showOnly, setShowOnly] = useState(false);

  const findSession = useCallback(async () => {
    try {
      const me = await padFetch<{ role: string; liveSession: { id: string } | null }>(host, '/api/pad/me');
      setPadAvailable(me.role === 'staff');
      if (me.role !== 'staff') setPad({ kind: 'off' });
      else setPad(me.liveSession ? { kind: 'live', sessionId: me.liveSession.id } : { kind: 'none' });
    } catch (err) {
      if (err instanceof PadClientError && err.status === 404) {
        setPadAvailable(false);
        setPad({ kind: 'off' });
      } else setPad((prev) => (prev.kind === 'checking' ? { kind: 'none' } : prev));
    }
  }, [host]);

  useEffect(() => {
    if (tokenReady) void findSession();
  }, [tokenReady, findSession]);

  // Waiting for the teacher to open Neram Pad in the meeting: look again every few seconds.
  useEffect(() => {
    if (pad.kind !== 'none' || showOnly) return;
    const timer = setInterval(() => void findSession(), FIND_SESSION_MS);
    return () => clearInterval(timer);
  }, [pad.kind, showOnly, findSession]);

  const effectivePad: PadLink = showOnly && pad.kind !== 'live' ? { kind: 'off' } : pad;
  const sessionId = effectivePad.kind === 'live' ? effectivePad.sessionId : null;
  const { snapshot, refresh, error: snapshotError } = usePadSnapshot<TeacherSnapshot>({ host, sessionId, role: 'teacher' });

  // The round ended (from the console, or replaced): find whatever is live now.
  useEffect(() => {
    if (snapshot?.session.status === 'ended') {
      setPad({ kind: 'none' });
      void findSession();
    }
  }, [snapshot?.session.status, findSession]);
  useEffect(() => {
    if (snapshotError && (snapshotError.status === 403 || snapshotError.status === 404)) {
      setPad({ kind: 'none' });
      void findSession();
    }
  }, [snapshotError, findSession]);

  const sessionInfo: LiveSessionInfo | null = snapshot
    ? {
        classroomName: snapshot.session.classroom_name,
        roomCode: snapshot.session.room_code,
        roundNo: snapshot.session.round_no ?? null,
        inMeeting: !!snapshot.session.meeting_id,
      }
    : null;

  // ── What the stage shows ──────────────────────────────────────────────────
  const isLast = index >= items.length - 1;
  const view = item ? stageView(item, snapshot, effectivePad, isLast) : null;
  const serverNow = useServerNow(snapshot?.server_time, { active: view?.phase === 'open' });
  const left = view?.closesAt ? secondsUntil(view.closesAt, serverNow) : null;
  const statuses = useMemo(() => gridStatuses(items, snapshot), [items, snapshot]);

  // ── Preferences ───────────────────────────────────────────────────────────
  const [timer, setTimer] = useState(60);
  const [spreadOn, setSpreadOn] = useState(true);
  useEffect(() => {
    setTimer(readStored(TIMER_KEY, 60));
    setSpreadOn(readStored(SPREAD_KEY, 1) === 1);
  }, []);
  const chooseTimer = (seconds: number) => {
    setTimer(seconds);
    writeStored(TIMER_KEY, seconds);
  };
  const toggleSpread = () =>
    setSpreadOn((on) => {
      writeStored(SPREAD_KEY, on ? 0 : 1);
      return !on;
    });

  // ── Overlays ──────────────────────────────────────────────────────────────
  const [gridOpen, setGridOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [keyPickerOpen, setKeyPickerOpen] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);
  const [solutionOn, setSolutionOn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const overlayOpen = gridOpen || connectOpen || keyPickerOpen || !!zoom;

  useEffect(() => setSolutionOn(false), [item?.id]);
  const solutionQuery = useAuthSWR<StageSolution>(
    solutionOn && view?.phase === 'revealed' && item ? `/api/question-bank/present?solution=${item.id}` : null,
    { revalidateOnFocus: false },
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        await action();
      } catch (err) {
        if (err instanceof PadClientError && err.code === 'SESSION_NOT_LIVE') {
          setPad({ kind: 'none' });
          void findSession();
        }
        setToast(refusalMessage(err));
      } finally {
        busyRef.current = false;
        setBusy(false);
        void refresh();
      }
    },
    [refresh, findSession],
  );

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= items.length) return;
      setIndex(next);
    },
    [items.length],
  );

  const start = useCallback(() => {
    if (!item || !sessionId) return;
    void run(() =>
      padFetch(host, '/api/pad/prompts/ask', {
        method: 'POST',
        body: {
          sessionId,
          qbQuestionId: item.id,
          label: item.label,
          timeLimitSec: timer || null,
          closePromptId: view?.otherOpen?.promptId ?? null,
        },
      }),
    );
  }, [item, sessionId, run, host, timer, view?.otherOpen?.promptId]);

  const close = useCallback(
    (promptId: string) => run(() => padFetch(host, `/api/pad/prompts/${promptId}/close`, { method: 'POST' })),
    [run, host],
  );

  const reveal = useCallback(() => {
    if (!view?.promptId) return;
    if (!view.canReveal) {
      setKeyPickerOpen(true);
      return;
    }
    const promptId = view.promptId;
    void run(() => padFetch(host, `/api/pad/prompts/${promptId}/reveal`, { method: 'POST' }));
  }, [view?.promptId, view?.canReveal, run, host]);

  const pickKey = (choice: { keys: string[] } | { ungraded: true }) => {
    if (!view?.promptId) return;
    const promptId = view.promptId;
    void run(async () => {
      await padFetch(host, `/api/pad/prompts/${promptId}/key`, { method: 'POST', body: choice });
      await padFetch(host, `/api/pad/prompts/${promptId}/reveal`, { method: 'POST' });
      setKeyPickerOpen(false);
    });
  };

  const addTime = useCallback(() => {
    if (!view?.promptId) return;
    const promptId = view.promptId;
    void run(() => padFetch(host, `/api/pad/prompts/${promptId}/timer`, { method: 'POST', body: { addSeconds: 15 } }));
  }, [view?.promptId, run, host]);

  const primary = useCallback(() => {
    if (!view) return;
    switch (view.primary) {
      case 'start':
        start();
        break;
      case 'close':
        if (view.promptId) void close(view.promptId);
        break;
      case 'reveal':
        reveal();
        break;
      case 'next':
        goTo(index + 1);
        break;
    }
  }, [view, start, close, reveal, goTo, index]);

  // Time up: close the question just after the grace, once.
  const autoClosedRef = useRef<string | null>(null);
  useEffect(() => {
    if (view?.phase !== 'open' || !view.closesAt || !view.promptId || !view.isCurrentPrompt) return;
    const promptId = view.promptId;
    const due = Date.parse(view.closesAt) + CLOSE_AFTER_ZERO_MS - serverNow;
    if (due > 0 || autoClosedRef.current === `${promptId}:${view.closesAt}`) return;
    autoClosedRef.current = `${promptId}:${view.closesAt}`;
    void close(promptId);
  }, [view?.phase, view?.closesAt, view?.promptId, view?.isCurrentPrompt, serverNow, close]);

  // ── Full screen ───────────────────────────────────────────────────────────
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => setToast('This browser did not allow full screen.'));
  }, []);

  const backHref = safeBackHref(source.back, source.paperId);
  const exit = useCallback(() => {
    if (view?.phase === 'open' && !window.confirm('A question is still open on the pad. Leave anyway? It stays open until you close it from the Teams panel.')) {
      return;
    }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    router.push(backHref);
  }, [view?.phase, router, backHref]);

  // ── The control bar fades when the mouse rests ────────────────────────────
  const [barVisible, setBarVisible] = useState(true);
  const [barHeld, setBarHeld] = useState(false);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useCallback(() => {
    setBarVisible(true);
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => setBarVisible(false), IDLE_MS);
  }, []);
  useEffect(() => {
    wake();
    window.addEventListener('mousemove', wake);
    window.addEventListener('touchstart', wake);
    return () => {
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('touchstart', wake);
      if (idleRef.current) clearTimeout(idleRef.current);
    };
  }, [wake]);

  // ── Keys ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || overlayOpen) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const onControl = !!target?.closest('button, a, [role="button"], [role="menuitem"]');
      wake();
      switch (event.key) {
        case ' ':
        case 'PageDown': // a presentation clicker's "next"
          if (event.key === ' ' && onControl) return; // a keyboard user pressing the focused control
          event.preventDefault();
          primary();
          break;
        case 'ArrowRight':
          event.preventDefault();
          goTo(index + 1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          goTo(index - 1);
          break;
        case 'g':
        case 'G':
          setGridOpen(true);
          break;
        case 's':
        case 'S':
          if (view?.phase === 'revealed') setSolutionOn((on) => !on);
          break;
        case 'd':
        case 'D':
          toggleSpread();
          break;
        case '+':
        case '=':
          if (view?.phase === 'open') addTime();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayOpen, wake, primary, goTo, index, view?.phase, addTime, toggleFullscreen]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (deckQuery.error?.status === 401) {
    return (
      <Centered>
        <Typography sx={{ mb: 2 }}>Sign in with your Neram Microsoft account to present.</Typography>
        <Button
          variant="contained"
          href={`/login?next=${encodeURIComponent(typeof window === 'undefined' ? '/pad/present' : window.location.pathname + window.location.search)}`}
          sx={{ minHeight: 48 }}
        >
          Sign in
        </Button>
      </Centered>
    );
  }
  if (deckQuery.error) {
    return (
      <Centered>
        <Alert severity="error" action={<Button onClick={() => void deckQuery.mutate()}>Try again</Button>}>
          {deckQuery.error.status === 404 ? 'Present to class is not switched on, or this paper was not found.' : deckQuery.error.message}
        </Alert>
        <Button href={backHref} sx={{ mt: 2, minHeight: 44 }}>
          Back to the question bank
        </Button>
      </Centered>
    );
  }
  if (!deckKey) {
    return (
      <Centered>
        <Typography>Open Present to class from a question bank paper or a list of questions.</Typography>
        <Button href={backHref} sx={{ mt: 2, minHeight: 44 }}>
          Back to the question bank
        </Button>
      </Centered>
    );
  }
  if (!deckQuery.data) return <StageSkeleton />;
  if (!item || !view) {
    return (
      <Centered>
        <Typography>No questions to show here yet.</Typography>
        <Button href={backHref} sx={{ mt: 2, minHeight: 44 }}>
          Back to the question bank
        </Button>
      </Centered>
    );
  }

  const prompt = snapshot?.prompt && snapshot.prompt.id === view.promptId ? snapshot.prompt : null;
  const keyType: AnswerType = (prompt?.answer_type ?? (item.plan.type === 'show' ? 'mcq' : item.plan.type)) as AnswerType;
  const position = `${index + 1} of ${items.length}`;

  return (
    <Box sx={{ height: '100dvh', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', bgcolor: 'background.paper', overflow: 'hidden' }}>
      {view.otherOpen ? (
        <Alert
          severity="info"
          sx={{ borderRadius: 0 }}
          action={
            <Button color="inherit" onClick={() => void close(view.otherOpen!.promptId)} sx={{ minHeight: 40 }}>
              Close it
            </Button>
          }
        >
          {promptTitle({ sequence: view.otherOpen.sequence, label: view.otherOpen.label })} is open on the pad. Start closes it and asks this one.
        </Alert>
      ) : (
        <span />
      )}

      <Box sx={{ minHeight: 0, width: '100%', maxWidth: 'min(100vw, calc((100dvh - 72px) * 16 / 9))', mx: 'auto' }}>
        <PresentStage
          title={deckQuery.data.title}
          item={item}
          position={position}
          view={view}
          secondsLeft={left}
          showDistribution={spreadOn}
          solution={solutionOn && view.phase === 'revealed' ? solutionQuery.data ?? { explanation: solutionQuery.isLoading ? 'Loading the solution.' : null, imageUrl: null } : null}
          onZoom={(src, label) => setZoom({ src, label })}
        />
      </Box>

      <PresentControlBar
        visible={barVisible || barHeld || overlayOpen || busy}
        onHoldVisible={setBarHeld}
        phase={view.phase}
        primary={view.primary}
        busy={busy}
        onPrimary={primary}
        canPrev={index > 0}
        canNext={!isLast}
        onPrev={() => goTo(index - 1)}
        onNext={() => goTo(index + 1)}
        position={position}
        onGrid={() => setGridOpen(true)}
        timer={timer}
        onTimer={chooseTimer}
        canAddTime={view.phase === 'open' || (view.phase === 'closed' && view.isCurrentPrompt)}
        onAddTime={addTime}
        canSpread={view.phase === 'closed' || view.phase === 'revealed'}
        spreadOn={spreadOn}
        onSpread={toggleSpread}
        canSolution={view.phase === 'revealed'}
        solutionOn={solutionOn}
        onSolution={() => setSolutionOn((on) => !on)}
        fullscreen={fullscreen}
        onFullscreen={toggleFullscreen}
        onExit={exit}
        padSlot={<PadChip pad={effectivePad} info={sessionInfo} onConnect={() => setConnectOpen(true)} />}
      />

      <QuestionGrid
        open={gridOpen}
        onClose={() => setGridOpen(false)}
        items={items}
        currentIndex={index}
        statuses={statuses}
        onPick={(i) => {
          goTo(i);
          setGridOpen(false);
        }}
      />
      <ConnectPadDialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        host={host}
        pad={effectivePad}
        padAvailable={padAvailable}
        info={sessionInfo}
        onConnected={(id) => {
          setShowOnly(false);
          setPad({ kind: 'live', sessionId: id });
          setConnectOpen(false);
        }}
        onShowOnly={() => {
          setShowOnly(true);
          setConnectOpen(false);
        }}
      />
      <KeyPickerDialog
        open={keyPickerOpen}
        onClose={() => setKeyPickerOpen(false)}
        answerType={keyType}
        optionCount={prompt?.option_count ?? item.plan.optionCount ?? 4}
        busy={busy}
        onPick={pickKey}
      />
      {zoom && <FigureViewer open onClose={() => setZoom(null)} src={zoom.src} label={zoom.label} />}
      <Snackbar
        open={!!toast}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />
    </Box>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ minHeight: '100dvh', p: 3, textAlign: 'center' }}>
      <Box sx={{ maxWidth: 520 }}>{children}</Box>
    </Stack>
  );
}

function StageSkeleton() {
  return (
    <Box aria-busy="true" aria-label="Loading the questions" sx={{ height: '100dvh', p: { xs: 2, md: 4 }, display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 3 }}>
      <Stack spacing={1}>
        <Skeleton width={220} height={20} />
        <Skeleton width={120} height={44} />
      </Stack>
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={90} />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={72} />
          ))}
        </Box>
      </Stack>
      <Skeleton variant="rounded" height={56} />
    </Box>
  );
}
