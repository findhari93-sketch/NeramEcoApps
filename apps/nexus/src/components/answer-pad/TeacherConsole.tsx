'use client';

/**
 * The teacher's Answer Pad console, sized for the Teams meeting side panel
 * (about 320px wide) and usable up to a tablet, or in its own window (Pop out).
 *
 * One primary action at a time: ASK, then CLOSE, then choose the key and
 * REVEAL, then ASK again. The key can also wait: Decide later moves on to the
 * next question, and the answer is set from Questions so far or from the class
 * report after the class. While students are answering the console shows a
 * count only, never names or answers. Every button press is followed by a fresh
 * snapshot, so the screen always shows the server's state, including after a
 * refused or repeated press.
 */

import { useCallback, useEffect, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  ImageUploadField,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  Tooltip,
  Typography,
  useTheme,
} from '@neram/ui';
import AddRounded from '@mui/icons-material/AddRounded';
import CampaignRounded from '@mui/icons-material/CampaignRounded';
import CancelRounded from '@mui/icons-material/CancelRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import HowToVoteRounded from '@mui/icons-material/HowToVoteRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import NotificationsActiveRounded from '@mui/icons-material/NotificationsActiveRounded';
import BackHandRounded from '@mui/icons-material/BackHandRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PersonOffRounded from '@mui/icons-material/PersonOffRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import ScreenShareRounded from '@mui/icons-material/ScreenShareRounded';
import StopCircleRounded from '@mui/icons-material/StopCircleRounded';
import StopScreenShareRounded from '@mui/icons-material/StopScreenShareRounded';
import VolumeOffRounded from '@mui/icons-material/VolumeOffRounded';
import { SKIP_REASON_LABELS, answerTypeLabel, displayKeys, nextLabel, promptTitle, skipSummary } from '@/lib/pad/client/format';
import { PadClientError, padFetch, padUpload } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import type { RealtimeState } from '@/lib/pad/client/poll-policy';
import {
  consoleAnnouncement,
  deriveConsoleView,
  groupParticipation,
  groupsFromParticipation,
  historyChipLabel,
  reminderMessage,
  revealSummary,
  type ReminderResult,
  type SummaryItem,
} from '@/lib/pad/client/teacher-view';
import type { AnswerType, HistoryEntry, ParticipationRow, TeacherPrompt, TeacherSnapshot } from '@/lib/pad/client/types';
import { nudgeResultMessage, type NudgeResult } from '@/lib/pad/nudge-message';
import { compressImage } from '@/utils/imageCompression';
import AnswerKeyPicker, { AnswerBars } from './AnswerKeyPicker';
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
    case 'NOT_LATEST_PROMPT':
      return 'Only the newest question can be reopened.';
    case 'KEY_REQUIRED':
      return 'Choose the correct answer, or mark it as a poll, before revealing.';
    case 'INVALID_KEY':
      return 'That is not a valid answer for this question.';
    case 'INVALID_INPUT':
      return err.detail.field === 'label'
        ? 'The question number can be up to 80 characters.'
        : err.detail.field === 'text'
          ? 'The question can be up to 500 characters.'
          : err.detail.field === 'image' || err.detail.field === 'imageUrl'
            ? 'That picture could not be used. Paste it again.'
            : err.detail.field === 'options'
              ? 'Each option can be up to 200 characters.'
              : 'Something in that request was not right. Please try again.';
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

/** What a failed picture upload says, in the upload field itself. */
function pictureUploadMessage(err: unknown): string {
  if (err instanceof PadClientError) {
    if (err.offline) return 'No connection. Paste the picture again when you are back online.';
    if (err.code === 'RATE_LIMITED') return 'This class has 60 pictures already.';
    if (err.code === 'SESSION_NOT_LIVE') return 'This class has ended.';
    if (err.code === 'INVALID_INPUT') return 'Use a PNG, JPEG or WebP picture up to 10 MB.';
  }
  return 'The picture could not be uploaded. Please try again.';
}

/** Seconds left until `untilMs`, ticking once a second while there are any. */
function useSecondsLeft(untilMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!untilMs || untilMs <= Date.now()) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [untilMs]);
  return untilMs ? Math.max(0, Math.ceil((untilMs - now) / 1_000)) : 0;
}

/** Nudging waits a minute between presses, as the database does. */
const NUDGE_INTERVAL_MS = 60_000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/**
 * @param sessionId set in the popped-out window: that session runs straight
 *   away, with no start request (the window has no meeting to start one from).
 */
