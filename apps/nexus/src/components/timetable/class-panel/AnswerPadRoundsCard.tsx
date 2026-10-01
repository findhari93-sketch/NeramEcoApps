'use client';

/**
 * The Answer Pad rounds run in this class, on the drawer's After tab.
 *
 * Teacher: every round, one row each, with the class numbers and whether its
 * results are published. Each row opens the round's report, where results are
 * published or withdrawn.
 *
 * Student: published rounds only. How many they attempted, how many were
 * right, their own rank out of everyone who joined, and the top five (their
 * own row marked when they are in it). Never anyone else's score beyond it.
 *
 * Most classes never run the pad, so the card draws nothing at all until it
 * knows there is a round to show, rather than a skeleton that then vanishes.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Box, Button, Chip, Stack, Typography, alpha, useTheme } from '@neram/ui';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import { useNexusSWR, type GetToken } from '@/lib/nexus-swr';
import { RESULT_LABELS, rankLine, roundName, scoreLine, type ResultLabel, type RoundTopRow } from '@/lib/pad/round-results';
import { SECTION_LABEL_SX } from '../timetable-theme';

export interface TeacherRound {
  session_id: string;
  round_no: number | null;
  status: 'live' | 'ended';
  created_at: string;
  ended_at: string | null;
  results_published_at: string | null;
  class: {
    questions: number;
    graded: number;
    pending_keys?: number;
    joined?: number;
    took_part: number;
    enrolled?: number;
    average_score: number | null;
    average_participation?: number | null;
  };
  top: RoundTopRow[];
}

export interface StudentRoundMe {
  student_id: string;
  correct: number;
  counted: number;
  attempted: number;
  no_answer: number;
  answered: number;
  present_for: number;
  score_pct: number | null;
  label: ResultLabel | null;
  not_active: boolean;
  rank: number | null;
  ranked_of: number;
  in_top: boolean;
}

/** "Attempted 14 of 18 · 11 right · Rank 7 of 22" */
export function studentRoundLine(me: Pick<StudentRoundMe, 'counted' | 'attempted' | 'correct' | 'rank' | 'ranked_of'>): string {
  if (me.counted === 0) return scoreLine(me);
  const rank = rankLine(me);
  return [`Attempted ${me.attempted} of ${me.counted}`, `${me.correct} right`, rank ? `Rank ${rank}` : null].filter(Boolean).join(' · ');
}

export interface StudentRound {
  session_id: string;
  round_no: number | null;
  results_published_at: string | null;
  me: StudentRoundMe | null;
  top: RoundTopRow[];
  class: { questions: number; graded: number; took_part: number; average_score: number | null };
}

export type AnswerPadRoundsPayload =
  | { role: 'teacher'; rounds: TeacherRound[] }
  | { role: 'student'; rounds: StudentRound[] };

export function answerPadRoundsKey(classId: string): string {
  return `/api/timetable/${classId}/answer-pad`;
}

