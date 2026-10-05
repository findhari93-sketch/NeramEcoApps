'use client';

/**
 * The teacher's Answer Pad console, sized for the Teams meeting side panel
 * (about 300px wide) and usable up to a laptop, or in its own window (Pop out).
 *
 * Three parts, like a Teams chat: a header that stays at the top (the class,
 * the round, who is here, one menu), the question on screen, and the Ask bar
 * that stays at the bottom, so the next question is always one paste and one
 * tap away. One main action at a time: ASK, then CLOSE, then choose the key and
 * REVEAL. The key can also wait: asking the next question leaves a closed one
 * waiting, and its answer is set from Questions so far or from the class report. While students are answering the console shows a
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
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
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
import MoreTimeRounded from '@mui/icons-material/MoreTimeRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PersonOffRounded from '@mui/icons-material/PersonOffRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import ScreenShareRounded from '@mui/icons-material/ScreenShareRounded';
import StopCircleRounded from '@mui/icons-material/StopCircleRounded';
import StopScreenShareRounded from '@mui/icons-material/StopScreenShareRounded';
import VolumeOffRounded from '@mui/icons-material/VolumeOffRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import HowToRegRounded from '@mui/icons-material/HowToRegRounded';
import PostAddRounded from '@mui/icons-material/PostAddRounded';
import ContentPasteRounded from '@mui/icons-material/ContentPasteRounded';
import StudentAvatar from '@/components/students/StudentAvatar';
import { PAD_PROBLEM_LABEL, answerTypeLabel, displayKeys, nextLabel, promptTitle, qbPreview, reasonLabel } from '@/lib/pad/client/format';
import { PadClientError, padFetch, padUpload } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import { clockLabel, secondsLeft, useServerNow } from '@/lib/pad/client/server-clock';
import {
  classFunnel,
  consoleAnnouncement,
  consoleStatus,
  consoleTitle,
  deriveConsoleView,
  groupParticipation,
  groupsFromParticipation,
  historyChipLabel,
  reminderMessage,
  revealSummary,
  roundTitle,
  type ClassFunnel,
  type FunnelGroup,
  type ReminderResult,
  type SummaryItem,
} from '@/lib/pad/client/teacher-view';
import type { AnswerType, HistoryEntry, ParticipationRow, TeacherPrompt, TeacherSnapshot } from '@/lib/pad/client/types';
import { nudgeResultMessage, type NudgeResult } from '@/lib/pad/nudge-message';
import { compressImage } from '@/utils/imageCompression';
import AnswerKeyPicker, { AnswerBars } from './AnswerKeyPicker';
import AskBar from './AskBar';
import ClassDetailsSheet, { RoomCode } from './ClassDetailsSheet';
import ClassStrip from './ClassStrip';
import ConsoleHeader from './ConsoleHeader';
import LiveAnnouncement from './LiveAnnouncement';
import OptionNames from './OptionNames';
import PadCountdown from './PadCountdown';
import PresenterBanner from './PresenterBanner';
import RoundResults from './RoundResults';
import { usePadSnapshot } from './usePadSnapshot';
import PadStageFactsProvider from './PadStageFactsProvider';
import PeopleSheet from './PeopleSheet';

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

/** What the picture route takes; anything else is re-encoded as JPEG on the way. */
const UPLOADABLE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const UNREADABLE_PICTURE = 'This picture type can’t be used. Snip it again or save it as PNG.';

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

/** What one press of +15s adds to a timed question. */
const ADD_SECONDS = 15;

/** The question's own text, or a question bank question's text as one plain line (no KaTeX in the console). */
function questionLine(prompt: Pick<TeacherPrompt, 'question_text' | 'qb'>): string | null {
  return prompt.question_text ?? (qbPreview(prompt.qb?.text) || null);
}

