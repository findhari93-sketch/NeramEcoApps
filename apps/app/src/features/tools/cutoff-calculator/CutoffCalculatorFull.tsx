'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Card,
  CardContent,
  Alert,
  Divider,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Chip,
  CircularProgress,
  Collapse,
  Stepper,
  Step,
  StepLabel,
  MobileStepper,
  InputAdornment,
  alpha,
  useTheme,
  useMediaQuery,
  CheckCircleIcon,
  CancelIcon,
  InfoIcon,
  ArrowForwardIcon,
  ArrowBackIcon,
  SchoolIcon,
  KeyboardArrowDownIcon,
} from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import ToolPageHeader from '@/components/tools-hub/ToolPageHeader';
import { useScoreAutoSave, type ScoreSaveStatus } from './useScoreAutoSave';
import { PurposePrompt } from './PurposePrompt';
import type { CalculationPurpose } from '@neram/database';
import { useToolOpened } from '@/hooks/useToolOpened';
import {
  BOARD_CONFIG,
  calculateBestNataScore,
  checkBoardEligibility,
  checkNataAttempt,
  convertBoardMarks,
  type BoardType,
  type NataAttempt,
  type NataAttemptResult,
  parseCutoffDemoInput,
  type CutoffDemoInput,
} from '@/lib/tools/cutoff-formula';
import type { FullToolProps } from '@/components/tools/full-tools';

// ─── Types & Constants ───────────────────────────────────────────────

const STEPS = ['Board Exam', 'NATA Exam', 'Previous Year'];

// ─── Calculation Functions ───────────────────────────────────────────

/**
 * The cycle rolls over in September. The academic year "2025-2026" sits the
 * NATA 2026 exam (April to August 2026); from September 2026 students in
 * "2026-2027" prepare for NATA 2027. The label is what gets saved, so it keeps
 * its old format.
 */
function getAcademicYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const nataYear = month < 8 ? year : year + 1;
  return {
    label: `${nataYear - 1}-${nataYear}`,
    nataYear,
    prevNataYear: nataYear - 1,
  };
}

/** Scroll an element into view (smooth only when motion is welcome) and move focus to it. */
function revealElement(el: HTMLElement | null, { focus = true }: { focus?: boolean } = {}) {
  if (!el || typeof window === 'undefined') return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  if (focus) el.focus({ preventScroll: true });
}

// ─── Custom Hook ─────────────────────────────────────────────────────