export default function TeacherConsole({ host, sessionId }: { host: PadHost; sessionId?: string }) {
  const [start, setStart] = useState<StartState>(sessionId ? { kind: 'running', sessionId } : { kind: 'starting' });

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
    if (!sessionId) void startSession();
  }, [sessionId, startSession]);

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
      return <LiveConsole host={host} sessionId={start.sessionId} onStartAgain={sessionId ? undefined : () => startSession()} />;
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

/**
 * Putting the class results on the meeting screen (the /pad/stage page: totals
 * and the breakdown, never names). Only where Teams lets this person share,
 * which means organizers and presenters. It replaces a screen share, so it
 * lives in the console's menu rather than as a big button.
 */
function useStageShare(host: PadHost) {
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

  const toggle = async () => {
    if (!stage) return;
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

  return { allowed: !!stage && allowed, sharing, busy, problem, clearProblem: () => setProblem(null), toggle };
}

function LiveConsole({ host, sessionId, onStartAgain }: { host: PadHost; sessionId: string; onStartAgain?: () => void }) {
  const { snapshot, error, realtime, refresh } = usePadSnapshot<TeacherSnapshot>({ host, sessionId, role: 'teacher' });
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [askType, setAskType] = useStoredState<AnswerType>('pad-ask-type', 'mcq', isAnswerType);
  const [optionCount, setOptionCount] = useStoredState<number>('pad-option-count', 4, isOptionCount);
  const [askLabel, setAskLabel] = useState('');
  const [askText, setAskText] = useState('');
  const [askImage, setAskImage] = useState<string | null>(null);
  const [askOptions, setAskOptions] = useState<string[]>([]);
  const [nudge, setNudge] = useState<{ promptId: string; message: string; until: number | null } | null>(null);
  const [endStep, setEndStep] = useState<null | { unrevealed: { title: string; count: number } | null }>(null);
  const [historyPromptId, setHistoryPromptId] = useState<string | null>(null);
  const [reminder, setReminder] = useState<string | null>(null);
  /** Questions the teacher chose to answer later, so the console moves on to the next one. */
  const [deferred, setDeferred] = useState<ReadonlySet<string>>(() => new Set());
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const share = useStageShare(host);

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

  /** The question's picture: shrunk in the browser (a pasted screenshot is often several MB), then stored for this class. */
  const uploadPicture = useCallback(
    async (file: File) => {
      try {
        const shrunk = await compressImage(file, 1600, 0.85, 'question.jpg');
        const { url } = await padUpload<{ url: string }>(host, `/api/pad/sessions/${sessionId}/image`, shrunk, shrunk.name);
        return { url };
      } catch (err) {
        throw new Error(pictureUploadMessage(err));
      }
    },
    [host, sessionId],
  );

  // The next question's number, suggested from the last one ("38" after "37"),
  // replaced only when a new question is asked or a number is edited.
  const history = snapshot?.history ?? [];
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;
  const lastId = lastEntry?.id ?? null;
  const lastLabel = lastEntry?.label ?? null;
  useEffect(() => setAskLabel(nextLabel(lastLabel)), [lastId, lastLabel]);

  const remind = () =>
    act('remind', async () => {
      setReminder(null);
      const result = await padFetch<ReminderResult>(host, `/api/pad/sessions/${sessionId}/resend`, { method: 'POST' });
      setReminder(reminderMessage(result));
    });

  const ask = () =>
    act('ask', async () => {
      const label = askLabel.trim();
      const text = askText.trim();
      // One entry per option, null where the teacher left it blank; nothing at all when every one is blank.
      const optionTexts = Array.from({ length: optionCount }, (_, index) => askOptions[index]?.trim() || null);
      const withOptions = askType === 'mcq' && optionTexts.some((entry) => entry);
      await post('/api/pad/prompts/ask', {
        sessionId,
        answerType: askType,
        ...(askType === 'mcq' ? { optionCount } : {}),
        ...(label ? { label } : {}),
        ...(text ? { text } : {}),
        ...(askImage ? { imageUrl: askImage } : {}),
        ...(withOptions ? { optionTexts } : {}),
      });
      setAskText('');
      setAskImage(null);
      setAskOptions([]);
    });

  const setPicture = (promptId: string, imageUrl: string | null) =>
    act('picture', () => post(`/api/pad/prompts/${promptId}/picture`, { imageUrl }));

  const nudgeClass = (promptId: string) =>
    act('nudge', async () => {
      try {
        const result = await padFetch<NudgeResult>(host, `/api/pad/prompts/${promptId}/nudge`, { method: 'POST' });
        setNudge({ promptId, message: nudgeResultMessage(result), until: Date.now() + NUDGE_INTERVAL_MS });
      } catch (err) {
        if (err instanceof PadClientError && err.code === 'RATE_LIMITED') {
          const seconds = Number(err.detail.retry_after_seconds) || 60;
          setNudge({ promptId, message: 'You nudged a moment ago.', until: Date.now() + seconds * 1_000 });
          return;
        }
        throw err;
      }
    });

  const saveDetails = (promptId: string, label: string | null, text: string | null) =>
    act('details', () => post(`/api/pad/prompts/${promptId}/details`, { label, text }));

  const setKeys = (promptId: string, keys: string[]) => act('key', () => post(`/api/pad/prompts/${promptId}/key`, { keys }));
  const setPoll = (promptId: string) => act('key', () => post(`/api/pad/prompts/${promptId}/key`, { ungraded: true }));
  const reveal = (promptId: string) => act('reveal', () => post(`/api/pad/prompts/${promptId}/reveal`));

  const endClass = (confirmUnrevealed: boolean) =>
    act('end', async () => {
      try {
        await post(`/api/pad/sessions/${sessionId}/end`, { confirmUnrevealed });
        setEndStep(null);
      } catch (err) {
        if (err instanceof PadClientError && err.code === 'UNREVEALED_PROMPT') {
          const sequence = Number(err.detail.sequence) || 0;
          const label = typeof err.detail.label === 'string' ? err.detail.label : null;
          setEndStep({ unrevealed: { title: promptTitle({ sequence, label }), count: Number(err.detail.count) || 1 } });
          return;
        }
        throw err;
      }
    });

  const popOut = async () => {
    setMenuAnchor(null);
    if (!host.popOut) return;
    try {
      await host.popOut(sessionId);
    } catch {
      setActionError('The pad could not open in its own window. Keep using it here.');
    }
  };

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
  const nextSequence = Math.max(lastEntry?.sequence ?? 0, snapshot.prompt?.sequence ?? 0) + 1;
  const askButton = askLabel.trim() ? `Ask ${promptTitle({ sequence: nextSequence, label: askLabel })}` : `Ask question ${nextSequence}`;
  const anyRevealed = history.some((entry) => entry.state === 'revealed');
  const showShareItem = share.allowed && (anyRevealed || share.sharing);
  const historyPrompt = historyPromptId ? history.find((entry) => entry.id === historyPromptId) ?? null : null;
  // A closed question waits for its answer once a newer one exists or the teacher said Decide later.
  const waiting = (entry: HistoryEntry) => entry.state === 'closed' && (entry.id !== snapshot.prompt?.id || deferred.has(entry.id));

  const askControls = (
    <AskControls
      answerType={askType}
      optionCount={optionCount}
      onAnswerType={setAskType}
      onOptionCount={setOptionCount}
      label={askLabel}
      onLabel={setAskLabel}
      text={askText}
      onText={setAskText}
      image={askImage}
      onImage={setAskImage}
      uploadPicture={uploadPicture}
      options={askOptions}
      onOptions={setAskOptions}
      busy={busy === 'ask'}
      disabled={busy !== null}
      buttonLabel={askButton}
      onAsk={ask}
    />
  );

  return (
    <Stack spacing={2} sx={{ width: '100%' }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={0.5}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" component="h1" fontWeight={800} sx={{ overflowWrap: 'anywhere', lineHeight: 1.3 }}>
            {session.classroom_name ?? 'Answer Pad'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {`Started ${formatTime(session.created_at)}`}
          </Typography>
        </Box>
        {host.popOut && view.kind !== 'ended' && (
          <Tooltip title="Open in its own window">
            <IconButton aria-label="Open the Answer Pad in its own window" onClick={popOut} sx={{ width: 44, height: 44, flexShrink: 0 }}>
              <OpenInNewRounded />
            </IconButton>
          </Tooltip>
        )}
        <IconButton
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={menuAnchor ? true : undefined}
          onClick={(event: MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget)}
          sx={{ width: 44, height: 44, flexShrink: 0 }}
        >
          <MoreVertRounded />
        </IconButton>
        {view.kind !== 'ended' && (
          <Button color="error" size="small" onClick={() => setEndStep({ unrevealed: null })} disabled={busy !== null} sx={{ minHeight: 44, flexShrink: 0 }}>
            End class
          </Button>
        )}
      </Stack>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        {showShareItem && (
          <MenuItem
            disabled={share.busy}
            onClick={() => {
              setMenuAnchor(null);
              void share.toggle();
            }}
            sx={{ minHeight: 48, whiteSpace: 'normal' }}
          >
            <ListItemIcon>{share.sharing ? <StopScreenShareRounded /> : <ScreenShareRounded />}</ListItemIcon>
            <ListItemText
              primary={share.sharing ? 'Stop showing results on the meeting screen' : 'Show results on the meeting screen'}
              secondary={share.sharing ? null : 'This replaces your screen share'}
            />
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setHelpOpen(true);
          }}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon>
            <HelpOutlineRounded />
          </ListItemIcon>
          <ListItemText primary="Using one screen?" />
        </MenuItem>
      </Menu>

      {helpOpen && <OneScreenHelp canPopOut={!!host.popOut} onPopOut={popOut} onClose={() => setHelpOpen(false)} />}

      {share.sharing && (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={() => void share.toggle()} disabled={share.busy} sx={{ minHeight: 44 }}>
              Stop
            </Button>
          }
        >
          The results are on the meeting screen.
        </Alert>
      )}
      {share.problem && (
        <Alert severity="warning" onClose={share.clearProblem}>
          {share.problem}
        </Alert>
      )}

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
          {endStep.unrevealed === null
            ? 'End the Answer Pad for this class?'
            : endStep.unrevealed.count > 1
              ? `${endStep.unrevealed.count} questions have no answer yet, starting with ${endStep.unrevealed.title}. You can set them later from the class report, and scores update then.`
              : `${endStep.unrevealed.title} has no answer yet. You can set it later from the class report, and scores update then.`}
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
            {askControls}
          </Stack>
        )}

        {view.kind === 'open' && (
          <OpenPanel
            prompt={view.prompt}
            answered={view.answered}
            enrolled={view.enrolled}
            offRoster={view.offRoster}
            busy={busy === 'close'}
            disabled={busy !== null}
            onClose={() => act('close', () => post(`/api/pad/prompts/${view.prompt.id}/close`))}
            onDetails={(label, text) => saveDetails(view.prompt.id, label, text)}
            skips={snapshot.skips}
            lastNudgedAt={view.prompt.last_nudged_at}
            serverTime={snapshot.server_time}
            nudge={nudge?.promptId === view.prompt.id ? nudge : null}
            nudging={busy === 'nudge'}
            onNudge={() => nudgeClass(view.prompt.id)}
            uploadPicture={uploadPicture}
            onPicture={(imageUrl) => setPicture(view.prompt.id, imageUrl)}
            canRemind={snapshot.session.bot_in_meeting}
            reminding={busy === 'remind'}
            reminder={reminder}
            onRemind={remind}
          />
        )}

        {view.kind === 'closed' &&
          (deferred.has(view.prompt.id) ? (
            <Stack spacing={2}>
              <Alert
                severity="info"
                icon={<ScheduleRounded />}
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => setDeferred((current) => new Set([...current].filter((id) => id !== view.prompt.id)))}
                    sx={{ minHeight: 44 }}
                  >
                    Set it now
                  </Button>
                }
              >
                {`${promptTitle(view.prompt)} is waiting for its answer. Set it from Questions so far, or from the class report after class.`}
              </Alert>
              {askControls}
            </Stack>
          ) : (
            <ClosedPanel
              prompt={view.prompt}
              groups={snapshot.groups}
              busy={busy}
              onReopen={() => act('reopen', () => post(`/api/pad/prompts/${view.prompt.id}/reopen`))}
              onDetails={(label, text) => saveDetails(view.prompt.id, label, text)}
              onKeys={(keys) => setKeys(view.prompt.id, keys)}
              onPoll={() => setPoll(view.prompt.id)}
              onReveal={() => reveal(view.prompt.id)}
              onDecideLater={() => setDeferred((current) => new Set([...current, view.prompt.id]))}
            />
          ))}

        {view.kind === 'revealed' && (
          <Stack spacing={2.5}>
            <RevealedPanel
              host={host}
              prompt={view.prompt}
              snapshot={snapshot}
              busy={busy !== null}
              onDetails={(label, text) => saveDetails(view.prompt.id, label, text)}
            />
            <Divider />
            {askControls}
          </Stack>
        )}
      </Box>

      {history.length > 1 && (
        <Stack spacing={1}>
          <Typography variant="caption" color="text.secondary" component="h2">
            Questions so far
          </Typography>
          <Box component="nav" aria-label="Questions so far" sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
            {history.map((entry) => {
              const current = entry.id === snapshot.prompt?.id && !waiting(entry);
              const openable = !current && (entry.state === 'revealed' || waiting(entry));
              return (
                <Chip
                  key={entry.id}
                  label={historyChipLabel(entry, waiting(entry))}
                  icon={waiting(entry) ? <ScheduleRounded /> : undefined}
                  variant={current || entry.id === historyPromptId ? 'filled' : 'outlined'}
                  color={current ? 'primary' : waiting(entry) ? 'warning' : 'default'}
                  onClick={openable ? () => setHistoryPromptId(entry.id === historyPromptId ? null : entry.id) : undefined}
                  sx={{ minHeight: 36, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
                />
              );
            })}
          </Box>
          {historyPrompt && (historyPrompt.state === 'revealed' || waiting(historyPrompt)) && (
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" component="h3" fontWeight={700} gutterBottom>
                {waiting(historyPrompt) ? `Set the answer for ${promptTitle(historyPrompt)}` : promptTitle(historyPrompt)}
              </Typography>
              {historyPrompt.state === 'revealed' ? (
                <ParticipationDetails host={host} promptId={historyPrompt.id} ungraded={historyPrompt.ungraded} startOpen />
              ) : (
                <LaterKeyPanel
                  host={host}
                  entry={historyPrompt}
                  busy={busy}
                  onKeys={(keys) => setKeys(historyPrompt.id, keys)}
                  onPoll={() => setPoll(historyPrompt.id)}
                  onReveal={() => reveal(historyPrompt.id)}
                />
              )}
            </Paper>
          )}
        </Stack>
      )}
    </Stack>
  );
}

