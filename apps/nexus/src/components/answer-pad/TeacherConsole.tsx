'use client';

/**
 * The teacher's Answer Pad console, sized for the Teams meeting side panel
 * (about 320px wide) and usable up to a tablet.
 *
 * One primary action at a time: ASK, then CLOSE, then choose the key and
 * REVEAL, then ASK again. While students are answering the console shows a
 * count only, never names or answers. Every button press is followed by a
 * fresh snapshot, so the screen always shows the server's state, including
 * after a refused or repeated press.
 */

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import AddRounded from '@mui/icons-material/AddRounded';
import CampaignRounded from '@mui/icons-material/CampaignRounded';
import CancelRounded from '@mui/icons-material/CancelRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import HowToVoteRounded from '@mui/icons-material/HowToVoteRounded';
import NotificationsActiveRounded from '@mui/icons-material/NotificationsActiveRounded';
import PersonOffRounded from '@mui/icons-material/PersonOffRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import ScreenShareRounded from '@mui/icons-material/ScreenShareRounded';
import StopCircleRounded from '@mui/icons-material/StopCircleRounded';
import StopScreenShareRounded from '@mui/icons-material/StopScreenShareRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import VolumeOffRounded from '@mui/icons-material/VolumeOffRounded';
import { answerTypeLabel, displayAnswer, displayKeys } from '@/lib/pad/client/format';
import { PadClientError, padFetch } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import type { RealtimeState } from '@/lib/pad/client/poll-policy';
import {
  consoleAnnouncement,
  deriveConsoleView,
  groupParticipation,
  keyChoices,
  reminderMessage,
  revealSummary,
  toggleKey,
  type ReminderResult,
  type SummaryItem,
} from '@/lib/pad/client/teacher-view';
import type { AnswerType, ParticipationRow, TeacherPrompt, TeacherSnapshot } from '@/lib/pad/client/types';
import LiveAnnouncement from './LiveAnnouncement';
import { usePadSnapshot } from './usePadSnapshot';

type StartResponse =
  | { sessionId: string; resumed: boolean; endedSessionId: string | null }
  | { needsClassroom: true; classrooms: Array<{ id: string; name: string }> };

type StartState =
  | { kind: 'starting' }
  | { kind: 'choose'; classrooms: Array<{ id: string; name: string }> }
  | { kind: 'conflict'; existing: { session_id: string; classroom_name: string | null; created_at: string }; classroomId: string | null }
  | { kind: 'problem'; message: string }
  | { kind: 'running'; sessionId: string };

const ANSWER_TYPES: AnswerType[] = ['mcq', 'numeric', 'text', 'yesno'];

