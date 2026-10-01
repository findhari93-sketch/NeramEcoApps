'use client';

/**
 * The student's Answer Pad for one round of a live class.
 *
 * Renders only what the snapshot says, plus the one answer this pad is sending.
 * An answer is SELECTED, not locked: while the question is open, tapping another
 * option changes it, and the newest answer is the one saved. When the teacher
 * closes answers it locks, and the server's answer is the one shown. A dropped
 * connection never loses an answer: the pad keeps retrying the newest choice.
 * It never shows anything about anyone else's answers.
 *
 * When a round ends the pad shows the result once the teacher publishes it, and
 * when the teacher starts the next round the pad follows it on its own, so the
 * student never has to rejoin.
 */

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  ImageViewerDialog,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import CancelRounded from '@mui/icons-material/CancelRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import EmojiPeopleRounded from '@mui/icons-material/EmojiPeopleRounded';
import EventAvailableRounded from '@mui/icons-material/EventAvailableRounded';
import HourglassTopRounded from '@mui/icons-material/HourglassTopRounded';
import HowToVoteRounded from '@mui/icons-material/HowToVoteRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import NotificationsActiveRounded from '@mui/icons-material/NotificationsActiveRounded';
import WifiOffRounded from '@mui/icons-material/WifiOffRounded';
import { SKIP_REASON_LABELS, displayAnswer, displayKeys, promptTitle, scoreLabel } from '@/lib/pad/client/format';
import { PadClientError, padFetch } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import {
  deriveStudentView,
  nextRoundId,
  studentAnnouncement,
  type PendingSubmit,
  type SaveState,
  type StudentView,
} from '@/lib/pad/client/student-view';
import type { AnswerType, SkipReason, StudentPrompt, StudentSnapshot } from '@/lib/pad/client/types';
import { roundName } from '@/lib/pad/round-results';
import AnswerInput from './AnswerInput';
import LiveAnnouncement from './LiveAnnouncement';
import RoundResultCard, { roundEndedLine } from './RoundResultCard';
import { usePadHeartbeat, usePadSnapshot } from './usePadSnapshot';

const MAX_RETRY_DELAY_MS = 8_000;
/**
 * After a round ends the snapshot poll stops (poll-policy.ts). Realtime hints
 * carry Publish and the next round when they work, so this slow check runs
 * only for a pad without Realtime, and gives up after a while: every check is a
 * function call, and a class of forty idle pads would otherwise add up.
 */
const ENDED_CHECK_MS = 30_000;
const ENDED_CHECK_FOR_MS = 20 * 60_000;

function submitErrorMessage(code: string | null): string {
  switch (code) {
    case 'INVALID_ANSWER':
      return 'That answer does not fit this question. Please check it.';
    case 'INVALID_INPUT':
      return 'Please enter an answer first.';
    default:
      return 'Your answer could not be sent. Please try again.';
  }
}

const SKIP_REASONS = Object.keys(SKIP_REASON_LABELS) as SkipReason[];

function skipErrorMessage(code: string | null): string {
  switch (code) {
    case 'PROMPT_NOT_OPEN':
      return 'This question has closed.';
    case 'OFFLINE':
      return 'No connection. Try again in a moment.';
    default:
      return 'That did not reach your teacher. Please try again.';
  }
}

function answerHint(answerType: AnswerType): string {
  return answerType === 'mcq' || answerType === 'yesno' ? 'Tap your answer.' : 'Type your answer, then tap Save answer.';
}

export const CHANGE_HINT = 'You can change your answer until your teacher closes answers.';
const ACCEPTED_LINE = "Your teacher accepted your reason. This question won't count against you.";
const TRY_IT_LINE = 'Your teacher would like you to try this one. A guess is fine.';

interface StudentPadProps {
  host: PadHost;
  sessionId: string;
  onEnded?: () => void;
  /** The question pop-up: no header and shorter words, so the answer buttons fit without scrolling. */
  compact?: boolean;
}

/**
 * Follows the class from round to round. The round shown is the one it was
 * given, until a round it shows ends and names the next one; a new session
 * from the parent (a rejoin, a room code) always wins.
 */
