'use client';

/**
 * The student's own result for one Answer Pad round, once the teacher has
 * published it: how many they attempted and did not, how many of their
 * attempts were right, their rank out of everyone who joined the round, a kind
 * label, the class average, each question folded underneath, and the top five
 * by name.
 *
 * Privacy by design: the route never sends another student's score outside the
 * top five. A student sees their own rank and their own answers, nobody else's.
 */

import { useCallback, useEffect, useId, useState } from 'react';
import { Alert, Box, Button, Chip, Collapse, Skeleton, Stack, Typography, alpha, useTheme } from '@neram/ui';
import CancelRounded from '@mui/icons-material/CancelRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import EventAvailableRounded from '@mui/icons-material/EventAvailableRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import HourglassEmptyRounded from '@mui/icons-material/HourglassEmptyRounded';
import HowToRegRounded from '@mui/icons-material/HowToRegRounded';
import PersonOffOutlined from '@mui/icons-material/PersonOffOutlined';
import PollOutlined from '@mui/icons-material/PollOutlined';
import RemoveCircleOutlineRounded from '@mui/icons-material/RemoveCircleOutlineRounded';
import StudentAvatar from '@/components/students/StudentAvatar';
import { displayAnswer, displayKeys, promptTitle } from '@/lib/pad/client/format';
import { padFetch } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import {
  QUESTION_RESULT_LABELS,
  RESULT_LABELS,
  accuracyLine,
  activityLine,
  countedLine,
  rankLine,
  rightLine,
  roundName,
  scoreLine,
  type QuestionResult,
  type ResultLabel,
  type RoundQuestionResult,
  type RoundTopRow,
  type StudentRoundResult,
} from '@/lib/pad/round-results';

const LABEL_TONE: Record<ResultLabel, 'success' | 'info' | 'warning'> = {
  strong: 'success',
  good: 'info',
  needs_practice: 'warning',
};