/** "+15s": more time for a timed question. */
function AddTimeButton({ onClick, busy, disabled }: { onClick: () => void; busy: boolean; disabled: boolean }) {
  return (
    <Button
      variant="outlined"
      size="small"
      onClick={onClick}
      disabled={disabled}
      aria-label="Add 15 seconds"
      startIcon={busy ? <CircularProgress size={16} color="inherit" aria-hidden /> : <MoreTimeRounded />}
      sx={{ minHeight: 48, minWidth: 72, fontWeight: 800, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
    >
      +15s
    </Button>
  );
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
        // The meeting's own title names a class that is not on the timetable. Never waited on for long.
        const meetingTitle = host.meetingTitle ? await host.meetingTitle().catch(() => null) : null;
        const result = await padFetch<StartResponse>(host, '/api/pad/sessions', {
          method: 'POST',
          body: { meeting: host.meeting, ...(meetingTitle ? { meetingTitle } : {}), ...extra },
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
      return (
        <PadStageFactsProvider host={host}>
          <LiveConsole
            key={start.sessionId}
            host={host}
            sessionId={start.sessionId}
            onRound={(next) => setStart({ kind: 'running', sessionId: next })}
          />
        </PadStageFactsProvider>
      );
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

/**
 * The running round: a header that stays at the top, the question on screen,
 * and the Ask bar that stays at the bottom (or beside it in a wide window).
 *
 * @param onRound switches the console to another round (Start Round 2). The
 *   next round keeps the meeting, the class and the room code.
 */
function LiveConsole({ host, sessionId, onRound }: { host: PadHost; sessionId: string; onRound: (sessionId: string) => void }) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  /** The People sheet: closed (null), or open on a chip (or the console's best guess). */
  const [people, setPeople] = useState<{ group: FunnelGroup | null } | null>(null);
  /** A picture pasted for the next question while one is open: the teacher may want it on the open one. */
  const [pasted, setPasted] = useState<{ url: string; promptId: string; title: string } | null>(null);
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
  useEffect(() => {
    setReminder(null);
  }, [currentPromptId]);

  // The minute between nudges, from this console's press or from the server's
  // record (another console, or before a reload), measured on the server's clock.
  const lastNudgedAt = snapshot?.prompt?.state === 'open' ? snapshot.prompt.last_nudged_at : null;
  const serverNudgeLimit =
    lastNudgedAt && snapshot ? Date.now() + (Date.parse(lastNudgedAt) + NUDGE_INTERVAL_MS - Date.parse(snapshot.server_time)) : null;
  const nudgeSeconds = useSecondsLeft(Math.max(nudge?.promptId === currentPromptId ? (nudge.until ?? 0) : 0, serverNudgeLimit ?? 0) || null);

  /** The question's picture: shrunk in the browser (a pasted screenshot is often several MB), then stored for this class. */
  const uploadPicture = useCallback(
    async (file: File) => {
      let shrunk: File;
      try {
        shrunk = await compressImage(file, 1600, 0.85, 'question.jpg');
      } catch {
        // The browser could not read it (a HEIC photo, a damaged file).
        throw new Error(UNREADABLE_PICTURE);
      }
      if (!UPLOADABLE_TYPES.has(shrunk.type)) throw new Error(UNREADABLE_PICTURE);
      try {
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

  /** @param closePromptId the question open now, closed first in the same call ("Close Q.31 and ask Q.32"). */
  const ask = (closePromptId?: string) =>
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
        ...(closePromptId ? { closePromptId } : {}),
      });
      setAskText('');
      setAskImage(null);
      setAskOptions([]);
      setPasted(null);
    });

  const setPicture = (promptId: string, imageUrl: string | null) =>
    act('picture', () => post(`/api/pad/prompts/${promptId}/picture`, { imageUrl }));

  const rename = (title: string | null) => act('rename', () => post(`/api/pad/sessions/${sessionId}/title`, { title }));

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

  /** Accept (excuse), turn down, or undo "I can't answer" reasons. */
  const decideReasons = (promptId: string, studentIds: string[], approve: boolean | null) =>
    act('excuse', () => post(`/api/pad/prompts/${promptId}/excuse`, { studentIds, approve }));

  /** "Can't use the pad" for the rest of the round, or Undo. */
  const cantUsePad = (studentId: string, on: boolean) =>
    act('cant-use-pad', () => post(`/api/pad/sessions/${sessionId}/cant-use-pad`, { studentId, on }));

  const nextRound = () =>
    act('next-round', async () => {
      const next = await padFetch<{ sessionId: string }>(host, `/api/pad/sessions/${sessionId}/next-round`, { method: 'POST', body: {} });
      if (next.sessionId && next.sessionId !== sessionId) onRound(next.sessionId);
    });

  const setKeys = (promptId: string, keys: string[]) => act('key', () => post(`/api/pad/prompts/${promptId}/key`, { keys }));
  /** +15s on a timed question; on the newest question whose time was up, it reopens it with 15 seconds. */
  const addTime = (promptId: string) => act('timer', () => post(`/api/pad/prompts/${promptId}/timer`, { addSeconds: ADD_SECONDS }));
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
  const funnel = classFunnel(snapshot);
  const openPeople = (group: FunnelGroup | null = null) => setPeople({ group });
  const nextSequence = Math.max(lastEntry?.sequence ?? 0, snapshot.prompt?.sequence ?? 0) + 1;
  const nextTitle = askLabel.trim() ? promptTitle({ sequence: nextSequence, label: askLabel }) : `Q.${nextSequence}`;
  const askButton = askLabel.trim() ? `Ask ${nextTitle}` : `Ask question ${nextSequence}`;
  const anyRevealed = history.some((entry) => entry.state === 'revealed');
  const showShareItem = share.allowed && (anyRevealed || share.sharing);
  const historyPrompt = historyPromptId ? history.find((entry) => entry.id === historyPromptId) ?? null : null;
  // A closed question waits for its answer once a newer one has been asked.
  const waiting = (entry: HistoryEntry) => entry.state === 'closed' && entry.id !== snapshot.prompt?.id;
  const ended = view.kind === 'ended';

  // The Ask bar's words and weight follow the question on screen: one main action per state.
  const askBar = ended ? null : (
    <AskBar
      label={askLabel}
      onLabel={setAskLabel}
      answerType={askType}
      onAnswerType={setAskType}
      optionCount={optionCount}
      onOptionCount={setOptionCount}
      text={askText}
      onText={setAskText}
      image={askImage}
      onImage={(url) => {
        setAskImage(url);
        if (!url) setPasted(null);
      }}
      options={askOptions}
      onOptions={setAskOptions}
      uploadPicture={uploadPicture}
      questionTitle={nextTitle}
      busy={busy === 'ask'}
      disabled={busy !== null}
      emphasis={view.kind === 'open' || view.kind === 'closed' ? 'secondary' : 'primary'}
      note={
        view.kind === 'open'
          ? `Asking closes ${promptTitle(view.prompt)} first.`
          : view.kind === 'closed'
            ? `${promptTitle(view.prompt)} will wait for its answer. Set it later from Questions so far or the report.`
            : null
      }
      buttonLabel={view.kind === 'open' ? `Close ${promptTitle(view.prompt)} and ask ${nextTitle}` : askButton}
      onAsk={() => ask(view.kind === 'open' ? view.prompt.id : undefined)}
      onPasted={(url) => {
        if (view.kind === 'open') setPasted({ url, promptId: view.prompt.id, title: promptTitle(view.prompt) });
      }}
    />
  );

  const body = (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      {!ended && <PresenterBanner host={host} sessionId={sessionId} />}

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
        <Alert severity="warning" role="alertdialog" aria-label={`End ${roundTitle(session.round_no)}`}>
          <Stack spacing={1}>
            <span>
              {endStep.unrevealed !== null
                ? endStep.unrevealed.count > 1
                  ? `${endStep.unrevealed.count} questions have no answer yet, starting with ${endStep.unrevealed.title}. They won't count until you set them from the report, and scores update then.`
                  : `${endStep.unrevealed.title} has no answer yet. It won't count until you set it from the report, and scores update then.`
                : history.length === 0
                  ? `No questions yet. End ${roundTitle(session.round_no)} anyway?`
                  : `End ${roundTitle(session.round_no)}? The meeting carries on, students keep their answers, and you can start the next round here.`}
            </span>
            {/* Under the words, not beside them: two buttons beside a sentence leave it a column at 320px. */}
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" color="inherit" size="small" onClick={() => endClass(endStep.unrevealed !== null)} disabled={busy !== null} sx={{ minHeight: 44 }}>
                {endStep.unrevealed !== null || history.length === 0 ? 'End anyway' : 'End round'}
              </Button>
              <Button color="inherit" size="small" onClick={() => setEndStep(null)} sx={{ minHeight: 44 }}>
                Keep going
              </Button>
            </Stack>
          </Stack>
        </Alert>
      )}

      {actionError && (
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}
      {error?.offline && <Alert severity="warning">No connection. Reconnecting now.</Alert>}

      <LiveAnnouncement message={consoleAnnouncement(view)} />

      {view.kind === 'ended' && (
        <RoundResults
          host={host}
          sessionId={sessionId}
          share={{ allowed: share.allowed, sharing: share.sharing, busy: share.busy, toggle: () => void share.toggle() }}
          onNextRound={nextRound}
          nextRoundBusy={busy === 'next-round'}
        />
      )}

      {view.kind === 'ready' && <ReadyPanel snapshot={snapshot} funnel={funnel} onPeople={() => openPeople()} onDetails={() => setDetailsOpen(true)} />}

      {view.kind === 'open' && (
        <Stack spacing={2}>
          <OpenPanel
            prompt={view.prompt}
            answered={view.answered}
            total={view.enrolled}
            offRoster={view.offRoster}
            funnel={funnel}
            onPeople={openPeople}
            serverTime={snapshot.server_time}
            busy={busy === 'close'}
            disabled={busy !== null}
            onClose={() => act('close', () => post(`/api/pad/prompts/${view.prompt.id}/close`))}
            onAddTime={() => addTime(view.prompt.id)}
            addingTime={busy === 'timer'}
            onDetails={(label, text) => saveDetails(view.prompt.id, label, text)}
            onRemovePicture={() => setPicture(view.prompt.id, null)}
          />
        </Stack>
      )}

      {view.kind === 'closed' && (
        <Stack spacing={2}>
          <ClosedPanel
            host={host}
            prompt={view.prompt}
            groups={snapshot.groups}
            refreshKey={snapshot.server_time}
            serverTime={snapshot.server_time}
            busy={busy}
            onAddTime={() => addTime(view.prompt.id)}
            onReopen={() => act('reopen', () => post(`/api/pad/prompts/${view.prompt.id}/reopen`))}
            onDetails={(label, text) => saveDetails(view.prompt.id, label, text)}
            onKeys={(keys) => setKeys(view.prompt.id, keys)}
            onPoll={() => setPoll(view.prompt.id)}
            onReveal={() => reveal(view.prompt.id)}
          />
          <ReasonsWaiting funnel={funnel} onPeople={openPeople} />
        </Stack>
      )}

      {view.kind === 'revealed' && (
        <RevealedPanel
          host={host}
          prompt={view.prompt}
          snapshot={snapshot}
          busy={busy}
          onDetails={(label, text) => saveDetails(view.prompt.id, label, text)}
          onKeys={(keys) => setKeys(view.prompt.id, keys)}
          onPoll={() => setPoll(view.prompt.id)}
        />
      )}

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
                  suggestedKeys={historyPrompt.suggested_keys ?? (snapshot.prompt?.id === historyPrompt.id ? (snapshot.prompt.suggested_keys ?? null) : null)}
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

      {!ended && history.length > 0 && !endStep && (
        <Button
          variant="text"
          color="inherit"
          startIcon={<StopCircleRounded />}
          onClick={() => setEndStep({ unrevealed: null })}
          disabled={busy !== null}
          sx={{ alignSelf: 'flex-start', minHeight: 44, color: 'text.secondary' }}
        >
          End round and see results
        </Button>
      )}
    </Stack>
  );

  return (
    <Box sx={{ width: '100%' }}>
      <ConsoleHeader
        title={consoleTitle(session)}
        status={consoleStatus(session.round_no, view)}
        strip={ended ? undefined : <ClassStrip funnel={funnel} onOpen={() => openPeople()} />}
        onRename={rename}
        renaming={busy === 'rename'}
        onClassDetails={() => setDetailsOpen(true)}
        onPopOut={host.popOut && !ended ? () => void popOut() : undefined}
        share={showShareItem ? { sharing: share.sharing, busy: share.busy, toggle: () => void share.toggle() } : null}
        onHelp={() => setHelpOpen(true)}
        onEndRound={ended ? undefined : () => setEndStep({ unrevealed: null })}
        disabled={busy !== null}
      />

      {askBar && wide ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 3, alignItems: 'start', pt: 2 }}>
          {body}
          <Paper variant="outlined" sx={{ p: 2, position: 'sticky', top: 80 }}>
            {askBar}
          </Paper>
        </Box>
      ) : (
        <>
          <Box sx={{ pt: 2, pb: askBar ? 2 : 0 }}>{body}</Box>
          {askBar && (
            <Box
              sx={{
                position: 'sticky',
                bottom: 0,
                zIndex: 3,
                mx: -2,
                mb: -2,
                px: 2,
                pt: 1.25,
                pb: 'calc(12px + env(safe-area-inset-bottom))',
                bgcolor: 'var(--pad-bg)',
                borderTop: '1px solid',
                borderColor: 'divider',
                boxShadow: `0 -6px 16px ${alpha(theme.palette.common.black, 0.08)}`,
              }}
            >
              {askBar}
            </Box>
          )}
        </>
      )}

      <ClassDetailsSheet open={detailsOpen} onClose={() => setDetailsOpen(false)} snapshot={snapshot} host={host} realtime={realtime} />

      {!ended && (
        <PeopleSheet
          open={people !== null}
          onClose={() => setPeople(null)}
          funnel={funnel}
          startGroup={people?.group ?? null}
          actions={{
            onCantUsePad: (studentId, on) => void cantUsePad(studentId, on),
            onDecide:
              snapshot.prompt && snapshot.prompt.state !== 'revealed'
                ? (ids, approve) => void decideReasons(snapshot.prompt!.id, ids, approve)
                : undefined,
            nudge:
              view.kind === 'open'
                ? {
                    secondsLeft: nudgeSeconds,
                    busy: busy === 'nudge',
                    message: nudge?.promptId === view.prompt.id ? nudge.message : null,
                    onNudge: () => nudgeClass(view.prompt.id),
                  }
                : null,
            remind: snapshot.session.bot_in_meeting && view.kind === 'open' ? { busy: busy === 'remind', message: reminder, onRemind: remind } : null,
            disabled: busy !== null,
          }}
        />
      )}

      <Snackbar
        open={!!pasted && view.kind === 'open' && pasted.promptId === view.prompt.id && askImage === pasted.url}
        autoHideDuration={8_000}
        onClose={(_, reason) => reason !== 'clickaway' && setPasted(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        message={`Picture added to ${nextTitle}`}
        action={
          pasted && (
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                void setPicture(pasted.promptId, pasted.url);
                setAskImage(null);
                setPasted(null);
              }}
              sx={{ minHeight: 44 }}
            >
              {`Use for ${pasted.title}`}
            </Button>
          )
        }
      />
    </Box>
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

/**
 * Before the first question: how many are here and the room code, small, so
 * the Ask bar below is what the eye lands on. The full checks are in Class
 * details.
 */
function ReadyPanel({
  snapshot,
  funnel,
  onPeople,
  onDetails,
}: {
  snapshot: TeacherSnapshot;
  funnel: ClassFunnel;
  onPeople: () => void;
  onDetails: () => void;
}) {
  const here = funnel.groups.answered.length + funnel.groups.waiting.length + funnel.groups.no_pad.length + funnel.groups.excused.length;
  return (
    <Stack spacing={1.5}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="flex-end" spacing={1.5}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="p" variant="h3" fontWeight={800} sx={{ lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {here}
              <Box component="span" sx={{ fontSize: '0.45em', fontWeight: 600, color: 'text.secondary', ml: 0.25 }}>
                {` of ${funnel.expected}`}
              </Box>
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {funnel.meetingList ? 'expected are here' : 'expected have opened the pad'}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
            <Typography variant="caption" color="text.secondary">
              Room code
            </Typography>
            <RoomCode code={snapshot.session.room_code} />
          </Box>
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ mt: 1, ml: -1 }} useFlexGap flexWrap="wrap">
          <Button size="small" startIcon={<GroupsRounded />} onClick={onPeople} sx={{ minHeight: 44 }}>
            See who
          </Button>
          <Button size="small" onClick={onDetails} sx={{ minHeight: 44 }}>
            Class details
          </Button>
        </Stack>
      </Paper>
      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ color: 'text.secondary' }}>
        <ContentPasteRounded fontSize="small" sx={{ mt: '2px' }} aria-hidden />
        <Typography variant="body2">Snip the question with Win + Shift + S, click the box below, press Ctrl + V, then Ask.</Typography>
      </Stack>
    </Stack>
  );
}

