'use client';

import { useEffect, useRef, type MutableRefObject, type MouseEvent, type ReactNode } from 'react';
import { Alert, Box, Button, IconButton, Skeleton, Tooltip, Typography } from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ReplayIcon from '@mui/icons-material/Replay';
import type { NexusQBQuestionDetail } from '@neram/database';
import EmptyStateIcon from '@mui/icons-material/QuizOutlined';
import QuestionDetail from '../QuestionDetail';
import { useQuestionAnswer, type PriorAnswer } from '../useQuestionAnswer';
import LangToggle from './LangToggle';
import { SR_ONLY } from './QuestionRow';

/** What the keyboard shortcuts can do to the open question. */
export interface ReaderAnswerHandle {
  selectOption: (index: number) => void;
  /** Check the answer, or move on once it is checked. */
  primary: () => void;
}

interface PracticeReaderProps {
  /** `pane` beside the rail on a laptop, `screen` for the phone's full-screen reader. */
  variant: 'pane' | 'screen';
  questionId: string | null;
  detail: NexusQBQuestionDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  /** "Q18 of 30" or "3 of 120". */
  positionLabel: string;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Open the number grid from the position label. */
  onJump: (anchor: HTMLElement) => void;
  onClose?: () => void;
  lang: 'en' | 'hi';
  onLangChange: (lang: 'en' | 'hi') => void;
  showLang: boolean;
  showSourceBadges: boolean;
  priorAnswer: (id: string) => PriorAnswer | null;
  onSubmit: (id: string, answer: string) => Promise<{ isCorrect: boolean }>;
  onStudyToggle: (id: string) => void;
  onReport: (id: string, reportType: string, description: string) => Promise<void>;
  onRetryLoad: () => void;
  /** Filled in by the open question, for the keyboard shortcuts. */
  answerHandle?: MutableRefObject<ReaderAnswerHandle | null>;
}

/**
 * The question being read: a header that never scrolls, a body that does, and
 * an action bar pinned under it.
 *
 * On a laptop this is the right-hand pane, and it used to be a sticky box that
 * never stuck (the student layout's <main> does not scroll, the document does),
 * so the question slid off the top while the student scrolled the list. It is
 * now a column inside a viewport-high shell, so nothing but the body scrolls.
 * On a phone the same column fills the screen.
 *
 * The body and the action bar are keyed by question, so moving on starts at
 * the top of the new question with a clean answer, or with the answer given to
 * it earlier in this visit.
 */
