'use client';

/**
 * The six digits from the teacher's console, for a student whose pad is not in
 * the meeting panel: a phone browser, a laptop outside Teams, or a Teams client
 * without meeting apps. The code only finds the session. The server still checks
 * that the student is on that class list, and wrong codes are rate limited.
 */

import { useState, type FormEvent } from 'react';
import { Button, Stack, TextField, Typography } from '@neram/ui';
import LoginRounded from '@mui/icons-material/LoginRounded';
import { PadClientError, padFetch } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';

export function joinErrorMessage(err: unknown): string {
  const code = err instanceof PadClientError ? err.code : null;
  switch (code) {
    case 'ROOM_CODE_INVALID':
    case 'NOT_FOUND':
      return "That code doesn't match a live class. Check the six digits on your teacher's screen.";
    case 'RATE_LIMITED':
      return 'Too many tries. Wait a minute, then try again.';
    case 'NOT_ENROLLED':
      return "You're not on the class list for that class. Ask your teacher to check your enrollment.";
    case 'INVALID_INPUT':
      return "Enter the six digits shown on your teacher's screen.";
    case 'OFFLINE':
      return 'No connection. Check your network and try again.';
    default:
      return 'Could not join the class. Please try again.';
  }
}

export default function RoomCodeForm({
  host,
  initialCode = '',
  onJoined,
}: {
  host: PadHost;
  initialCode?: string;
  onJoined: (sessionId: string, code: string) => void;
}) {
  const [code, setCode] = useState(() => initialCode.replace(/\D/g, '').slice(0, 6));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const joined = await padFetch<{ sessionId: string }>(host, '/api/pad/join', { method: 'POST', body: { code } });
      onJoined(joined.sessionId, code);
    } catch (err) {
      setError(joinErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Stack component="form" spacing={2} onSubmit={submit} noValidate>
      <Stack spacing={0.5}>
        <Typography variant="h6" component="h2" fontWeight={800}>
          Join with a room code
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {"Your teacher's Answer Pad shows a six digit code."}
        </Typography>
      </Stack>
      <TextField
        label="Room code"
        value={code}
        onChange={(event) => {
          setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
          setError(null);
        }}
        error={Boolean(error)}
        helperText={error ?? ' '}
        FormHelperTextProps={{ role: error ? 'alert' : undefined }}
        inputProps={{
          inputMode: 'numeric',
          pattern: '[0-9]*',
          maxLength: 6,
          autoComplete: 'off',
          style: { fontSize: '1.75rem', letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' },
        }}
        fullWidth
      />
      <Button
        type="submit"
        variant="contained"
        size="large"
        disabled={code.length !== 6 || busy}
        startIcon={<LoginRounded />}
        sx={{ minHeight: 56, fontWeight: 800 }}
      >
        {busy ? 'Joining' : 'Join class'}
      </Button>
    </Stack>
  );
}
