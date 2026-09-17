'use client';

/**
 * The student's side panel in a class meeting. The teacher's console starts the
 * session, so the pad first finds the live session for this meeting, waits while
 * there is none yet, and shows the pad once there is. A room code is always one
 * tap away, and is the only way in where Teams gives no meeting id.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Stack, Typography } from '@neram/ui';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import { PadClientError, padFetch } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import LiveAnnouncement from './LiveAnnouncement';
import RoomCodeForm from './RoomCodeForm';
import StudentPad from './StudentPad';

/** Before the teacher starts: soon enough that nobody misses the first question. */
const WAITING_POLL_MS = 6_000;
/** After a class ends, in case the teacher starts another session in the same meeting. */
const ENDED_POLL_MS = 20_000;

type JoinState =
  | { kind: 'finding' }
  | { kind: 'waiting' }
  | { kind: 'code' }
  | { kind: 'not-enrolled' }
  | { kind: 'joined'; sessionId: string; ended: boolean };

export default function StudentMeetingPad({ host, compact = false }: { host: PadHost; compact?: boolean }) {
  const meetingId = host.meeting?.meetingId ?? null;
  const [state, setState] = useState<JoinState>(meetingId ? { kind: 'finding' } : { kind: 'code' });

  const find = useCallback(async () => {
    if (!meetingId) return;
    try {
      const joined = await padFetch<{ sessionId: string | null }>(host, '/api/pad/join', {
        method: 'POST',
        body: { meetingId },
      });
      setState((current) => {
        if (current.kind === 'code' || current.kind === 'not-enrolled') return current;
        if (!joined.sessionId) return current.kind === 'joined' ? current : { kind: 'waiting' };
        if (current.kind === 'joined' && current.sessionId === joined.sessionId) return current;
        return { kind: 'joined', sessionId: joined.sessionId, ended: false };
      });
    } catch (err) {
      if (err instanceof PadClientError && err.code === 'NOT_ENROLLED') {
        setState({ kind: 'not-enrolled' });
        return;
      }
      // Offline or a hiccup: keep waiting, the next check tries again.
      setState((current) => (current.kind === 'finding' ? { kind: 'waiting' } : current));
    }
  }, [host, meetingId]);

  useEffect(() => {
    void find();
  }, [find]);

  const pollMs =
    state.kind === 'finding' || state.kind === 'waiting'
      ? WAITING_POLL_MS
      : state.kind === 'joined' && state.ended
        ? ENDED_POLL_MS
        : null;

  useEffect(() => {
    if (pollMs === null) return;
    const check = () => {
      if (document.visibilityState !== 'hidden') void find();
    };
    const timer = setInterval(check, pollMs);
    document.addEventListener('visibilitychange', check);
    const stopResume = host.onResume(check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      stopResume();
    };
  }, [pollMs, find, host]);

  const onEnded = useCallback(() => {
    setState((current) => (current.kind === 'joined' && !current.ended ? { ...current, ended: true } : current));
  }, []);

  switch (state.kind) {
    case 'finding':
      return (
        <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
          <CircularProgress aria-label="Finding your class" />
          <Typography>Finding your class.</Typography>
        </Stack>
      );

    case 'waiting':
      return (
        <Stack spacing={2}>
          <LiveAnnouncement message="Waiting for your teacher to start the Answer Pad." />
          <Stack spacing={1} sx={{ p: 2.5, borderRadius: 3, border: '2px solid', borderColor: 'divider' }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <HourglassTopRounded color="action" sx={{ fontSize: 32 }} aria-hidden />
              <Typography variant="h6" component="h2" fontWeight={800}>
                Waiting for your teacher
              </Typography>
            </Stack>
            <Typography>
              {compact
                ? 'Your question appears here as soon as your teacher asks.'
                : 'The Answer Pad opens here as soon as your teacher starts it. Keep this panel open.'}
            </Typography>
          </Stack>
          <Button variant="text" onClick={() => setState({ kind: 'code' })} sx={{ minHeight: 44, alignSelf: 'flex-start' }}>
            I have a room code
          </Button>
        </Stack>
      );

    case 'code':
      return (
        <Stack spacing={2}>
          <RoomCodeForm host={host} onJoined={(sessionId) => setState({ kind: 'joined', sessionId, ended: false })} />
          {meetingId && (
            <Button
              variant="text"
              onClick={() => {
                setState({ kind: 'waiting' });
                void find();
              }}
              sx={{ minHeight: 44, alignSelf: 'flex-start' }}
            >
              Back to waiting for my teacher
            </Button>
          )}
        </Stack>
      );

    case 'not-enrolled':
      return (
        <Alert severity="error">
          {"You're not on the class list for this class. Ask your teacher to check your enrollment."}
        </Alert>
      );

    case 'joined':
      return <StudentPad host={host} sessionId={state.sessionId} onEnded={onEnded} compact={compact} />;
  }
}