/**
 * For a teacher on one monitor. Sharing a window rather than the screen keeps
 * the pad private, and Pop out gives it a window of its own to sit beside the
 * question.
 */
function OneScreenHelp({ canPopOut, onPopOut, onClose }: { canPopOut: boolean; onPopOut: () => void; onClose: () => void }) {
  return (
    <Alert severity="info" icon={<HelpOutlineRounded />} onClose={onClose}>
      <Stack spacing={1}>
        <Typography variant="body2" fontWeight={700}>
          Using one screen?
        </Typography>
        <Typography variant="body2">
          In Teams, choose Share, then Window, and pick the window with your question, such as the PDF. Students see only that
          window, never this pad.
        </Typography>
        {canPopOut && (
          <>
            <Typography variant="body2">Pop out puts this pad in its own window, so you can place it beside the question.</Typography>
            <Button variant="outlined" size="small" startIcon={<OpenInNewRounded />} onClick={onPopOut} sx={{ minHeight: 44, alignSelf: 'flex-start' }}>
              Pop out
            </Button>
          </>
        )}
      </Stack>
    </Alert>
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
  label,
  onLabel,
  text,
  onText,
  image,
  onImage,
  uploadPicture,
  options,
  onOptions,
  busy,
  disabled,
  buttonLabel,
  onAsk,
}: {
  answerType: AnswerType;
  optionCount: number;
  onAnswerType: (type: AnswerType) => void;
  onOptionCount: (count: number) => void;
  /** The paper's question number, so every screen says Q.38. */
  label: string;
  onLabel: (label: string) => void;
  /** The question itself, typed or dictated. Optional. */
  text: string;
  onText: (text: string) => void;
  /** A picture of the question, usually a snip of the paper. Optional. */
  image: string | null;
  onImage: (url: string | null) => void;
  uploadPicture: (file: File) => Promise<{ url: string }>;
  /** Multiple choice only: text for each option, blank where the letter is enough. */
  options: string[];
  onOptions: (options: string[]) => void;
  busy: boolean;
  disabled: boolean;
  buttonLabel: string;
  onAsk: () => void;
}) {
  const [showOptions, setShowOptions] = useState(options.some((entry) => entry.trim()));
  const letters = 'ABCDEF'.slice(0, optionCount).split('');
  const setOption = (index: number, value: string) => {
    const next = Array.from({ length: Math.max(optionCount, options.length) }, (_, i) => options[i] ?? '');
    next[index] = value;
    onOptions(next);
  };

  return (
    <Stack spacing={1.5}>
      <TextField
        size="small"
        label="Question no."
        placeholder="e.g. 38"
        value={label}
        onChange={(event) => onLabel(event.target.value)}
        inputProps={{ maxLength: 80, autoComplete: 'off' }}
        helperText="As printed on the paper, so students know which question this is."
      />
      <TextField
        size="small"
        label="Question (optional)"
        value={text}
        onChange={(event) => onText(event.target.value)}
        multiline
        minRows={1}
        maxRows={5}
        inputProps={{ maxLength: 500 }}
        helperText="Tip: press Windows + H to type by voice."
      />
      <ImageUploadField
        label="Picture (optional)"
        helperText="Win + Shift + S to snip the question, then Ctrl + V here."
        value={image}
        onChange={onImage}
        upload={uploadPicture}
        enableGlobalPaste
        previewable
        height={96}
        disabled={disabled}
      />

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
          <IconButton aria-label="Fewer answer options" onClick={() => onOptionCount(Math.max(2, optionCount - 1))} disabled={optionCount <= 2} sx={{ width: 44, height: 44 }}>
            <RemoveRounded />
          </IconButton>
          <Typography sx={{ minWidth: 88, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{`${optionCount} options`}</Typography>
          <IconButton aria-label="More answer options" onClick={() => onOptionCount(Math.min(6, optionCount + 1))} disabled={optionCount >= 6} sx={{ width: 44, height: 44 }}>
            <AddRounded />
          </IconButton>
        </Stack>
      )}

      {answerType === 'mcq' && (
        <Stack spacing={1}>
          <Button
            variant="text"
            size="small"
            onClick={() => setShowOptions(!showOptions)}
            aria-expanded={showOptions}
            endIcon={<ExpandMoreRounded sx={{ transform: showOptions ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />}
            sx={{ minHeight: 44, alignSelf: 'flex-start' }}
          >
            {showOptions ? 'Hide option text' : 'Add option text (optional)'}
          </Button>
          <Collapse in={showOptions} unmountOnExit>
            <Stack spacing={1}>
              {letters.map((letter, index) => (
                <TextField
                  key={letter}
                  size="small"
                  label={`Option ${letter}`}
                  value={options[index] ?? ''}
                  onChange={(event) => setOption(index, event.target.value)}
                  inputProps={{ maxLength: 200 }}
                />
              ))}
            </Stack>
          </Collapse>
        </Stack>
      )}

      <Button
        variant="contained"
        size="large"
        onClick={onAsk}
        disabled={disabled}
        startIcon={busy ? <CircularProgress size={22} color="inherit" aria-hidden /> : <CampaignRounded />}
        sx={{ minHeight: 64, fontSize: '1.25rem', fontWeight: 800, touchAction: 'manipulation', overflowWrap: 'anywhere' }}
      >
        {buttonLabel}
      </Button>
    </Stack>
  );
}

/** Edits the question number and text after the ASK, both together, as the teacher last saw them. */
function DetailsEditor({
  prompt,
  busy,
  onSave,
  onDone,
}: {
  prompt: Pick<TeacherPrompt, 'label' | 'question_text'>;
  busy: boolean;
  onSave: (label: string | null, text: string | null) => void;
  onDone: () => void;
}) {
  const [label, setLabel] = useState(prompt.label ?? '');
  const [text, setText] = useState(prompt.question_text ?? '');
  const unchanged = label.trim() === (prompt.label ?? '') && text.trim() === (prompt.question_text ?? '');

  return (
    <Stack
      component="form"
      spacing={1.25}
      sx={{ width: '100%' }}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSave(label.trim() || null, text.trim() || null);
        onDone();
      }}
    >
      <TextField size="small" label="Question no." value={label} onChange={(event) => setLabel(event.target.value)} inputProps={{ maxLength: 80, autoComplete: 'off' }} autoFocus />
      <TextField size="small" label="Question (optional)" value={text} onChange={(event) => setText(event.target.value)} multiline minRows={1} maxRows={5} inputProps={{ maxLength: 500 }} />
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button onClick={onDone} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={busy || unchanged} sx={{ minHeight: 44 }}>
          Save
        </Button>
      </Stack>
    </Stack>
  );
}