export default function StudentPad(props: StudentPadProps) {
  const [followed, setFollowed] = useState<{ from: string; to: string } | null>(null);
  const sessionId = followed && followed.from === props.sessionId ? followed.to : props.sessionId;
  const given = props.sessionId;
  const follow = useCallback((next: string) => setFollowed({ from: given, to: next }), [given]);

  // A fresh pad per round: nothing from the last round's questions carries over.
  return <RoundPad key={sessionId} {...props} sessionId={sessionId} onNextRound={follow} />;
}

function RoundPad({
  host,
  sessionId,
  onEnded,
  compact = false,
  onNextRound,
}: StudentPadProps & { onNextRound: (sessionId: string) => void }) {
  const { snapshot, error, realtime, refresh } = usePadSnapshot<StudentSnapshot>({ host, sessionId, role: 'student' });
  const ended = snapshot?.session.status === 'ended';
  usePadHeartbeat(host, sessionId, snapshot?.session.status === 'live');

  const [pending, setPending] = useState<PendingSubmit | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  /** A typed answer the server could not take, put back in the box to fix. */
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (ended) onEnded?.();
  }, [ended, onEnded]);

  // The teacher started the next round: go straight to it.
  const next = nextRoundId(snapshot);
  useEffect(() => {
    if (next) onNextRound(next);
  }, [next, onNextRound]);

  // An ended round still changes twice: its results, and the next round. With
  // Realtime both arrive as hints; without it, check now and then.
  useEffect(() => {
    if (!ended || next || realtime === 'subscribed') return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > ENDED_CHECK_FOR_MS) {
        clearInterval(timer);
        return;
      }
      if (document.visibilityState !== 'hidden') void refresh();
    }, ENDED_CHECK_MS);
    return () => clearInterval(timer);
  }, [ended, next, realtime, refresh]);

  const seenOpen = useRef(new Set<string>());
  const mounted = useRef(true);
  /** Each tap supersedes the one before: only the newest choice keeps retrying. */
  const latestSubmit = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const promptId = snapshot?.prompt?.id ?? null;
  const promptState = snapshot?.prompt?.state ?? null;

  useEffect(() => {
    if (promptId && promptState === 'open') seenOpen.current.add(promptId);
  }, [promptId, promptState]);

  // A new question clears whatever the last one left behind.
  useEffect(() => {
    setInputError(null);
    setDraft('');
    setPending((current) => (current && current.promptId !== promptId ? null : current));
  }, [promptId]);

  const submit = useCallback(
    async (targetPromptId: string, answer: string) => {
      latestSubmit.current += 1;
      const mine = latestSubmit.current;
      const current = () => mounted.current && latestSubmit.current === mine;
      setInputError(null);
      setPending({ promptId: targetPromptId, answer, status: 'sending' });

      for (let attempt = 0; current(); attempt += 1) {
        try {
          await padFetch(host, '/api/pad/submit', { method: 'POST', body: { promptId: targetPromptId, answer } });
          if (!current()) return;
          // Fetch the saved answer before letting go of the pending one, so the
          // choice does not flicker back to the previous answer in between.
          await refresh();
          if (current()) setPending(null);
          return;
        } catch (err) {
          if (!current()) return;
          const refusal = err instanceof PadClientError ? err : null;

          if (refusal?.code === 'PROMPT_NOT_OPEN' || refusal?.code === 'SESSION_NOT_LIVE') {
            // Too late to change it. The server says which answer stands, if any.
            const standing = typeof refusal.detail.answer === 'string' ? refusal.detail.answer : null;
            setPending({ promptId: targetPromptId, answer, status: 'refused', standing });
            void refresh();
            return;
          }
          if (refusal && !refusal.offline && refusal.status >= 400 && refusal.status < 500 && refusal.status !== 401 && refusal.status !== 429) {
            setPending(null);
            setDraft(answer);
            setInputError(submitErrorMessage(refusal.code));
            return;
          }

          // Offline, a server hiccup or a token refresh: try again. Saving the same
          // answer twice changes nothing, so a retry is always safe.
          setPending({ promptId: targetPromptId, answer, status: 'retrying' });
          await new Promise((resolve) => setTimeout(resolve, Math.min(1_000 * 2 ** attempt, MAX_RETRY_DELAY_MS)));
        }
      }
    },
    [host, refresh],
  );

  /** "I can't answer": a reason, or null to take it back. */
  const skip = useCallback(
    async (targetPromptId: string, reason: SkipReason | null, note: string | null) => {
      await padFetch(host, '/api/pad/skip', { method: 'POST', body: { promptId: targetPromptId, reason, note } });
      await refresh();
    },
    [host, refresh],
  );

  // A nudge buzzes a phone once, not on every refresh that still carries it.
  const nudgedAt = snapshot?.nudged_at ?? null;
  const buzzed = useRef<string | null>(null);
  useEffect(() => {
    if (!nudgedAt || buzzed.current === nudgedAt) return;
    buzzed.current = nudgedAt;
    try {
      navigator.vibrate?.(200);
    } catch {
      // No vibration here (a laptop, or a browser that refuses): the banner carries it.
    }
  }, [nudgedAt]);

  const view = deriveStudentView(snapshot, pending, seenOpen.current);

  if (error && !snapshot) {
    return <ConnectionProblem code={error.code} offline={error.offline} />;
  }

  return (
    <Stack spacing={compact ? 1.5 : 2} sx={{ width: '100%' }}>
      {!compact && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            {snapshot?.session.classroom_name ?? 'Answer Pad'}
            {snapshot?.session.round_no ? ` · ${roundName(snapshot.session.round_no)}` : ''}
          </Typography>
          {snapshot && (
            <Chip
              size="small"
              variant="outlined"
              label={snapshot.score.total_graded > 0 ? `Score ${scoreLabel(snapshot.score)}` : scoreLabel(snapshot.score)}
              sx={{ fontVariantNumeric: 'tabular-nums' }}
            />
          )}
        </Stack>
      )}

      {error?.offline && snapshot && (
        <Alert severity="warning" icon={<WifiOffRounded />}>
          No connection. Reconnecting now.
        </Alert>
      )}

      <LiveAnnouncement message={studentAnnouncement(view)} />
      <ViewBody
        view={view}
        host={host}
        sessionId={sessionId}
        draft={draft || snapshot?.my_response?.raw_answer || ''}
        inputError={inputError}
        onAnswer={submit}
        mySkip={snapshot?.my_skip ?? null}
        nudgedAt={nudgedAt}
        onSkip={skip}
        compact={compact}
      />
    </Stack>
  );
}

