'use client';

/**
 * One test's worth of graded questions: the stem, every option with the
 * correct one and the student's own pick highlighted, and the explanation.
 *
 * Extracted from the student take page's own results screen, which was the
 * only place this rendering existed. A teacher's per-student response sheet
 * needed the exact same per-question view for a past attempt, and duplicating
 * ~80 lines of option-highlighting logic risked the two drifting apart the
 * same way the has_test chip and the completion banner once did.
 */

import { Box, Typography, Paper, Chip, alpha, useTheme } from '@neram/ui';
import MathText from '@/components/common/MathText';
import ExplanationPanel from '@/components/tests/ExplanationPanel';
import OptionBody, { type TestOption } from '@/components/tests/OptionBody';
import { optionKeyAt, sameChoice } from '@/lib/option-keys';

export interface GradedReviewItem {
  question_id: string;
  question_text: string | null;
  options: TestOption[] | null;
  correct_answer: string | null;
  selected: string | null;
  is_correct: boolean;
  is_gradable: boolean;
  explanation: string | null;
  /** Only present once someone has asked the AI for the worked version. */
  explanation_detailed?: string | null;
}

interface GradedReviewListProps {
  review: GradedReviewItem[];
  getToken: () => Promise<string | null>;
  classroomId?: string;
}

export default function GradedReviewList({ review, getToken, classroomId }: GradedReviewListProps) {
  const theme = useTheme();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
      {review.map((r, i) => {
        const options = Array.isArray(r.options) ? r.options : [];
        return (
          <Paper
            key={r.question_id}
            variant="outlined"
            sx={{
              p: 1.75,
              borderRadius: 2,
              borderColor: !r.is_gradable ? 'divider' : r.is_correct ? 'success.light' : 'error.light',
            }}
          >
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                {i + 1}
              </Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <MathText text={r.question_text || 'Question'} variant="body2" sx={{ fontWeight: 600 }} />
              </Box>
              <Chip
                size="small"
                label={!r.is_gradable ? 'Not marked' : r.is_correct ? 'Correct' : 'Wrong'}
                color={!r.is_gradable ? 'default' : r.is_correct ? 'success' : 'error'}
                sx={{ height: 22, fontSize: '0.68rem', flexShrink: 0 }}
              />
            </Box>

            {options.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, mb: 1 }}>
                {options.map((o, oi) => {
                  // The same key the paper was answered with, matched the way
                  // the grader matches it (case-insensitive). Comparing o.id
                  // alone marked the right answer wrong on every question
                  // whose options carry a label.
                  const key = optionKeyAt(o, oi);
                  const isCorrect = sameChoice(key, r.correct_answer);
                  const isChosen = sameChoice(key, r.selected);
                  return (
                    <Box
                      key={key}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        px: 1,
                        py: 0.5,
                        borderRadius: 1,
                        bgcolor: isCorrect
                          ? alpha(theme.palette.success.main, 0.12)
                          : isChosen
                            ? alpha(theme.palette.error.main, 0.1)
                            : 'transparent',
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                        {key}
                      </Typography>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <OptionBody option={o} letter={String(key)} compact />
                      </Box>
                      {isCorrect && (
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.dark' }}>
                          Correct
                        </Typography>
                      )}
                      {isChosen && !isCorrect && (
                        <Typography variant="caption" sx={{ fontWeight: 700, color: 'error.dark' }}>
                          You
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>
            ) : (
              <Typography variant="body2" sx={{ mb: 1 }}>
                Answer: <strong>{r.correct_answer || '-'}</strong>
                {r.selected ? ` · you wrote ${r.selected}` : ' · you left this blank'}
              </Typography>
            )}

            <ExplanationPanel
              questionId={r.question_id}
              brief={r.explanation}
              detailed={r.explanation_detailed}
              classroomId={classroomId}
              getToken={getToken}
            />
          </Paper>
        );
      })}
    </Box>
  );
}
