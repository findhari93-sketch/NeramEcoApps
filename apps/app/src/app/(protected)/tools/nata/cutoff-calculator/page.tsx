'use client';

import { useState, useMemo } from 'react';
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
  Tooltip,
  useTheme,
  useMediaQuery,
  CheckCircleIcon,
  CancelIcon,
  InfoIcon,
  ArrowForwardIcon,
  ArrowBackIcon,
  SchoolIcon,
} from '@neram/ui';
import { AuthGate } from '@/components/AuthGate';
import { useFirebaseAuth } from '@neram/auth';
import { useScoreAutoSave } from './useScoreAutoSave';
import { PurposePrompt } from './PurposePrompt';
import type { CalculationPurpose } from '@neram/database';

// ─── Types & Constants ───────────────────────────────────────────────

type BoardType =
  | 'CBSE'
  | 'ICSE'
  | 'TN_STATE'
  | 'KA_PUC'
  | 'AP_TS_IPE'
  | 'KERALA_HSE'
  | 'MAHARASHTRA_HSC'
  | 'WB_BOARD'
  | 'UP_BOARD'
  | 'BIHAR_BSEB'
  | 'RAJASTHAN_RBSE'
  | 'DIPLOMA'
  | 'OTHER';

interface BoardConfig {
  label: string;
  maxMarks: number;
}

const BOARD_CONFIG: Record<BoardType, BoardConfig> = {
  CBSE: { label: 'CBSE', maxMarks: 500 },
  ICSE: { label: 'ICSE / ISC', maxMarks: 500 },
  TN_STATE: { label: 'Tamil Nadu State Board', maxMarks: 600 },
  KA_PUC: { label: 'Karnataka PUC', maxMarks: 600 },
  AP_TS_IPE: { label: 'AP / Telangana (IPE)', maxMarks: 600 },
  KERALA_HSE: { label: 'Kerala HSE', maxMarks: 600 },
  MAHARASHTRA_HSC: { label: 'Maharashtra HSC', maxMarks: 650 },
  WB_BOARD: { label: 'West Bengal (WBCHSE)', maxMarks: 500 },
  UP_BOARD: { label: 'UP Board', maxMarks: 600 },
  BIHAR_BSEB: { label: 'Bihar (BSEB)', maxMarks: 500 },
  RAJASTHAN_RBSE: { label: 'Rajasthan (RBSE)', maxMarks: 500 },
  DIPLOMA: { label: '10+3 Diploma', maxMarks: 1000 },
  OTHER: { label: 'Other Board', maxMarks: 500 },
};

interface NataAttempt {
  partA: string;
  partB: string;
}

interface NataAttemptResult {
  total: number;
  isPartAEligible: boolean;
  isPartBEligible: boolean;
  isTotalEligible: boolean;
  isFullyEligible: boolean;
}

const STEPS = ['Board Exam', 'NATA Exam', 'Previous Year'];

// ─── Calculation Functions ───────────────────────────────────────────

function getAcademicYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  if (month < 8) {
    // Before September
    return {
      label: `${year - 1}-${year}`,
      nataYear: year - 1,
      prevNataYear: year - 2,
    };
  }
  return {
    label: `${year}-${year + 1}`,
    nataYear: year,
    prevNataYear: year - 1,
  };
}

function convertBoardMarks(marksSecured: number, maxMarks: number): number {
  if (maxMarks <= 0 || marksSecured < 0) return 0;
  return parseFloat(((marksSecured / maxMarks) * 200).toFixed(2));
}

function checkBoardEligibility(marksSecured: number, maxMarks: number): boolean {
  if (maxMarks <= 0) return false;
  return (marksSecured / maxMarks) * 100 >= 45;
}

function checkNataAttempt(partA: number, partB: number): NataAttemptResult {
  const total = partA + partB;
  const isPartAEligible = partA >= 20;
  const isPartBEligible = partB >= 30;
  const isTotalEligible = total >= 70;
  return {
    total,
    isPartAEligible,
    isPartBEligible,
    isTotalEligible,
    isFullyEligible: isPartAEligible && isPartBEligible && isTotalEligible,
  };
}