function actionMessage(err: unknown): string {
  if (!(err instanceof PadClientError)) return 'Something went wrong. Please try again.';
  switch (err.code) {
    case 'INVALID_TRANSITION':
      return 'That question had already moved on. The screen now shows where it is.';
    case 'KEY_REQUIRED':
      return 'Choose the correct answer, or mark it as a poll, before revealing.';
    case 'INVALID_KEY':
      return 'That is not a valid answer for this question.';
    case 'SESSION_NOT_LIVE':
      return 'This class has already ended.';
    case 'NOT_SESSION_TEACHER':
      return 'Only the teacher who started this class can change it.';
    case 'RATE_LIMITED':
      return 'A reminder just went out. Try again in a few seconds.';
    case 'OFFLINE':
      return 'No connection. Check your network and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function TeacherConsole({ host }: { host: PadHost }) {
  const [start, setStart] = useState<StartState>({ kind: 'starting' });

  const startSession = useCallback(
    async (extra: { classroomId?: string; endExisting?: boolean } = {}) => {
      setStart({ kind: 'starting' });
      try {
        const result = await padFetch<StartResponse>(host, '/api/pad/sessions', {
          method: 'POST',
          body: { meeting: host.meeting, ...extra },
        });
        if ('needsClassroom' in result) setStart({ kind: 'choose', classrooms: result.classrooms });
        else setStart({ kind: 'running', sessionId: result.sessionId });
      } catch (err) {
        if (err instanceof PadClientError && err.code === 'SESSION_CONFLICT') {
          const existing = err.detail.existing as { session_id: string; classroom_name: string | null; created_at: string };
          setStart({ kind: 'conflict', existing, classroomId: extra.classroomId ?? null });
        } else if (err instanceof PadClientError && err.status === 403) {
          setStart({ kind: 'problem', message: 'You can only run the Answer Pad for classes you teach.' });
        } else {
          setStart({ kind: 'problem', message: 'The Answer Pad could not start. Check your connection and try again.' });
        }
      }
    },
    [host],
  );

  useEffect(() => {
    void startSession();
  }, [startSession]);

  switch (start.kind) {
    case 'starting':
      return (
        <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
          <CircularProgress aria-label="Starting the Answer Pad" />
          <Typography>Starting the Answer Pad.</Typography>
        </Stack>
      );

    case 'choose':
      return <ClassroomPicker classrooms={start.classrooms} onPick={(classroomId) => startSession({ classroomId })} />;

    case 'conflict':
      return (
        <Stack spacing={2}>
          <Alert severity="warning" icon={<ErrorOutlineRounded />}>
            {`${start.existing.classroom_name ?? 'Another class'} is still running, started at ${formatTime(start.existing.created_at)}.`}
          </Alert>
          <Button
            variant="contained"
            size="large"
            onClick={() => startSession({ classroomId: start.classroomId ?? undefined, endExisting: true })}
            sx={{ minHeight: 52 }}
          >
            {`End ${start.existing.classroom_name ?? 'that class'} and start this class`}
          </Button>
          <Button variant="text" onClick={() => setStart({ kind: 'running', sessionId: start.existing.session_id })} sx={{ minHeight: 44 }}>
            Continue that class instead
          </Button>
        </Stack>
      );

    case 'problem':
      return (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => startSession()} sx={{ minHeight: 44 }}>
              Try again
            </Button>
          }
        >
          {start.message}
        </Alert>
      );

    case 'running':
      return <LiveConsole host={host} sessionId={start.sessionId} onStartAgain={() => startSession()} />;
  }
}

function ClassroomPicker({ classrooms, onPick }: { classrooms: Array<{ id: string; name: string }>; onPick: (id: string) => void }) {
  if (classrooms.length === 0) {
    return <Alert severity="info">There are no classes you can run the Answer Pad for. Ask an admin to add you as a teacher.</Alert>;
  }
  return (
    <Stack spacing={1.5}>
      <Typography variant="h6" component="h2" fontWeight={800}>
        Which class is this?
      </Typography>
      <Typography variant="body2" color="text.secondary">
        This meeting is not linked to a class in Nexus yet. Pick it once and it is remembered for this meeting series.
      </Typography>
      <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {classrooms.map((classroom) => (
          <li key={classroom.id}>
            <Button fullWidth variant="outlined" onClick={() => onPick(classroom.id)} sx={{ minHeight: 48, justifyContent: 'flex-start', textAlign: 'left' }}>
              {classroom.name}
            </Button>
          </li>
        ))}
      </Stack>
    </Stack>
  );
}

function useStoredState<T>(key: string, initial: T, valid: (value: unknown) => value is T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
      return valid(stored) ? stored : initial;
    } catch {
      return initial;
    }
  });
  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Private mode or blocked storage: the choice lasts for this visit only.
      }
    },
    [key],
  );
  return [value, update];
}

const isAnswerType = (value: unknown): value is AnswerType => typeof value === 'string' && (ANSWER_TYPES as string[]).includes(value);
const isOptionCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 2 && value <= 6;