export default function PracticeReader(props: PracticeReaderProps) {
  const {
    variant,
    questionId,
    detail,
    detailLoading,
    detailError,
    positionLabel,
    hasPrev,
    hasNext,
    onPrev,
    onNext,
    onJump,
    onClose,
    lang,
    onLangChange,
    showLang,
  } = props;

  const screen = variant === 'screen';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: 'background.paper' }}>
      {/* Header: never scrolls */}
      <Box
        component="header"
        sx={{
          position: 'relative',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: { xs: 0.5, md: 1.5 },
          minHeight: 56,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {screen && onClose && (
          <IconButton onClick={onClose} aria-label="Back to the question list" sx={{ width: 48, height: 48 }}>
            <ArrowBackIcon />
          </IconButton>
        )}
        {!screen && (
          <Tooltip title="Previous (Left arrow)">
            <span>
              <IconButton onClick={onPrev} disabled={!hasPrev} aria-label="Previous question" sx={{ width: 48, height: 48 }}>
                <ChevronLeftIcon />
              </IconButton>
            </span>
          </Tooltip>
        )}
        <Button
          onClick={(e: MouseEvent<HTMLElement>) => onJump(e.currentTarget)}
          endIcon={<ArrowDropDownIcon />}
          aria-haspopup="dialog"
          aria-label={`${positionLabel}. Jump to a question`}
          sx={{
            minHeight: 44,
            px: 1.5,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: '1rem',
            color: 'text.primary',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {positionLabel}
        </Button>
        {!screen && (
          <Tooltip title="Next (Right arrow)">
            <span>
              <IconButton onClick={onNext} disabled={!hasNext} aria-label="Next question" sx={{ width: 48, height: 48 }}>
                <ChevronRightIcon />
              </IconButton>
            </span>
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        {showLang && <LangToggle lang={lang} onChange={onLangChange} />}
        {/* Said once per move, so a screen reader hears where it landed. */}
        <Box component="span" aria-live="polite" sx={SR_ONLY}>
          {positionLabel}
        </Box>
      </Box>

      {!questionId ? (
        <ReaderEmpty />
      ) : detailError ? (
        <ReaderShell {...props} footer={null}>
          <Alert
            severity="warning"
            sx={{ borderRadius: 2 }}
            action={
              <Button color="inherit" onClick={props.onRetryLoad} sx={{ minHeight: 44 }}>
                Try again
              </Button>
            }
          >
            {detailError}
          </Alert>
        </ReaderShell>
      ) : detailLoading || !detail || detail.id !== questionId ? (
        <ReaderShell {...props} footer={<ActionBar {...props} state="loading" />}>
          <Skeleton variant="text" width="30%" height={28} />
          <Skeleton variant="text" width="95%" />
          <Skeleton variant="text" width="80%" />
          <Box sx={{ display: 'grid', gap: 1, mt: 2 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={56} sx={{ borderRadius: 2 }} />
            ))}
          </Box>
        </ReaderShell>
      ) : (
        <ReaderQuestion key={detail.id} {...props} detail={detail} />
      )}
    </Box>
  );
}

// ─── The open question ───────────────────────────────────────────────────────

function ReaderQuestion(props: PracticeReaderProps & { detail: NexusQBQuestionDetail }) {
  const { detail, lang, showSourceBadges, priorAnswer, onSubmit, onStudyToggle, onReport, answerHandle } = props;

  const answer = useQuestionAnswer({
    questionId: detail.id,
    correctAnswer: detail.correct_answer,
    onSubmit: (value) => onSubmit(detail.id, value),
    prior: priorAnswer(detail.id),
  });

  const answerable =
    detail.question_format !== 'DRAWING_PROMPT' && !!detail.options && detail.options.length > 0;

  // The keyboard reaches the options and the primary action through here.
  const latest = useRef({ answer, answerable, props });
  latest.current = { answer, answerable, props };
  useEffect(() => {
    if (!answerHandle) return;
    answerHandle.current = {
      selectOption: (index) => {
        const { answer: a, answerable: ok } = latest.current;
        const option = detail.options?.[index];
        if (ok && option && !a.submitted) a.select(option.id);
      },
      primary: () => runPrimary(latest.current.answer, latest.current.answerable, latest.current.props),
    };
    return () => {
      answerHandle.current = null;
    };
  }, [answerHandle, detail]);

  return (
    <ReaderShell {...props} footer={<ActionBar {...props} state="ready" answer={answer} answerable={answerable} />}>
      <QuestionDetail
        question={detail}
        onSubmit={(value) => onSubmit(detail.id, value)}
        onStudyToggle={() => onStudyToggle(detail.id)}
        onReport={(type, description) => onReport(detail.id, type, description)}
        onNext={props.onNext}
        onPrev={props.onPrev}
        hasNext={props.hasNext}
        hasPrev={props.hasPrev}
        currentIndex={0}
        totalCount={0}
        answer={answer}
        lang={lang}
        hideNav
        hideActions
        showSourceBadges={showSourceBadges}
        showRepeatBadges
      />
    </ReaderShell>
  );
}

function runPrimary(
  answer: ReturnType<typeof useQuestionAnswer>,
  answerable: boolean,
  props: PracticeReaderProps,
) {
  if (answerable && !answer.submitted) {
    if (answer.selected && !answer.submitting) void answer.submit();
    return;
  }
  if (props.hasNext) props.onNext();
}

// ─── Layout pieces ───────────────────────────────────────────────────────────

function ReaderShell({ children, footer, variant }: PracticeReaderProps & { children: ReactNode; footer: ReactNode }) {
  return (
    <>
      {/* Body: the only thing that scrolls. Keyed with the question, so it opens at the top. */}
      <Box
        data-reader-body
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          px: { xs: 2, md: 3 },
          pt: { xs: 2, md: 2.5 },
          pb: 3,
        }}
      >
        <Box sx={{ maxWidth: 760, mx: 'auto' }}>{children}</Box>
      </Box>
      {footer && (
        <Box
          sx={{
            flexShrink: 0,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            px: { xs: 1, md: 2 },
            pt: 1,
            pb: variant === 'screen' ? 'calc(8px + env(safe-area-inset-bottom, 0px))' : 1,
            // The report-a-problem button sits bottom right on a laptop.
            pr: { md: 11 },
          }}
        >
          {footer}
        </Box>
      )}
    </>
  );
}

interface ActionBarProps extends PracticeReaderProps {
  state: 'loading' | 'ready';
  answer?: ReturnType<typeof useQuestionAnswer>;
  answerable?: boolean;
}

function ActionBar(props: ActionBarProps) {
  const { state, answer, answerable, hasPrev, hasNext, onPrev, onNext, onClose, variant } = props;
  const submitted = !!answer?.submitted;

  let primary: ReactNode;
  if (state === 'loading') {
    primary = (
      <Button variant="contained" fullWidth disabled sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}>
        Check answer
      </Button>
    );
  } else if (answerable && !submitted) {
    primary = (
      <Button
        variant="contained"
        fullWidth
        disabled={!answer?.selected || answer.submitting}
        onClick={() => void answer?.submit()}
        sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, fontSize: '1rem' }}
      >
        {answer?.submitting ? 'Checking...' : answer?.selected ? 'Check answer' : 'Choose an answer'}
      </Button>
    );
  } else if (hasNext) {
    primary = (
      <Button
        variant="contained"
        fullWidth
        onClick={onNext}
        endIcon={<ChevronRightIcon />}
        sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, fontSize: '1rem' }}
      >
        Next question
      </Button>
    );
  } else if (variant === 'screen' && onClose) {
    primary = (
      <Button variant="contained" fullWidth onClick={onClose} sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, fontSize: '1rem' }}>
        Back to the list
      </Button>
    );
  } else {
    primary = (
      <Button variant="outlined" fullWidth disabled sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}>
        Last question
      </Button>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, maxWidth: 760, mx: 'auto' }}>
      <IconButton
        onClick={onPrev}
        disabled={!hasPrev}
        aria-label="Previous question"
        sx={{ width: 48, height: 48, border: '1px solid', borderColor: 'divider', flexShrink: 0 }}
      >
        <ChevronLeftIcon />
      </IconButton>
      {answerable && submitted && (
        <>
          {/* Four controls share a 375px phone, so Try again is its icon there
              and "Next question" keeps one line. */}
          <IconButton
            onClick={() => answer?.reset()}
            aria-label="Try again"
            sx={{
              display: { xs: 'inline-flex', sm: 'none' },
              width: 48,
              height: 48,
              flexShrink: 0,
              border: '1px solid',
              borderColor: 'primary.main',
              color: 'primary.main',
            }}
          >
            <ReplayIcon />
          </IconButton>
          <Button
            variant="outlined"
            onClick={() => answer?.reset()}
            startIcon={<ReplayIcon />}
            sx={{
              display: { xs: 'none', sm: 'inline-flex' },
              minHeight: 48,
              textTransform: 'none',
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Try again
          </Button>
        </>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>{primary}</Box>
      <IconButton
        onClick={onNext}
        disabled={!hasNext}
        aria-label="Next question"
        sx={{ width: 48, height: 48, border: '1px solid', borderColor: 'divider', flexShrink: 0 }}
      >
        <ChevronRightIcon />
      </IconButton>
    </Box>
  );
}

function ReaderEmpty() {
  return (
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4, textAlign: 'center' }}>
      <Box>
        <EmptyStateIcon aria-hidden sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Pick a question
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Choose a number or a question on the left to read it here.
        </Typography>
      </Box>
    </Box>
  );
}
