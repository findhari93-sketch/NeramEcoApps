'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Chip, Skeleton, Typography, useMediaQuery, useTheme } from '@neram/ui';
import AssignmentLateOutlinedIcon from '@mui/icons-material/AssignmentLateOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import AiStatusLine from '@/components/assistant/AiStatusLine';
import { getAiStatus, type AiStatus, type GetToken } from '@/components/assistant/client';
import { focusRing } from '@/components/assistant/focusRing';
import { stableHover } from '@/components/assistant/stableHover';
import { TEST_OPEN } from '@/lib/assistant/tutor/copy';
import type { Chip as TutorChip } from '@/lib/assistant/tutor/types';
import { NOT_READY, type TutorSession } from './useTutorSession';
import TutorTurnList, { COLUMN_MAX, TutorRow } from './TutorTurnList';
import TutorComposer from './TutorComposer';

interface TutorPanelProps {
  session: TutorSession;
  onClose: () => void;
  getToken: GetToken;
  /** One column (a phone): the question card pinned above the conversation. */
  questionCard?: ReactNode;
  /** "Try it myself" was pressed. */
  onTryMyself?: () => void;
  onOpenSimilar: (questionId: string) => void;
}

/**
 * The tutor's side of the focus screen: the conversation in a reading column,
 * the tutor's suggested next moves, and a box to type into. Starts (or
 * resumes, server side) as soon as it mounts. When the tutor cannot start
 * (a test running, no pack) it says so in the middle, with one way out, and
 * offers no box to type into.
 */