function ViewBody({
  view,
  host,
  sessionId,
  draft,
  inputError,
  onAnswer,
  mySkip,
  nudgedAt,
  onSkip,
  compact,
}: {
  view: StudentView;
  host: PadHost;
  sessionId: string;
  draft: string;
  inputError: string | null;
  onAnswer: (promptId: string, answer: string) => void;
  mySkip: StudentSnapshot['my_skip'];
  nudgedAt: string | null;
  onSkip: (promptId: string, reason: SkipReason | null, note: string | null) => Promise<void>;
  compact: boolean;
}) {
  switch (view.kind) {
    case 'loading':
      return (
        <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
          <CircularProgress aria-label="Connecting" />
          <Typography>Connecting to your class.</Typography>
        </Stack>
      );

    case 'idle':
      return (
        <StatusCard tone="neutral" icon={<HourglassTopRounded />} title="You're connected">
          Questions will appear here when your teacher asks.
        </StatusCard>
      );

    case 'answering': {
      const title = promptTitle(view.prompt);
      const approval = mySkip?.approval ?? null;
      const choose = (answer: string) => {
        // Tapping the answer already chosen changes nothing.
        if (answer === view.selected && view.save !== 'retrying') return;
        onAnswer(view.prompt.id, answer);
      };
      return (
        <Stack spacing={compact ? 1.5 : 2}>
          {approval === 'approved' && (
            <Alert severity="success" role="status">
              {ACCEPTED_LINE}
            </Alert>
          )}
          {approval === 'rejected' && !view.selected && (
            <Alert severity="info" icon={<EmojiPeopleRounded />} role="status">
              {TRY_IT_LINE}
            </Alert>
          )}
          {nudgedAt && !mySkip && !view.selected && (
            <Alert severity="info" icon={<NotificationsActiveRounded />} role="status">
              {`Your teacher is waiting for your answer to ${title}. A guess is fine, or tap I can't answer.`}
            </Alert>
          )}
          <Stack spacing={0.5}>
            <Typography variant="h5" component="h2" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>
              {title}
            </Typography>
            {view.prompt.question_text && (
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.5 }}>
                {view.prompt.question_text}
              </Typography>
            )}
          </Stack>
          {view.prompt.image_url && <QuestionPicture key={view.prompt.image_url} url={view.prompt.image_url} title={title} compact={compact} />}
          {!compact && (
            <Typography variant="body2" color="text.secondary">
              {answerHint(view.prompt.answer_type)}
            </Typography>
          )}
          <AnswerInput
            key={view.prompt.id}
            answerType={view.prompt.answer_type}
            optionCount={view.prompt.option_count}
            optionTexts={view.prompt.option_texts}
            disabled={false}
            error={inputError}
            initialValue={draft}
            selected={view.selected}
            onAnswer={choose}
          />
          {view.selected && <ChosenAnswer answer={displayAnswer(view.prompt.answer_type, view.selected)} save={view.save} />}
          <Typography variant="body2" color="text.secondary">
            {CHANGE_HINT}
          </Typography>
          {!view.selected && (
            <CantAnswer
              key={`skip-${view.prompt.id}`}
              mySkip={mySkip}
              onSkip={(reason, note) => onSkip(view.prompt.id, reason, note)}
            />
          )}
        </Stack>
      );
    }

    case 'saving':
      return (
        <StatusCard
          prompt={view.prompt}
          tone="neutral"
          icon={view.retrying ? <WifiOffRounded /> : <CircularProgress size={28} aria-hidden />}
          title={view.retrying ? 'Still trying to send your answer' : 'Sending your answer'}
        >
          {view.retrying
            ? `No connection yet. The pad keeps trying to send ${displayAnswer(view.prompt.answer_type, view.answer)} as soon as you are back online.`
            : `Sending ${displayAnswer(view.prompt.answer_type, view.answer)}.`}
        </StatusCard>
      );

    case 'locked':
      return (
        <StatusCard prompt={view.prompt} tone="primary" icon={<LockRounded />} title={`Locked: ${displayAnswer(view.prompt.answer_type, view.answer)}`}>
          Answering has closed. Your teacher will share the answer, now or after class.
        </StatusCard>
      );

    case 'missed': {
      const title =
        view.reason === 'closed-before-arrival'
          ? 'This question closed before your answer arrived'
          : view.reason === 'joined-after-close'
            ? 'This question closed before you joined'
            : "You didn't answer this one";
      const keys = displayKeys(view.prompt.answer_type, view.prompt.correct_keys);
      return (
        <Stack spacing={1.5}>
          <StatusCard prompt={view.prompt} tone="neutral" icon={<HourglassTopRounded />} title={title}>
            {view.revealed
              ? view.prompt.ungraded
                ? 'That one was a poll. The next question will appear here.'
                : `The answer was ${keys}. The next question will appear here.`
              : 'Wait for the next question.'}
          </StatusCard>
          {mySkip?.approval === 'approved' && (
            <Alert severity="success" role="status">
              {ACCEPTED_LINE}
            </Alert>
          )}
        </Stack>
      );
    }

    case 'result': {
      const answer = displayAnswer(view.prompt.answer_type, view.answer);
      if (view.outcome === 'poll') {
        return (
          <StatusCard prompt={view.prompt} tone="primary" icon={<HowToVoteRounded />} title="Thanks for answering">
            {`You answered ${answer}. This one was a poll, so it is not graded.`}
          </StatusCard>
        );
      }
      const keys = displayKeys(view.prompt.answer_type, view.prompt.correct_keys);
      return view.outcome === 'correct' ? (
        <StatusCard prompt={view.prompt} tone="success" icon={<CheckCircleRounded />} title="Correct">
          {`You answered ${answer}.`}
        </StatusCard>
      ) : (
        <StatusCard prompt={view.prompt} tone="error" icon={<CancelRounded />} title="Not this time">
          {`You answered ${answer}. The answer was ${keys}.`}
        </StatusCard>
      );
    }

    case 'ended':
      if (view.published) return <RoundResultCard host={host} sessionId={sessionId} roundNo={view.roundNo} />;
      return (
        <StatusCard tone="neutral" icon={<EventAvailableRounded />} title="Results coming soon">
          {roundEndedLine(view.roundNo)}
        </StatusCard>
      );
  }
}

