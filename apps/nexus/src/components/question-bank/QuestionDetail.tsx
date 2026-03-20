'use client';

import { useState, useCallback } from 'react';
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
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Chip,
  Tabs,
  Tab,
  TextField,
  RadioGroup,
  Radio,
  useTheme,
  useMediaQuery,
  Fade,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import type { NexusQBQuestionDetail } from '@neram/database';
import { QB_REPORT_TYPE_LABELS } from '@neram/database';
import SourceBadges from './SourceBadges';
import RepeatBadges from './RepeatBadges';
import DifficultyChip from './DifficultyChip';
import CategoryChips from './CategoryChips';
import MCQOptions from './MCQOptions';
import MathText from '@/components/common/MathText';

// ---- Video embed helpers (copied from SolutionSection.tsx) ----

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function isSharePointUrl(url: string): boolean {
  return /\.sharepoint\.com\//i.test(url) || /onedrive\.live\.com\//i.test(url);
}

function getSharePointEmbedUrl(url: string): string {
  if (/onedrive\.live\.com\//i.test(url)) {
    return url.replace(/\/redir\?/i, '/embed?').replace(/\/view\?/i, '/embed?');
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (parsed.pathname.includes('_layouts/15/embed.aspx')) return url;
    if (parsed.pathname.includes('download.aspx') || parsed.pathname.includes('_api')) {
      const srcParam = parsed.searchParams.get('UniqueId') || parsed.searchParams.get('sourcedoc');
      if (srcParam) {
        return `https://${host}/_layouts/15/embed.aspx?UniqueId=${encodeURIComponent(srcParam)}`;
      }
    }
    return `https://${host}/_layouts/15/embed.aspx?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

// ---- Types ----

interface QuestionDetailProps {
  question: NexusQBQuestionDetail;
  onSubmit: (answer: string) => Promise<void>;
  onStudyToggle?: () => void;
  onReport?: (reportType: string, description: string) => Promise<void>;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  currentIndex: number;
  totalCount: number;
  inline?: boolean;
  showSourceBadges?: boolean;
}

interface SolutionTab {
  label: string;
  key: 'explanation' | 'video' | 'image';
}

export default function QuestionDetail({
  question,
  onSubmit,
  onStudyToggle,
  onReport,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  currentIndex,
  totalCount,
  inline = false,
  showSourceBadges = true,
}: QuestionDetailProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [imageZoomed, setImageZoomed] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [solutionTab, setSolutionTab] = useState(0);
  const [solutionImageZoomed, setSolutionImageZoomed] = useState(false);

  // Report dialog state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const handleReportSubmit = useCallback(async () => {
    if (!reportType || !onReport || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      await onReport(reportType, reportDescription);
      setReportOpen(false);
      setReportType('');
      setReportDescription('');
    } catch (err) {
      console.error('Failed to submit report:', err);
    } finally {
      setReportSubmitting(false);
    }
  }, [reportType, reportDescription, onReport, reportSubmitting]);

  // Build available solution tabs dynamically
  const solutionTabs: SolutionTab[] = [];
  if (question.explanation_brief || question.explanation_detailed) {
    solutionTabs.push({ label: 'Explanation', key: 'explanation' });
  }
  if (question.solution_video_url) {
    solutionTabs.push({ label: 'Video', key: 'video' });
  }
  if (question.solution_image_url) {
    solutionTabs.push({ label: 'Image', key: 'image' });
  }

  const handleSubmit = useCallback(async () => {
    if (!selectedAnswer || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(selectedAnswer);
      const correct = selectedAnswer === question.correct_answer;
      setIsCorrect(correct);
      setSubmitted(true);
      setShowFeedback(true);
      // Auto-select first tab
      setSolutionTab(0);
      setTimeout(() => setShowFeedback(false), 2000);
    } finally {
      setSubmitting(false);
    }
  }, [selectedAnswer, submitting, onSubmit, question.correct_answer]);

  const handleNext = useCallback(() => {
    setSelectedAnswer(null);
    setSubmitted(false);
    setIsCorrect(null);
    setShowFeedback(false);
    setSolutionTab(0);
    onNext();
  }, [onNext]);

  const handlePrev = useCallback(() => {
    setSelectedAnswer(null);
    setSubmitted(false);
    setIsCorrect(null);
    setShowFeedback(false);
    setSolutionTab(0);
    onPrev();
  }, [onPrev]);

  // Determine correct option letter for "Incorrect" badge
  const correctOptionLetter = (() => {
    if (!question.correct_answer || !question.options) return '';
    const idx = question.options.findIndex(
      (o) => o.id === question.correct_answer || o.nta_id === question.correct_answer,
    );
    if (idx >= 0) return String.fromCharCode(65 + idx); // A, B, C, D
    return question.correct_answer;
  })();

  // Video embed helpers
  const videoId = question.solution_video_url
    ? extractYouTubeId(question.solution_video_url)
    : null;

  const activeTabKey = solutionTabs[solutionTab]?.key;

  return (
    <Box sx={{ position: 'relative', pb: inline ? 0 : isMobile ? 10 : 0 }}>
      {/* Navigation header (hidden in inline mode) */}
      {!inline && (
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
      {showSourceBadges && question.repeat_sources.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <RepeatBadges sources={question.repeat_sources} />
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

      {/* Question text */}
      {question.question_text && (
        <MathText
          text={question.question_text}
          variant="body1"
          sx={{
            mb: 2.5,
            lineHeight: 1.7,
            fontSize: { xs: '0.95rem', md: '1rem' },
          }}
        />
      )}

      {/* MCQ Options */}
      {question.options && question.options.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <MCQOptions
            options={question.options}
            selectedId={selectedAnswer}
            correctId={submitted ? question.correct_answer : undefined}
            submitted={submitted}
            onSelect={setSelectedAnswer}
          />
        </Box>
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
              label={`Incorrect — Answer: ${correctOptionLetter}`}
              color="error"
              variant="filled"
              sx={{ fontWeight: 600, fontSize: '0.875rem' }}
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
            {activeTabKey === 'explanation' && (
              <Box>
                {question.explanation_brief && (
                  <Box sx={{ mb: 2 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, mb: 0.5, color: 'text.secondary' }}
                    >
                      Quick Explanation
                    </Typography>
                    <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                      {question.explanation_brief}
                    </Typography>
                  </Box>
                )}
                {question.explanation_detailed && (
                  <Box>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, mb: 0.5, color: 'text.secondary' }}
                    >
                      Detailed Solution
                    </Typography>
                    <MathText
                      text={question.explanation_detailed}
                      variant="body2"
                      sx={{ lineHeight: 1.7 }}
                    />
                  </Box>
                )}
              </Box>
            )}

            {/* Video tab */}
            {activeTabKey === 'video' && question.solution_video_url && (
              <Box>
                {videoId ? (
                  <Box
                    sx={{
                      position: 'relative',
                      width: '100%',
                      paddingTop: '56.25%',
                      borderRadius: 1,
                      overflow: 'hidden',
                      bgcolor: 'grey.900',
                    }}
                  >
                    <Box
                      component="iframe"
                      src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                      title="Solution video"
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        border: 0,
                      }}
                    />
                  </Box>
                ) : isSharePointUrl(question.solution_video_url) ? (
                  <Box
                    sx={{
                      position: 'relative',
                      width: '100%',
                      paddingTop: '56.25%',
                      borderRadius: 1,
                      overflow: 'hidden',
                      bgcolor: 'grey.900',
                    }}
                  >
                    <Box
                      component="iframe"
                      src={getSharePointEmbedUrl(question.solution_video_url)}
                      title="Solution video"
                      loading="lazy"
                      allowFullScreen
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        border: 0,
                      }}
                    />
                  </Box>
                ) : (
                  <Box>
                    <Box
                      component="a"
                      href={question.solution_video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        color: 'primary.main',
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      <OpenInNewIcon fontSize="small" />
                      <Typography variant="body2">Open solution video</Typography>
                    </Box>
                  </Box>
                )}
              </Box>
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

          {/* Report Issue button */}
          {onReport && (
            <Box sx={{ mt: 2 }}>
              <Button
                size="small"
                startIcon={<FlagOutlined />}
                onClick={() => setReportOpen(true)}
                sx={{ textTransform: 'none', color: 'text.secondary' }}
              >
                Report Issue
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* Report Issue Dialog */}
      {onReport && (
        <Dialog
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          fullScreen={isMobile}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" fontWeight={600}>Report Issue</Typography>
            <IconButton
              onClick={() => setReportOpen(false)}
              aria-label="Close"
              sx={{ minWidth: 48, minHeight: 48 }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              What type of issue?
            </Typography>
            <RadioGroup
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              {Object.entries(QB_REPORT_TYPE_LABELS).map(([value, label]) => (
                <FormControlLabel
                  key={value}
                  value={value}
                  control={<Radio />}
                  label={label}
                  sx={{
                    mb: 0.5,
                    '& .MuiFormControlLabel-label': { fontSize: '0.95rem' },
                  }}
                />
              ))}
            </RadioGroup>
            <TextField
              multiline
              rows={3}
              fullWidth
              label="Description (optional)"
              placeholder="Describe the issue..."
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
              sx={{ mt: 2 }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => setReportOpen(false)}
              sx={{ textTransform: 'none' }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={!reportType || reportSubmitting}
              onClick={handleReportSubmit}
              sx={{ textTransform: 'none', minWidth: 120 }}
            >
              {reportSubmitting ? 'Submitting...' : 'Submit Report'}
            </Button>
          </DialogActions>
        </Dialog>
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

      {/* Submit Answer button (before submit) */}
      {!submitted && (
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
      {submitted && hasNext && (
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
