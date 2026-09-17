'use client';

/**
 * The page Teams loads in the meeting side panel, the same for teachers and
 * students: connect to Teams (or, outside production, the Playwright test host),
 * ask /api/pad/me who this is, then show the teacher console or the student pad.
 *
 * The same app runs two more surfaces:
 *   - the "Question N is open" pop-up (variant "popup"), which is where most
 *     students answer, on their phones: only their answer buttons, and for a
 *     teacher a pointer back to the panel;
 *   - the meeting screen (variant "stage", or any page Teams opens on the
 *     stage), where everyone sees the class results the teacher shared.
 */

import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Stack, Typography } from '@neram/ui';
import { PadClientError, padFetch } from '@/lib/pad/client/pad-fetch';
import { connectTeamsHost, readTestHost, type PadFrame, type PadHost, type PadTheme } from '@/lib/pad/client/pad-host';
import PadShell from './PadShell';
import StudentMeetingPad from './StudentMeetingPad';

/**
 * Loaded only where they are shown. Students, mostly on phones where Teams
 * keeps no copy of the panel between opens, never download the console.
 */
const TeacherConsole = lazy(() => import('./TeacherConsole'));
const StageResults = lazy(() => import('./StageResults'));

type AppState =
  | { kind: 'connecting' }
  | { kind: 'outside-teams' }
  | { kind: 'problem'; host: PadHost; message: string; canRetry: boolean }
  | { kind: 'ready'; host: PadHost; role: 'staff' | 'student' };

export function identifyProblem(err: unknown): { message: string; canRetry: boolean } {
  if (err instanceof PadClientError) {
    if (err.status === 404) return { message: "The Answer Pad isn't switched on for your account yet.", canRetry: false };
    if (err.status === 401) {
      return {
        message: 'Teams could not sign you in to Neram. Check that you are using your Neram Microsoft account, then try again.',
        canRetry: true,
      };
    }
    if (err.offline) return { message: 'No connection. Check your network and try again.', canRetry: true };
  }
  return { message: 'The Answer Pad could not load. Please try again.', canRetry: true };
}

function Opening() {
  return (
    <Stack alignItems="center" spacing={2} sx={{ py: 8 }}>
      <CircularProgress aria-label="Opening the Answer Pad" />
      <Typography>Opening the Answer Pad.</Typography>
    </Stack>
  );
}

export default function TeamsPadApp({ variant = 'panel' }: { variant?: 'panel' | 'popup' | 'stage' }) {
  const popup = variant === 'popup';
  const [state, setState] = useState<AppState>({ kind: 'connecting' });
  const [theme, setTheme] = useState<PadTheme>('light');
  const [frame, setFrame] = useState<PadFrame | null>(null);
  const onStage = variant === 'stage' || frame === 'meetingStage';

  const identify = useCallback(async (host: PadHost) => {
    setState({ kind: 'connecting' });
    try {
      const me = await padFetch<{ role: 'staff' | 'student' }>(host, '/api/pad/me');
      setState({ kind: 'ready', host, role: me.role });
    } catch (err) {
      setState({ kind: 'problem', host, ...identifyProblem(err) });
    }
  }, []);

  useEffect(() => {
    let active = true;
    let stopTheme: () => void = () => undefined;

    void (async () => {
      const host = readTestHost(window) ?? (await connectTeamsHost().catch(() => null));
      if (!active) return;
      if (!host) {
        setState({ kind: 'outside-teams' });
        return;
      }
      setTheme(host.theme);
      setFrame(host.frame);
      stopTheme = host.onThemeChange(setTheme);
      await identify(host);
    })();

    return () => {
      active = false;
      stopTheme();
    };
  }, [identify]);

  return (
    <PadShell theme={theme} dense={popup} wide={onStage}>
      {state.kind === 'connecting' && <Opening />}

      {state.kind === 'outside-teams' && (
        <Stack spacing={2}>
          <Typography variant="h6" component="h1" fontWeight={800}>
            Open this in a Teams meeting
          </Typography>
          <Typography>
            The Answer Pad runs in the side panel of your class meeting. Students without Teams can join from a browser with the
            room code.
          </Typography>
          <Button variant="contained" href="/pad" sx={{ minHeight: 48, alignSelf: 'flex-start' }}>
            Join with a room code
          </Button>
        </Stack>
      )}

      {state.kind === 'problem' && (
        <Alert
          severity={state.canRetry ? 'warning' : 'info'}
          action={
            state.canRetry ? (
              <Button color="inherit" size="small" onClick={() => identify(state.host)} sx={{ minHeight: 44 }}>
                Try again
              </Button>
            ) : undefined
          }
        >
          {state.message}
        </Alert>
      )}

      {state.kind === 'ready' &&
        (onStage ? (
          <Suspense fallback={<Opening />}>
            <StageResults host={state.host} />
          </Suspense>
        ) : state.role === 'student' ? (
          <StudentMeetingPad host={state.host} compact={popup} />
        ) : popup ? (
          <Typography>This pop-up is for students. Run the class from the Answer Pad button in the meeting.</Typography>
        ) : (
          <Suspense fallback={<Opening />}>
            <TeacherConsole host={state.host} />
          </Suspense>
        ))}
    </PadShell>
  );
}
