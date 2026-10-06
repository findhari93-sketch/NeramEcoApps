'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Box, Paper, Skeleton, alpha, useMediaQuery, useTheme } from '@neram/ui';
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

/** The three-line bubble while a turn is in flight. Still under reduced motion. */
export function PendingBubble() {
  const theme = useTheme();
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const animation = reduce ? false : 'pulse';
  return (
    <Box role="status" aria-label="The tutor is thinking" sx={{ display: 'flex' }}>
      <Paper elevation={0} sx={{ p: 1.5, borderRadius: 3, width: '75%', bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
        <Skeleton animation={animation} width="92%" />
        <Skeleton animation={animation} width="78%" />
        <Skeleton animation={animation} width="45%" />
      </Paper>
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
        return (
          <Paper elevation={0} sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.06), maxWidth: '100%' }}>
            <TutorText md={b.md} />
          </Paper>
        );
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
            sx={{ px: 1.5, py: 1, borderRadius: 3, maxWidth: '85%', minWidth: 0, bgcolor: 'primary.main', color: 'primary.contrastText' }}
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
      <Box key={t.id} ref={isLast ? lastTurnRef : undefined} sx={{ display: 'grid', gap: 1.25, minWidth: 0 }}>
        {blocks.map((b) => (
          <Box key={b.id} sx={{ minWidth: 0 }}>
            {renderBlock(b)}
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Box
      ref={scrollRef}
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
        py: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.75,
      }}
    >
      {children}
      {turns.map((t, i) => renderTurn(t, i === turns.length - 1))}
      {pending && turns.length > 0 && <PendingBubble />}
    </Box>
  );
}