/** Reasons a student gave that wait for the teacher's decision: one line, the names in the People sheet. */
function ReasonsWaiting({ funnel, onPeople }: { funnel: ClassFunnel; onPeople: (group: FunnelGroup) => void }) {
  const undecided = [...funnel.groups.waiting, ...funnel.groups.no_pad].filter((person) => person.reason && !person.approval).length;
  if (undecided === 0) return null;
  return (
    <Alert
      severity="info"
      action={
        <Button color="inherit" size="small" onClick={() => onPeople('waiting')} sx={{ minHeight: 44 }}>
          Review
        </Button>
      }
    >
      {undecided === 1 ? '1 student gave a reason.' : `${undecided} students gave a reason.`}
    </Alert>
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
  prompt: Pick<TeacherPrompt, 'sequence' | 'label' | 'question_text' | 'qb'>;
  suffix: string;
  busy: boolean;
  onDetails: (label: string | null, text: string | null) => void;
  action?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const line = questionLine(prompt);
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
        line && (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {line}
          </Typography>
        )
      )}
    </Stack>
  );
}

function OpenPanel({
  prompt,
  answered,
  total,
  offRoster,
  funnel,
  onPeople,
  serverTime,
  busy,
  disabled,
  onClose,
  onAddTime,
  addingTime,
  onDetails,
  onRemovePicture,
}: {
  prompt: TeacherPrompt;
  answered: number;
  /** Students who joined this round, less anyone excused on this question. */
  total: number;
  offRoster: number;
  funnel: ClassFunnel;
  /** Opens the People sheet, on a chip. */
  onPeople: (group?: FunnelGroup | null) => void;
  serverTime: string;
  busy: boolean;
  disabled: boolean;
  onClose: () => void;
  /** +15s on a timed question. */
  onAddTime: () => void;
  addingTime: boolean;
  onDetails: (label: string | null, text: string | null) => void;
  /** The open question's picture can be taken off; a new one comes from the Ask bar ("Use for Q.32"). */
  onRemovePicture: () => void;
}) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  // One clock for both: how long it has been open, and the time left on a timed question.
  // At 0 the console does not close it; the presenter and the server do. Close stays here.
  const serverNow = useServerNow(serverTime, { tickMs: 500 });
  const elapsed = elapsedLabel(prompt.opened_at, serverNow);
  const timeLeft = secondsLeft(prompt.closes_at, serverNow);
  const line = questionLine(prompt);
  const notAnswered = funnel.groups.waiting.length + funnel.groups.no_pad.length;
  const undecided = [...funnel.groups.waiting, ...funnel.groups.no_pad].filter((person) => person.reason && !person.approval).length;
  const share = total > 0 ? Math.min(100, Math.round((answered / total) * 100)) : 0;

  return (
    <Stack alignItems="center" spacing={1.5}>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Chip color="success" label={`${promptTitle(prompt)} open`} />
        <Typography variant="body2" color="text.secondary" aria-label={`Open for ${elapsed}`} sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 40 }}>
          {elapsed}
        </Typography>
        <IconButton aria-label="Edit question number and text" aria-expanded={editing} onClick={() => setEditing(!editing)} sx={{ width: 44, height: 44 }}>
          <EditRounded fontSize="small" />
        </IconButton>
      </Stack>
      {editing ? (
        <DetailsEditor prompt={prompt} busy={disabled} onSave={onDetails} onDone={() => setEditing(false)} />
      ) : (
        line && (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', textAlign: 'center' }}>
            {line}
          </Typography>
        )
      )}
      {timeLeft !== null && (
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} useFlexGap flexWrap="wrap">
          <PadCountdown seconds={timeLeft} />
          <AddTimeButton onClick={onAddTime} busy={addingTime} disabled={disabled} />
        </Stack>
      )}

      <Box sx={{ width: '100%', textAlign: 'center' }}>
        <Typography
          component="p"
          aria-label={`${answered} of ${total} answered`}
          sx={{ fontSize: 'clamp(3rem, 18vw, 4.5rem)', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
        >
          {answered}
          <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.55em' }}>
            {` of ${total}`}
          </Box>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          answered
        </Typography>
        <Box
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={share}
          aria-label="Answered so far"
          sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.08), overflow: 'hidden' }}
        >
          <Box
            sx={{
              width: `${share}%`,
              height: '100%',
              bgcolor: theme.palette.success.main,
              transition: 'width 300ms ease-out',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        </Box>
      </Box>

      <Button
        variant="outlined"
        fullWidth
        onClick={() => onPeople(notAnswered > 0 ? 'waiting' : 'answered')}
        startIcon={<GroupsRounded />}
        sx={{ minHeight: 44, justifyContent: 'center' }}
      >
        {notAnswered > 0 ? `See who: ${notAnswered} not answered` : 'See who answered'}
      </Button>
      {undecided > 0 && (
        <Typography variant="body2" color="text.secondary" role="status" sx={{ textAlign: 'center' }}>
          {undecided === 1 ? '1 student gave a reason. Review it in See who.' : `${undecided} students gave a reason. Review them in See who.`}
        </Typography>
      )}
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
      {prompt.image_url && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
          <Box
            component="img"
            src={prompt.image_url}
            alt={`Picture for ${promptTitle(prompt)}`}
            sx={{ height: 48, maxWidth: 120, objectFit: 'contain', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
            Students see this picture.
          </Typography>
          <Button size="small" onClick={onRemovePicture} disabled={disabled} sx={{ minHeight: 44 }}>
            Remove
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

/**
 * "1:05": how long the question has been open, read against the server's clock
 * (useServerNow), so a fast or slow laptop clock never shows a wrong time.
 */
function elapsedLabel(openedAt: string, serverNow: number): string {
  return clockLabel(Math.max(0, (serverNow - Date.parse(openedAt)) / 1_000));
}

function ClosedPanel({
  host,
  prompt,
  groups,
  refreshKey,
  serverTime,
  busy,
  onAddTime,
  onReopen,
  onDetails,
  onKeys,
  onPoll,
  onReveal,
}: {
  host: PadHost;
  prompt: TeacherPrompt;
  groups: Array<{ value: string; count: number }>;
  refreshKey: string;
  /** The snapshot's server_time: whether the question's time ran out. */
  serverTime: string;
  busy: string | null;
  /** +15s: reopens the newest question whose time was up, with 15 seconds. */
  onAddTime: () => void;
  onReopen: () => void;
  onDetails: (label: string | null, text: string | null) => void;
  onKeys: (keys: string[]) => void;
  onPoll: () => void;
  onReveal: () => void;
}) {
  // The console shows the newest question here, so a time-up one can take more time.
  const timeUp = Boolean(prompt.closes_at) && Date.parse(prompt.closes_at as string) <= Date.parse(serverTime);
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

      {timeUp && (
        <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
          <PadCountdown seconds={0} />
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 120 }}>
            Need more time? Students can answer again.
          </Typography>
          <AddTimeButton onClick={onAddTime} busy={busy === 'timer'} disabled={busy !== null} />
        </Stack>
      )}

      <OptionNames host={host} prompt={prompt} groups={groups} refreshKey={refreshKey} />

      <AnswerKeyPicker prompt={prompt} groups={groups} busy={busy} onKeys={onKeys} onPoll={onPoll} onReveal={onReveal} />
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
  suggestedKeys,
  busy,
  onKeys,
  onPoll,
  onReveal,
}: {
  host: PadHost;
  entry: HistoryEntry;
  /** The question bank's answer for this question, from its history row. */
  suggestedKeys: string[] | null;
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
      <AnswerKeyPicker
        prompt={{ ...entry, suggested_keys: suggestedKeys }}
        groups={groups}
        busy={busy}
        onKeys={onKeys}
        onPoll={onPoll}
        onReveal={onReveal}
      />
    </Stack>
  );
}

const SUMMARY_ICONS: Record<SummaryItem['key'], ReactNode> = {
  correct: <CheckCircleRounded />,
  incorrect: <CancelRounded />,
  answered: <HowToVoteRounded />,
  silent: <VolumeOffRounded />,
  excused: <HowToRegRounded />,
  absent: <PersonOffRounded />,
};

function RevealedPanel({
  host,
  prompt,
  snapshot,
  busy,
  onDetails,
  onKeys,
  onPoll,
}: {
  host: PadHost;
  prompt: TeacherPrompt;
  snapshot: TeacherSnapshot;
  busy: string | null;
  onDetails: (label: string | null, text: string | null) => void;
  /** Correcting the answer after Reveal regrades everyone. */
  onKeys: (keys: string[]) => void;
  onPoll: () => void;
}) {
  const theme = useTheme();
  const [changing, setChanging] = useState(false);

  const tone: Record<SummaryItem['key'], string> = {
    correct: theme.palette.success.main,
    incorrect: theme.palette.error.main,
    answered: theme.palette.primary.main,
    silent: theme.palette.warning.dark,
    excused: theme.palette.info.main,
    absent: theme.palette.text.secondary,
  };

  return (
    <Stack spacing={2}>
      <QuestionHeading prompt={prompt} suffix="revealed" busy={busy !== null} onDetails={onDetails} />
      <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
        {prompt.ungraded ? (
          <Chip icon={<HowToVoteRounded />} label="Poll, not graded" />
        ) : (
          <Typography sx={{ flex: 1 }}>{`Answer: ${displayKeys(prompt.answer_type, prompt.correct_keys)}`}</Typography>
        )}
        <Button size="small" variant="text" onClick={() => setChanging(!changing)} aria-expanded={changing} sx={{ minHeight: 44 }}>
          {changing ? 'Done' : 'Change the answer'}
        </Button>
      </Stack>
      <Collapse in={changing} unmountOnExit>
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
            Everyone is regraded, and students see the change on their pad.
          </Typography>
          <AnswerKeyPicker prompt={prompt} groups={snapshot.groups} busy={busy} onKeys={onKeys} onPoll={onPoll} onReveal={() => setChanging(false)} hideReveal />
        </Paper>
      </Collapse>

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

      {/* Who picked what: the wrong bars are who got it wrong. */}
      <OptionNames host={host} prompt={prompt} groups={snapshot.groups} refreshKey={snapshot.server_time} />

      <ParticipationDetails host={host} promptId={prompt.id} ungraded={prompt.ungraded} startOpen={false} />
    </Stack>
  );
}

const DETAIL_ORDER: Array<{ key: SummaryItem['key']; title: string }> = [
  { key: 'correct', title: 'Correct' },
  { key: 'incorrect', title: 'Incorrect' },
  { key: 'answered', title: 'Answered' },
  { key: 'silent', title: 'No answer' },
  { key: 'excused', title: 'Excused' },
  { key: 'absent', title: 'Not in the pad' },
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
        <Stack spacing={1}>
          {DETAIL_ORDER.filter(({ key }) => groups[key].length > 0).map(({ key, title }) => (
            <NameGroup key={key} title={title} rows={groups[key]} showAnswer={key !== 'correct'} startFolded={key === 'absent'} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/** Enough faces to scan in a 300px panel; the rest of a group is one tap away. */
const GROUP_ROWS = 8;

/**
 * One group of a question's names ("Correct (12)"): each student's avatar with
 * their ring, the name, and why they are in the group. Long groups fold to the
 * first eight; "Not in the pad", usually the longest and the least useful,
 * starts folded.
 */
function NameGroup({ title, rows, showAnswer, startFolded }: { title: string; rows: ParticipationRow[]; showAnswer: boolean; startFolded: boolean }) {
  const [folded, setFolded] = useState(startFolded);
  const [all, setAll] = useState(false);
  const shown = folded ? [] : all ? rows : rows.slice(0, GROUP_ROWS);
  return (
    <Box component="section" aria-label={`${title} (${rows.length})`}>
      <Button
        variant="text"
        color="inherit"
        onClick={() => setFolded(!folded)}
        aria-expanded={!folded}
        endIcon={<ExpandMoreRounded sx={{ transform: folded ? 'none' : 'rotate(180deg)', transition: 'transform 150ms', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }} />}
        sx={{ minHeight: 44, px: 0.5, fontWeight: 700, justifyContent: 'flex-start' }}
      >
        {`${title} (${rows.length})`}
      </Button>
      {shown.length > 0 && (
        <Stack component="ul" spacing={0.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {shown.map((row) => {
            const notes = [
              showAnswer && row.answer ? `answered ${row.answer}` : null,
              row.skip_reason ? (row.skip_reason === 'pad_problem' ? PAD_PROBLEM_LABEL : `Said: ${reasonLabel(row.skip_reason)}${row.skip_note ? `, ${row.skip_note}` : ''}`) : null,
              row.joined_mid_prompt ? 'Joined mid-question' : null,
              !row.on_roster ? 'Not on class list' : null,
            ].filter(Boolean);
            const name = row.name ?? 'Unnamed student';
            return (
              <Stack component="li" key={row.student_id} direction="row" spacing={1} alignItems="center" sx={{ minHeight: 44 }}>
                <StudentAvatar userId={row.student_id} name={name} size={28} sx={{ flexShrink: 0 }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" noWrap>
                    {name}
                  </Typography>
                  {notes.length > 0 && (
                    <Typography variant="caption" color="text.secondary" component="p" sx={{ overflowWrap: 'anywhere' }}>
                      {notes.join(' · ')}
                    </Typography>
                  )}
                </Box>
              </Stack>
            );
          })}
        </Stack>
      )}
      {!folded && rows.length > GROUP_ROWS && (
        <Button variant="text" size="small" onClick={() => setAll(!all)} aria-expanded={all} sx={{ minHeight: 44 }}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </Button>
      )}
    </Box>
  );
}