function calculateBestNataScore(
  currentAttempts: NataAttempt[],
  hasPreviousYear: boolean,
  previousYearScore: number,
): { bestScore: number; explanation: string; prevYearInvalid: boolean } {
  const currentScores = currentAttempts.map(
    (a) => (parseFloat(a.partA) || 0) + (parseFloat(a.partB) || 0),
  );
  const validCurrentScores = currentScores.filter((s) => s > 0);
  const bestCurrentYear = validCurrentScores.length > 0 ? Math.max(...validCurrentScores) : 0;
  const numAttempts = currentAttempts.length;

  if (!hasPreviousYear || previousYearScore <= 0) {
    return {
      bestScore: bestCurrentYear,
      explanation:
        validCurrentScores.length > 1
          ? `Best of ${validCurrentScores.length} attempt(s) in current year`
          : 'Current year score',
      prevYearInvalid: false,
    };
  }

  if (numAttempts === 1) {
    const best = Math.max(previousYearScore, currentScores[0] || 0);
    return {
      bestScore: best,
      explanation: `Better of previous year (${previousYearScore}) and current year 1st attempt (${currentScores[0] || 0})`,
      prevYearInvalid: false,
    };
  } else if (numAttempts === 2) {
    const allScores = [previousYearScore, ...currentScores];
    const best = Math.max(...allScores);
    return {
      bestScore: best,
      explanation: `Best of 3 scores: previous year (${previousYearScore}) + 2 current year attempts`,
      prevYearInvalid: false,
    };
  } else {
    // 3 attempts — previous year becomes INVALID
    return {
      bestScore: bestCurrentYear,
      explanation: `With 3 current year attempts, previous year score is invalidated. Best of current year only.`,
      prevYearInvalid: true,
    };
  }
}

// ─── Custom Hook ─────────────────────────────────────────────────────

function useCalculatorState() {
  const academicYear = useMemo(() => getAcademicYear(), []);

  // Board state
  const [board, setBoard] = useState<BoardType>('CBSE');
  const [qualificationType, setQualificationType] = useState<'10+2' | 'diploma'>('10+2');
  const [maxMarks, setMaxMarks] = useState<string>('500');
  const [marksSecured, setMarksSecured] = useState<string>('');

  // NATA state
  const [attemptCount, setAttemptCount] = useState<number>(1);
  const [attempts, setAttempts] = useState<NataAttempt[]>([{ partA: '', partB: '' }]);

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
          size="small"
          fullWidth
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
            size="small"
            inputProps={{ min: 1 }}
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
            size="small"
            error={marksError}
            helperText={marksError ? 'Cannot exceed max marks' : ' '}
            inputProps={{ min: 0, max: maxMarksNum }}
            placeholder="Enter your marks"
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
              bgcolor: 'primary.50',
              border: '1px solid',
              borderColor: 'primary.200',
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
            ? `Eligible — ${boardPercentage}% aggregate (minimum 45% required)`
            : `Not Eligible — ${boardPercentage}% aggregate (minimum 45% required)`}
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
          size="small"
          fullWidth
        >
          <ToggleButton value={1}>1 Attempt</ToggleButton>
          <ToggleButton value={2}>2 Attempts</ToggleButton>
          <ToggleButton value={3}>3 Attempts</ToggleButton>
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
                    label="Part A (MCQ)"
                    type="number"
                    value={attempt.partA}
                    onChange={(e) => onUpdateAttempt(index, 'partA', e.target.value)}
                    fullWidth
                    size="small"
                    inputProps={{ min: 0, max: 200 }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Typography variant="caption" color="text.secondary">
                            min 20
                          </Typography>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Part B (Drawing)"
                    type="number"
                    value={attempt.partB}
                    onChange={(e) => onUpdateAttempt(index, 'partB', e.target.value)}
                    fullWidth
                    size="small"
                    inputProps={{ min: 0, max: 200 }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Typography variant="caption" color="text.secondary">
                            min 30
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
                      label={`A: ${partANum}${result.isPartAEligible ? '' : ' (min 20)'}`}
                      color={result.isPartAEligible ? 'success' : 'error'}
                      variant="outlined"
                    />
                    <Chip
                      size="small"
                      icon={result.isPartBEligible ? <CheckCircleIcon /> : <CancelIcon />}
                      label={`B: ${partBNum}${result.isPartBEligible ? '' : ' (min 30)'}`}
                      color={result.isPartBEligible ? 'success' : 'error'}
                      variant="outlined"
                    />
                    <Chip
                      size="small"
                      icon={result.isTotalEligible ? <CheckCircleIcon /> : <CancelIcon />}
                      label={result.isTotalEligible ? 'Qualified' : `Total < 70`}
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
            bgcolor: 'success.50',
            border: '1px solid',
            borderColor: 'success.200',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Best NATA Score
          </Typography>
          <Typography variant="h5" fontWeight={700} color="success.main">
            {bestNata.bestScore} / 200
          </Typography>
          <Typography variant="caption" color="text.secondary">
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
  academicYear: { prevNataYear: number };
  hasPreviousYear: boolean;
  previousYearScore: string;
  attemptCount: number;
  onToggle: (val: boolean) => void;
  onScoreChange: (val: string) => void;
}) {
  const getCrossYearRule = () => {
    if (attemptCount === 1) {
      return 'Better of previous year and current year 1st attempt will be considered.';
    } else if (attemptCount === 2) {
      return 'Best of three scores (previous year + 2 current year attempts) will be considered.';
    }
    return 'With 3 current year attempts, previous year score will be INVALIDATED. Only best of 3 current year scores will be counted.';
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
      />

      <Collapse in={hasPreviousYear}>
        <Box sx={{ mt: 2 }}>
          <TextField
            label={`NATA ${academicYear.prevNataYear} Score`}
            type="number"
            value={previousYearScore}
            onChange={(e) => onScoreChange(e.target.value)}
            fullWidth
            size="small"
            inputProps={{ min: 0, max: 200 }}
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
          </Alert>
        </Box>
      </Collapse>
    </Paper>
  );
}