/** A question's name, its text when there is one, and the pencil that edits both. */
function QuestionHeading({
  prompt,
  suffix,
  busy,
  onDetails,
  action,
}: {
  prompt: Pick<TeacherPrompt, 'sequence' | 'label' | 'question_text'>;
  suffix: string;
  busy: boolean;
  onDetails: (label: string | null, text: string | null) => void;
  action?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <Stack spacing={1}>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Typography variant="subtitle1" component="h2" fontWeight={800} sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          {`${promptTitle(prompt)} ${suffix}`}
        </Typography>
        <IconButton aria-label="Edit question number and text" aria-expanded={editing} onClick={() => setEditing(!editing)} sx={{ width: 44, height: 44 }}>
          <EditRounded fontSize="small" />
        </IconButton>
        {action}
      </Stack>
      {editing ? (
        <DetailsEditor prompt={prompt} busy={busy} onSave={onDetails} onDone={() => setEditing(false)} />
      ) : (
        prompt.question_text && (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {prompt.question_text}
          </Typography>
        )
      )}
    </Stack>
  );
}

function OpenPanel({
  prompt,
  answered,
  enrolled,
  offRoster,
  busy,
  disabled,
  onClose,
  onDetails,
  skips,
  lastNudgedAt,
  serverTime,
  nudge,
  nudging,
  onNudge,
  uploadPicture,
  onPicture,
  canRemind,
  reminding,
  reminder,
  onRemind,
}: {
  prompt: TeacherPrompt;
  answered: number;
  enrolled: number;
  offRoster: number;
  busy: boolean;
  disabled: boolean;
  onClose: () => void;
  onDetails: (label: string | null, text: string | null) => void;
  /** Who said why they cannot answer: counts only, never who. */
  skips: TeacherSnapshot['skips'];
  lastNudgedAt: string | null;
  serverTime: string;
  nudge: { message: string; until: number | null } | null;
  nudging: boolean;
  onNudge: () => void;
  uploadPicture: (file: File) => Promise<{ url: string }>;
  onPicture: (imageUrl: string | null) => void;
  /** Only with the bot in the meeting: it is the bot that sends the reminder. */
  canRemind: boolean;
  reminding: boolean;
  reminder: string | null;
  onRemind: () => void;
}) {
  const [editing, setEditing] = useState(false);
  // The minute between nudges, from this console's press or from the server's
  // record (another console, or before a reload), measured on the server's clock.
  const serverLimit = lastNudgedAt ? Date.now() + (Date.parse(lastNudgedAt) + NUDGE_INTERVAL_MS - Date.parse(serverTime)) : null;
  const secondsLeft = useSecondsLeft(Math.max(nudge?.until ?? 0, serverLimit ?? 0) || null);
  const waiting = Math.max(0, enrolled - answered - (skips?.total ?? 0));
  const summary = skipSummary(skips);
  return (
    <Stack alignItems="center" spacing={1.5}>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Chip color="success" label={`${promptTitle(prompt)} is open`} />
        <IconButton aria-label="Edit question number and text" aria-expanded={editing} onClick={() => setEditing(!editing)} sx={{ width: 44, height: 44 }}>
          <EditRounded fontSize="small" />
        </IconButton>
      </Stack>
      {editing ? (
        <DetailsEditor prompt={prompt} busy={disabled} onSave={onDetails} onDone={() => setEditing(false)} />
      ) : (
        prompt.question_text && (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', textAlign: 'center' }}>
            {prompt.question_text}
          </Typography>
        )
      )}
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
      {summary && (
        <Typography variant="body2" sx={{ textAlign: 'center', fontWeight: 600 }}>
          {summary}
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
      {waiting > 0 && (
        <Button
          fullWidth
          variant="outlined"
          onClick={onNudge}
          disabled={disabled || secondsLeft > 0}
          startIcon={nudging ? <CircularProgress size={18} color="inherit" aria-hidden /> : <BackHandRounded />}
          sx={{ minHeight: 48, fontWeight: 700 }}
        >
          {secondsLeft > 0 ? `Nudge again in ${secondsLeft}s` : `Nudge the ${waiting} who haven't answered`}
        </Button>
      )}
      {nudge && (
        <Typography variant="body2" color="text.secondary" role="status" sx={{ textAlign: 'center' }}>
          {nudge.message}
        </Typography>
      )}
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
      <Box sx={{ width: '100%' }}>
        <ImageUploadField
          label={prompt.image_url ? 'Picture' : 'Add a picture'}
          helperText="Win + Shift + S, then Ctrl + V. Students see it on their pad."
          value={prompt.image_url}
          onChange={onPicture}
          upload={uploadPicture}
          enableGlobalPaste
          previewable
          dense
          height={96}
          disabled={disabled}
        />
      </Box>
    </Stack>
  );
}

function ClosedPanel({
  prompt,
  groups,
  busy,
  onReopen,
  onDetails,
  onKeys,
  onPoll,
  onReveal,
  onDecideLater,
}: {
  prompt: TeacherPrompt;
  groups: Array<{ value: string; count: number }>;
  busy: string | null;
  onReopen: () => void;
  onDetails: (label: string | null, text: string | null) => void;
  onKeys: (keys: string[]) => void;
  onPoll: () => void;
  onReveal: () => void;
  onDecideLater: () => void;
}) {
  return (
    <Stack spacing={2}>
      <QuestionHeading
        prompt={prompt}
        suffix="closed"
        busy={busy !== null}
        onDetails={onDetails}
        action={
          <Button size="small" startIcon={<ReplayRounded />} onClick={onReopen} disabled={busy !== null} sx={{ minHeight: 44, flexShrink: 0 }}>
            Reopen
          </Button>
        }
      />

      <AnswerBars prompt={prompt} groups={groups} />

      <AnswerKeyPicker prompt={prompt} groups={groups} busy={busy} onKeys={onKeys} onPoll={onPoll} onReveal={onReveal} />

      <Button fullWidth variant="outlined" startIcon={<ScheduleRounded />} onClick={onDecideLater} disabled={busy !== null} sx={{ minHeight: 48, fontWeight: 700 }}>
        Decide later, ask the next question
      </Button>
      <Typography variant="caption" color="text.secondary">
        Not sure yet? Check it after class and set it from the class report. Scores update then.
      </Typography>
    </Stack>
  );
}

/**
 * The key picker for a question left for later. Its answers come from the
 * named rows (allowed once a question is closed), counted the way the
 * snapshot counts them.
 */
function LaterKeyPanel({
  host,
  entry,
  busy,
  onKeys,
  onPoll,
  onReveal,
}: {
  host: PadHost;
  entry: HistoryEntry;
  busy: string | null;
  onKeys: (keys: string[]) => void;
  onPoll: () => void;
  onReveal: () => void;
}) {
  const [groups, setGroups] = useState<Array<{ value: string; count: number }> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setGroups(null);
    setFailed(false);
    padFetch<{ rows: ParticipationRow[] }>(host, `/api/pad/prompts/${entry.id}/participation`)
      .then((data) => active && setGroups(groupsFromParticipation(data.rows)))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [host, entry.id]);

  if (failed) return <Alert severity="warning">The answers could not load. Try again in a moment.</Alert>;
  if (!groups) return <CircularProgress size={24} aria-label="Loading the answers" />;

  return (
    <Stack spacing={2}>
      <AnswerBars prompt={entry} groups={groups} />
      <AnswerKeyPicker prompt={entry} groups={groups} busy={busy} onKeys={onKeys} onPoll={onPoll} onReveal={onReveal} />
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
  busy,
  onDetails,
}: {
  host: PadHost;
  prompt: TeacherPrompt;
  snapshot: TeacherSnapshot;
  busy: boolean;
  onDetails: (label: string | null, text: string | null) => void;
}) {
  const theme = useTheme();

  const tone: Record<SummaryItem['key'], string> = {
    correct: theme.palette.success.main,
    incorrect: theme.palette.error.main,
    answered: theme.palette.primary.main,
    silent: theme.palette.warning.dark,
    absent: theme.palette.text.secondary,
  };

  return (
    <Stack spacing={2}>
      <QuestionHeading prompt={prompt} suffix="revealed" busy={busy} onDetails={onDetails} />
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

      <ParticipationDetails host={host} promptId={prompt.id} ungraded={prompt.ungraded} startOpen={false} />
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
                    {row.skip_reason && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color="warning"
                        label={`Said: ${SKIP_REASON_LABELS[row.skip_reason]}${row.skip_note ? `, ${row.skip_note}` : ''}`}
                        sx={{ maxWidth: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.25 } }}
                      />
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

function EndedPanel({ snapshot, onStartAgain }: { snapshot: TeacherSnapshot; onStartAgain?: () => void }) {
  const asked = snapshot.history.length;
  const waitingCount = snapshot.history.filter((entry) => entry.state !== 'revealed').length;
  return (
    <Stack spacing={2}>
      <Alert severity="success">{asked === 0 ? 'Class ended. No questions were asked.' : `Class ended after ${asked} question${asked === 1 ? '' : 's'}.`}</Alert>
      {waitingCount > 0 && (
        <Alert severity="info" icon={<ScheduleRounded />}>
          {`${waitingCount} question${waitingCount === 1 ? ' is' : 's are'} waiting for an answer. Set ${waitingCount === 1 ? 'it' : 'them'} from the class report.`}
        </Alert>
      )}
      <Button variant="contained" href={`/teacher/answer-pad/sessions/${snapshot.session.id}`} target="_blank" rel="noopener noreferrer" sx={{ minHeight: 48 }}>
        Open the class report
      </Button>
      {onStartAgain && (
        <Button variant="text" onClick={onStartAgain} sx={{ minHeight: 44 }}>
          Start a new session
        </Button>
      )}
    </Stack>
  );
}
