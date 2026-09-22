'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  Divider,
  Chip,
  Tabs,
  Tab,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
  useMediaQuery,
  Fade,
  Alert,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import CloseIcon from '@mui/icons-material/Close';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import type { NexusQBQuestionDetail } from '@neram/database';
import DrawingPracticePanel from './DrawingPracticePanel';
import SourceBadges from './SourceBadges';
import RepeatBadges from './RepeatBadges';
import DifficultyChip from './DifficultyChip';
import CategoryChips from './CategoryChips';
import MCQOptions from './MCQOptions';
import MathText from '@/components/common/MathText';
import { readDrawingParts } from '@/lib/drawing-parts';
import SolutionVideoPlayer from './SolutionVideoPlayer';
import ReportMistakeLink from './ReportMistakeLink';
import { SolutionReportScope } from './SolutionReportScope';
import { reportTargetsFor } from '@/lib/report-targets';
import { useQuestionAnswer, type AnswerSubmitFn, type QuestionAnswerState } from './useQuestionAnswer';

// ---- Types ----

interface QuestionDetailProps {
  question: NexusQBQuestionDetail;
  /** May resolve to the server's verdict, and may reject when the save fails. */
  onSubmit: AnswerSubmitFn;
  onStudyToggle?: () => void;
  /**
   * Offer "Report a mistake" under each solution once it is revealed. Student
   * screens set it; a teacher previewing a question does not.
   */
  allowReport?: boolean;
  /**
   * The old report callback. No longer called: the report sheet posts to the
   * report route itself, with the part and reason the old dialog could not
   * carry. Kept so a caller that still passes it (a student screen) keeps
   * offering reports, which is what passing it always meant.
   */
  onReport?: (reportType: string, description: string) => Promise<void>;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  currentIndex: number;
  totalCount: number;
  inline?: boolean;
  showSourceBadges?: boolean;
  /** "Also asked in" badges. Defaults to showSourceBadges. */
  showRepeatBadges?: boolean;
  initialLang?: 'en' | 'hi';
  /**
   * The answer, owned by the caller (the practice reader, whose Submit button
   * lives outside this component). Omitted, the component keeps its own.
   */
  answer?: QuestionAnswerState;
  /** A language owned by the caller. Hides this component's own EN/HI toggle. */
  lang?: 'en' | 'hi';
  /** Hide the prev / "n of m" / next header. */
  hideNav?: boolean;
  /** Hide Submit and Next Question, for a caller that renders its own. */
  hideActions?: boolean;
}

interface SolutionTab {
  label: string;
  key: 'explanation' | 'video' | 'image';
}

/**
 * The report links need one status request for the question, which lives in a
 * SolutionReportScope. Only screens that offer reporting pay for the scope.
 */
export default function QuestionDetail(props: QuestionDetailProps) {
  const allowReport = props.allowReport ?? !!props.onReport;
  if (!allowReport) return <QuestionDetailBody {...props} allowReport={false} />;
  return (
    <SolutionReportScope questionIds={[props.question.id]}>
      <QuestionDetailBody {...props} allowReport />
    </SolutionReportScope>
  );
}