// ─── Results Panel ───────────────────────────────────────────────────

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
    return (
      <Paper
        sx={{
          p: { xs: 2, md: 3 },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 300,
          textAlign: 'center',
        }}
      >
        <Box>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Enter your scores
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your cutoff score and eligibility results will appear here as you fill in the details
          </Typography>
        </Box>
      </Paper>
    );
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
          color: 'white',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Typography variant="body2" sx={{ opacity: 0.85, mb: 1 }}>
          Your NATA Cutoff Score
        </Typography>

        <Box sx={{ position: 'relative', display: 'inline-flex', mb: 2 }}>
          <CircularProgress
            variant="determinate"
            value={Math.min(cutoffPercentage, 100)}
            size={140}
            thickness={4}
            sx={{
              color: 'rgba(255,255,255,0.3)',
              '& .MuiCircularProgress-circle': {
                strokeLinecap: 'round',
              },
            }}
          />
          <CircularProgress
            variant="determinate"
            value={Math.min(cutoffPercentage, 100)}
            size={140}
            thickness={4}
            sx={{
              color: 'white',
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
            <Typography variant="h3" fontWeight={700} sx={{ lineHeight: 1 }}>
              {finalCutoff}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              out of 400
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3 }}>
          <Box>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              Board
            </Typography>
            <Typography variant="h6" fontWeight={600}>
              {boardConverted}/200
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.3)' }} />
          <Box>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              NATA
            </Typography>
            <Typography variant="h6" fontWeight={600}>
              {bestNata.bestScore}/200
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Overall Eligibility */}
      <Alert
        severity={overallEligible ? 'success' : 'error'}
        sx={{ fontWeight: 600 }}
      >
        {overallEligible
          ? 'You are eligible for B.Arch admission!'
          : 'Not eligible — see criteria below'}
      </Alert>

      {/* Eligibility Checklist */}
      <Paper sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
          Eligibility Criteria
        </Typography>
        {[
          {
            label: `Board: ${boardPercentage}% aggregate (min 45%)`,
            met: boardEligible,
          },
          {
            label: `NATA Part A (min 20)`,
            met: bestAttemptResult.isPartAEligible,
            show: bestAttemptResult.total > 0,
          },
          {
            label: `NATA Part B (min 30)`,
            met: bestAttemptResult.isPartBEligible,
            show: bestAttemptResult.total > 0,
          },
          {
            label: `NATA Total: ${bestAttemptResult.total}/200 (min 70)`,
            met: bestAttemptResult.isTotalEligible,
            show: bestAttemptResult.total > 0,
          },
        ]
          .filter((item) => item.show !== false)
          .map((item, i) => (
            <Box
              key={i}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
            >
              {item.met ? (
                <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main' }} />
              ) : (
                <CancelIcon sx={{ fontSize: 20, color: 'error.main' }} />
              )}
              <Typography variant="body2">{item.label}</Typography>
            </Box>
          ))}
      </Paper>

      {/* Previous Year Note */}
      {bestNata.prevYearInvalid && (
        <Alert severity="warning" icon={<InfoIcon />}>
          Previous year NATA score has been invalidated due to 3 current year attempts.
        </Alert>
      )}

      {/* CTA */}
      <Button
        variant="outlined"
        fullWidth
        href="/tools/nata/college-predictor"
        endIcon={<ArrowForwardIcon />}
      >
        Find Colleges for Your Score
      </Button>
    </Box>
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
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
        display: { xs: 'flex', md: 'none' },
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 1.5,
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Box>
        <Typography variant="caption" color="text.secondary">
          Your Cutoff Score
        </Typography>
        <Typography variant="h6" fontWeight={700} color="primary.main">
          {finalCutoff} / 400
        </Typography>
      </Box>
      <Button variant="contained" size="small" onClick={onViewDetails}>
        See Details
      </Button>
    </Paper>
  );
}