function useCalculatorState(initial?: CutoffDemoInput | null) {
  const academicYear = useMemo(() => getAcademicYear(), []);

  // Board state (pre-filled from the public demo after sign-in)
  const initialBoard = initial?.board && initial.board in BOARD_CONFIG ? (initial.board as BoardType) : 'CBSE';
  const [board, setBoard] = useState<BoardType>(initialBoard);
  const [qualificationType, setQualificationType] = useState<'10+2' | 'diploma'>(initialBoard === 'DIPLOMA' ? 'diploma' : '10+2');
  const [maxMarks, setMaxMarks] = useState<string>(initial?.maxMarks ? String(initial.maxMarks) : String(BOARD_CONFIG[initialBoard].maxMarks));
  const [marksSecured, setMarksSecured] = useState<string>(initial?.marksSecured ? String(initial.marksSecured) : '');

  // NATA state
  const [attemptCount, setAttemptCount] = useState<number>(1);
  const [attempts, setAttempts] = useState<NataAttempt[]>([
    { partA: initial?.partA != null ? String(initial.partA) : '', partB: initial?.partB != null ? String(initial.partB) : '' },
  ]);

  // Previous year state
  const [hasPreviousYear, setHasPreviousYear] = useState(false);
  const [previousYearScore, setPreviousYearScore] = useState<string>('');

  // Mobile step
  const [activeStep, setActiveStep] = useState(0);

  // Board handlers
  const handleBoardChange = (newBoard: BoardType) => {
    setBoard(newBoard);
    setMaxMarks(String(BOARD_CONFIG[newBoard].maxMarks));
    if (newBoard === 'DIPLOMA') {
      setQualificationType('diploma');
    }
  };

  const handleQualificationChange = (val: '10+2' | 'diploma') => {
    setQualificationType(val);
    if (val === 'diploma' && board !== 'DIPLOMA') {
      setBoard('DIPLOMA');
      setMaxMarks(String(BOARD_CONFIG.DIPLOMA.maxMarks));
    }
  };

  // Attempt count handler
  const handleAttemptCountChange = (count: number) => {
    setAttemptCount(count);
    setAttempts((prev) => {
      if (count > prev.length) {
        return [...prev, ...Array.from({ length: count - prev.length }, () => ({ partA: '', partB: '' }))];
      }
      return prev.slice(0, count);
    });
  };

  // Attempt input handler
  const updateAttempt = (index: number, field: 'partA' | 'partB', value: string) => {
    setAttempts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // Derived calculations
  const maxMarksNum = parseInt(maxMarks) || 0;
  const marksSecuredNum = parseInt(marksSecured) || 0;
  const boardConverted = convertBoardMarks(marksSecuredNum, maxMarksNum);
  const boardPercentage = maxMarksNum > 0 ? parseFloat(((marksSecuredNum / maxMarksNum) * 100).toFixed(1)) : 0;
  const boardEligible = checkBoardEligibility(marksSecuredNum, maxMarksNum);

  const attemptResults: NataAttemptResult[] = attempts.map((a) =>
    checkNataAttempt(parseFloat(a.partA) || 0, parseFloat(a.partB) || 0),
  );

  const prevYearScoreNum = parseFloat(previousYearScore) || 0;
  const bestNata = calculateBestNataScore(attempts, hasPreviousYear, prevYearScoreNum);

  // Find the best attempt for eligibility check
  const bestAttemptResult = attemptResults.reduce(
    (best, curr) => (curr.total > best.total ? curr : best),
    attemptResults[0] || { total: 0, isPartAEligible: false, isPartBEligible: false, isTotalEligible: false, isFullyEligible: false },
  );

  const finalCutoff = parseFloat((boardConverted + bestNata.bestScore).toFixed(2));

  const hasData =
    marksSecuredNum > 0 && attempts.some((a) => (parseFloat(a.partA) || 0) + (parseFloat(a.partB) || 0) > 0);

  return {
    // Academic year
    academicYear,
    // Board
    board,
    qualificationType,
    maxMarks,
    marksSecured,
    maxMarksNum,
    marksSecuredNum,
    boardConverted,
    boardPercentage,
    boardEligible,
    handleBoardChange,
    handleQualificationChange,
    setMaxMarks,
    setMarksSecured,
    // NATA
    attemptCount,
    attempts,
    attemptResults,
    handleAttemptCountChange,
    updateAttempt,
    // Previous year
    hasPreviousYear,
    setHasPreviousYear,
    previousYearScore,
    setPreviousYearScore,
    prevYearScoreNum,
    // Results
    bestNata,
    bestAttemptResult,
    finalCutoff,
    hasData,
    // Mobile
    activeStep,
    setActiveStep,
  };
}

// ─── Board Exam Section ──────────────────────────────────────────────

function BoardExamSection({
  board,
  qualificationType,
  maxMarks,
  marksSecured,
  maxMarksNum,
  marksSecuredNum,
  boardConverted,
  boardPercentage,
  boardEligible,
  onBoardChange,
  onQualificationChange,
  onMaxMarksChange,
  onMarksSecuredChange,
}: {
  board: BoardType;
  qualificationType: '10+2' | 'diploma';
  maxMarks: string;
  marksSecured: string;
  maxMarksNum: number;
  marksSecuredNum: number;
  boardConverted: number;
  boardPercentage: number;
  boardEligible: boolean;
  onBoardChange: (b: BoardType) => void;
  onQualificationChange: (v: '10+2' | 'diploma') => void;
  onMaxMarksChange: (v: string) => void;
  onMarksSecuredChange: (v: string) => void;
}) {
  const marksError = marksSecuredNum > maxMarksNum && maxMarksNum > 0;

  return (
    <Paper sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <SchoolIcon color="primary" />
        <Typography variant="h6" fontWeight={600}>
          Board Exam Details
        </Typography>
      </Box>

      {/* Qualification Type */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Qualification Type
        </Typography>
        <ToggleButtonGroup
          value={qualificationType}
          exclusive
          onChange={(_, val) => val && onQualificationChange(val)}
          fullWidth
          aria-label="Qualification type"
        >
          <ToggleButton value="10+2">10+2 (Class 12)</ToggleButton>
          <ToggleButton value="diploma">10+3 Diploma</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Board Selection */}
      {qualificationType === '10+2' && (
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Board</InputLabel>
          <Select
            value={board}
            label="Board"
            onChange={(e) => onBoardChange(e.target.value as BoardType)}
          >
            {Object.entries(BOARD_CONFIG)
              .filter(([key]) => key !== 'DIPLOMA')
              .map(([key, config]) => (
                <MenuItem key={key} value={key}>
                  {config.label}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
      )}

      {/* Marks Inputs */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6}>
          <TextField
            label="Maximum Marks"
            type="number"
            value={maxMarks}
            onChange={(e) => onMaxMarksChange(e.target.value)}
            fullWidth
            inputProps={{ min: 1, inputMode: 'numeric' }}
            helperText="Auto-filled, editable"
          />
        </Grid>
        <Grid item xs={6}>
          <TextField
            label="Marks Secured"
            type="number"
            value={marksSecured}
            onChange={(e) => onMarksSecuredChange(e.target.value)}
            fullWidth
            error={marksError}
            helperText={marksError ? 'Cannot exceed max marks' : ' '}
            inputProps={{ min: 0, max: maxMarksNum, inputMode: 'numeric' }}
            placeholder="Your marks"
          />
        </Grid>
      </Grid>

      {/* Conversion Display */}
      {marksSecuredNum > 0 && !marksError && (
        <Box sx={{ mb: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 1.5,
              borderRadius: 2,
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
              border: '1px solid',
              borderColor: (theme) => alpha(theme.palette.primary.main, 0.3),
            }}
          >
            <Box>
              <Typography variant="body2" color="text.secondary">
                Converted Score (out of 200)
              </Typography>
              <Typography variant="h5" fontWeight={700} color="primary.main">
                {boardConverted} / 200
              </Typography>
            </Box>
            <Chip
              label={`${boardPercentage}%`}
              color={boardPercentage >= 45 ? 'success' : 'error'}
              size="small"
            />
          </Box>
        </Box>
      )}

      {/* Eligibility Status */}
      {marksSecuredNum > 0 && !marksError && (
        <Alert
          severity={boardEligible ? 'success' : 'error'}
          icon={boardEligible ? <CheckCircleIcon /> : <CancelIcon />}
        >
          {boardEligible
            ? `Eligible: ${boardPercentage}% aggregate (minimum 45% required)`
            : `Not eligible: ${boardPercentage}% aggregate (minimum 45% required)`}
        </Alert>
      )}
    </Paper>
  );
}

// ─── NATA Exam Section ───────────────────────────────────────────────

function NataExamSection({
  academicYear,
  attemptCount,
  attempts,
  attemptResults,
  bestNata,
  onAttemptCountChange,
  onUpdateAttempt,
}: {
  academicYear: { label: string; nataYear: number };
  attemptCount: number;
  attempts: NataAttempt[];
  attemptResults: NataAttemptResult[];
  bestNata: { bestScore: number; explanation: string };
  onAttemptCountChange: (count: number) => void;
  onUpdateAttempt: (index: number, field: 'partA' | 'partB', value: string) => void;
}) {
  return (
    <Paper sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="h6" fontWeight={600}>
          NATA Exam Scores
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Chip label={`NATA ${academicYear.nataYear}`} size="small" color="primary" variant="outlined" />
        <Typography variant="body2" color="text.secondary">
          Academic Year {academicYear.label}
        </Typography>
      </Box>

      {/* Attempt Count */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Number of Attempts
        </Typography>
        <ToggleButtonGroup
          value={attemptCount}
          exclusive
          onChange={(_, val) => val !== null && onAttemptCountChange(val)}
          fullWidth
          aria-label="Number of attempts"
        >
          <ToggleButton value={1}>1 Attempt</ToggleButton>
          <ToggleButton value={2}>2 Attempts</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Attempt Cards */}
      {attempts.map((attempt, index) => {
        const result = attemptResults[index];
        const partANum = parseFloat(attempt.partA) || 0;
        const partBNum = parseFloat(attempt.partB) || 0;
        const sumError = partANum + partBNum > 200;
        const hasInput = partANum > 0 || partBNum > 0;

        return (
          <Card
            key={index}
            variant="outlined"
            sx={{ mb: 2, borderColor: result?.isFullyEligible ? 'success.main' : undefined }}
          >
            <CardContent sx={{ p: { xs: 1.5, md: 2 }, '&:last-child': { pb: { xs: 1.5, md: 2 } } }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                Attempt {index + 1}
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    label="Part A (Drawing)"
                    type="number"
                    value={attempt.partA}
                    onChange={(e) => onUpdateAttempt(index, 'partA', e.target.value)}
                    fullWidth
                    inputProps={{ min: 0, max: 80, inputMode: 'decimal' }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Typography variant="caption" color="text.secondary">
                            / 80
                          </Typography>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Part B (MCQ/NCQ)"
                    type="number"
                    value={attempt.partB}
                    onChange={(e) => onUpdateAttempt(index, 'partB', e.target.value)}
                    fullWidth
                    inputProps={{ min: 0, max: 120, inputMode: 'decimal' }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Typography variant="caption" color="text.secondary">
                            / 120
                          </Typography>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
              </Grid>

              {sumError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  Part A + Part B cannot exceed 200
                </Alert>
              )}

              {hasInput && !sumError && (
                <Box
                  sx={{
                    mt: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 1,
                  }}
                >
                  <Typography variant="body2" fontWeight={600}>
                    Total: {result.total}/200
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    <Chip
                      size="small"
                      icon={result.isPartAEligible ? <CheckCircleIcon /> : <CancelIcon />}
                      label={`A: ${partANum}/80`}
                      color={result.isPartAEligible ? 'success' : 'error'}
                      variant="outlined"
                    />
                    <Chip
                      size="small"
                      icon={result.isPartBEligible ? <CheckCircleIcon /> : <CancelIcon />}
                      label={`B: ${partBNum}/120`}
                      color={result.isPartBEligible ? 'success' : 'error'}
                      variant="outlined"
                    />
                    <Chip
                      size="small"
                      icon={result.isTotalEligible ? <CheckCircleIcon /> : <CancelIcon />}
                      label={result.isTotalEligible ? 'Qualified' : 'Not Qualified'}
                      color={result.isTotalEligible ? 'success' : 'error'}
                      variant="outlined"
                    />
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Best Score Display */}
      {bestNata.bestScore > 0 && (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: (theme) => alpha(theme.palette.success.main, 0.08),
            border: '1px solid',
            borderColor: (theme) => alpha(theme.palette.success.main, 0.3),
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Best NATA Score
          </Typography>
          <Typography variant="h5" fontWeight={700} color="success.main">
            {bestNata.bestScore} / 200
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {bestNata.explanation}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

// ─── Previous Year Section ───────────────────────────────────────────

function PreviousYearSection({
  academicYear,
  hasPreviousYear,
  previousYearScore,
  attemptCount,
  onToggle,
  onScoreChange,
}: {
  academicYear: { prevNataYear: number; nataYear: number };
  hasPreviousYear: boolean;
  previousYearScore: string;
  attemptCount: number;
  onToggle: (val: boolean) => void;
  onScoreChange: (val: string) => void;
}) {
  const { prevNataYear, nataYear } = academicYear;
  const getCrossYearRule = () => {
    if (attemptCount === 1) {
      return `If you did not take admission in ${prevNataYear}-${String(nataYear).slice(-2)}, your NATA ${prevNataYear} score stays valid. Taking any NATA ${nataYear} attempt cancels the ${prevNataYear} score.`;
    } else if (attemptCount === 2) {
      return `Taking any NATA ${nataYear} attempt cancels your ${prevNataYear} score. The best of your 2 Phase 1 attempts is used for the percentile.`;
    }
    return `Taking any NATA ${nataYear} attempt cancels your previous year score.`;
  };

  return (
    <Paper sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="h6" fontWeight={600}>
          Previous Year NATA
        </Typography>
      </Box>

      <FormControlLabel
        control={
          <Switch checked={hasPreviousYear} onChange={(e) => onToggle(e.target.checked)} />
        }
        label={`Did you appear for NATA ${academicYear.prevNataYear}?`}
        sx={{ minHeight: 48, mr: 0 }}
      />

      <Collapse in={hasPreviousYear}>
        <Box sx={{ mt: 2 }}>
          <TextField
            label={`NATA ${academicYear.prevNataYear} Score`}
            type="number"
            value={previousYearScore}
            onChange={(e) => onScoreChange(e.target.value)}
            fullWidth
            inputProps={{ min: 0, max: 200, inputMode: 'decimal' }}
            InputProps={{
              endAdornment: <InputAdornment position="end">/ 200</InputAdornment>,
            }}
            sx={{ mb: 2 }}
          />

          <Alert
            severity={attemptCount === 3 ? 'warning' : 'info'}
            icon={<InfoIcon />}
          >
            <Typography variant="body2">{getCrossYearRule()}</Typography>
            {nataYear > 2026 && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                Based on the NATA 2026 rules. Check nata.in once the NATA {nataYear} brochure is out.
              </Typography>
            )}
          </Alert>
        </Box>
      </Collapse>
    </Paper>
  );
}

// ─── Results Panel ───────────────────────────────────────────────────

function ResultsEmptyState() {
  return (
    <Box
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: 3,
        border: '1px dashed',
        borderColor: 'divider',
        display: 'flex',
        gap: 1.5,
        alignItems: 'flex-start',
      }}
    >
      <CalculateOutlinedIcon aria-hidden="true" sx={{ color: 'text.secondary', mt: 0.25, flexShrink: 0 }} />
      <Box>
        <Typography variant="subtitle2" component="h2" fontWeight={600}>
          Your result shows up here
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Add your board marks and at least one NATA score. The cutoff updates as you type.
        </Typography>
      </Box>
    </Box>
  );
}

function ResultsPanel({
  boardConverted,
  boardPercentage,
  boardEligible,
  bestNata,
  bestAttemptResult,
  finalCutoff,
  hasData,
}: {
  boardConverted: number;
  boardPercentage: number;
  boardEligible: boolean;
  bestNata: { bestScore: number; explanation: string; prevYearInvalid: boolean };
  bestAttemptResult: NataAttemptResult;
  finalCutoff: number;
  hasData: boolean;
}) {
  if (!hasData) {
    return <ResultsEmptyState />;
  }

  const overallEligible = boardEligible && bestAttemptResult.isFullyEligible;
  const cutoffPercentage = (finalCutoff / 400) * 100;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Final Score Card */}
      <Paper
        sx={{
          p: 3,
          background: (theme) =>
            `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          color: 'primary.contrastText',
          border: 'none',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Typography variant="body2" component="h2" sx={{ opacity: 0.9, mb: 1, fontWeight: 600 }}>
          Your NATA Cutoff Score
        </Typography>

        <Box sx={{ position: 'relative', display: 'inline-flex', mb: 2 }}>
          <CircularProgress
            variant="determinate"
            value={100}
            size={140}
            thickness={4}
            aria-hidden="true"
            sx={{ color: 'currentColor', opacity: 0.3 }}
          />
          <CircularProgress
            variant="determinate"
            value={Math.min(cutoffPercentage, 100)}
            size={140}
            thickness={4}
            aria-label={`Cutoff ${finalCutoff} out of 400`}
            sx={{
              color: 'currentColor',
              position: 'absolute',
              left: 0,
              '& .MuiCircularProgress-circle': {
                strokeLinecap: 'round',
              },
            }}
          />
          <Box
            sx={{
              top: 0,
              left: 0,
              bottom: 0,
              right: 0,
              position: 'absolute',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
            }}
          >
            <Typography variant="h3" component="p" fontWeight={700} sx={{ lineHeight: 1 }}>
              {finalCutoff}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              out of 400
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3 }}>
          <Box>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Board
            </Typography>
            <Typography variant="h6" component="p" fontWeight={600}>
              {boardConverted}/200
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ borderColor: 'currentColor', opacity: 0.3 }} />
          <Box>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              NATA
            </Typography>
            <Typography variant="h6" component="p" fontWeight={600}>
              {bestNata.bestScore}/200
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Overall Eligibility */}
      <Alert severity={overallEligible ? 'success' : 'error'} sx={{ fontWeight: 600 }}>
        {overallEligible
          ? 'You are eligible for B.Arch admission.'
          : 'Not eligible yet. See the criteria below.'}
      </Alert>

      {/* Eligibility Checklist */}
      <Paper sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="subtitle2" component="h3" fontWeight={600} sx={{ mb: 1.5 }}>
          Eligibility Criteria
        </Typography>
        {[
          {
            label: `Board: ${boardPercentage}% aggregate (min 45%)`,
            met: boardEligible,
          },
          {
            label: 'NATA Part A (Drawing, 80 marks): scored',
            met: bestAttemptResult.isPartAEligible,
            show: bestAttemptResult.total > 0,
          },
          {
            label: 'NATA Part B (MCQ/NCQ, 120 marks): scored',
            met: bestAttemptResult.isPartBEligible,
            show: bestAttemptResult.total > 0,
          },
          {
            label: `NATA Total: ${bestAttemptResult.total}/200`,
            met: bestAttemptResult.isTotalEligible,
            show: bestAttemptResult.total > 0,
          },
        ]
          .filter((item) => item.show !== false)
          .map((item, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              {item.met ? (
                <CheckCircleIcon titleAccess="Met" sx={{ fontSize: 20, color: 'success.main' }} />
              ) : (
                <CancelIcon titleAccess="Not met" sx={{ fontSize: 20, color: 'error.main' }} />
              )}
              <Typography variant="body2">{item.label}</Typography>
            </Box>
          ))}
      </Paper>

      {/* Previous Year Note */}
      {bestNata.prevYearInvalid && (
        <Alert severity="warning" icon={<InfoIcon />}>
          Your previous year NATA score no longer counts because you took an attempt this year.
        </Alert>
      )}

      {/* What's Next CTAs */}
      <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
        <Typography variant="subtitle2" component="h3" fontWeight={600} sx={{ mb: 0.5 }}>
          What&apos;s next?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Take this score into TNEA B.Arch counselling (Tamil Nadu). The next tool opens with TNEA
          selected.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Button
            component={Link}
            variant="contained"
            fullWidth
            href={`/tools/counseling/rank-predictor?score=${finalCutoff}&system=TNEA_BARCH`}
            endIcon={<ArrowForwardIcon />}
          >
            Predict your rank
          </Button>
          <Button
            component={Link}
            variant="outlined"
            fullWidth
            href={`/tools/counseling/college-predictor?score=${finalCutoff}&system=TNEA_BARCH`}
            endIcon={<ArrowForwardIcon />}
          >
            Find colleges for your score
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

// ─── Save status ─────────────────────────────────────────────────────

function SaveNotice({ status, onRetry }: { status: ScoreSaveStatus; onRetry: () => void }) {
  if (status !== 'error') return null;
  return (
    <Alert
      severity="error"
      icon={<CloudOffOutlinedIcon />}
      sx={{ mt: 2, alignItems: 'center' }}
      action={
        <Button color="inherit" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      Not saved to your history yet.
    </Alert>
  );
}

// ─── Mobile Sticky Bottom Bar ────────────────────────────────────────

function MobileStickyResult({
  finalCutoff,
  hasData,
  onViewDetails,
}: {
  finalCutoff: number;
  hasData: boolean;
  onViewDetails: () => void;
}) {
  if (!hasData) return null;

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        // Sit above the phone tab bar instead of covering it (set by AppShell)
        bottom: 'var(--app-bottom-inset, 0px)',
        left: 0,
        right: 0,
        zIndex: 1050,
        display: { xs: 'flex', md: 'none' },
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        px: 2,
        py: 1,
        borderTop: 1,
        borderColor: 'divider',
        borderRadius: 0,
      }}
    >
      <Box>
        <Typography variant="caption" color="text.secondary" component="p">
          Your Cutoff Score
        </Typography>
        <Typography variant="h6" component="p" fontWeight={700} color="primary.main">
          {finalCutoff} / 400
        </Typography>
      </Box>
      <Button variant="contained" onClick={onViewDetails} endIcon={<KeyboardArrowDownIcon />}>
        See details
      </Button>
    </Paper>
  );
}

// ─── Info Section ────────────────────────────────────────────────────

function InfoSection({ nataYear }: { nataYear: number }) {
  return (
    <Paper sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h6" component="h2" gutterBottom>
        About NATA Cutoff Calculation
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        The NATA cutoff score is calculated out of 400, combining your 12th board marks (converted to
        200) and your best NATA score (out of 200).
      </Typography>

      <Typography variant="subtitle2" component="h3" fontWeight={600} gutterBottom>
        Board Eligibility (10+2 / Diploma)
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Candidates must have passed 10+2 with Physics and Mathematics as compulsory subjects, along
        with one of Chemistry, Biology, Technical Vocational, Computer Science, IT, Informatics
        Practices, Engineering Graphics, or Business Studies, with at least 45% marks in aggregate. Or
        passed 10+3 Diploma with Mathematics as compulsory, with at least 45% aggregate.
      </Typography>

      <Typography variant="subtitle2" component="h3" fontWeight={600} gutterBottom>
        NATA 2026 Scoring
      </Typography>
      <Box component="ul" sx={{ pl: 3, mt: 0 }}>
        <li>
          <Typography variant="body2" color="text.secondary">
            No minimum Raw Score is prescribed for qualifying in NATA 2026
          </Typography>
        </li>
        <li>
          <Typography variant="body2" color="text.secondary">
            Phase 1: Percentile-based scoring (best raw score used for percentile)
          </Typography>
        </li>
        <li>
          <Typography variant="body2" color="text.secondary">
            Phase 2: Raw scores only (no percentile)
          </Typography>
        </li>
        <li>
          <Typography variant="body2" color="text.secondary">
            Score valid for academic session 2026-2027 only
          </Typography>
        </li>
      </Box>

      <Typography variant="subtitle2" component="h3" fontWeight={600} gutterBottom sx={{ mt: 2 }}>
        Attempt Structure and Cross-Year Rules
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Phase 1 (April to June 2026): Up to 2 attempts for Centralized Admission Counselling (CAP).
        Phase 2 (August 2026): 1 attempt only, for vacant seats. You cannot appear in both phases.
        If you have a valid NATA 2025 score and do NOT take any NATA 2026 attempt, the 2025 score
        remains valid for 2026-27. However, taking any NATA 2026 attempt invalidates your 2025 score.
      </Typography>

      {nataYear > 2026 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            These are the NATA 2026 rules. Check nata.in for the NATA {nataYear} rules before you
            rely on them.
          </Typography>
        </Alert>
      )}

      <Alert severity="info" sx={{ mt: 2 }}>
        <Typography variant="body2">
          This calculator provides estimates based on publicly available NATA guidelines. Actual cutoff
          scores may vary by college, category, and counseling round.
        </Typography>
      </Alert>
    </Paper>
  );
}

// ─── Main Page Component ─────────────────────────────────────────────

export default function CutoffCalculatorPage({ initialInput }: FullToolProps) {
  useToolOpened('nata_cutoff_calculator');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const state = useCalculatorState(parseCutoffDemoInput(initialInput));

  const resultsRef = useRef<HTMLDivElement>(null);
  const stepTopRef = useRef<HTMLDivElement>(null);
  // Bumped to scroll to the results after React has rendered them
  const [revealRequest, setRevealRequest] = useState(0);
  // Bumped when the phone step changes so the new step starts at its top
  const [stepScrollRequest, setStepScrollRequest] = useState(0);

  // ─── Score auto-save (logged-in users only) ───────────────────────
  const { user } = useFirebaseAuth();
  const isLoggedIn = !!user;

  const { savedCalcId, calculationCount, setPurpose, isUpdatingPurpose, saveStatus, retrySave } =
    useScoreAutoSave({
      toolName: 'cutoff_calculator',
      inputData: {
        board: state.board,
        qualificationType: state.qualificationType,
        maxMarks: state.maxMarksNum,
        marksSecured: state.marksSecuredNum,
        attempts: state.attempts.map((a) => ({
          partA: parseFloat(a.partA) || 0,
          partB: parseFloat(a.partB) || 0,
        })),
        hasPreviousYear: state.hasPreviousYear,
        previousYearScore: state.prevYearScoreNum,
        attemptCount: state.attemptCount,
      },
      resultData: {
        boardConverted: state.boardConverted,
        boardPercentage: state.boardPercentage,
        boardEligible: state.boardEligible,
        bestNataScore: state.bestNata.bestScore,
        finalCutoff: state.finalCutoff,
        overallEligible: state.boardEligible && state.bestAttemptResult.isFullyEligible,
        prevYearInvalid: state.bestNata.prevYearInvalid,
        nataExplanation: state.bestNata.explanation,
      },
      academicYear: state.academicYear.label,
      hasData: state.hasData && isLoggedIn,
    });

  useEffect(() => {
    if (revealRequest > 0) revealElement(resultsRef.current);
  }, [revealRequest]);

  useEffect(() => {
    if (stepScrollRequest === 0) return;
    const el = stepTopRef.current;
    // Only scroll when the step heading is hidden under the top bar or above it
    if (el && el.getBoundingClientRect().top < 64) revealElement(el, { focus: false });
  }, [stepScrollRequest]);

  // The results live on the last phone step, so jump there first and scroll once rendered
  const handleViewDetails = () => {
    state.setActiveStep(2);
    setRevealRequest((n) => n + 1);
  };

  const goToStep = (step: number) => {
    state.setActiveStep(Math.max(0, Math.min(2, step)));
    setStepScrollRequest((n) => n + 1);
  };

  // Desktop stepper (visual only)
  const getActiveDesktopStep = () => {
    if (!state.marksSecuredNum) return 0;
    if (!state.attempts.some((a) => parseFloat(a.partA) > 0 || parseFloat(a.partB) > 0)) return 1;
    return 2;
  };

  const resultsPanel = (
    <ResultsPanel
      boardConverted={state.boardConverted}
      boardPercentage={state.boardPercentage}
      boardEligible={state.boardEligible}
      bestNata={state.bestNata}
      bestAttemptResult={state.bestAttemptResult}
      finalCutoff={state.finalCutoff}
      hasData={state.hasData}
    />
  );

  const purposePrompt = (
    <PurposePrompt
      calculationCount={calculationCount}
      savedCalcId={savedCalcId}
      isLoggedIn={isLoggedIn}
      onPurposePicked={(purpose: CalculationPurpose, label?: string) => setPurpose(purpose, label)}
      isUpdating={isUpdatingPurpose}
    />
  );

  const saveNotice = state.hasData ? <SaveNotice status={saveStatus} onRetry={retrySave} /> : null;

  return (
    <Box sx={{ pb: { xs: 12, md: 0 } }}>
      <ToolPageHeader toolId="nata-cutoff-calculator" />

      {/* Stepper */}
      {isMobile ? (
        <Box ref={stepTopRef} sx={{ mb: 2, scrollMarginTop: '72px' }}>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 0.5 }}>
            Step {state.activeStep + 1} of 3: {STEPS[state.activeStep]}
          </Typography>
          <MobileStepper
            variant="dots"
            steps={3}
            position="static"
            activeStep={state.activeStep}
            sx={{ bgcolor: 'transparent', justifyContent: 'center', p: 0 }}
            nextButton={<Box />}
            backButton={<Box />}
          />
        </Box>
      ) : (
        <Stepper activeStep={getActiveDesktopStep()} alternativeLabel sx={{ mb: 3 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      )}

      <Grid container spacing={3}>
        {/* Input Column */}
        <Grid item xs={12} md={7}>
          {isMobile ? (
            // Mobile: show one step at a time
            <Box>
              {state.activeStep === 0 && (
                <BoardExamSection
                  board={state.board}
                  qualificationType={state.qualificationType}
                  maxMarks={state.maxMarks}
                  marksSecured={state.marksSecured}
                  maxMarksNum={state.maxMarksNum}
                  marksSecuredNum={state.marksSecuredNum}
                  boardConverted={state.boardConverted}
                  boardPercentage={state.boardPercentage}
                  boardEligible={state.boardEligible}
                  onBoardChange={state.handleBoardChange}
                  onQualificationChange={state.handleQualificationChange}
                  onMaxMarksChange={state.setMaxMarks}
                  onMarksSecuredChange={state.setMarksSecured}
                />
              )}
              {state.activeStep === 1 && (
                <NataExamSection
                  academicYear={state.academicYear}
                  attemptCount={state.attemptCount}
                  attempts={state.attempts}
                  attemptResults={state.attemptResults}
                  bestNata={state.bestNata}
                  onAttemptCountChange={state.handleAttemptCountChange}
                  onUpdateAttempt={state.updateAttempt}
                />
              )}
              {state.activeStep === 2 && (
                <>
                  <PreviousYearSection
                    academicYear={state.academicYear}
                    hasPreviousYear={state.hasPreviousYear}
                    previousYearScore={state.previousYearScore}
                    attemptCount={state.attemptCount}
                    onToggle={state.setHasPreviousYear}
                    onScoreChange={state.setPreviousYearScore}
                  />
                  {/* Show results inline on last step (mobile) */}
                  <Box
                    id="results-section"
                    ref={resultsRef}
                    tabIndex={-1}
                    aria-label="Your cutoff result"
                    sx={{ mt: 3, scrollMarginTop: '72px', '&:focus': { outline: 'none' } }}
                  >
                    {resultsPanel}
                    {saveNotice}
                  </Box>
                  {/* Mobile: purpose prompt as an inline card after results */}
                  {purposePrompt}
                </>
              )}

              {/* Mobile Navigation Buttons */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3, gap: 1.5 }}>
                <Button
                  variant="outlined"
                  startIcon={<ArrowBackIcon />}
                  onClick={() => goToStep(state.activeStep - 1)}
                  disabled={state.activeStep === 0}
                  sx={{ flex: 1 }}
                >
                  Back
                </Button>
                {state.activeStep < 2 ? (
                  <Button
                    variant="contained"
                    endIcon={<ArrowForwardIcon />}
                    onClick={() => goToStep(state.activeStep + 1)}
                    sx={{ flex: 1 }}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    endIcon={<KeyboardArrowDownIcon />}
                    onClick={handleViewDetails}
                    disabled={!state.hasData}
                    sx={{ flex: 1 }}
                  >
                    See result
                  </Button>
                )}
              </Box>
            </Box>
          ) : (
            // Desktop: show all sections stacked
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <BoardExamSection
                board={state.board}
                qualificationType={state.qualificationType}
                maxMarks={state.maxMarks}
                marksSecured={state.marksSecured}
                maxMarksNum={state.maxMarksNum}
                marksSecuredNum={state.marksSecuredNum}
                boardConverted={state.boardConverted}
                boardPercentage={state.boardPercentage}
                boardEligible={state.boardEligible}
                onBoardChange={state.handleBoardChange}
                onQualificationChange={state.handleQualificationChange}
                onMaxMarksChange={state.setMaxMarks}
                onMarksSecuredChange={state.setMarksSecured}
              />
              <NataExamSection
                academicYear={state.academicYear}
                attemptCount={state.attemptCount}
                attempts={state.attempts}
                attemptResults={state.attemptResults}
                bestNata={state.bestNata}
                onAttemptCountChange={state.handleAttemptCountChange}
                onUpdateAttempt={state.updateAttempt}
              />
              <PreviousYearSection
                academicYear={state.academicYear}
                hasPreviousYear={state.hasPreviousYear}
                previousYearScore={state.previousYearScore}
                attemptCount={state.attemptCount}
                onToggle={state.setHasPreviousYear}
                onScoreChange={state.setPreviousYearScore}
              />
            </Box>
          )}
        </Grid>

        {/* Results Column (Desktop) */}
        {!isMobile && (
          <Grid item xs={12} md={5}>
            <Box
              sx={{
                position: 'sticky',
                top: 24,
                maxHeight: 'calc(100vh - 48px)',
                overflowY: 'auto',
              }}
            >
              {resultsPanel}
              {saveNotice}
              {/* Desktop: purpose prompt inline below results */}
              {purposePrompt}
            </Box>
          </Grid>
        )}

        {/* Info Section */}
        <Grid item xs={12}>
          <InfoSection nataYear={state.academicYear.nataYear} />
        </Grid>
      </Grid>

      {/* Mobile Sticky Bottom Bar */}
      {isMobile && (
        <MobileStickyResult
          finalCutoff={state.finalCutoff}
          hasData={state.hasData}
          onViewDetails={handleViewDetails}
        />
      )}
    </Box>
  );
}
