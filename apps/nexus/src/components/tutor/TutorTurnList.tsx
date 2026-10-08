'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, IconButton, Paper, Skeleton, alpha, useMediaQuery, useTheme } from '@neram/ui';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import { focusRing } from '@/components/assistant/focusRing';
import type { TutorBlock } from '@/lib/assistant/tutor/types';
import MathText from '@/components/common/MathText';
import { SR_ONLY } from '@/components/question-bank/practice/QuestionRow';
import type { TutorSession, TutorTurn } from './useTutorSession';
import TutorText from './blocks/TutorText';
import CheckQuestion from './blocks/CheckQuestion';
import HintCard from './blocks/HintCard';
import Verdict from './blocks/Verdict';
import StepProgress from './blocks/StepProgress';
import ConceptChips from './blocks/ConceptChips';
import SimilarQuestions from './blocks/SimilarQuestions';
import SaveOffer from './blocks/SaveOffer';
import SolutionBlock from './blocks/SolutionBlock';

interface TutorTurnListProps {
  session: TutorSession;
  onChoose: (stepId: string, choiceId: string, label: string) => void;
  onSave: (ref: string) => void;
  onOpenSimilar: (questionId: string) => void;
  /** Sits above the first turn, inside the scroll (the phone's question card is outside it). */
  children?: ReactNode;
}

/** The reading column: ChatGPT-like, about 70 characters a line at 16px. */
export const COLUMN_MAX = 720;

/** The tutor's mark at the start of each of its turns. */
export function TutorAvatar() {
  const theme = useTheme();
  return (
    <Box
      aria-hidden
      sx={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: alpha(theme.palette.primary.main, 0.12),
        color: 'primary.main',
        mt: '2px',
      }}
    >
      <SchoolOutlinedIcon sx={{ fontSize: 18 }} />
    </Box>
  );
}

/** A tutor turn's frame: the avatar, then the blocks. */
export function TutorRow({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', columnGap: 1.5, alignItems: 'start', minWidth: 0 }}>
      <TutorAvatar />
      <Box sx={{ display: 'grid', gap: 1.25, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

/** Three lines while a turn is in flight. Still under reduced motion. */
export function PendingBubble() {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const animation = reduce ? false : 'pulse';
  return (
    <Box role="status" aria-label="The tutor is thinking">
      <TutorRow>
        <Box sx={{ width: '80%' }}>
          <Skeleton animation={animation} width="92%" />
          <Skeleton animation={animation} width="78%" />
          <Skeleton animation={animation} width="45%" />
        </Box>
      </TutorRow>
    </Box>
  );
}

/**
 * The conversation: the student's presses on the right, the tutor's blocks on
 * the left. A polite live log, so a screen reader hears each reply once.
 *
 * New replies scroll into view from their FIRST line, not the bottom: a reply
 * is often a verdict, a paragraph and a check, and landing on the check means
 * the student never reads why.
 */
export default function TutorTurnList({ session, onChoose, onSave, onOpenSimilar, children }: TutorTurnListProps) {
  const theme = useTheme();
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastTurnRef = useRef<HTMLDivElement | null>(null);
  const { turns, pending } = session;
  const lastTurn = turns[turns.length - 1];
  // Scrolled up to reread: offer a way back down.
  const [away, setAway] = useState(false);
  const onScroll = useCallback(() => {
    const box = scrollRef.current;
    if (box) setAway(box.scrollHeight - box.scrollTop - box.clientHeight > 240);
  }, []);
  const toLatest = () => {
    const box = scrollRef.current;
    box?.scrollTo?.({ top: box.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';
    if (pending || lastTurn?.who === 'student') {
      box.scrollTo?.({ top: box.scrollHeight, behavior });
      return;
    }
    const el = lastTurnRef.current;
    if (el) box.scrollTo?.({ top: Math.max(0, el.offsetTop - 8), behavior });
  }, [turns.length, pending, lastTurn, reduce]);

  const renderBlock = (b: TutorBlock) => {
    switch (b.kind) {
      case 'tutor_text':
        // No bubble: the teaching reads as the page, as in ChatGPT and Claude.
        return <TutorText md={b.md} />;
      case 'check_question':
        return (
          <CheckQuestion
            block={b}
            interactive={b === session.openCheck}
            disabled={pending}
            onChoose={(choiceId, label) => onChoose(b.stepId, choiceId, label)}
          />
        );
      case 'hint':
        return <HintCard level={b.level} md={b.md} />;
      case 'verdict':
        return <Verdict result={b.result} md={b.md} mistakeLabel={b.mistakeLabel} />;
      case 'step_progress':
        return <StepProgress index={b.index} total={b.total} />;
      case 'concept_chips':
        return <ConceptChips items={b.items} />;
      case 'similar_questions':
        return <SimilarQuestions items={b.items} onOpen={onOpenSimilar} disabled={pending} />;
      case 'save_offer':
        return (
          <SaveOffer
            title={b.title}
            itemKind={b.itemKind}
            saved={session.saved.has(b.ref)}
            disabled={pending}
            onSave={() => onSave(b.ref)}
          />
        );
      case 'solution':
        return <SolutionBlock steps={b.steps} finalMd={b.final_md} />;
      default:
        return null;
    }
  };

  const renderTurn = (t: TutorTurn, isLast: boolean) => {
    if (t.who === 'student') {
      return (
        <Box key={t.id} ref={isLast ? lastTurnRef : undefined} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Paper
            elevation={0}
            sx={{
              px: 2,
              py: 1.25,
              borderRadius: '20px 20px 6px 20px',
              maxWidth: '85%',
              minWidth: 0,
              // Soft, so the student's own line does not outshout the teaching.
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: 'text.primary',
            }}
          >
            <Box component="span" sx={SR_ONLY}>
              You:
            </Box>
            <MathText text={t.text || ''} variant="body1" color="inherit" sx={{ overflowWrap: 'anywhere', '& .katex': { color: 'inherit' } }} />
          </Paper>
        </Box>
      );
    }
    const blocks = t.envelope?.blocks || [];
    if (!blocks.length) return null;
    return (
      <Box key={t.id} ref={isLast ? lastTurnRef : undefined} sx={{ minWidth: 0 }}>
        <TutorRow>
          {blocks.map((b) => (
            <Box key={b.id} sx={{ minWidth: 0 }}>
              {renderBlock(b)}
            </Box>
          ))}
        </TutorRow>
      </Box>
    );
  };

  return (
    <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Tutor conversation"
        data-tutor-log
        sx={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          px: 2,
          py: { xs: 2, md: 3 },
        }}
      >
        {/* The scrollbar stays at the edge; the words keep to a reading column. */}
        <Box sx={{ maxWidth: COLUMN_MAX, mx: 'auto', display: 'flex', flexDirection: 'column', gap: { xs: 2.5, md: 3 } }}>
          {children}
          {turns.map((t, i) => renderTurn(t, i === turns.length - 1))}
          {pending && turns.length > 0 && <PendingBubble />}
        </Box>
      </Box>
      {away && (
        <IconButton
          onClick={toLatest}
          aria-label="Jump to the latest reply"
          sx={{
            position: 'absolute',
            left: '50%',
            bottom: 12,
            transform: 'translateX(-50%)',
            width: 44,
            height: 44,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: 2,
            '@media (hover: hover)': { '&:hover': { bgcolor: 'background.paper', borderColor: 'primary.main' } },
            '&.Mui-focusVisible': focusRing(theme.palette.primary.dark),
          }}
        >
          <ArrowDownwardRoundedIcon />
        </IconButton>
      )}
    </Box>
  );
}