// ─── Info Section ────────────────────────────────────────────────────

function InfoSection() {
  return (
    <Paper sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h6" gutterBottom>
        About NATA Cutoff Calculation
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        The NATA cutoff score is calculated out of 400, combining your 12th board marks (converted to
        200) and your best NATA score (out of 200).
      </Typography>

      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        Board Eligibility (10+2 / Diploma)
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Candidates must have passed 10+2 with Physics and Mathematics as compulsory subjects, along
        with one of Chemistry, Biology, Technical Vocational, Computer Science, IT, Informatics
        Practices, Engineering Graphics, or Business Studies — with at least 45% marks in aggregate. OR
        passed 10+3 Diploma with Mathematics as compulsory, with at least 45% aggregate.
      </Typography>

      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        NATA Qualifying Criteria
      </Typography>
      <ul style={{ marginLeft: '1.5rem', marginTop: 0 }}>
        <li>
          <Typography variant="body2" color="text.secondary">
            Minimum 20 marks in Part A (MCQ)
          </Typography>
        </li>
        <li>
          <Typography variant="body2" color="text.secondary">
            Minimum 30 marks in Part B (Drawing)
          </Typography>
        </li>
        <li>
          <Typography variant="body2" color="text.secondary">
            Overall qualifying marks: 70 out of 200
          </Typography>
        </li>
      </ul>

      <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ mt: 2 }}>
        Multi-Attempt & Cross-Year Rules
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Candidates can appear for up to 3 NATA attempts per year. The best score is taken as valid. If
        you have a valid previous year score and take 1 or 2 attempts this year, the best score across
        all attempts (including previous year) is considered. However, if you take all 3 attempts this
        year, the previous year score becomes invalid.
      </Typography>

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