/** "Your answer: B" under the options, and whether it has reached the teacher. */
function ChosenAnswer({ answer, save }: { answer: string; save: SaveState | null }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
      <Typography variant="body1" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
        {`Your answer: ${answer}`}
      </Typography>
      {save === 'saved' && (
        <Chip size="small" color="success" variant="outlined" icon={<CheckCircleRounded />} label="Saved" sx={{ fontWeight: 700 }} />
      )}
      {save === 'sending' && (
        <Chip size="small" variant="outlined" icon={<CircularProgress size={14} aria-hidden />} label="Saving" sx={{ fontWeight: 700 }} />
      )}
      {save === 'retrying' && (
        <Chip size="small" variant="outlined" icon={<WifiOffRounded />} label="No connection, still trying" sx={{ fontWeight: 700 }} />
      )}
    </Stack>
  );
}

/**
 * The teacher's picture of the question, sized to the pad. A tap opens it full
 * screen, which is how a student on a phone reads a small snip of the paper.
 */
function QuestionPicture({ url, title, compact }: { url: string; title: string; compact: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const alt = `Picture for ${title}`;

  if (failed) {
    return (
      <Typography variant="body2" color="text.secondary">
        The picture could not load. Look at the shared screen instead.
      </Typography>
    );
  }

  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Show the picture for ${title} full screen`}
        sx={{
          position: 'relative',
          display: 'block',
          width: '100%',
          minHeight: loaded ? 0 : 120,
          p: 0,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'background.paper',
          cursor: 'zoom-in',
          '&:focus-visible': { outline: '3px solid', outlineOffset: 2 },
        }}
      >
        {!loaded && <Skeleton variant="rectangular" sx={{ position: 'absolute', inset: 0, height: '100%' }} />}
        <Box
          component="img"
          src={url}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          sx={{ display: 'block', width: '100%', height: 'auto', maxHeight: compact ? '30vh' : '45vh', objectFit: 'contain' }}
        />
      </Box>
      <ImageViewerDialog open={open} onClose={() => setOpen(false)} src={url} alt={alt} name={title} />
    </>
  );
}

/**
 * "I can't answer", and why. It never locks the student out: the answer buttons
 * above stay live, and an answer given later wins. The teacher sees how many
 * gave each reason, and who only after the question closes.
 */
function CantAnswer({
  mySkip,
  onSkip,
}: {
  mySkip: StudentSnapshot['my_skip'];
  onSkip: (reason: SkipReason | null, note: string | null) => Promise<void>;
}) {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState<SkipReason | null>(mySkip?.reason ?? null);
  const [note, setNote] = useState(mySkip?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const send = async (next: SkipReason | null, nextNote: string | null) => {
    setBusy(true);
    setProblem(null);
    try {
      await onSkip(next, nextNote);
      setEditing(false);
    } catch (err) {
      setProblem(skipErrorMessage(err instanceof PadClientError ? err.code : null));
    } finally {
      setBusy(false);
    }
  };

  if (mySkip && !editing) {
    const said = `${SKIP_REASON_LABELS[mySkip.reason]}${mySkip.note ? `: ${mySkip.note}` : ''}`;
    return (
      <Stack spacing={1}>
        <Typography variant="body2" role="status">
          {`You told your teacher: ${said}. You can still answer above.`}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="text" onClick={() => setEditing(true)} disabled={busy} sx={{ minHeight: 48 }}>
            Change
          </Button>
          <Button variant="text" color="inherit" onClick={() => void send(null, null)} disabled={busy} sx={{ minHeight: 48 }}>
            Take it back
          </Button>
        </Stack>
        {problem && <Alert severity="warning">{problem}</Alert>}
      </Stack>
    );
  }

  if (!editing) {
    return (
      <Button variant="text" startIcon={<HelpOutlineRounded />} onClick={() => setEditing(true)} sx={{ minHeight: 48, alignSelf: 'flex-start' }}>
        {"I can't answer"}
      </Button>
    );
  }

  return (
    <Stack
      component="form"
      spacing={1.25}
      aria-labelledby={headingId}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (reason) void send(reason, reason === 'other' ? note.trim() || null : null);
      }}
    >
      <Typography variant="subtitle2" fontWeight={700} id={headingId}>
        {"Why can't you answer?"}
      </Typography>
      <Stack role="group" aria-labelledby={headingId} spacing={1}>
        {SKIP_REASONS.map((value) => (
          <ToggleButton
            key={value}
            value={value}
            selected={reason === value}
            onChange={() => setReason(value)}
            sx={{ minHeight: 48, justifyContent: 'flex-start', textTransform: 'none', fontWeight: 600 }}
          >
            {SKIP_REASON_LABELS[value]}
          </ToggleButton>
        ))}
      </Stack>
      {reason === 'other' && (
        <TextField size="small" label="Tell your teacher (optional)" value={note} onChange={(event) => setNote(event.target.value)} inputProps={{ maxLength: 80 }} />
      )}
      {problem && (
        <Alert severity="warning" role="alert">
          {problem}
        </Alert>
      )}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disabled={!reason || busy} sx={{ minHeight: 48, flex: 1 }}>
          Send to my teacher
        </Button>
        <Button onClick={() => setEditing(false)} disabled={busy} sx={{ minHeight: 48 }}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  );
}

type Tone = 'neutral' | 'primary' | 'success' | 'error';

/**
 * @param prompt when the card is about a question, it is named above the card
 *   ("Q.38"), so a student who looks up from the paper knows which one it means.
 */
function StatusCard({
  prompt,
  tone,
  icon,
  title,
  children,
}: {
  prompt?: Pick<StudentPrompt, 'sequence' | 'label'>;
  tone: Tone;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const accent =
    tone === 'success'
      ? theme.palette.success.main
      : tone === 'error'
        ? theme.palette.error.main
        : tone === 'primary'
          ? theme.palette.primary.main
          : theme.palette.text.secondary;

  const card = (
    <Stack
      spacing={1}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: '2px solid',
        borderColor: alpha(accent, 0.5),
        bgcolor: alpha(accent, theme.palette.mode === 'dark' ? 0.16 : 0.08),
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ color: accent, display: 'flex', '& svg': { fontSize: 32 } }} aria-hidden>
          {icon}
        </Box>
        <Typography variant="h6" component="h2" fontWeight={800} sx={{ lineHeight: 1.25 }}>
          {title}
        </Typography>
      </Stack>
      <Typography variant="body1">{children}</Typography>
    </Stack>
  );
  if (!prompt) return card;
  return (
    <Stack spacing={0.75}>
      <Typography variant="subtitle2" color="text.secondary" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
        {promptTitle(prompt)}
      </Typography>
      {card}
    </Stack>
  );
}

function ConnectionProblem({ code, offline }: { code: string | null; offline: boolean }) {
  const message =
    code === 'NOT_ENROLLED'
      ? 'You are not on the class list for this session. Ask your teacher to check your enrollment.'
      : code === 'NOT_FOUND'
        ? 'This class session could not be found. It may have been replaced by a new one.'
        : offline
          ? 'No connection. The pad will reconnect on its own.'
          : 'The Answer Pad could not load. It will try again shortly.';
  return <Alert severity={code === 'NOT_ENROLLED' ? 'error' : 'warning'}>{message}</Alert>;
}