export default function TutorPanel({ session, onClose, getToken, questionCard, onTryMyself, onOpenSimilar }: TutorPanelProps) {
  const theme = useTheme();
  const ring = { '&.Mui-focusVisible': focusRing(theme.palette.primary.dark) };
  const { start, send, retry, turns, pending, error, latest, openCheck, started, notReady } = session;

  useEffect(() => {
    start();
  }, [start, session.questionId]);

  // The AI status line only matters once the model has written part of a reply.
  const usedModel = turns.some((t) => t.envelope?.llm);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const statusAsked = useRef(false);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  useEffect(() => {
    if (!usedModel || statusAsked.current) return;
    statusAsked.current = true;
    let alive = true;
    getAiStatus(getTokenRef.current)
      .then((s) => alive && setAiStatus(s))
      .catch(() => alive && setAiStatus(null));
    return () => {
      alive = false;
    };
  }, [usedModel]);

  const onChip = (chip: TutorChip) => {
    void send(chip.action, chip.label);
    if (chip.action.type === 'try_myself') onTryMyself?.();
  };

  const chips = latest?.chips ?? [];
  const testRunning = !!error && error.status === 409 && error.message === TEST_OPEN;
  // Nothing to show but a refusal: no conversation yet and the start was turned away.
  const blocked = notReady || (testRunning && turns.length === 0);
  const firstLoad = turns.length === 0 && !blocked && (pending || !started) && !error;

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', overscrollBehavior: 'contain' }}>
      <AiStatusLine status={aiStatus} />
      {questionCard}

      {blocked ? (
        notReady ? (
          <CentredState
            icon={<SchoolOutlinedIcon aria-hidden sx={{ fontSize: 40, color: 'primary.main' }} />}
            title={NOT_READY}
            body="You can still answer it in the question and check your answer."
            actions={
              <Button variant="contained" onClick={onClose} sx={{ ...stableHover, minHeight: 48, textTransform: 'none', fontWeight: 700, borderRadius: 24, px: 3, ...ring }}>
                Answer it in the question
              </Button>
            }
          />
        ) : (
          <CentredState
            icon={<AssignmentLateOutlinedIcon aria-hidden sx={{ fontSize: 40, color: 'warning.dark' }} />}
            title="You have a test running"
            body="Finish it first, then come back to learn this question with the tutor."
            actions={
              <>
                <Button
                  component={Link}
                  href="/student/tests"
                  variant="contained"
                  sx={{ ...stableHover, minHeight: 48, textTransform: 'none', fontWeight: 700, borderRadius: 24, px: 3, ...ring }}
                >
                  Go to my test
                </Button>
                <Button onClick={() => void retry()} disabled={pending} sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600, borderRadius: 24, px: 2, ...ring }}>
                  I have finished it
                </Button>
              </>
            }
          />
        )
      ) : firstLoad ? (
        <Opening />
      ) : (
        <TutorTurnList
          session={session}
          onChoose={(stepId, choiceId, label) => void send({ type: 'choose', stepId, choiceId }, label)}
          onSave={(ref) => void send({ type: 'save', ref })}
          onOpenSimilar={onOpenSimilar}
        />
      )}

      {!blocked && (
        <Box sx={{ flexShrink: 0, px: 2, pt: 1, pb: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
          <Box sx={{ maxWidth: COLUMN_MAX, mx: 'auto', display: 'grid', gap: 1 }}>
            {error && (
              <Alert
                severity="warning"
                sx={{ borderRadius: 3, alignItems: 'center' }}
                action={
                  error.retryable ? (
                    <Button color="inherit" onClick={() => void retry()} disabled={pending} sx={{ minHeight: 44, fontWeight: 700, textTransform: 'none' }}>
                      Retry
                    </Button>
                  ) : undefined
                }
              >
                {error.message}
              </Alert>
            )}
            {chips.length > 0 && (
              <Box role="list" aria-label="Suggested next steps" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {chips.map((c, i) => (
                  <Box key={c.label} role="listitem" sx={{ display: 'flex', maxWidth: '100%' }}>
                    <Chip
                      label={c.label}
                      onClick={() => onChip(c)}
                      disabled={pending}
                      // The first is the tutor's recommendation.
                      variant={i === 0 ? 'filled' : 'outlined'}
                      color="primary"
                      data-testid="tutor-chip"
                      sx={{
                        ...stableHover,
                        height: 'auto',
                        minHeight: 44,
                        maxWidth: '100%',
                        borderRadius: 22,
                        fontSize: '0.9375rem',
                        fontWeight: 600,
                        px: 0.75,
                        cursor: 'pointer',
                        '& .MuiChip-label': { whiteSpace: 'normal', py: 0.75 },
                        // The theme greys a filled chip; the recommendation is solid primary.
                        ...(i === 0
                          ? {
                              bgcolor: 'primary.main',
                              color: 'primary.contrastText',
                              '@media (hover: hover)': { '&:hover': { bgcolor: 'primary.dark' } },
                            }
                          : {}),
                        ...ring,
                      }}
                    />
                  </Box>
                ))}
              </Box>
            )}
            <TutorComposer numberMode={openCheck?.input === 'number'} disabled={pending} onSend={(t) => void send({ type: 'answer', text: t }, t)} />
          </Box>
        </Box>
      )}
    </Box>
  );
}

/** The tutor cannot start here: one sentence, one way on. */
function CentredState({ icon, title, body, actions }: { icon: ReactNode; title: string; body: string; actions: ReactNode }) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
      <Box role="status" sx={{ maxWidth: 420, textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 1.5 }}>
        {icon}
        <Typography variant="h6" component="p" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          {title}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          {body}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1, mt: 1 }}>{actions}</Box>
      </Box>
    </Box>
  );
}

/** While the first reply is on its way: the tutor's greeting, then where its words will land. */
function Opening() {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const animation = reduce ? false : 'pulse';
  return (
    <Box role="status" aria-label="Opening the tutor" sx={{ flex: 1, minHeight: 0, px: 2, py: { xs: 2, md: 3 } }}>
      <Box sx={{ maxWidth: COLUMN_MAX, mx: 'auto' }}>
        <TutorRow>
          <Typography variant="body1" sx={{ fontWeight: 600, lineHeight: 1.6 }}>
            Let&apos;s work through this together.
          </Typography>
          <Box>
            <Skeleton animation={animation} width="92%" />
            <Skeleton animation={animation} width="70%" />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Skeleton animation={animation} variant="rounded" width={120} height={44} sx={{ borderRadius: 22 }} />
            <Skeleton animation={animation} variant="rounded" width={100} height={44} sx={{ borderRadius: 22 }} />
          </Box>
        </TutorRow>
      </Box>
    </Box>
  );
}
