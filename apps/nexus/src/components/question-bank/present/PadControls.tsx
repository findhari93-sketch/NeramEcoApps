'use client';

/**
 * The presenter's link to the Answer Pad: a chip saying which class is
 * answering (and the room code, for students joining from a phone), the
 * dialog that connects one, and the answer picker for a question the bank has
 * no key for.
 *
 * The best way in is the Teams meeting: the teacher opens the Answer Pad there
 * (the Neram Assistant app's meeting tab, already in class meetings) and
 * this screen finds that session by itself. Starting one here works too, and
 * the meeting takes it over when the pad is opened there later.
 */

import { useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@neram/ui';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import SensorsRoundedIcon from '@mui/icons-material/SensorsRounded';
import { PadClientError, padFetch } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import type { AnswerType } from '@/lib/pad/client/types';
import type { PadLink } from './present-model';

export interface LiveSessionInfo {
  classroomName: string | null;
  roomCode: string | null;
  roundNo: number | null;
  inMeeting: boolean;
}

export function PadChip({ pad, info, onConnect }: { pad: PadLink; info: LiveSessionInfo | null; onConnect: () => void }) {
  if (pad.kind === 'checking') {
    return <Chip icon={<CircularProgress size={14} />} label="Finding your Answer Pad" variant="outlined" />;
  }
  if (pad.kind === 'live') {
    return (
      <Chip
        icon={<SensorsRoundedIcon />}
        color="success"
        variant="outlined"
        onClick={onConnect}
        aria-label={`Answer Pad connected${info?.classroomName ? ` to ${info.classroomName}` : ''}. Room code ${info?.roomCode ?? ''}`}
        label={
          <Box component="span" sx={{ display: 'inline-flex', gap: 1, alignItems: 'center', minWidth: 0 }}>
            <Box component="span" sx={{ display: { xs: 'none', lg: 'inline' }, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
              {info?.classroomName ?? 'Answer Pad'}
              {info?.roundNo ? `, round ${info.roundNo}` : ''}
            </Box>
            {info?.roomCode && (
              <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                Code {info.roomCode}
              </Box>
            )}
          </Box>
        }
        sx={{ minHeight: 40, maxWidth: '100%' }}
      />
    );
  }
  return (
    <Button onClick={onConnect} startIcon={<LinkOffRoundedIcon />} variant="outlined" sx={{ minHeight: 44, whiteSpace: 'nowrap' }}>
      {pad.kind === 'off' ? 'Showing only' : 'Connect Answer Pad'}
    </Button>
  );
}

interface Classroom {
  id: string;
  name: string;
}

type ConnectState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'choose'; classrooms: Classroom[] }
  | { kind: 'conflict'; classroomId: string; existing: string | null }
  | { kind: 'error'; message: string };

export function ConnectPadDialog({
  open,
  onClose,
  host,
  pad,
  padAvailable,
  info,
  onConnected,
  onShowOnly,
}: {
  open: boolean;
  onClose: () => void;
  host: PadHost;
  pad: PadLink;
  /** False when the Answer Pad is switched off for this account. */
  padAvailable: boolean;
  info: LiveSessionInfo | null;
  onConnected: (sessionId: string) => void;
  onShowOnly: () => void;
}) {
  const [state, setState] = useState<ConnectState>({ kind: 'idle' });

  async function start(body: Record<string, unknown>, classroomId?: string) {
    setState({ kind: 'loading' });
    try {
      const result = await padFetch<{ sessionId?: string; needsClassroom?: boolean; classrooms?: Classroom[] }>(host, '/api/pad/sessions', {
        method: 'POST',
        body,
      });
      if (result.needsClassroom) {
        setState({ kind: 'choose', classrooms: result.classrooms ?? [] });
        return;
      }
      if (result.sessionId) {
        setState({ kind: 'idle' });
        onConnected(result.sessionId);
      }
    } catch (err) {
      if (err instanceof PadClientError && err.code === 'SESSION_CONFLICT' && classroomId) {
        const existing = (err.detail.existing as { classroom_name?: string } | undefined)?.classroom_name ?? null;
        setState({ kind: 'conflict', classroomId, existing });
        return;
      }
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Could not start the Answer Pad.' });
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ 'aria-label': 'Answer Pad' }}>
      <DialogTitle sx={{ fontWeight: 800 }}>Answer Pad</DialogTitle>
      <DialogContent>
        {pad.kind === 'live' ? (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <CheckCircleRoundedIcon color="success" />
              <Typography sx={{ fontWeight: 700 }}>
                Connected{info?.classroomName ? ` to ${info.classroomName}` : ''}
                {info?.roundNo ? `, round ${info.roundNo}` : ''}
              </Typography>
            </Stack>
            <Typography color="text.secondary">
              {info?.inMeeting
                ? 'Students in the Teams meeting answer in the Answer Pad panel.'
                : 'Students join at nexus.neramclasses.com/pad with the room code. Open the Answer Pad in your Teams meeting and students there join by themselves.'}
            </Typography>
            {info?.roomCode && (
              <Typography sx={{ fontSize: 32, fontWeight: 800, letterSpacing: 4, fontVariantNumeric: 'tabular-nums' }} aria-label={`Room code ${info.roomCode.split('').join(' ')}`}>
                {info.roomCode}
              </Typography>
            )}
          </Stack>
        ) : !padAvailable ? (
          <Alert severity="info">The Answer Pad is not switched on for your account, so this screen shows the questions only.</Alert>
        ) : (
          <Stack spacing={2}>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>Best: open the Answer Pad in your Teams meeting</Typography>
              <Typography color="text.secondary">
                Select Answer Pad in the meeting's top bar (if it is not there, open Apps and add Neram Assistant). This screen connects to it by itself within a few seconds.
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>Or start it here</Typography>
              {state.kind === 'idle' && (
                <Button variant="outlined" onClick={() => void start({})} sx={{ minHeight: 48 }}>
                  Choose a class
                </Button>
              )}
              {state.kind === 'loading' && <CircularProgress size={28} aria-label="Starting the Answer Pad" />}
              {state.kind === 'choose' &&
                (state.classrooms.length ? (
                  <Stack spacing={1} role="list" aria-label="Classes">
                    {state.classrooms.map((c) => (
                      <Button
                        key={c.id}
                        role="listitem"
                        variant="outlined"
                        onClick={() => void start({ classroomId: c.id }, c.id)}
                        sx={{ minHeight: 48, justifyContent: 'flex-start', textTransform: 'none', fontWeight: 600 }}
                      >
                        {c.name}
                      </Button>
                    ))}
                  </Stack>
                ) : (
                  <Alert severity="info">You do not teach any active class yet.</Alert>
                ))}
              {state.kind === 'conflict' && (
                <Stack spacing={1}>
                  <Alert severity="warning">
                    {state.existing ? `${state.existing} is still running on the Answer Pad.` : 'Another class is still running on the Answer Pad.'}
                  </Alert>
                  <Button
                    variant="contained"
                    onClick={() => void start({ classroomId: state.classroomId, endExisting: true }, state.classroomId)}
                    sx={{ minHeight: 48 }}
                  >
                    End it and start this class
                  </Button>
                </Stack>
              )}
              {state.kind === 'error' && <Alert severity="error">{state.message}</Alert>}
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {pad.kind !== 'live' && padAvailable && (
          <Button onClick={onShowOnly} sx={{ minHeight: 44, mr: 'auto' }}>
            Present without answers
          </Button>
        )}
        <Button onClick={onClose} variant="contained" sx={{ minHeight: 44 }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Reveal for a question the bank has no usable answer for: the teacher picks
 * it, or makes it a poll with no right answer.
 */
export function KeyPickerDialog({
  open,
  onClose,
  answerType,
  optionCount,
  busy,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  answerType: AnswerType;
  optionCount: number;
  busy: boolean;
  onPick: (choice: { keys: string[] } | { ungraded: true }) => void;
}) {
  const [value, setValue] = useState('');
  const letters = 'ABCDEF'.slice(0, Math.max(2, Math.min(6, optionCount))).split('');
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ 'aria-label': 'Choose the answer' }}>
      <DialogTitle sx={{ fontWeight: 800 }}>Choose the answer</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          The question bank has no answer for this question. Students are graded on what you choose.
        </Typography>
        {answerType === 'mcq' ? (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {letters.map((letter) => (
              <Button key={letter} variant="outlined" disabled={busy} onClick={() => onPick({ keys: [letter] })} sx={{ minWidth: 56, minHeight: 56, fontSize: 20, fontWeight: 800 }}>
                {letter}
              </Button>
            ))}
          </Stack>
        ) : answerType === 'yesno' ? (
          <Stack direction="row" spacing={1}>
            {['yes', 'no'].map((v) => (
              <Button key={v} variant="outlined" disabled={busy} onClick={() => onPick({ keys: [v] })} sx={{ minHeight: 48, textTransform: 'capitalize' }}>
                {v}
              </Button>
            ))}
          </Stack>
        ) : (
          <Stack
            component="form"
            direction="row"
            spacing={1}
            onSubmit={(e: React.FormEvent) => {
              e.preventDefault();
              if (value.trim()) onPick({ keys: [value.trim()] });
            }}
          >
            <TextField
              autoFocus
              label="Answer"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputProps={{ inputMode: answerType === 'numeric' ? 'decimal' : 'text' }}
              fullWidth
            />
            <Button type="submit" variant="contained" disabled={busy || !value.trim()} sx={{ minHeight: 56 }}>
              Reveal
            </Button>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => onPick({ ungraded: true })} disabled={busy} sx={{ minHeight: 44, mr: 'auto' }}>
          Poll, no right answer
        </Button>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
