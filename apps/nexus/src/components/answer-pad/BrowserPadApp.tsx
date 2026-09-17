'use client';

/**
 * The Answer Pad outside Teams. A student signed in to Nexus in any browser
 * enters the room code from the teacher's console, or opens a /pad/r/<code>
 * link, and gets the same pad as in the meeting panel.
 */

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, CircularProgress, Stack, Typography } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { PadClientError, padFetch } from '@/lib/pad/client/pad-fetch';
import { browserHost } from '@/lib/pad/client/pad-host';
import PadShell from './PadShell';
import RoomCodeForm, { joinErrorMessage } from './RoomCodeForm';
import StudentPad from './StudentPad';

type State =
  | { kind: 'checking' }
  | { kind: 'signed-out' }
  | { kind: 'staff' }
  | { kind: 'switched-off' }
  | { kind: 'enter-code'; error: string | null }
  | { kind: 'joined'; sessionId: string };

export default function BrowserPadApp({ code }: { code?: string }) {
  const { tokenReady, getToken } = useNexusAuthContext();
  const host = useMemo(() => browserHost(getToken), [getToken]);
  const [state, setState] = useState<State>({ kind: 'checking' });

  useEffect(() => {
    if (!tokenReady) return;
    let active = true;

    void (async () => {
      const token = await getToken().catch(() => null);
      if (!active) return;
      if (!token) {
        setState({ kind: 'signed-out' });
        return;
      }

      try {
        const me = await padFetch<{ role: 'staff' | 'student' }>(host, '/api/pad/me');
        if (!active) return;
        if (me.role === 'staff') {
          setState({ kind: 'staff' });
          return;
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof PadClientError && err.status === 404) setState({ kind: 'switched-off' });
        else if (err instanceof PadClientError && err.status === 401) setState({ kind: 'signed-out' });
        else setState({ kind: 'enter-code', error: joinErrorMessage(err) });
        return;
      }

      if (!code) {
        setState({ kind: 'enter-code', error: null });
        return;
      }
      try {
        const joined = await padFetch<{ sessionId: string }>(host, '/api/pad/join', { method: 'POST', body: { code } });
        if (active) setState({ kind: 'joined', sessionId: joined.sessionId });
      } catch (err) {
        if (active) setState({ kind: 'enter-code', error: joinErrorMessage(err) });
      }
    })();

    return () => {
      active = false;
    };
  }, [tokenReady, getToken, host, code]);

  const returnPath = code ? `/pad/r/${code}` : '/pad';

  return (
    <PadShell theme={host.theme}>
      <Stack spacing={2.5}>
        {state.kind !== 'joined' && (
          <Typography variant="h5" component="h1" fontWeight={800}>
            Answer Pad
          </Typography>
        )}

        {state.kind === 'checking' && (
          <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
            <CircularProgress aria-label="Opening the Answer Pad" />
            <Typography>Opening the Answer Pad.</Typography>
          </Stack>
        )}

        {state.kind === 'signed-out' && (
          <Stack spacing={2}>
            <Typography>Sign in with your Neram Microsoft account to join your class.</Typography>
            <Button
              variant="contained"
              size="large"
              href={`/login?next=${encodeURIComponent(returnPath)}`}
              sx={{ minHeight: 56, fontWeight: 800 }}
            >
              Sign in
            </Button>
          </Stack>
        )}

        {state.kind === 'staff' && (
          <Alert severity="info">
            Teachers run the Answer Pad from the class meeting in Teams. Open the meeting, then select Answer Pad in the meeting
            toolbar.
          </Alert>
        )}

        {state.kind === 'switched-off' && <Alert severity="info">{"The Answer Pad isn't switched on for your account yet."}</Alert>}

        {state.kind === 'enter-code' && (
          <Stack spacing={2}>
            {state.error && <Alert severity="warning">{state.error}</Alert>}
            <RoomCodeForm
              host={host}
              initialCode={code}
              onJoined={(sessionId, joinedCode) => {
                // A reload rejoins the same class instead of asking for the code again.
                window.history.replaceState(null, '', `/pad/r/${joinedCode}`);
                setState({ kind: 'joined', sessionId });
              }}
            />
          </Stack>
        )}

        {state.kind === 'joined' && <StudentPad host={host} sessionId={state.sessionId} />}
      </Stack>
    </PadShell>
  );
}
