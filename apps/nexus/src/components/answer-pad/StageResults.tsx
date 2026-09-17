'use client';

/**
 * The Answer Pad on the meeting screen, when the teacher shares it: the class's
 * results for the current question, large enough to read across a room and on
 * a phone's meeting screen.
 *
 * Everyone in the meeting loads this on their own device with their own Teams
 * sign-in, and every one of them sees the same class-level numbers
 * (lib/pad/stage.ts): no names, and no breakdown of answers before the reveal.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Stack, Typography, alpha, useTheme } from '@neram/ui';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import { displayAnswer, displayKeys } from '@/lib/pad/client/format';
import { padFetch } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import { nextPollDelay, type RealtimeState } from '@/lib/pad/client/poll-policy';
import { loadRealtimeClient } from '@/lib/pad/client/realtime-client';
import type { StageView } from '@/lib/pad/stage';
import LiveAnnouncement from './LiveAnnouncement';

/** The server holds one reading for two seconds, so a second fetch after a hint picks up a change the first missed. */
const SETTLE_MS = 2_500;
/** While nothing is running in the meeting, look again now and then. */
const IDLE_POLL_MS = 15_000;

export type StageState = { kind: 'loading' } | { kind: 'ready'; stage: StageView | null } | { kind: 'problem' };

export function useStageView(host: PadHost): StageState {
  const meetingId = host.meeting?.meetingId ?? null;
  const [state, setState] = useState<StageState>({ kind: 'loading' });
  const [realtime, setRealtime] = useState<RealtimeState>('connecting');
  const [tick, setTick] = useState(0);
  const latestRequest = useRef(0);
  const failures = useRef(0);

  const refresh = useCallback(async () => {
    if (!meetingId) return;
    const request = ++latestRequest.current;
    try {
      const data = await padFetch<{ stage: StageView | null }>(host, `/api/pad/stage?meetingId=${encodeURIComponent(meetingId)}`);
      if (request !== latestRequest.current) return;
      failures.current = 0;
      setState({ kind: 'ready', stage: data.stage });
    } catch {
      if (request !== latestRequest.current) return;
      failures.current += 1;
      // Keep showing the last results through a dropped connection.
      setState((current) => (current.kind === 'ready' ? current : { kind: 'problem' }));
    } finally {
      setTick((value) => value + 1);
    }
  }, [host, meetingId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const again = () => {
      if (document.visibilityState !== 'hidden') void refresh();
    };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('online', again);
    const stopResume = host.onResume(again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('online', again);
      stopResume();
    };
  }, [host, refresh]);

  const stage = state.kind === 'ready' ? state.stage : null;
  const topic = stage?.session.hint_topic ?? null;

  useEffect(() => {
    if (!topic) return;
    let active = true;
    let unsubscribe: (() => void) | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    loadRealtimeClient()
      .then((client) => {
        if (!active) return;
        const channel = client
          .channel(topic)
          .on('broadcast', { event: 'hint' }, () => {
            if (!active) return;
            void refresh();
            const timer = setTimeout(() => {
              timers.delete(timer);
              if (active) void refresh();
            }, SETTLE_MS);
            timers.add(timer);
          })
          .subscribe((status) => {
            if (!active) return;
            if (status === 'SUBSCRIBED') setRealtime('subscribed');
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtime('unavailable');
          });
        unsubscribe = () => void client.removeChannel(channel);
      })
      .catch(() => {
        if (active) setRealtime('unavailable');
      });

    return () => {
      active = false;
      timers.forEach(clearTimeout);
      unsubscribe?.();
    };
  }, [topic, refresh]);

  useEffect(() => {
    if (!meetingId) return;
    const hidden = document.visibilityState === 'hidden';
    const delay = stage
      ? nextPollDelay({
          role: 'student',
          realtime,
          sessionStatus: stage.session.status,
          promptState: stage.prompt?.state ?? null,
          hidden,
          failures: failures.current,
        })
      : IDLE_POLL_MS;
    if (delay === null) return;
    const timer = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(timer);
  }, [meetingId, stage, realtime, tick, refresh]);

  return state;
}

/** What a screen reader says when the shared screen changes. The live count is not announced. */
export function stageAnnouncement(stage: StageView | null): string {
  if (!stage) return 'The Answer Pad is not running in this meeting.';
  const prompt = stage.prompt;
  if (!prompt) return 'Waiting for the first question.';
  if (prompt.reveal) return prompt.reveal.ungraded ? `Question ${prompt.sequence} poll results.` : `Question ${prompt.sequence} answer revealed.`;
  return prompt.state === 'open' ? `Question ${prompt.sequence} is open.` : `Question ${prompt.sequence} closed.`;
}

const HEADING = { fontSize: 'clamp(1.25rem, 3.5vw, 2rem)', fontWeight: 800, lineHeight: 1.2 } as const;
const BIG = { fontSize: 'clamp(2.25rem, 8vw, 4.5rem)', fontWeight: 800, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' } as const;
const BODY = { fontSize: 'clamp(1rem, 2.4vw, 1.4rem)' } as const;

function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Stack spacing={1.5} alignItems="center" justifyContent="center" sx={{ minHeight: '60vh', textAlign: 'center', px: 2 }}>
      <Typography component="h1" sx={HEADING}>
        {title}
      </Typography>
      {children && (
        <Typography color="text.secondary" sx={BODY}>
          {children}
        </Typography>
      )}
    </Stack>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Stack role="group" aria-label={`${label}: ${value}`} spacing={0.25} sx={{ flex: 1, minWidth: 0, p: { xs: 1.25, sm: 2 }, borderRadius: 2, border: '1px solid', borderColor: 'divider', borderLeft: `6px solid ${color}` }}>
      <Typography sx={BODY}>{label}</Typography>
      <Typography sx={{ ...BIG, fontSize: 'clamp(2rem, 6vw, 3.5rem)' }}>{value}</Typography>
    </Stack>
  );
}