function LiveConsole({ host, sessionId, onStartAgain }: { host: PadHost; sessionId: string; onStartAgain: () => void }) {
  const { snapshot, error, realtime, refresh } = usePadSnapshot<TeacherSnapshot>({ host, sessionId, role: 'teacher' });
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [askType, setAskType] = useStoredState<AnswerType>('pad-ask-type', 'mcq', isAnswerType);
  const [optionCount, setOptionCount] = useStoredState<number>('pad-option-count', 4, isOptionCount);
  const [endStep, setEndStep] = useState<null | { unrevealed: number | null }>(null);
  const [historyPromptId, setHistoryPromptId] = useState<string | null>(null);
  const [reminder, setReminder] = useState<string | null>(null);

  const view = deriveConsoleView(snapshot);

  const act = useCallback(
    async (label: string, run: () => Promise<unknown>) => {
      setBusy(label);
      setActionError(null);
      try {
        await run();
      } catch (err) {
        setActionError(actionMessage(err));
      } finally {
        setBusy(null);
        await refresh();
      }
    },
    [refresh],
  );

  const post = useCallback((path: string, body?: unknown) => padFetch(host, path, { method: 'POST', body }), [host]);

  // A reminder's result belongs to the question it was sent for.
  const currentPromptId = snapshot?.prompt?.id ?? null;
  useEffect(() => setReminder(null), [currentPromptId]);

  const remind = () =>
    act('remind', async () => {
      setReminder(null);
      const result = await padFetch<ReminderResult>(host, `/api/pad/sessions/${sessionId}/resend`, { method: 'POST' });
      setReminder(reminderMessage(result));
    });

  const ask = () =>
    act('ask', () => post('/api/pad/prompts/ask', { sessionId, answerType: askType, ...(askType === 'mcq' ? { optionCount } : {}) }));

  const endClass = (confirmUnrevealed: boolean) =>
    act('end', async () => {
      try {
        await post(`/api/pad/sessions/${sessionId}/end`, { confirmUnrevealed });
        setEndStep(null);
      } catch (err) {
        if (err instanceof PadClientError && err.code === 'UNREVEALED_PROMPT') {
          setEndStep({ unrevealed: Number(err.detail.sequence) || null });
          return;
        }
        throw err;
      }
    });

  if (!snapshot) {
    return error ? (
      <Alert severity="warning">{error.offline ? 'No connection. Reconnecting now.' : 'The console could not load. It will try again shortly.'}</Alert>
    ) : (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress aria-label="Loading the console" />
      </Stack>
    );
  }

  const session = snapshot.session;
  const historyPrompt = historyPromptId ? snapshot.history.find((entry) => entry.id === historyPromptId) ?? null : null;

  return (
    <Stack spacing={2} sx={{ width: '100%' }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" component="h1" fontWeight={800} sx={{ overflowWrap: 'anywhere', lineHeight: 1.3 }}>
            {session.classroom_name ?? 'Answer Pad'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {`Started ${formatTime(session.created_at)}`}
          </Typography>
        </Box>
        {view.kind !== 'ended' && (
          <Button color="error" size="small" onClick={() => setEndStep({ unrevealed: null })} disabled={busy !== null} sx={{ minHeight: 44, flexShrink: 0 }}>
            End class
          </Button>
        )}
      </Stack>

      {endStep && (
        <Alert
          severity="warning"
          action={
            <Stack direction="row" spacing={0.5}>
              <Button color="inherit" size="small" onClick={() => endClass(endStep.unrevealed !== null)} disabled={busy !== null} sx={{ minHeight: 44 }}>
                {endStep.unrevealed !== null ? 'End anyway' : 'End'}
              </Button>
              <Button color="inherit" size="small" onClick={() => setEndStep(null)} sx={{ minHeight: 44 }}>
                Cancel
              </Button>
            </Stack>
          }
        >
          {endStep.unrevealed !== null
            ? `Question ${endStep.unrevealed} isn't revealed. It will not count towards anyone's score.`
            : 'End the Answer Pad for this class?'}
        </Alert>
      )}

      {actionError && (
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}
      {error?.offline && <Alert severity="warning">No connection. Reconnecting now.</Alert>}

      <LiveAnnouncement message={consoleAnnouncement(view)} />
      <Box>
        {view.kind === 'ended' && <EndedPanel snapshot={snapshot} onStartAgain={onStartAgain} />}

        {view.kind === 'ready' && (
          <Stack spacing={2}>
            <ReadinessPanel snapshot={snapshot} host={host} realtime={realtime} />
            <AskControls
              answerType={askType}
              optionCount={optionCount}
              onAnswerType={setAskType}
              onOptionCount={setOptionCount}
              busy={busy === 'ask'}
              disabled={busy !== null}
              label="Ask question 1"
              onAsk={ask}
            />
          </Stack>
        )}

        {view.kind === 'open' && (
          <OpenPanel
            sequence={view.prompt.sequence}
            answered={view.answered}
            enrolled={view.enrolled}
            offRoster={view.offRoster}
            busy={busy === 'close'}
            disabled={busy !== null}
            onClose={() => act('close', () => post(`/api/pad/prompts/${view.prompt.id}/close`))}
            canRemind={snapshot.session.bot_in_meeting}
            reminding={busy === 'remind'}
            reminder={reminder}
            onRemind={remind}
          />
        )}

        {view.kind === 'closed' && (
          <ClosedPanel
            prompt={view.prompt}
            groups={snapshot.groups}
            decided={view.decided}
            busy={busy}
            onReopen={() => act('reopen', () => post(`/api/pad/prompts/${view.prompt.id}/reopen`))}
            onKeys={(keys) => act('key', () => post(`/api/pad/prompts/${view.prompt.id}/key`, { keys }))}
            onPoll={() => act('key', () => post(`/api/pad/prompts/${view.prompt.id}/key`, { ungraded: true }))}
            onReveal={() => act('reveal', () => post(`/api/pad/prompts/${view.prompt.id}/reveal`))}
          />
        )}

        {view.kind === 'revealed' && (
          <Stack spacing={2.5}>
            <RevealedPanel host={host} prompt={view.prompt} snapshot={snapshot} onLabel={(label) => act('label', () => post(`/api/pad/prompts/${view.prompt.id}/label`, { label }))} busy={busy !== null} />
            <Divider />
            <AskControls
              answerType={askType}
              optionCount={optionCount}
              onAnswerType={setAskType}
              onOptionCount={setOptionCount}
              busy={busy === 'ask'}
              disabled={busy !== null}
              label={`Ask question ${view.prompt.sequence + 1}`}
              onAsk={ask}
            />
          </Stack>
        )}
      </Box>

      {snapshot.history.length > 1 && (
        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary" component="h2">
            Questions so far
          </Typography>
          <Box component="nav" aria-label="Questions so far" sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
            {snapshot.history.map((entry) => {
              const current = entry.id === snapshot.prompt?.id;
              const label =
                entry.state === 'revealed'
                  ? entry.ungraded
                    ? `Q${entry.sequence} poll`
                    : `Q${entry.sequence} ${entry.correct} of ${entry.answered}`
                  : `Q${entry.sequence} ${entry.state}`;
              return (
                <Chip
                  key={entry.id}
                  label={label}
                  variant={current || entry.id === historyPromptId ? 'filled' : 'outlined'}
                  color={current ? 'primary' : 'default'}
                  onClick={!current && entry.state === 'revealed' ? () => setHistoryPromptId(entry.id === historyPromptId ? null : entry.id) : undefined}
                  sx={{ minHeight: 36, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
                />
              );
            })}
          </Box>
          {historyPrompt && historyPrompt.id !== snapshot.prompt?.id && (
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                {`Question ${historyPrompt.sequence}${historyPrompt.label ? `: ${historyPrompt.label}` : ''}`}
              </Typography>
              <ParticipationDetails host={host} promptId={historyPrompt.id} ungraded={historyPrompt.ungraded} startOpen />
            </Paper>
          )}
        </Stack>
      )}
    </Stack>
  );
}

function CheckRow({ ok, children }: { ok: boolean; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box sx={{ display: 'flex', color: ok ? theme.palette.success.main : theme.palette.warning.dark }} aria-hidden>
        {ok ? <CheckCircleRounded fontSize="small" /> : <ErrorOutlineRounded fontSize="small" />}
      </Box>
      <Typography variant="body2">{children}</Typography>
    </Stack>
  );
}

function ReadinessPanel({ snapshot, host, realtime }: { snapshot: TeacherSnapshot; host: PadHost; realtime: RealtimeState }) {
  const { readiness, session } = snapshot;
  const code = session.room_code;
  const padAddress = typeof window !== 'undefined' ? `${window.location.host}/pad` : 'nexus.neramclasses.com/pad';

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="overline" color="text.secondary">
        Before you ask
      </Typography>
      <Typography variant="h4" component="p" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums' }}>
        {`${readiness.connected} of ${readiness.enrolled}`}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        students have the pad open
        {session.presence_basis === 'meeting' ? `, ${readiness.in_meeting} in the meeting` : ''}
      </Typography>

      <Stack spacing={0.75} sx={{ mt: 1.5 }}>
        <CheckRow ok={host.kind !== 'browser'}>{host.kind === 'browser' ? 'Opened outside Teams' : 'Teams connected'}</CheckRow>
        <CheckRow ok>{`Class: ${session.classroom_name ?? 'linked'}`}</CheckRow>
        <CheckRow ok={realtime === 'subscribed'}>{realtime === 'subscribed' ? 'Live updates on' : 'Updating every few seconds'}</CheckRow>
        <CheckRow ok={session.bot_in_meeting}>{session.bot_in_meeting ? 'Meeting bot added' : 'Meeting bot not added, so no reminders go out'}</CheckRow>
      </Stack>

      <Divider sx={{ my: 1.5 }} />
      <Typography variant="body2">{`Students without the pad can open ${padAddress} and enter`}</Typography>
      <Typography variant="h4" component="p" fontWeight={800} aria-label={`Room code ${code.split('').join(' ')}`} sx={{ letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' }}>
        {`${code.slice(0, 3)} ${code.slice(3)}`}
      </Typography>
    </Paper>
  );
}

function AskControls({
  answerType,
  optionCount,
  onAnswerType,
  onOptionCount,
  busy,
  disabled,
  label,
  onAsk,
}: {
  answerType: AnswerType;
  optionCount: number;
  onAnswerType: (type: AnswerType) => void;
  onOptionCount: (count: number) => void;
  busy: boolean;
  disabled: boolean;
  label: string;
  onAsk: () => void;
}) {
  return (
    <Stack spacing={1.5}>
      {/* Toggle buttons in a labelled group: MUI marks the chosen one with aria-pressed. */}
      <Box role="group" aria-label="Answer type" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
        {ANSWER_TYPES.map((type) => (
          <ToggleButton
            key={type}
            value={type}
            selected={answerType === type}
            onChange={() => onAnswerType(type)}
            sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
          >
            {answerTypeLabel(type, type === 'mcq' ? optionCount : null)}
          </ToggleButton>
        ))}
      </Box>

      {answerType === 'mcq' && (
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
          <IconButton aria-label="Fewer options" onClick={() => onOptionCount(Math.max(2, optionCount - 1))} disabled={optionCount <= 2} sx={{ width: 44, height: 44 }}>
            <RemoveRounded />
          </IconButton>
          <Typography sx={{ minWidth: 88, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{`${optionCount} options`}</Typography>
          <IconButton aria-label="More options" onClick={() => onOptionCount(Math.min(6, optionCount + 1))} disabled={optionCount >= 6} sx={{ width: 44, height: 44 }}>
            <AddRounded />
          </IconButton>
        </Stack>
      )}

      <Button
        variant="contained"
        size="large"
        onClick={onAsk}
        disabled={disabled}
        startIcon={busy ? <CircularProgress size={22} color="inherit" aria-hidden /> : <CampaignRounded />}
        sx={{ minHeight: 64, fontSize: '1.25rem', fontWeight: 800, touchAction: 'manipulation' }}
      >
        {label}
      </Button>
    </Stack>
  );
}

function OpenPanel({
  sequence,
  answered,
  enrolled,
  offRoster,
  busy,
  disabled,
  onClose,
  canRemind,
  reminding,
  reminder,
  onRemind,
}: {
  sequence: number;
  answered: number;
  enrolled: number;
  offRoster: number;
  busy: boolean;
  disabled: boolean;
  onClose: () => void;
  /** Only with the bot in the meeting: it is the bot that sends the reminder. */
  canRemind: boolean;
  reminding: boolean;
  reminder: string | null;
  onRemind: () => void;
}) {
  return (
    <Stack alignItems="center" spacing={1.5}>
      <Chip color="success" label={`Question ${sequence} is open`} />
      <Typography
        component="p"
        aria-label={`${answered} of ${enrolled} answered`}
        sx={{ fontSize: 'clamp(3rem, 18vw, 4.5rem)', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
      >
        {answered}
        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>
          {` / ${enrolled}`}
        </Box>
      </Typography>
      <Typography variant="body2" color="text.secondary">
        answered
      </Typography>
      {offRoster > 0 && (
        <Typography variant="caption" color="text.secondary">
          {`plus ${offRoster} not on the class list`}
        </Typography>
      )}
      <Button
        fullWidth
        variant="contained"
        size="large"
        onClick={onClose}
        disabled={disabled}
        startIcon={busy ? <CircularProgress size={22} color="inherit" aria-hidden /> : <StopCircleRounded />}
        sx={{ minHeight: 56, fontWeight: 800 }}
      >
        Close answers
      </Button>
      {canRemind && (
        <Button
          fullWidth
          variant="text"
          onClick={onRemind}
          disabled={disabled}
          startIcon={reminding ? <CircularProgress size={18} color="inherit" aria-hidden /> : <NotificationsActiveRounded />}
          sx={{ minHeight: 44 }}
        >
          Remind students without the pad
        </Button>
      )}
      {reminder && (
        <Typography variant="body2" color="text.secondary" role="status" sx={{ textAlign: 'center' }}>
          {reminder}
        </Typography>
      )}
    </Stack>
  );
}

function AnswerBars({ prompt, groups }: { prompt: TeacherPrompt; groups: Array<{ value: string; count: number }> }) {
  const theme = useTheme();
  const rows =
    prompt.answer_type === 'mcq' || prompt.answer_type === 'yesno'
      ? keyChoices(prompt, groups).map(({ value, count }) => ({ value, count }))
      : groups;
  const max = Math.max(1, ...rows.map((row) => row.count));

  if (rows.every((row) => row.count === 0)) {
    return <Typography variant="body2" color="text.secondary">Nobody answered this one.</Typography>;
  }

  return (
    <Stack spacing={0.75} role="list" aria-label="Answers given">
      {rows.map((row) => (
        <Stack key={row.value} direction="row" spacing={1} alignItems="center" role="listitem">
          <Typography sx={{ width: 56, flexShrink: 0, fontWeight: 700, overflowWrap: 'anywhere' }}>{displayAnswer(prompt.answer_type, row.value)}</Typography>
          <Box sx={{ flex: 1, height: 12, borderRadius: 6, bgcolor: alpha(theme.palette.text.primary, 0.08) }} aria-hidden>
            <Box sx={{ width: `${(row.count / max) * 100}%`, height: '100%', borderRadius: 6, bgcolor: theme.palette.primary.main }} />
          </Box>
          <Typography sx={{ width: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.count}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function ClosedPanel({
  prompt,
  groups,
  decided,
  busy,
  onReopen,
  onKeys,
  onPoll,
  onReveal,
}: {
  prompt: TeacherPrompt;
  groups: Array<{ value: string; count: number }>;
  decided: boolean;
  busy: string | null;
  onReopen: () => void;
  onKeys: (keys: string[]) => void;
  onPoll: () => void;
  onReveal: () => void;
}) {
  const [extraKey, setExtraKey] = useState('');
  const choices = keyChoices(prompt, groups);
  const typed = prompt.answer_type === 'numeric' || prompt.answer_type === 'text';

  const addKey = (event: FormEvent) => {
    event.preventDefault();
    const value = extraKey.trim();
    if (!value) return;
    const next = toggleKey(prompt.ungraded ? null : prompt.correct_keys, value);
    if (next) onKeys(next);
    setExtraKey('');
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle1" component="h2" fontWeight={800}>
          {`Question ${prompt.sequence} closed`}
        </Typography>
        <Button size="small" startIcon={<ReplayRounded />} onClick={onReopen} disabled={busy !== null} sx={{ minHeight: 44 }}>
          Reopen
        </Button>
      </Stack>

      <AnswerBars prompt={prompt} groups={groups} />

      <Stack spacing={1}>
        <Typography variant="body2" fontWeight={700} id="pad-key-label">
          Correct answer
        </Typography>
        <Box role="group" aria-labelledby="pad-key-label" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 1 }}>
          {choices.map((choice) => {
            // Tapping the only key does nothing: a graded question always keeps an answer.
            const next = toggleKey(prompt.ungraded ? null : prompt.correct_keys, choice.value);
            return (
              <ToggleButton
                key={choice.value}
                value={choice.value}
                selected={choice.selected}
                disabled={busy !== null}
                onChange={() => next && onKeys(next)}
                aria-label={`${displayAnswer(prompt.answer_type, choice.value)}, ${choice.count} answered${choice.selected ? ', marked correct' : ''}`}
                sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, overflowWrap: 'anywhere' }}
              >
                {choice.selected && <CheckCircleRounded fontSize="small" sx={{ mr: 0.5 }} aria-hidden />}
                {`${displayAnswer(prompt.answer_type, choice.value)} (${choice.count})`}
              </ToggleButton>
            );
          })}
        </Box>

        {typed && (
          <Stack component="form" direction="row" spacing={1} onSubmit={addKey}>
            <TextField
              size="small"
              label="Another correct answer"
              value={extraKey}
              onChange={(event) => setExtraKey(event.target.value)}
              inputProps={{ maxLength: 100, inputMode: prompt.answer_type === 'numeric' ? 'decimal' : 'text' }}
              sx={{ flex: 1 }}
            />
            <Button type="submit" variant="outlined" disabled={busy !== null || !extraKey.trim()} sx={{ minHeight: 44 }}>
              Add
            </Button>
          </Stack>
        )}

        <ToggleButton
          value="poll"
          selected={prompt.ungraded}
          disabled={busy !== null || prompt.ungraded}
          onChange={onPoll}
          sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
        >
          <HowToVoteRounded fontSize="small" sx={{ mr: 0.75 }} aria-hidden />
          {"Poll, don't grade"}
        </ToggleButton>
      </Stack>

      <Button
        fullWidth
        variant="contained"
        size="large"
        onClick={onReveal}
        disabled={!decided || busy !== null}
        startIcon={busy === 'reveal' ? <CircularProgress size={22} color="inherit" aria-hidden /> : <VisibilityRounded />}
        sx={{ minHeight: 56, fontWeight: 800 }}
      >
        Reveal answer
      </Button>
      {!decided && (
        <Typography variant="caption" color="text.secondary">
          Choose the correct answer, or mark it as a poll, to reveal.
        </Typography>
      )}
    </Stack>
  );
}

const SUMMARY_ICONS: Record<SummaryItem['key'], ReactNode> = {
  correct: <CheckCircleRounded />,
  incorrect: <CancelRounded />,
  answered: <HowToVoteRounded />,
  silent: <VolumeOffRounded />,
  absent: <PersonOffRounded />,
};

function RevealedPanel({
  host,
  prompt,
  snapshot,
  onLabel,
  busy,
}: {
  host: PadHost;
  prompt: TeacherPrompt;
  snapshot: TeacherSnapshot;
  onLabel: (label: string | null) => void;
  busy: boolean;
}) {
  const theme = useTheme();
  const [note, setNote] = useState(prompt.label ?? '');
  useEffect(() => setNote(prompt.label ?? ''), [prompt.id, prompt.label]);

  const tone: Record<SummaryItem['key'], string> = {
    correct: theme.palette.success.main,
    incorrect: theme.palette.error.main,
    answered: theme.palette.primary.main,
    silent: theme.palette.warning.dark,
    absent: theme.palette.text.secondary,
  };

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1" component="h2" fontWeight={800}>
        {`Question ${prompt.sequence} revealed`}
      </Typography>
      {prompt.ungraded ? (
        <Chip icon={<HowToVoteRounded />} label="Poll, not graded" sx={{ alignSelf: 'flex-start' }} />
      ) : (
        <Typography>{`Answer: ${displayKeys(prompt.answer_type, prompt.correct_keys)}`}</Typography>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
        {revealSummary(snapshot.counts, prompt.ungraded).map((item) => (
          <Stack
            key={item.key}
            role="group"
            aria-label={`${item.label}: ${item.count}`}
            spacing={0.25}
            sx={{ p: 1.25, borderRadius: 2, border: '1px solid', borderColor: 'divider', borderLeft: `4px solid ${tone[item.key]}` }}
          >
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Box sx={{ display: 'flex', color: tone[item.key], '& svg': { fontSize: 18 } }} aria-hidden>
                {SUMMARY_ICONS[item.key]}
              </Box>
              <Typography variant="caption" sx={{ lineHeight: 1.2 }}>
                {item.label}
              </Typography>
            </Stack>
            <Typography variant="h5" component="p" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {item.count}
            </Typography>
          </Stack>
        ))}
      </Box>

      <ShareResultsButton host={host} />

      <ParticipationDetails host={host} promptId={prompt.id} ungraded={prompt.ungraded} startOpen={false} />

      <Stack
        component="form"
        direction="row"
        spacing={1}
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onLabel(note.trim() ? note.trim() : null);
        }}
      >
        <TextField size="small" label="Add a note" value={note} onChange={(event) => setNote(event.target.value)} inputProps={{ maxLength: 80 }} sx={{ flex: 1 }} />
        <Button type="submit" variant="outlined" disabled={busy || note.trim() === (prompt.label ?? '')} sx={{ minHeight: 44 }}>
          Save
        </Button>
      </Stack>
    </Stack>
  );
}

/**
 * Puts the class results on the meeting screen for everyone (the /pad/stage
 * page: totals and the breakdown, never names). Shown only where Teams lets
 * this person share, which means organizers and presenters.
 */
function ShareResultsButton({ host }: { host: PadHost }) {
  const stage = host.stage;
  const [allowed, setAllowed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!stage) return;
    let active = true;
    void Promise.all([stage.canShare().catch(() => false), stage.isSharing().catch(() => false)]).then(([can, now]) => {
      if (!active) return;
      setAllowed(can);
      setSharing(now);
    });
    return () => {
      active = false;
    };
  }, [stage]);

  if (!stage || !allowed) return null;

  const toggle = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (sharing) {
        await stage.stop();
        setSharing(false);
      } else {
        await stage.share(`${window.location.origin}/pad/stage`);
        setSharing(true);
      }
    } catch {
      setProblem(sharing ? 'Sharing did not stop. Use Stop sharing on the meeting screen.' : 'The results could not be shared. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={1}>
      <Button
        variant={sharing ? 'outlined' : 'contained'}
        onClick={toggle}
        disabled={busy}
        startIcon={busy ? <CircularProgress size={20} color="inherit" aria-hidden /> : sharing ? <StopScreenShareRounded /> : <ScreenShareRounded />}
        sx={{ minHeight: 48, fontWeight: 700 }}
      >
        {sharing ? 'Stop sharing' : 'Share results'}
      </Button>
      {!sharing && (
        <Typography variant="caption" color="text.secondary">
          {"Shows the class totals on everyone's screen, without names."}
        </Typography>
      )}
      {problem && <Alert severity="warning">{problem}</Alert>}
    </Stack>
  );
}

const DETAIL_ORDER: Array<{ key: SummaryItem['key']; title: string }> = [
  { key: 'correct', title: 'Correct' },
  { key: 'incorrect', title: 'Incorrect' },
  { key: 'answered', title: 'Answered' },
  { key: 'silent', title: 'Present but silent' },
  { key: 'absent', title: 'Absent' },
];

function ParticipationDetails({ host, promptId, ungraded, startOpen }: { host: PadHost; promptId: string; ungraded: boolean; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [rows, setRows] = useState<ParticipationRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setRows(null);
    setFailed(false);
  }, [promptId]);

  useEffect(() => {
    if (!open || rows) return;
    let active = true;
    padFetch<{ rows: ParticipationRow[] }>(host, `/api/pad/prompts/${promptId}/participation`)
      .then((data) => active && setRows(data.rows))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [host, open, promptId, rows]);

  const groups = rows ? groupParticipation(rows, ungraded) : null;

  return (
    <Stack spacing={1}>
      <Button variant="text" onClick={() => setOpen(!open)} aria-expanded={open} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>
        {open ? 'Hide names' : 'Show names'}
      </Button>
      {open && failed && <Alert severity="warning">The names could not load. Try again in a moment.</Alert>}
      {open && !failed && !groups && <CircularProgress size={24} aria-label="Loading names" />}
      {open && groups && (
        <Stack spacing={1.5}>
          {DETAIL_ORDER.filter(({ key }) => groups[key].length > 0).map(({ key, title }) => (
            <Stack key={key} spacing={0.5}>
              <Typography variant="body2" fontWeight={700}>{`${title} (${groups[key].length})`}</Typography>
              <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {groups[key].map((row) => (
                  <Stack component="li" key={row.student_id} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                      {row.name ?? 'Unnamed student'}
                    </Typography>
                    {row.answer && key !== 'correct' && (
                      <Typography variant="caption" color="text.secondary">{`answered ${row.answer}`}</Typography>
                    )}
                    {row.joined_mid_prompt && <Chip size="small" variant="outlined" label="Joined mid-question" />}
                    {!row.on_roster && <Chip size="small" variant="outlined" label="Not on class list" />}
                  </Stack>
                ))}
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function EndedPanel({ snapshot, onStartAgain }: { snapshot: TeacherSnapshot; onStartAgain: () => void }) {
  const asked = snapshot.history.length;
  return (
    <Stack spacing={2}>
      <Alert severity="success">{asked === 0 ? 'Class ended. No questions were asked.' : `Class ended after ${asked} question${asked === 1 ? '' : 's'}.`}</Alert>
      <Button variant="contained" href={`/teacher/answer-pad/sessions/${snapshot.session.id}`} target="_blank" rel="noopener noreferrer" sx={{ minHeight: 48 }}>
        Open the class report
      </Button>
      <Button variant="text" onClick={onStartAgain} sx={{ minHeight: 44 }}>
        Start a new session
      </Button>
    </Stack>
  );
}