/** Read by screen readers, never seen. Sized in px: `width: 1` in sx means 100%. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; result: StudentRoundResult };

export function roundEndedLine(roundNo: number | null | undefined): string {
  return `${roundName(roundNo)} has ended. Your teacher will share the results soon.`;
}

export default function RoundResultCard({ host, sessionId, roundNo = null }: { host: PadHost; sessionId: string; roundNo?: number | null }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const fetchResult = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      const result = await padFetch<StudentRoundResult>(host, `/api/pad/sessions/${sessionId}/my-result`);
      setLoad({ kind: 'ready', result });
    } catch {
      setLoad({ kind: 'failed' });
    }
  }, [host, sessionId]);

  useEffect(() => {
    void fetchResult();
  }, [fetchResult]);

  if (load.kind === 'loading') return <ResultSkeleton />;

  if (load.kind === 'failed') {
    return (
      <Alert
        severity="warning"
        action={
          <Button color="inherit" onClick={() => void fetchResult()} sx={{ minHeight: 44 }}>
            Try again
          </Button>
        }
      >
        Your result could not load. Check your connection and try again.
      </Alert>
    );
  }

  const { result } = load;
  const round = roundName(result.round_no ?? roundNo);

  if (!result.published) {
    return (
      <Stack spacing={1} sx={{ p: 2.5, borderRadius: 3, border: '2px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <EventAvailableRounded color="action" sx={{ fontSize: 32 }} aria-hidden />
          <Typography variant="h6" component="h2" fontWeight={800}>
            {`${round} has ended`}
          </Typography>
        </Stack>
        <Typography>{roundEndedLine(result.round_no ?? roundNo)}</Typography>
      </Stack>
    );
  }

  return <Published round={round} result={result} />;
}

function Published({ round, result }: { round: string; result: StudentRoundResult }) {
  const theme = useTheme();
  const headingId = useId();
  const me = result.me ?? null;
  const top = (result.top ?? []).slice(0, 5);
  const average = result.class?.average_score ?? null;
  const tone = me?.label ? LABEL_TONE[me.label] : null;
  const toneColor = tone ? theme.palette[tone] : null;
  const accuracy = me ? accuracyLine(me) : null;
  const rank = me ? rankLine(me) : null;

  return (
    <Stack spacing={2} component="section" aria-labelledby={headingId}>
      <Stack spacing={1.5} sx={{ p: 2, borderRadius: 3, border: '2px solid', borderColor: alpha(theme.palette.primary.main, 0.4), bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.14 : 0.05) }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
          <Typography id={headingId} variant="subtitle1" component="h2" fontWeight={800}>
            {`Your ${round} result`}
          </Typography>
          {me?.label && toneColor && (
            <Chip
              label={RESULT_LABELS[me.label]}
              sx={{
                fontWeight: 700,
                height: 32,
                bgcolor: alpha(toneColor.main, 0.14),
                color: theme.palette.mode === 'dark' ? toneColor.light : toneColor.dark,
                border: '1px solid',
                borderColor: alpha(toneColor.main, 0.5),
              }}
            />
          )}
        </Stack>

        {me ? (
          <>
            {me.counted > 0 ? (
              <Box
                component="dl"
                aria-label="Your numbers"
                sx={{ m: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}
              >
                <Stat label="Attempted" value={String(me.attempted)} />
                <Stat label="Not attempted" value={String(me.no_answer)} />
                <Stat label="Right" value={rightLine(me)} />
                <Stat label="Rank" value={rank ?? 'Not ranked'} emphasis />
              </Box>
            ) : (
              <Typography component="p" sx={{ fontSize: '1.25rem', fontWeight: 800 }}>
                {scoreLine(me)}
              </Typography>
            )}

            {(accuracy || average !== null) && (
              <Stack spacing={0.25}>
                {accuracy && <Typography variant="body1">{accuracy}</Typography>}
                {average !== null && (
                  <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {`Class average ${average}%`}
                  </Typography>
                )}
              </Stack>
            )}
            {me.counted > 0 && (
              <Typography variant="body2" color="text.secondary">
                {countedLine(me)}
              </Typography>
            )}
            {me.not_active && (
              <Alert severity="warning" role="status">
                {activityLine(me)}
              </Alert>
            )}
          </>
        ) : (
          <>
            <Typography variant="body1">You did not answer any questions in this round. The next round is a fresh start.</Typography>
            {average !== null && (
              <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {`Class average ${average}%`}
              </Typography>
            )}
          </>
        )}
      </Stack>

      <QuestionList questions={result.questions ?? []} />

      <TopFive rows={top} myId={me?.in_top ? me.student_id : null} />
    </Stack>
  );
}

/** One number in the grid. The label comes first for screen readers ("Attempted 14"), the number reads first on screen. */
function Stat({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column-reverse',
        justifyContent: 'flex-end',
        minHeight: 72,
        px: 1.5,
        py: 1.25,
        borderRadius: 2,
        border: '1px solid',
        borderColor: emphasis ? alpha(theme.palette.primary.main, 0.5) : 'divider',
        bgcolor: 'background.paper',
        minWidth: 0,
      }}
    >
      <Typography component="dt" variant="body2" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      <Typography
        component="dd"
        sx={{
          m: 0,
          fontSize: '1.5rem',
          fontWeight: 800,
          lineHeight: 1.2,
          fontVariantNumeric: 'tabular-nums',
          overflowWrap: 'anywhere',
          color: emphasis ? 'primary.main' : 'text.primary',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

const QUESTION_ICON: Record<QuestionResult, { Icon: typeof CheckCircleRounded; tone: 'success' | 'error' | 'info' | 'text' }> = {
  right: { Icon: CheckCircleRounded, tone: 'success' },
  wrong: { Icon: CancelRounded, tone: 'error' },
  not_attempted: { Icon: RemoveCircleOutlineRounded, tone: 'text' },
  excused: { Icon: HowToRegRounded, tone: 'info' },
  away: { Icon: PersonOffOutlined, tone: 'text' },
  poll: { Icon: PollOutlined, tone: 'text' },
  pending: { Icon: HourglassEmptyRounded, tone: 'text' },
};

/** Folded under the summary: each question with their answer, the right one, and how it went. */
function QuestionList({ questions }: { questions: RoundQuestionResult[] }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (questions.length === 0) return null;

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
      <Button
        fullWidth
        color="inherit"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={listId}
        endIcon={open ? <ExpandLessRounded aria-hidden /> : <ExpandMoreRounded aria-hidden />}
        sx={{ minHeight: 48, px: 2, justifyContent: 'space-between', fontWeight: 700, textTransform: 'none', fontSize: '1rem' }}
      >
        {open ? 'Hide the questions' : `See each question (${questions.length})`}
      </Button>
      <Collapse in={open} id={listId} unmountOnExit>
        <Stack component="ol" aria-label="Each question" sx={{ listStyle: 'none', m: 0, p: 0, borderTop: '1px solid', borderColor: 'divider' }}>
          {questions.map((question) => {
            const { Icon, tone } = QUESTION_ICON[question.result];
            const toneColor = tone === 'text' ? theme.palette.text.secondary : theme.palette.mode === 'dark' ? theme.palette[tone].light : theme.palette[tone].dark;
            const yours = question.your_answer ? displayAnswer(question.answer_type, question.your_answer) : 'No answer';
            const key = question.correct_keys ? displayKeys(question.answer_type, question.correct_keys) : null;
            return (
              <Stack
                component="li"
                key={question.prompt_id}
                spacing={0.25}
                sx={{ px: 2, py: 1.25, '& + &': { borderTop: '1px solid', borderColor: 'divider' } }}
              >
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                  <Typography fontWeight={700} sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    {promptTitle(question)}
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0, color: toneColor }}>
                    <Icon fontSize="small" aria-hidden />
                    <Typography variant="body2" fontWeight={700} sx={{ color: 'inherit' }}>
                      {QUESTION_RESULT_LABELS[question.result]}
                    </Typography>
                  </Stack>
                </Stack>
                {question.result !== 'away' && question.result !== 'pending' && (
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                    {key ? `You: ${yours}. Answer: ${key}` : `You: ${yours}`}
                  </Typography>
                )}
              </Stack>
            );
          })}
        </Stack>
      </Collapse>
    </Box>
  );
}