function QuestionDetailBody({
  question,
  onSubmit,
  onStudyToggle,
  allowReport = false,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  currentIndex,
  totalCount,
  inline = false,
  showSourceBadges = true,
  showRepeatBadges,
  initialLang,
  answer,
  lang: controlledLang,
  hideNav = false,
  hideActions = false,
}: QuestionDetailProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Always called (hooks cannot be conditional); ignored when the caller owns it.
  const ownAnswer = useQuestionAnswer({
    questionId: question.id,
    correctAnswer: question.correct_answer,
    onSubmit,
  });
  const a = answer ?? ownAnswer;
  const { selected: selectedAnswer, submitted, isCorrect, submitting, showFeedback } = a;

  const [imageZoomed, setImageZoomed] = useState(false);
  const [solutionTab, setSolutionTab] = useState(0);
  const [solutionImageZoomed, setSolutionImageZoomed] = useState(false);

  // The first solution tab each time an answer lands.
  useEffect(() => {
    if (submitted) setSolutionTab(0);
  }, [submitted]);

  // Language toggle, synced with the parent's initialLang when it changes
  const [ownLang, setLang] = useState<'en' | 'hi'>(initialLang || 'en');
  useEffect(() => {
    if (initialLang) setLang(initialLang);
  }, [initialLang]);
  const lang = controlledLang ?? ownLang;
  const hasHindi = !!(question.question_text_hi || question.options?.some(o => o.text_hi) || question.explanation_brief_hi || question.explanation_detailed_hi);

  // Build available solution tabs dynamically
  const solutionTabs: SolutionTab[] = [];
  /**
   * Not on a drawing. The explanation on those is a line the bulk import wrote
   * from the question itself ("Part (a): Create a 3D composition with cubes,
   * cones and cylinders"), which tells a student nothing the prompt above has
   * not already said, and no teacher screen edits it any more. The model answer
   * image is a drawing's explanation. The stored text is left untouched.
   */
  const explanationSuits = question.question_format !== 'DRAWING_PROMPT';
  if (
    explanationSuits &&
    (question.explanation_brief || question.explanation_detailed || question.explanation_brief_hi || question.explanation_detailed_hi)
  ) {
    solutionTabs.push({ label: 'Explanation', key: 'explanation' });
  }
  if (question.solution_video_url) {
    solutionTabs.push({ label: 'Video', key: 'video' });
  }
  if (question.solution_image_url) {
    solutionTabs.push({ label: 'Image', key: 'image' });
  }

  const handleSubmit = a.submit;

  const handleNext = useCallback(() => {
    a.reset();
    setSolutionTab(0);
    onNext();
  }, [a, onNext]);

  const handlePrev = useCallback(() => {
    a.reset();
    setSolutionTab(0);
    onPrev();
  }, [a, onPrev]);

  // Determine correct option letter for "Incorrect" badge
  const correctOptionLetter = (() => {
    if (!question.correct_answer || !question.options) return '';
    const idx = question.options.findIndex(
      (o) => o.id === question.correct_answer || o.nta_id === question.correct_answer,
    );
    if (idx >= 0) return String.fromCharCode(65 + idx); // A, B, C, D
    return question.correct_answer;
  })();

  const activeTabKey = solutionTabs[solutionTab]?.key;
  const reportTargets = reportTargetsFor(question);

  return (
    <Box sx={{ position: 'relative', pb: inline || hideActions ? 0 : isMobile ? 10 : 0 }}>
      {/* Navigation header (hidden in inline mode) */}
      {!inline && !hideNav && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 2,
          }}
        >
          <IconButton
            onClick={handlePrev}
            disabled={!hasPrev}
            size="small"
            aria-label="Previous question"
            sx={{ minWidth: 48, minHeight: 48 }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            {currentIndex + 1} / {totalCount}
          </Typography>
          <IconButton
            onClick={handleNext}
            disabled={!hasNext}
            size="small"
            aria-label="Next question"
            sx={{ minWidth: 48, minHeight: 48 }}
          >
            <ArrowForwardIcon />
          </IconButton>
        </Box>
      )}

      {/* Source badges */}
      {showSourceBadges && (
        <Box sx={{ mb: 1.5 }}>
          <SourceBadges sources={question.sources} />
        </Box>
      )}

      {/* Repeat badges */}
      {(showRepeatBadges ?? showSourceBadges) && question.repeat_sources?.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <RepeatBadges sources={question.repeat_sources} />
        </Box>
      )}

      {/* Language toggle, only when Hindi text exists and the caller does not own the language */}
      {hasHindi && controlledLang === undefined && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <ToggleButtonGroup
            value={lang}
            exclusive
            onChange={(_, v) => v && setLang(v)}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                px: 1.5,
                py: 0.25,
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'none',
              },
            }}
          >
            <ToggleButton value="en">EN</ToggleButton>
            <ToggleButton value="hi">हि</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {/* Question image */}
      {question.question_image_url && (
        <>
          <Box
            component="img"
            src={question.question_image_url}
            alt="Question figure"
            onClick={() => setImageZoomed(true)}
            sx={{
              maxWidth: '100%',
              maxHeight: 300,
              borderRadius: 1.5,
              mb: 2,
              cursor: 'zoom-in',
              border: '1px solid',
              borderColor: 'divider',
              objectFit: 'contain',
            }}
          />
          <Dialog
            open={imageZoomed}
            onClose={() => setImageZoomed(false)}
            maxWidth="lg"
            fullWidth
          >
            <Box sx={{ position: 'relative' }}>
              <IconButton
                onClick={() => setImageZoomed(false)}
                sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
                aria-label="Close zoomed image"
              >
                <CloseIcon />
              </IconButton>
              <Box
                component="img"
                src={question.question_image_url}
                alt="Question figure (zoomed)"
                sx={{ width: '100%', display: 'block' }}
              />
            </Box>
          </Dialog>
        </>
      )}

      {/* Question text. A drawing split into parts shows its parts in the
          practice panel below instead, so the text is not printed twice. */}
      {question.question_text && !(question.question_format === 'DRAWING_PROMPT' && readDrawingParts(question.drawing_parts)) && (
        <MathText
          text={lang === 'hi' && question.question_text_hi ? question.question_text_hi : question.question_text}
          variant="body1"
          sx={{
            mb: 2.5,
            lineHeight: 1.7,
            fontSize: { xs: '0.95rem', md: '1rem' },
          }}
        />
      )}

      {/* MCQ Options (only for MCQ/NUMERICAL/IMAGE_BASED) */}
      {question.question_format !== 'DRAWING_PROMPT' && question.options && question.options.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <MCQOptions
            options={question.options}
            selectedId={selectedAnswer}
            correctId={submitted ? question.correct_answer : undefined}
            submitted={submitted}
            onSelect={a.select}
            lang={lang}
          />
        </Box>
      )}

      {/* A save that failed says so, next to the answer it did not save. */}
      {a.error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} role="alert">
          {a.error}
        </Alert>
      )}

      {/* Drawing Prompt: show drawing-specific info + Practice CTA */}
      {question.question_format === 'DRAWING_PROMPT' && (
        <DrawingPracticePanel question={question} language={lang} allowReport={allowReport} />
      )}

      {/* Feedback animation overlay */}
      <Fade in={showFeedback} timeout={300}>
        <Box
          sx={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1300,
            pointerEvents: 'none',
          }}
        >
          {isCorrect ? (
            <CheckCircleIcon sx={{ fontSize: 80, color: 'success.main', opacity: 0.9 }} />
          ) : (
            <CancelIcon sx={{ fontSize: 80, color: 'error.main', opacity: 0.9 }} />
          )}
        </Box>
      </Fade>

      {/* Result badge (after submit) */}
      {submitted && isCorrect !== null && (
        <Box sx={{ mb: 2 }}>
          {isCorrect ? (
            <Chip
              icon={<CheckCircleIcon />}
              label="Correct!"
              color="success"
              variant="filled"
              sx={{ fontWeight: 600, fontSize: '0.875rem' }}
            />
          ) : (
            <Chip
              icon={<CancelIcon />}
              label={`Incorrect. Answer: ${correctOptionLetter}`}
              color="error"
              variant="filled"
              sx={{ fontWeight: 600, fontSize: '0.875rem' }}
            />
          )}
          {/* The answer key is the one part a student can doubt even with no
              solution attached. The sheet's Change reaches the question itself. */}
          {allowReport && question.correct_answer && (
            <ReportMistakeLink
              questionId={question.id}
              target="answer_key"
              targets={reportTargets}
              isMcq={question.question_format === 'MCQ'}
              source="practice"
              label="Think the answer key is wrong?"
            />
          )}
        </Box>
      )}

      {/* Solution tabs (shown after submit) */}
      {submitted && solutionTabs.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Divider sx={{ mb: 2 }} />

          <Tabs
            value={solutionTab}
            onChange={(_, newVal) => setSolutionTab(newVal)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 40,
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                minHeight: 40,
                fontSize: '0.85rem',
              },
            }}
          >
            {solutionTabs.map((tab) => (
              <Tab key={tab.key} label={tab.label} />
            ))}
          </Tabs>

          {/* Tab content */}
          <Box sx={{ pt: 2 }}>
            {/* Explanation tab */}
            {activeTabKey === 'explanation' && (() => {
              const briefText = lang === 'hi' && question.explanation_brief_hi
                ? question.explanation_brief_hi : question.explanation_brief;
              const detailedText = lang === 'hi' && question.explanation_detailed_hi
                ? question.explanation_detailed_hi : question.explanation_detailed;

              return (
                <Box>
                  {briefText && (
                    <Box sx={{ mb: 2 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 600, mb: 0.5, color: 'text.secondary' }}
                      >
                        {lang === 'hi' && question.explanation_brief_hi ? 'संक्षिप्त व्याख्या' : 'Quick Explanation'}
                      </Typography>
                      <MathText
                        text={briefText}
                        variant="body2"
                        sx={{ lineHeight: 1.7 }}
                      />
                    </Box>
                  )}
                  {detailedText && (
                    <Box>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 600, mb: 0.5, color: 'text.secondary' }}
                      >
                        {lang === 'hi' && question.explanation_detailed_hi ? 'विस्तृत हल' : 'Detailed Solution'}
                      </Typography>
                      <MathText
                        text={detailedText}
                        variant="body2"
                        sx={{ lineHeight: 1.7 }}
                      />
                    </Box>
                  )}
                </Box>
              );
            })()}

            {/* Video tab */}
            {activeTabKey === 'video' && question.solution_video_url && (
              <SolutionVideoPlayer url={question.solution_video_url} />
            )}

            {/* Image tab */}
            {activeTabKey === 'image' && question.solution_image_url && (
              <>
                <Box
                  component="img"
                  src={question.solution_image_url}
                  alt="Solution diagram"
                  onClick={() => setSolutionImageZoomed(true)}
                  sx={{
                    maxWidth: '100%',
                    borderRadius: 1,
                    cursor: 'zoom-in',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                />
                <Dialog
                  open={solutionImageZoomed}
                  onClose={() => setSolutionImageZoomed(false)}
                  maxWidth="lg"
                  fullWidth
                >
                  <Box sx={{ position: 'relative' }}>
                    <IconButton
                      onClick={() => setSolutionImageZoomed(false)}
                      sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
                      aria-label="Close zoomed image"
                    >
                      <CloseIcon />
                    </IconButton>
                    <Box
                      component="img"
                      src={question.solution_image_url}
                      alt="Solution diagram (zoomed)"
                      sx={{ width: '100%', display: 'block' }}
                    />
                  </Box>
                </Dialog>
              </>
            )}
          </Box>

          {/* A mistake in the part on screen: the video, the written
              solution or the image. Right under it, where it was noticed. */}
          {allowReport && activeTabKey && (
            <ReportMistakeLink
              key={activeTabKey}
              questionId={question.id}
              target={activeTabKey === 'image' ? 'solution_image' : activeTabKey}
              targets={reportTargets}
              isMcq={question.question_format === 'MCQ'}
              source="practice"
            />
          )}
        </Box>
      )}

      {/* Mark as Studied toggle (available after submit) */}
      {submitted && onStudyToggle && (
        <Box sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={question.is_studied}
                onChange={onStudyToggle}
                color="primary"
              />
            }
            label="Mark as Studied"
            sx={{ ml: 0 }}
          />
        </Box>
      )}

      {/* Attempt history */}
      {question.attempts.length > 0 && (
        <Accordion
          sx={{
            mb: 2,
            '&:before': { display: 'none' },
            boxShadow: 'none',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '8px !important',
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{ minHeight: 48 }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Attempt History ({question.attempts.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            {question.attempts.map((attempt, idx) => (
              <Box
                key={attempt.id}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  py: 1,
                  borderBottom:
                    idx < question.attempts.length - 1
                      ? '1px solid'
                      : 'none',
                  borderColor: 'divider',
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Attempt {idx + 1}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {new Date(attempt.created_at).toLocaleDateString()}{' '}
                    {attempt.time_spent_seconds
                      ? `(${attempt.time_spent_seconds}s)`
                      : ''}
                  </Typography>
                </Box>
                {attempt.is_correct ? (
                  <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                ) : (
                  <CancelIcon sx={{ color: 'error.main', fontSize: 20 }} />
                )}
              </Box>
            ))}
          </AccordionDetails>
        </Accordion>
      )}

      {/* Category + Difficulty footer */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <DifficultyChip difficulty={question.difficulty} />
        <CategoryChips categories={question.categories || []} />
      </Box>

      {/* The video is promised before the answer, and only opens after it. */}
      {!submitted && question.question_format !== 'DRAWING_PROMPT' && question.solution_video_url?.trim() && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1, color: 'text.secondary' }}>
          <PlayCircleOutlineIcon aria-hidden sx={{ fontSize: 20, color: 'primary.main' }} />
          <Typography variant="body2">A video solution unlocks when you submit</Typography>
        </Box>
      )}

      {/* Submit Answer button (before submit) */}
      {!submitted && !hideActions && (
        <Box
          sx={{
            position: inline ? 'relative' : isMobile ? 'fixed' : 'relative',
            bottom: inline ? 'auto' : isMobile ? 0 : 'auto',
            left: 0,
            right: 0,
            p: inline ? 0 : isMobile ? 2 : 0,
            pt: inline ? 2 : isMobile ? 1.5 : 2,
            bgcolor: inline ? 'transparent' : isMobile ? 'background.paper' : 'transparent',
            borderTop: inline ? 'none' : isMobile ? '1px solid' : 'none',
            borderColor: 'divider',
            zIndex: 10,
          }}
        >
          <Button
            variant="contained"
            fullWidth
            disabled={!selectedAnswer || submitting}
            onClick={handleSubmit}
            sx={{
              minHeight: 48,
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '1rem',
            }}
          >
            {submitting ? 'Submitting...' : 'Submit Answer'}
          </Button>
        </Box>
      )}

      {/* After submit: next button */}
      {submitted && hasNext && !hideActions && (
        <Box sx={{ pt: 1 }}>
          <Button
            variant="contained"
            fullWidth
            onClick={handleNext}
            sx={{
              minHeight: 48,
              fontWeight: 600,
              textTransform: 'none',
            }}
          >
            Next Question
          </Button>
        </Box>
      )}
    </Box>
  );
}
