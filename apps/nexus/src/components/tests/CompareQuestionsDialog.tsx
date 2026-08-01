'use client';

/**
 * Side by side comparison of an imported question and the bank question the
 * dedupe pass matched it to, with the decision made at the bottom.
 *
 * The review card can only show the match as a clamped two-line strip, which is
 * enough to say "there is a duplicate" and not nearly enough to say "which of
 * these two is better". That judgement needs the options, the answer key and
 * the explanation of both, side by side, which is what this is for.
 *
 * When more than one candidate came back, switching between them here also sets
 * which one the row's action applies to. Previously only the top hit was ever
 * reachable even though five were fetched.
 */

import {
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  IconButton,
  Divider,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import type { ImportQuestion } from '@/lib/qb-import-schema';
import { ROW_ACTIONS, type DuplicateCandidate, type RowAction } from './ImportReviewCard';

interface CompareQuestionsDialogProps {
  open: boolean;
  onClose: () => void;
  /** The question as the AI wrote it. */
  incoming: ImportQuestion | null;
  candidates: DuplicateCandidate[];
  /** Which candidate is currently being compared against. */
  selectedId: string | null;
  onSelectCandidate: (id: string) => void;
  action: RowAction;
  onActionChange: (action: RowAction) => void;
  useInTest: 'new' | 'existing';
  onUseInTestChange: (which: 'new' | 'existing') => void;
}

/** Actions offered here. `skip` lives on the card; this screen is about choosing between two. */
const COMPARE_ACTIONS: RowAction[] = ['reuse', 'merge', 'replace', 'keep_both', 'create'];

function OptionRow({
  id,
  text,
  correct,
}: {
  id: string;
  text: string;
  correct: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 0.75,
        py: 0.35,
        px: 0.75,
        borderRadius: 1,
        bgcolor: correct ? 'success.light' : 'transparent',
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
        {id}
      </Typography>
      <Typography variant="caption" sx={{ flex: 1 }}>
        {text}
      </Typography>
      {correct && <CheckCircleOutlinedIcon sx={{ fontSize: 14, color: 'success.dark' }} />}
    </Box>
  );
}

/** One side of the comparison. Both columns render through this so the rows line up. */
function QuestionColumn({
  heading,
  headingColor,
  text,
  options,
  correctAnswer,
  explanation,
  chips,
  footnote,
}: {
  heading: string;
  headingColor: 'primary.main' | 'text.secondary';
  text: string | null;
  options: Array<{ id: string; text: string }> | null;
  correctAnswer: string | null;
  explanation: string | null;
  chips: string[];
  footnote?: string;
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography
        variant="caption"
        sx={{ display: 'block', fontWeight: 700, color: headingColor, mb: 0.75 }}
      >
        {heading}
      </Typography>

      <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
        {text || 'No question text'}
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
        {chips.map((c) => (
          <Chip key={c} label={c} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
        ))}
      </Box>

      {options && options.length > 0 ? (
        <Box sx={{ mb: 1 }}>
          {options.map((o) => (
            <OptionRow key={o.id} id={o.id} text={o.text} correct={o.id === correctAnswer} />
          ))}
        </Box>
      ) : (
        <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
          Answer: <strong>{correctAnswer || 'not recorded'}</strong>
        </Typography>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {explanation || 'No explanation.'}
      </Typography>

      {footnote && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, fontStyle: 'italic' }}>
          {footnote}
        </Typography>
      )}
    </Box>
  );
}

export default function CompareQuestionsDialog({
  open,
  onClose,
  incoming,
  candidates,
  selectedId,
  onSelectCandidate,
  action,
  onActionChange,
  useInTest,
  onUseInTestChange,
}: CompareQuestionsDialogProps) {
  const theme = useTheme();
  const stacked = useMediaQuery(theme.breakpoints.down('md'));

  const existing = candidates.find((c) => c.id === selectedId) || candidates[0] || null;
  if (!incoming) return null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={stacked}>
      <DialogTitle sx={{ pr: 6, fontSize: '1.05rem' }}>
        Compare with the bank
        <IconButton
          onClick={onClose}
          aria-label="Close"
          sx={{ position: 'absolute', right: 8, top: 8, minWidth: 44, minHeight: 44 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {candidates.length > 1 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>
              {candidates.length} questions in the bank look like this one
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {candidates.map((c, i) => (
                <Chip
                  key={c.id}
                  label={`Match ${i + 1} · ${Math.round(c.similarity * 100)}%`}
                  size="small"
                  color={c.id === existing?.id ? 'primary' : 'default'}
                  variant={c.id === existing?.id ? 'filled' : 'outlined'}
                  onClick={() => onSelectCandidate(c.id)}
                  sx={{ height: 30, cursor: 'pointer' }}
                />
              ))}
            </Box>
          </Box>
        )}

        <Box
          sx={{
            display: 'flex',
            flexDirection: stacked ? 'column' : 'row',
            gap: 2,
            alignItems: 'stretch',
          }}
        >
          <QuestionColumn
            heading="From your paste"
            headingColor="primary.main"
            text={incoming.question_text}
            options={incoming.options}
            correctAnswer={incoming.correct_answer}
            explanation={incoming.explanation}
            chips={[incoming.difficulty, incoming.exam_relevance].filter(Boolean) as string[]}
          />

          <Divider orientation={stacked ? 'horizontal' : 'vertical'} flexItem />

          <QuestionColumn
            heading="Already in the bank"
            headingColor="text.secondary"
            text={existing?.question_text ?? null}
            options={existing?.options ?? null}
            correctAnswer={existing?.correct_answer ?? null}
            explanation={existing?.explanation_brief ?? null}
            chips={[existing?.difficulty, existing?.exam_relevance].filter(Boolean) as string[]}
            footnote={
              existing
                ? `${Math.round(existing.similarity * 100)}% match${
                    existing.used_in_tests > 0
                      ? `, used in ${existing.used_in_tests} test${existing.used_in_tests !== 1 ? 's' : ''}`
                      : ', not used in any test yet'
                  }`
                : undefined
            }
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, mb: 0.75 }}>
          What should happen?
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {COMPARE_ACTIONS.map((a) => (
            <Box
              key={a}
              role="button"
              tabIndex={0}
              onClick={() => onActionChange(a)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onActionChange(a);
                }
              }}
              sx={{
                p: 1.25,
                borderRadius: 1.5,
                border: 2,
                cursor: 'pointer',
                minHeight: 48,
                borderColor: a === action ? 'primary.main' : 'divider',
                bgcolor: a === action ? 'action.selected' : 'transparent',
                '&:hover': { borderColor: a === action ? 'primary.main' : 'text.disabled' },
                transition: 'border-color 150ms ease',
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {ROW_ACTIONS[a].label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {ROW_ACTIONS[a].effect}
              </Typography>
            </Box>
          ))}
        </Box>

        {action === 'keep_both' && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, mb: 0.5 }}>
              Which one goes in this test?
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant={useInTest === 'new' ? 'contained' : 'outlined'}
                onClick={() => onUseInTestChange('new')}
                sx={{ textTransform: 'none', minHeight: 44, flex: 1 }}
              >
                The new one
              </Button>
              <Button
                size="small"
                variant={useInTest === 'existing' ? 'contained' : 'outlined'}
                onClick={() => onUseInTestChange('existing')}
                sx={{ textTransform: 'none', minHeight: 44, flex: 1 }}
              >
                The bank one
              </Button>
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={onClose} variant="contained" sx={{ textTransform: 'none', minHeight: 44 }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