export default function CutoffCalculatorPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const state = useCalculatorState();
  const [showResultsMobile, setShowResultsMobile] = useState(false);

  // ─── Score auto-save (logged-in users only) ───────────────────────
  const { user } = useFirebaseAuth();
  const isLoggedIn = !!user;

  const { savedCalcId, calculationCount, setPurpose, isUpdatingPurpose } =
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

  const handleViewDetails = () => {
    setShowResultsMobile(true);
    // Scroll to results
    const el = document.getElementById('results-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Desktop stepper (visual only)
  const getActiveDesktopStep = () => {
    if (!state.marksSecuredNum) return 0;
    if (!state.attempts.some((a) => parseFloat(a.partA) > 0 || parseFloat(a.partB) > 0)) return 1;
    return 2;
  };

  return (
    <Box sx={{ pb: { xs: 10, md: 0 } }}>
      {/* Header */}
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 0.5, fontSize: { xs: '1.5rem', md: '2.125rem' } }}>
        NATA Cutoff Calculator & Eligibility Checker
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Calculate your NATA cutoff score out of 400 — board marks + best NATA score — with instant
        eligibility checks.
      </Typography>

      {/* Stepper */}
      {isMobile ? (
        <MobileStepper
          variant="dots"
          steps={3}
          position="static"
          activeStep={state.activeStep}
          sx={{ mb: 2, bgcolor: 'transparent', justifyContent: 'center', p: 0 }}
          nextButton={<Box />}
          backButton={<Box />}
        />
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
                  <Box id="results-section" sx={{ mt: 3 }}>
                    <AuthGate
                      hasData={state.hasData}
                      pendingData={{
                        board: state.board,
                        marksSecured: state.marksSecured,
                        attempts: state.attempts,
                      }}
                      onAuthenticated={() => {}}
                      title="Sign up to see your cutoff results"
                      description="Create a free account to view your full cutoff analysis and eligibility status."
                    >
                      <ResultsPanel
                        boardConverted={state.boardConverted}
                        boardPercentage={state.boardPercentage}
                        boardEligible={state.boardEligible}
                        bestNata={state.bestNata}
                        bestAttemptResult={state.bestAttemptResult}
                        finalCutoff={state.finalCutoff}
                        hasData={state.hasData}
                      />
                    </AuthGate>
                  </Box>
                  {/* Mobile: purpose prompt as bottom sheet after results */}
                  <PurposePrompt
                    calculationCount={calculationCount}
                    savedCalcId={savedCalcId}
                    isLoggedIn={isLoggedIn}
                    onPurposePicked={(purpose: CalculationPurpose, label?: string) =>
                      setPurpose(purpose, label)
                    }
                    isUpdating={isUpdatingPurpose}
                  />
                </>
              )}

              {/* Mobile Navigation Buttons */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3, gap: 2 }}>
                <Button
                  variant="outlined"
                  startIcon={<ArrowBackIcon />}
                  onClick={() => state.setActiveStep((s) => Math.max(0, s - 1))}
                  disabled={state.activeStep === 0}
                  sx={{ flex: 1 }}
                >
                  Back
                </Button>
                <Button
                  variant="contained"
                  endIcon={<ArrowForwardIcon />}
                  onClick={() => state.setActiveStep((s) => Math.min(2, s + 1))}
                  disabled={state.activeStep === 2}
                  sx={{ flex: 1 }}
                >
                  Next
                </Button>
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
                top: 80,
                maxHeight: 'calc(100vh - 100px)',
                overflowY: 'auto',
              }}
            >
              <AuthGate
                hasData={state.hasData}
                pendingData={{
                  board: state.board,
                  marksSecured: state.marksSecured,
                  attempts: state.attempts,
                }}
                onAuthenticated={() => {}}
                title="Sign up to see your cutoff results"
                description="Create a free account to view your full cutoff analysis and eligibility status."
              >
                <ResultsPanel
                  boardConverted={state.boardConverted}
                  boardPercentage={state.boardPercentage}
                  boardEligible={state.boardEligible}
                  bestNata={state.bestNata}
                  bestAttemptResult={state.bestAttemptResult}
                  finalCutoff={state.finalCutoff}
                  hasData={state.hasData}
                />
              </AuthGate>
              {/* Desktop: purpose prompt inline below results */}
              <PurposePrompt
                calculationCount={calculationCount}
                savedCalcId={savedCalcId}
                isLoggedIn={isLoggedIn}
                onPurposePicked={(purpose: CalculationPurpose, label?: string) =>
                  setPurpose(purpose, label)
                }
                isUpdating={isUpdatingPurpose}
              />
            </Box>
          </Grid>
        )}

        {/* Info Section */}
        <Grid item xs={12}>
          <InfoSection />
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