const LABEL_COLOR: Record<ResultLabel, 'success' | 'info' | 'warning'> = {
  strong: 'success',
  good: 'info',
  needs_practice: 'warning',
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Round 1 · 18 questions · average 61% · 22 took part" */
export function teacherRoundLine(round: TeacherRound): string {
  const parts = [
    roundName(round.round_no),
    plural(round.class.questions, 'question'),
    round.class.average_score === null ? 'no score yet' : `average ${round.class.average_score}%`,
    `${round.class.took_part} took part`,
  ];
  return parts.join(' · ');
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box
      component="section"
      aria-label={title}
      sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <QuizOutlinedIcon sx={{ fontSize: 20, color: 'text.secondary' }} aria-hidden />
        <Typography component="h3" sx={{ ...SECTION_LABEL_SX, mb: 0, flex: 1 }}>
          {title}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

function TeacherRounds({ rounds }: { rounds: TeacherRound[] }) {
  return (
    <Frame title="Answer Pad">
      <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {rounds.map((round) => {
          const published = !!round.results_published_at;
          const live = round.status === 'live';
          const pending = round.class.pending_keys ?? 0;
          return (
            <li key={round.session_id}>
              <Box
                component={Link}
                href={`/teacher/answer-pad/sessions/${round.session_id}`}
                aria-label={`${teacherRoundLine(round)}. ${live ? 'Still running' : published ? 'Published' : 'Not published'}. Open the report`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  minHeight: 48,
                  px: 1.25,
                  py: 1,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  color: 'text.primary',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 150ms ease',
                  '&:hover': { bgcolor: 'action.hover' },
                  '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                    {teacherRoundLine(round)}
                  </Typography>
                  {pending > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      {pending === 1 ? '1 question needs its answer set' : `${pending} questions need their answers set`}
                    </Typography>
                  )}
                </Box>
                <Chip
                  size="small"
                  variant="outlined"
                  color={live ? 'default' : published ? 'success' : 'default'}
                  label={live ? 'Still running' : published ? 'Published' : 'Not published'}
                  sx={{ flexShrink: 0, fontWeight: 600 }}
                />
                <ChevronRightIcon sx={{ color: 'text.secondary', flexShrink: 0 }} aria-hidden />
              </Box>
            </li>
          );
        })}
      </Stack>
    </Frame>
  );
}

function TopFive({ top, myId }: { top: RoundTopRow[]; myId: string | null }) {
  const theme = useTheme();
  if (top.length === 0) return null;
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
        Top five
      </Typography>
      <Box component="ol" aria-label="Top five" sx={{ listStyle: 'none', m: 0, mt: 0.5, p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {top.slice(0, 5).map((row, index) => {
          const mine = !!myId && row.student_id === myId;
          const name = row.name?.trim() || 'A student';
          return (
            <Box
              component="li"
              key={`${row.student_id}-${index}`}
              aria-label={`Rank ${row.rank}: ${mine ? `${name} (you)` : name}, ${row.correct} of ${row.counted} correct`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.75,
                borderRadius: 1.5,
                bgcolor: mine ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                border: '1px solid',
                borderColor: mine ? alpha(theme.palette.primary.main, 0.5) : 'transparent',
              }}
            >
              <Typography variant="body2" sx={{ width: '2ch', flexShrink: 0, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {row.rank}
              </Typography>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: mine ? 700 : 500, overflowWrap: 'anywhere' }}>
                {name}
                {mine && (
                  <Box component="span" sx={{ ml: 0.75, fontWeight: 700, color: 'primary.main' }}>
                    (you)
                  </Box>
                )}
              </Typography>
              <Typography variant="body2" sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                {`${row.correct} of ${row.counted}`}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function StudentRounds({ rounds }: { rounds: StudentRound[] }) {
  return (
    <Frame title="Your Answer Pad">
      <Stack spacing={2}>
        {rounds.map((round) => {
          const me = round.me;
          const name = roundName(round.round_no);
          return (
            <Stack key={round.session_id} component="article" aria-label={name} spacing={1}>
              {me ? (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                      {name}
                    </Typography>
                    {me.label && (
                      <Chip size="small" variant="outlined" color={LABEL_COLOR[me.label]} label={RESULT_LABELS[me.label]} sx={{ fontWeight: 600 }} />
                    )}
                  </Box>
                  <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {studentRoundLine(me)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {[
                      me.present_for > 0 ? '' : 'You were not in the pad for any question.',
                      round.class.average_score !== null ? `Class average ${round.class.average_score}%.` : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  </Typography>
                  {me.not_active && me.present_for > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Answer every question next time, a guess is fine.
                    </Typography>
                  )}
                </>
              ) : (
                <>
                  <Typography variant="body1" sx={{ fontWeight: 700 }}>
                    {name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    You did not join this round.
                    {round.class.average_score !== null ? ` Class average ${round.class.average_score}%.` : ''}
                  </Typography>
                </>
              )}
              <TopFive top={round.top} myId={me?.in_top ? me.student_id : null} />
            </Stack>
          );
        })}
      </Stack>
    </Frame>
  );
}

export default function AnswerPadRoundsCard({ classId, getToken }: { classId: string; getToken: GetToken }) {
  const { data, error, mutate } = useNexusSWR<AnswerPadRoundsPayload>(classId ? answerPadRoundsKey(classId) : null, getToken);

  if (!data) {
    // A server fault is said out loud; a class the reader cannot see, or no data yet, draws nothing.
    if (error && (error.status >= 500 || error.status === 408)) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            Could not load the Answer Pad rounds for this class.
          </Typography>
          <Button size="small" onClick={() => void mutate()} sx={{ minHeight: 44, textTransform: 'none' }}>
            Try again
          </Button>
        </Box>
      );
    }
    return null;
  }

  const rounds = Array.isArray(data.rounds) ? data.rounds : [];
  if (rounds.length === 0) return null;

  return data.role === 'teacher' ? (
    <TeacherRounds rounds={rounds as TeacherRound[]} />
  ) : (
    <StudentRounds rounds={rounds as StudentRound[]} />
  );
}
