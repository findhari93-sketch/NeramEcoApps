'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, IconButton, Skeleton, Typography, useMediaQuery, useTheme } from '@neram/ui';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import AiStatusLine from '@/components/assistant/AiStatusLine';
import { getAiStatus, type AiStatus, type GetToken } from '@/components/assistant/client';
import { focusRing } from '@/components/assistant/focusRing';
import { stableHover } from '@/components/assistant/stableHover';
import MathText from '@/components/common/MathText';
import type { Chip as TutorChip } from '@/lib/assistant/tutor/types';
import { NOT_READY, type TutorSession } from './useTutorSession';
import TutorTurnList from './TutorTurnList';
import TutorComposer from './TutorComposer';

interface TutorPanelProps {
  session: TutorSession;
  /** `sheet`: the phone's full-screen dialog; `dock`: a column beside the reader. */
  variant: 'sheet' | 'dock';
  onClose: () => void;
  getToken: GetToken;
  /** The question being taught, for the phone's collapsible card. */
  questionText?: string | null;
  /** "Try it myself" was pressed: the phone goes back to the reader. */
  onTryMyself?: () => void;
  onOpenSimilar: (questionId: string) => void;
}

/**
 * The AI Tutor: a header with where the student is (step, hints), the
 * conversation, the tutor's suggested next moves as chips, and a box to type
 * into. Starts (or resumes, server side) as soon as it mounts.
 */
export default function TutorPanel({ session, variant, onClose, getToken, questionText, onTryMyself, onOpenSimilar }: TutorPanelProps) {
  const theme = useTheme();
  const ring = { '&.Mui-focusVisible': focusRing(theme.palette.primary.dark) };
  const { start, send, retry, turns, pending, error, latest, progress, hintsUsed, openCheck, started, notReady } = session;

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
  const firstLoad = turns.length === 0 && !notReady && (pending || !started) && !error;
  const subtitle = [
    progress ? `Step ${progress.step} of ${progress.total}` : null,
    hintsUsed > 0 ? `Hint ${hintsUsed} of 4` : null,
  ].filter(Boolean);

  return (
    <Box
      // Docked beside the reader, the practice screen's letter and arrow keys
      // would answer the question or move on while the student is in here.
      onKeyDown={variant === 'dock' ? (e) => e.stopPropagation() : undefined}
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        overscrollBehavior: 'contain',
      }}
    >
      {/* Header: never scrolls */}
      <Box
        component="header"
        sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          pl: 2,
          pr: 0.5,
          minHeight: 56,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <SchoolOutlinedIcon aria-hidden sx={{ color: 'primary.main' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
            Tutor
          </Typography>
          {subtitle.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              {subtitle.map((s) => (
                <Typography key={s} variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }} data-testid="tutor-progress">
                  {s}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
        <IconButton onClick={onClose} aria-label="Close tutor" sx={{ width: 48, height: 48, flexShrink: 0, ...ring }}>
          <CloseRoundedIcon />
        </IconButton>
      </Box>

      <AiStatusLine status={aiStatus} />

      {variant === 'sheet' && questionText && <QuestionCard text={questionText} />}

      {notReady ? (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, textAlign: 'center' }}>
          <Box>
            <SchoolOutlinedIcon aria-hidden sx={{ fontSize: 44, color: 'text.secondary', mb: 1 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }} role="status">
              {NOT_READY}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              You can still answer it in the question and check your answer.
            </Typography>
          </Box>
        </Box>
      ) : firstLoad ? (
        <PanelSkeleton />
      ) : (
        <TutorTurnList
          session={session}
          onChoose={(stepId, choiceId, label) => void send({ type: 'choose', stepId, choiceId }, label)}
          onSave={(ref) => void send({ type: 'save', ref })}
          onOpenSimilar={onOpenSimilar}
        />
      )}

      {!notReady && (
        <Box
          sx={{
            flexShrink: 0,
            borderTop: '1px solid',
            borderColor: 'divider',
            pb: variant === 'sheet' ? 'calc(8px + env(safe-area-inset-bottom, 0px))' : 1,
          }}
        >
          {error && (
            <Alert
              severity="warning"
              sx={{ mx: 2, mt: 1, borderRadius: 2, alignItems: 'center' }}
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
            <Box role="list" aria-label="Next steps" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, px: 2, pt: 1 }}>
              {chips.map((c) => (
                <Box key={c.label} role="listitem" sx={{ display: 'flex', maxWidth: '100%' }}>
                  <Chip
                    label={c.label}
                    onClick={() => onChip(c)}
                    disabled={pending}
                    variant="outlined"
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
                      px: 0.5,
                      cursor: 'pointer',
                      '& .MuiChip-label': { whiteSpace: 'normal', py: 0.75 },
                      ...ring,
                    }}
                  />
                </Box>
              ))}
            </Box>
          )}
          <TutorComposer numberMode={openCheck?.input === 'number'} disabled={pending} onSend={(t) => void send({ type: 'answer', text: t }, t)} />
        </Box>
      )}
    </Box>
  );
}

/** The phone's question, two lines tall until tapped. */
function QuestionCard({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  return (
    <Box sx={{ flexShrink: 0, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
      <Button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Collapse the question' : 'Show the whole question'}
        fullWidth
        endIcon={<ExpandMoreRoundedIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />}
        sx={{
          ...stableHover,
          minHeight: 48,
          px: 2,
          py: 1,
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          textAlign: 'left',
          textTransform: 'none',
          color: 'text.primary',
          fontWeight: 400,
          borderRadius: 0,
          '&.Mui-focusVisible': focusRing(theme.palette.primary.dark),
          '& .MuiButton-endIcon': { mt: '2px' },
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1, maxHeight: open ? '40vh' : 'none', overflowY: open ? 'auto' : 'hidden' }}>
          <MathText
            text={text}
            variant="body2"
            sx={
              open
                ? { overflowWrap: 'anywhere' }
                : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal', overflowWrap: 'anywhere' }
            }
          />
        </Box>
      </Button>
    </Box>
  );
}

function PanelSkeleton() {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const animation = reduce ? false : 'pulse';
  return (
    <Box role="status" aria-label="Opening the tutor" sx={{ flex: 1, p: 2, display: 'grid', gap: 1.5, alignContent: 'start' }}>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Skeleton animation={animation} variant="rounded" width={140} height={32} sx={{ borderRadius: 4 }} />
        <Skeleton animation={animation} variant="rounded" width={110} height={32} sx={{ borderRadius: 4 }} />
      </Box>
      <Skeleton animation={animation} variant="rounded" height={72} sx={{ borderRadius: 3 }} />
      <Skeleton animation={animation} variant="rounded" height={48} sx={{ borderRadius: 2 }} />
      <Skeleton animation={animation} variant="rounded" height={48} sx={{ borderRadius: 2 }} />
    </Box>
  );
}
