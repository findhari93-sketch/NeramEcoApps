'use client';

import { forwardRef, useState, type ComponentProps, type ReactNode, type Ref } from 'react';
import { Box, Button, Dialog, Fade, IconButton, LinearProgress, Slide, Typography, useMediaQuery, useTheme } from '@neram/ui';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { focusRing } from '@/components/assistant/focusRing';
import { stableHover } from '@/components/assistant/stableHover';
import MathText from '@/components/common/MathText';
import { MATH_SX } from './blocks/TutorText';
import TutorPanel from './TutorPanel';
import type { TutorSession } from './useTutorSession';
import type { GetToken } from './client';

type SlideProps = ComponentProps<typeof Slide>;
const SlideUp = forwardRef(function SlideUp(props: SlideProps, ref: Ref<unknown>) {
  return <Slide {...props} direction="up" ref={ref} />;
});

export interface FocusQuestion {
  text: string | null;
  options: { id: string; text: string }[];
}

interface TutorFocusProps {
  open: boolean;
  session: TutorSession;
  onClose: () => void;
  getToken: GetToken;
  /** "Q2 of 30": where this question sits in the student's list. */
  label: string | null;
  /**
   * md and up: the question, answerable, beside the conversation. Null on a
   * phone, where the question is a card pinned above the conversation.
   */
  questionPane: ReactNode | null;
  question: FocusQuestion;
  onTryMyself: () => void;
  onOpenSimilar: (questionId: string) => void;
}

/**
 * Learn with tutor: the whole screen given to one question and its tutor.
 *
 * A full-screen dialog over everything (sidebar, top bar, question list, page
 * header, help button), so nothing competes with the learning. Its own top
 * bar holds only the way out and where the student is (step, hint). On a
 * laptop the question sits on the left and can be answered there; the
 * conversation, which matters most, takes the rest. On a phone the
 * conversation fills the screen under a two-line question card.
 *
 * The page owns the history entry (`tutor=1`), so Back, Escape and the close
 * button all land on the same question.
 */
export default function TutorFocus({ open, session, onClose, getToken, label, questionPane, question, onTryMyself, onOpenSimilar }: TutorFocusProps) {
  const theme = useTheme();
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const split = !!questionPane;
  const { progress, hintsUsed } = session;
  const where = [progress ? `Step ${progress.step} of ${progress.total}` : null, hintsUsed > 0 ? `Hint ${hintsUsed} of 4` : null].filter(Boolean) as string[];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      TransitionComponent={split ? Fade : SlideUp}
      transitionDuration={reduce ? 0 : split ? 200 : { enter: 225, exit: 195 }}
      // The practice screen's letter and arrow keys act on the reader under
      // this screen; they stop here. Escape still closes (the dialog's own handler runs first).
      onKeyDown={(e) => e.stopPropagation()}
      // On the paper, which carries role="dialog" (see MobileReaderDialog).
      PaperProps={{ 'aria-label': 'Learn with tutor', sx: { bgcolor: 'background.paper', overscrollBehavior: 'contain' } } as object}
    >
      <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Top bar: the way out, the title, where the student is */}
        <Box
          component="header"
          sx={{
            flexShrink: 0,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            pl: 0.5,
            pr: 2,
            pt: 'env(safe-area-inset-top, 0px)',
            minHeight: 56,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <IconButton onClick={onClose} aria-label="Back to the question" sx={{ width: 48, height: 48, flexShrink: 0, '&.Mui-focusVisible': focusRing(theme.palette.primary.dark) }}>
            <CloseRoundedIcon />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
              Learn with tutor
            </Typography>
            {label && (
              <Typography variant="caption" color="text.secondary" component="p" noWrap sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {label}
              </Typography>
            )}
          </Box>
          {where.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'flex-end', columnGap: 2, flexShrink: 0 }} data-testid="tutor-progress">
              {where.map((w) => (
                <Typography key={w} variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', lineHeight: 1.4, whiteSpace: 'nowrap' }}>
                  {w}
                </Typography>
              ))}
            </Box>
          )}
          {progress && (
            <LinearProgress
              variant="determinate"
              value={Math.min(100, Math.round((progress.step / Math.max(1, progress.total)) * 100))}
              aria-label={`Step ${progress.step} of ${progress.total}`}
              sx={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, bgcolor: 'transparent' }}
            />
          )}
        </Box>

        {split ? (
          <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'clamp(340px, 38%, 520px) minmax(0, 1fr)' }}>
            <Box
              component="section"
              aria-label="Question"
              data-tutor-question
              tabIndex={-1}
              sx={{ minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid', borderColor: 'divider', '&:focus': { outline: 'none' } }}
            >
              {questionPane}
            </Box>
            <Box component="section" aria-label="Tutor" sx={{ minHeight: 0, minWidth: 0 }}>
              <TutorPanel session={session} onClose={onClose} getToken={getToken} onTryMyself={onTryMyself} onOpenSimilar={onOpenSimilar} />
            </Box>
          </Box>
        ) : (
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <TutorPanel
              session={session}
              onClose={onClose}
              getToken={getToken}
              onTryMyself={onTryMyself}
              onOpenSimilar={onOpenSimilar}
              questionCard={question.text ? <QuestionCard question={question} /> : null}
            />
          </Box>
        )}
      </Box>
    </Dialog>
  );
}

/** The phone's question: two lines until tapped, then the whole of it with its options. */
function QuestionCard({ question }: { question: FocusQuestion }) {
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
          <Typography variant="overline" component="p" color="text.secondary" sx={{ lineHeight: 1.6, fontWeight: 700 }}>
            Question
          </Typography>
          <MathText
            text={question.text || ''}
            variant="body2"
            sx={
              open
                ? MATH_SX
                : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal', overflowWrap: 'anywhere' }
            }
          />
          {open && question.options.length > 0 && (
            <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1, display: 'grid', gap: 0.5 }}>
              {question.options.map((o, i) => (
                <Box component="li" key={o.id || i} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                  <Typography variant="body2" component="span" sx={{ fontWeight: 700, flexShrink: 0 }}>
                    {String.fromCharCode(65 + i)}.
                  </Typography>
                  <MathText text={o.text} variant="body2" sx={MATH_SX} />
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Button>
    </Box>
  );
}
