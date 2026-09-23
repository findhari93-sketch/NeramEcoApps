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

import { useState } from 'react';
import { Box, Button, Typography, Paper, Chip, alpha, useTheme } from '@neram/ui';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import type { NexusSolutionVideo } from '@neram/database';
import MathText from '@/components/common/MathText';
import ExplanationPanel from '@/components/tests/ExplanationPanel';
import SolutionVideoPlayer from '@/components/question-bank/SolutionVideoPlayer';
import OptionBody, { type TestOption } from '@/components/tests/OptionBody';
import ReportMistakeLink from '@/components/question-bank/ReportMistakeLink';
import { SolutionReportScope } from '@/components/question-bank/SolutionReportScope';
import type { ReportTargetOption } from '@/lib/report-targets';
import { optionKeyAt, sameChoice } from '@/lib/option-keys';

export interface GradedReviewItem {
  question_id: string;
  question_text: string | null;
  /**
   * The problem figure. The review never received it, so looking back at a
   * "which figure completes the sequence" question showed the four answer
   * figures with nothing to compare them against.
   */
  question_image_url?: string | null;
  options: TestOption[] | null;
  correct_answer: string | null;
  selected: string | null;
  is_correct: boolean;
  is_gradable: boolean;
  explanation: string | null;
  /** Only present once someone has asked the AI for the worked version. */
  explanation_detailed?: string | null;
  /** The question's solution videos, one per part for a split drawing. Absent on older payloads. */
  solution_videos?: NexusSolutionVideo[];
}

interface GradedReviewListProps {
  review: GradedReviewItem[];
  getToken: () => Promise<string | null>;
  classroomId?: string;
  /**
   * A student's own review: offer "Report a mistake" per question. The
   * teacher's copy of this list (StudentAttemptSheet) leaves it off.
   */
  allowReport?: boolean;
  /** The test this review belongs to, recorded on a report. */
  testId?: string | null;
}

/** What a student can report on one reviewed question, from what the review shows. */
function reviewTargets(r: GradedReviewItem): ReportTargetOption[] {
  const out: ReportTargetOption[] = (r.solution_videos ?? []).map((v) => ({
    target: 'video' as const,
    partLabel: v.label,
    label: v.label ? `Video for part ${v.label}` : 'Video solution',
  }));
  if (r.explanation?.trim() || r.explanation_detailed?.trim()) {
    out.push({ target: 'explanation', partLabel: null, label: 'Written solution' });
  }
  if (r.is_gradable && r.correct_answer) out.push({ target: 'answer_key', partLabel: null, label: 'Answer key' });
  out.push({ target: 'question', partLabel: null, label: 'The question itself' });
  return out;
}

export default function GradedReviewList(props: GradedReviewListProps) {
  if (!props.allowReport) return <ReviewCards {...props} />;
  // One status request for the whole review, however many questions it holds.
  return (
    <SolutionReportScope questionIds={props.review.map((r) => r.question_id)}>
      <ReviewCards {...props} />
    </SolutionReportScope>
  );
}

function ReviewCards({ review, getToken, classroomId, allowReport = false, testId = null }: GradedReviewListProps) {
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

            {r.question_image_url && (
              <Box
                component="img"
                src={r.question_image_url}
                alt="Question figure"
                loading="lazy"
                sx={{
                  display: 'block',
                  width: 'auto',
                  height: 'auto',
                  maxWidth: '100%',
                  maxHeight: 180,
                  objectFit: 'contain',
                  borderRadius: 1,
                  mb: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'common.white',
                }}
              />
            )}

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

            {(r.solution_videos ?? []).map((video) => (
              <ReviewVideo key={video.url} video={video} />
            ))}

            {allowReport && (() => {
              const targets = reviewTargets(r);
              return (
                <ReportMistakeLink
                  anyPart
                  questionId={r.question_id}
                  target={targets[0].target}
                  partLabel={targets[0].partLabel}
                  targets={targets}
                  isMcq={options.length > 0}
                  source="test_review"
                  testId={testId}
                />
              );
            })()}
          </Paper>
        );
      })}
    </Box>
  );
}

/**
 * One solution video in the review. A button until pressed, so a long review
 * never loads a player per question.
 */
function ReviewVideo({ video }: { video: NexusSolutionVideo }) {
  const [open, setOpen] = useState(false);
  const label = video.label ? `Watch the video for part ${video.label}` : 'Watch the video solution';
  if (open) {
    return (
      <Box sx={{ mt: 1.25 }}>
        <SolutionVideoPlayer
          url={video.url}
          title={video.label ? `Solution video for part ${video.label}` : 'Solution video'}
        />
      </Box>
    );
  }
  return (
    <Button
      variant="outlined"
      size="small"
      startIcon={<PlayCircleOutlineIcon />}
      onClick={() => setOpen(true)}
      sx={{ mt: 1.25, minHeight: 44, textTransform: 'none', fontWeight: 600 }}
    >
      {label}
    </Button>
  );
}
