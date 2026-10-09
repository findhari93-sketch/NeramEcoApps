'use client';

/**
 * Students who can present can replace the teacher's screen share with one
 * press of Teams' Share (it happened on 2026-09-30). The only control is the
 * meeting's "Who can present", so the console checks it once per round and,
 * when students can present, offers to fix it in one tap.
 *
 * Says nothing when the meeting is already locked, or when it cannot be read
 * (a meeting Nexus did not create): no nagging about what may be fine.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Stack } from '@neram/ui';
import LockRounded from '@mui/icons-material/LockRounded';
import { padFetch } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';

interface PresenterCheck {
  state: 'locked' | 'open' | 'unknown';
  allowedPresenters: string | null;
  canFix: boolean;
}

type Phase = { kind: 'checking' } | { kind: 'quiet' } | { kind: 'open' } | { kind: 'fixing' } | { kind: 'fixed' } | { kind: 'manual' };

export default function PresenterBanner({ host, sessionId }: { host: PadHost; sessionId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });

  useEffect(() => {
    // Only inside a Teams meeting: a room-code browser session has no meeting to lock.
    if (host.kind !== 'teams' && host.kind !== 'test') {
      setPhase({ kind: 'quiet' });
      return;
    }
    let active = true;
    padFetch<PresenterCheck>(host, `/api/pad/sessions/${sessionId}/presenters`)
      .then((check) => active && setPhase(check.state === 'open' ? { kind: 'open' } : { kind: 'quiet' }))
      .catch(() => active && setPhase({ kind: 'quiet' }));
    return () => {
      active = false;
    };
  }, [host, sessionId]);

  const lock = useCallback(async () => {
    setPhase({ kind: 'fixing' });
    try {
      const check = await padFetch<PresenterCheck>(host, `/api/pad/sessions/${sessionId}/presenters`, { method: 'POST' });
      setPhase(check.state === 'locked' ? { kind: 'fixed' } : { kind: 'manual' });
    } catch {
      setPhase({ kind: 'manual' });
    }
  }, [host, sessionId]);

  switch (phase.kind) {
    case 'checking':
    case 'quiet':
      return null;
    case 'fixed':
      return (
        <Alert severity="success" role="status" onClose={() => setPhase({ kind: 'quiet' })}>
          Only teachers can present now. Students cannot share over your screen.
        </Alert>
      );
    case 'manual':
      return (
        <Alert severity="warning" role="status" onClose={() => setPhase({ kind: 'quiet' })}>
          This meeting could not be changed from here. In Teams, open More, then Meeting options, and set Who can present to Specific people.
        </Alert>
      );
    default:
      // The button sits under the words: beside them it squeezes the text to a column at 320px.
      return (
        <Alert severity="warning" role="status">
          <Stack spacing={1} alignItems="flex-start">
            <span>Students can present in this meeting, so a student pressing Share replaces your screen.</span>
            <Button
              variant="outlined"
              color="inherit"
              size="small"
              onClick={lock}
              disabled={phase.kind === 'fixing'}
              startIcon={phase.kind === 'fixing' ? <CircularProgress size={16} color="inherit" aria-hidden /> : <LockRounded />}
              sx={{ minHeight: 44 }}
            >
              Only teachers can present
            </Button>
          </Stack>
        </Alert>
      );
  }
}