function TopFive({ rows, myId }: { rows: RoundTopRow[]; myId: string | null }) {
  const theme = useTheme();
  const listHeadingId = useId();
  if (rows.length === 0) return null;

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center">
        <EmojiEventsRounded sx={{ color: theme.palette.warning.main }} aria-hidden />
        <Typography variant="subtitle1" component="h3" fontWeight={800} id={listHeadingId}>
          Top five
        </Typography>
      </Stack>
      <Stack component="ol" aria-labelledby={listHeadingId} spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {rows.map((row, index) => {
          const mine = myId !== null && row.student_id === myId;
          const name = row.name?.trim() || 'A student';
          const score = `${row.correct} of ${row.counted}`;
          return (
            <Stack
              component="li"
              key={`${row.student_id}-${index}`}
              aria-current={mine ? 'true' : undefined}
              data-mine={mine ? 'true' : undefined}
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{
                position: 'relative',
                minHeight: 56,
                px: 1.5,
                py: 1,
                borderRadius: 2,
                border: mine ? '2px solid' : '1px solid',
                borderColor: mine ? 'primary.main' : 'divider',
                bgcolor: mine ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 28,
                  flexShrink: 0,
                  textAlign: 'center',
                  fontWeight: 800,
                  fontSize: '1.125rem',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {row.rank}
              </Box>
              <Box component="span" sx={VISUALLY_HIDDEN}>{`Rank ${row.rank}: `}</Box>
              <Box aria-hidden sx={{ flexShrink: 0, display: 'flex' }}>
                <StudentAvatar userId={row.student_id} name={name} size={36} clickable={false} snapshot={false} />
              </Box>
              <Typography sx={{ flex: 1, minWidth: 0, fontWeight: mine ? 800 : 600, overflowWrap: 'anywhere' }}>
                {mine ? `${name} (you)` : name}
              </Typography>
              <Typography sx={{ flexShrink: 0, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {score}
                <Box component="span" sx={VISUALLY_HIDDEN}>
                  {' correct'}
                </Box>
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    </Stack>
  );
}

function ResultSkeleton() {
  return (
    <Stack spacing={2} aria-busy="true" aria-label="Loading your result">
      <Stack spacing={1.25} sx={{ p: 2.5, borderRadius: 3, border: '2px solid', borderColor: 'divider' }}>
        <Skeleton variant="text" width="45%" />
        <Skeleton variant="text" height={48} width="80%" />
        <Skeleton variant="text" width="65%" />
        <Skeleton variant="text" width="40%" />
      </Stack>
      <Stack spacing={1}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={56} />
        ))}
      </Stack>
    </Stack>
  );
}