function StageBody({ stage }: { stage: StageView }) {
  const theme = useTheme();
  const { prompt } = stage;

  if (!prompt) {
    return <Notice title={stage.session.classroom_name ?? 'Answer Pad'}>Waiting for the first question.</Notice>;
  }

  if (!prompt.reveal) {
    const share = prompt.enrolled > 0 ? Math.min(prompt.answered / prompt.enrolled, 1) : 0;
    return (
      <Stack spacing={{ xs: 1.5, sm: 2.5 }}>
        <Typography component="h1" sx={HEADING}>
          {prompt.state === 'open' ? `Question ${prompt.sequence} is open` : `Question ${prompt.sequence} closed`}
        </Typography>
        <Stack direction="row" alignItems="baseline" spacing={1.5} flexWrap="wrap" useFlexGap>
          <Typography sx={BIG}>{`${prompt.answered} of ${prompt.enrolled}`}</Typography>
          <Typography sx={BODY}>answered</Typography>
        </Stack>
        <Box sx={{ height: 16, borderRadius: 8, bgcolor: alpha(theme.palette.text.primary, 0.12) }} aria-hidden>
          <Box sx={{ width: `${share * 100}%`, height: '100%', borderRadius: 8, bgcolor: theme.palette.primary.main }} />
        </Box>
        <Typography color="text.secondary" sx={BODY}>
          {prompt.state === 'open' ? 'Answer on your Answer Pad.' : 'The answer is coming up.'}
        </Typography>
      </Stack>
    );
  }

  const { reveal } = prompt;
  const correct = new Set(reveal.correct_keys);
  const max = Math.max(1, ...reveal.distribution.map((row) => row.count));

  return (
    <Box sx={{ display: 'grid', gap: { xs: 2, sm: 4 }, gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) minmax(0, 1.3fr)' }, alignItems: 'start' }}>
      <Stack spacing={{ xs: 1.5, sm: 2 }}>
        <Typography component="h1" sx={HEADING}>
          {reveal.ungraded ? `Question ${prompt.sequence} poll results` : `Question ${prompt.sequence}`}
        </Typography>
        {reveal.ungraded ? (
          <Typography sx={BODY}>{`${prompt.answered} of ${prompt.enrolled} answered. Not graded.`}</Typography>
        ) : (
          <>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CheckCircleRounded sx={{ color: theme.palette.success.main, fontSize: 'clamp(2rem, 6vw, 3.5rem)' }} aria-hidden />
              <Typography sx={BIG}>{`Answer: ${displayKeys(prompt.answer_type, reveal.correct_keys)}`}</Typography>
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <Stat label="Correct" value={reveal.correct} color={theme.palette.success.main} />
              <Stat label="Incorrect" value={reveal.incorrect} color={theme.palette.error.main} />
            </Stack>
          </>
        )}
      </Stack>

      {reveal.distribution.length > 0 && (
        <Stack spacing={{ xs: 0.75, sm: 1.25 }} role="list" aria-label="How the class answered">
          {reveal.distribution.map((row) => {
            const label = displayAnswer(prompt.answer_type, row.value);
            const isKey = correct.has(row.value);
            const color = isKey ? theme.palette.success.main : theme.palette.primary.main;
            return (
              <Stack
                key={row.value}
                role="listitem"
                aria-label={`${label}: ${row.count}${isKey ? ', correct' : ''}`}
                direction="row"
                spacing={1.5}
                alignItems="center"
              >
                <Typography sx={{ ...BODY, width: '4.5ch', flexShrink: 0, fontWeight: 800, overflowWrap: 'anywhere' }}>{label}</Typography>
                <Box sx={{ flex: 1, height: { xs: 20, sm: 28 }, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.1) }} aria-hidden>
                  <Box sx={{ width: `${(row.count / max) * 100}%`, height: '100%', borderRadius: 2, bgcolor: isKey ? color : alpha(color, 0.75) }} />
                </Box>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ width: '5ch', flexShrink: 0, justifyContent: 'flex-end' }}>
                  {isKey && <CheckCircleRounded sx={{ color, fontSize: '1.25rem' }} aria-hidden />}
                  <Typography sx={{ ...BODY, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{row.count}</Typography>
                </Stack>
              </Stack>
            );
          })}
          {reveal.others > 0 && (
            <Typography color="text.secondary" sx={BODY}>
              {`${reveal.others} gave other answers`}
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  );
}

export default function StageResults({ host }: { host: PadHost }) {
  const state = useStageView(host);

  if (!host.meeting?.meetingId) {
    return <Notice title="Share this from a class meeting">The class results show here when a teacher shares the Answer Pad in a Teams meeting.</Notice>;
  }
  if (state.kind === 'loading') return <Notice title="Loading the class results" />;
  if (state.kind === 'problem') return <Notice title="The results could not load">They will appear as soon as the connection is back.</Notice>;
  if (!state.stage) {
    return <Notice title="The Answer Pad is not running">Results show here once the teacher starts the Answer Pad in this meeting.</Notice>;
  }

  return (
    <Box component="section" aria-label="Class results" sx={{ py: { xs: 1, sm: 2 } }}>
      <LiveAnnouncement message={stageAnnouncement(state.stage)} />
      <StageBody stage={state.stage} />
    </Box>
  );
}
