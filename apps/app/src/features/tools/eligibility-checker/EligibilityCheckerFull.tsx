'use client';

import { useState, useEffect, useRef } from 'react';
import type { Theme } from '@mui/material/styles';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  FormControlLabel,
  Checkbox,
  RadioGroup,
  Radio,
  FormLabel,
  Alert,
  Divider,
  Chip,
  CheckCircleIcon,
  CancelIcon,
  alpha,
} from '@neram/ui';
import ToolPageHeader from '@/components/tools-hub/ToolPageHeader';
import { useToolOpened } from '@/hooks/useToolOpened';
import {
  EDUCATION_OPTIONS,
  SUBJECTS,
  evaluateEligibility,
  type EligibilityResult,
} from '@/lib/tools/eligibility-rules';

/**
 * Bring a freshly rendered result into view when it is off screen (phones stack
 * it under the form), then move focus to it so screen readers land there too.
 */
function revealIfNeeded(el: HTMLElement | null) {
  if (!el || typeof window === 'undefined') return;
  const rect = el.getBoundingClientRect();
  const hidden = rect.top < 64 || rect.top > window.innerHeight - 120;
  if (hidden) {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
  el.focus({ preventScroll: true });
}

export default function NataEligibilityCheckerPage() {
  useToolOpened('nata_eligibility_checker');
  const [education, setEducation] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [aggregate, setAggregate] = useState('');
  const [purpose, setPurpose] = useState('Just NATA Exam');
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [hasChecked, setHasChecked] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  // Bumped on every Check so the result scrolls into view after it renders
  const [revealRequest, setRevealRequest] = useState(0);

  useEffect(() => {
    if (revealRequest > 0) revealIfNeeded(resultsRef.current);
  }, [revealRequest]);

  const showAggregateInput =
    education === 'Passed 10+2' || education === '10+3 Diploma (Passed)';

  const isDiploma =
    education === '10+3 Diploma (Appearing)' || education === '10+3 Diploma (Passed)';

  const handleSubjectToggle = (subject: string) => {
    setSubjects((prev) =>
      prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject]
    );
  };

  const checkEligibility = () => {
    const { nataEligible, barchEligible, conditions } = evaluateEligibility({ education, subjects, aggregate, purpose });
    setResult({ nataEligible, barchEligible, conditions });
    setHasChecked(true);
    setRevealRequest((n) => n + 1);
  };

  const resetForm = () => {
    setEducation('');
    setSubjects([]);
    setAggregate('');
    setPurpose('Just NATA Exam');
    setResult(null);
    setHasChecked(false);
  };

  const resultTint = (ok: boolean) => (theme: Theme) =>
    alpha(ok ? theme.palette.success.main : theme.palette.error.main, 0.06);

  return (
    <Box>
      <ToolPageHeader
        toolId="nata-eligibility-checker"
        description="Check that your subjects and marks meet the NATA and B.Arch rules set by the Council of Architecture (COA)."
      />

      <Box
        sx={{
          display: 'grid',
          gap: { xs: 2, md: 3 },
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 5fr) minmax(0, 7fr)' },
          gridTemplateRows: { md: 'auto 1fr auto' },
          gridTemplateAreas: {
            xs: '"form" "results" "ref" "info"',
            md: '"form results" "ref results" "info info"',
          },
          alignItems: 'start',
        }}
      >
        {/* Input Section */}
        <Paper sx={{ gridArea: 'form', p: { xs: 2, md: 3 } }}>
          <Typography variant="h6" component="h2" gutterBottom>
            Your Details
          </Typography>

          {/* Education Status */}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel id="education-status-label">Education Status</InputLabel>
            <Select
              labelId="education-status-label"
              value={education}
              label="Education Status"
              onChange={(e) => {
                setEducation(e.target.value);
                setResult(null);
                setHasChecked(false);
              }}
            >
              {EDUCATION_OPTIONS.map((opt) => (
                <MenuItem key={opt} value={opt}>
                  {opt}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Subjects */}
          <FormControl component="fieldset" sx={{ mb: 2, width: '100%' }}>
            <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.875rem' }}>
              Subjects Taken
            </FormLabel>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                columnGap: 1,
              }}
            >
              {SUBJECTS.map((subject) => (
                <FormControlLabel
                  key={subject}
                  control={
                    <Checkbox
                      checked={subjects.includes(subject)}
                      onChange={() => handleSubjectToggle(subject)}
                    />
                  }
                  label={<Typography variant="body2">{subject}</Typography>}
                  sx={{ m: 0, minHeight: 44, minWidth: 0 }}
                />
              ))}
            </Box>
          </FormControl>

          {/* Aggregate Percentage */}
          {showAggregateInput && (
            <TextField
              fullWidth
              label="Aggregate Percentage"
              type="number"
              value={aggregate}
              onChange={(e) => {
                setAggregate(e.target.value);
                setResult(null);
                setHasChecked(false);
              }}
              placeholder="For example 75"
              inputProps={{ min: 0, max: 100, step: 0.1, inputMode: 'decimal' }}
              sx={{ mb: 2 }}
            />
          )}

          {/* Purpose */}
          <FormControl component="fieldset" sx={{ mb: 3, width: '100%' }}>
            <FormLabel component="legend" sx={{ fontSize: '0.875rem', mb: 0.5 }}>
              Purpose
            </FormLabel>
            <RadioGroup
              value={purpose}
              onChange={(e) => {
                setPurpose(e.target.value);
                setResult(null);
                setHasChecked(false);
              }}
            >
              <FormControlLabel
                value="Just NATA Exam"
                control={<Radio />}
                label={<Typography variant="body2">Just NATA Exam</Typography>}
                sx={{ minHeight: 44, mr: 0 }}
              />
              <FormControlLabel
                value="B.Arch Admission"
                control={<Radio />}
                label={<Typography variant="body2">B.Arch Admission</Typography>}
                sx={{ minHeight: 44, mr: 0 }}
              />
            </RadioGroup>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={checkEligibility}
              disabled={!education}
            >
              Check Eligibility
            </Button>
            {hasChecked && (
              <Button variant="outlined" size="large" onClick={resetForm} sx={{ minWidth: 100 }}>
                Reset
              </Button>
            )}
          </Box>
        </Paper>

        {/* Results Section */}
        <Box
          ref={resultsRef}
          tabIndex={-1}
          role="region"
          aria-label="Your eligibility result"
          sx={{
            gridArea: 'results',
            minWidth: 0,
            scrollMarginTop: { xs: '72px', md: '16px' },
            '&:focus': { outline: 'none' },
          }}
        >
          {!hasChecked || !result ? (
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
              <FactCheckOutlinedIcon
                aria-hidden="true"
                sx={{ color: 'text.secondary', mt: 0.25, flexShrink: 0 }}
              />
              <Box>
                <Typography variant="subtitle2" component="h2" fontWeight={600}>
                  Your result shows up here
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Pick your education status and subjects, then tap Check Eligibility.
                </Typography>
              </Box>
            </Box>
          ) : (
            <Box>
              <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
                Your Result
              </Typography>

              {/* Summary Cards */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={purpose === 'B.Arch Admission' ? 6 : 12}>
                  <Paper
                    sx={{
                      p: 2,
                      textAlign: 'center',
                      border: 2,
                      borderColor: result.nataEligible ? 'success.main' : 'error.main',
                      bgcolor: resultTint(result.nataEligible),
                    }}
                  >
                    {result.nataEligible ? (
                      <CheckCircleIcon aria-hidden="true" sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                    ) : (
                      <CancelIcon aria-hidden="true" sx={{ fontSize: 48, color: 'error.main', mb: 1 }} />
                    )}
                    <Typography variant="h6" component="h3" fontWeight={600}>
                      NATA Exam
                    </Typography>
                    <Chip
                      label={result.nataEligible ? 'Eligible' : 'Not Eligible'}
                      color={result.nataEligible ? 'success' : 'error'}
                      sx={{ mt: 1 }}
                    />
                  </Paper>
                </Grid>

                {result.barchEligible !== null && (
                  <Grid item xs={12} sm={6}>
                    <Paper
                      sx={{
                        p: 2,
                        textAlign: 'center',
                        border: 2,
                        borderColor: result.barchEligible ? 'success.main' : 'error.main',
                        bgcolor: resultTint(result.barchEligible),
                      }}
                    >
                      {result.barchEligible ? (
                        <CheckCircleIcon aria-hidden="true" sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                      ) : (
                        <CancelIcon aria-hidden="true" sx={{ fontSize: 48, color: 'error.main', mb: 1 }} />
                      )}
                      <Typography variant="h6" component="h3" fontWeight={600}>
                        B.Arch Admission
                      </Typography>
                      <Chip
                        label={result.barchEligible ? 'Eligible' : 'Not Eligible'}
                        color={result.barchEligible ? 'success' : 'error'}
                        sx={{ mt: 1 }}
                      />
                    </Paper>
                  </Grid>
                )}
              </Grid>

              {/* Detailed Breakdown */}
              <Paper sx={{ p: { xs: 2, md: 3 } }}>
                <Typography variant="h6" component="h3" gutterBottom>
                  Detailed Breakdown
                </Typography>
                <Divider sx={{ mb: 2 }} />

                {result.conditions.map((condition, index) => (
                  <Box
                    key={index}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1.5,
                      mb: 2,
                      pb: 2,
                      borderBottom: index < result.conditions.length - 1 ? '1px solid' : 'none',
                      borderColor: 'divider',
                    }}
                  >
                    {condition.met ? (
                      <CheckCircleIcon
                        titleAccess="Met"
                        sx={{ color: 'success.main', mt: 0.25, flexShrink: 0 }}
                      />
                    ) : (
                      <CancelIcon
                        titleAccess="Not met"
                        sx={{ color: 'error.main', mt: 0.25, flexShrink: 0 }}
                      />
                    )}
                    <Box>
                      <Typography variant="subtitle2" component="h4" fontWeight={600}>
                        {condition.label}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {condition.explanation}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Paper>

              {/* Recommendation */}
              {!result.nataEligible && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" component="h3" gutterBottom>
                    What you can do
                  </Typography>
                  <Typography variant="body2">
                    Review the conditions above and ensure you meet all requirements. If you are
                    currently appearing for exams, you can still register for NATA. Contact COA for
                    specific queries about your eligibility.
                  </Typography>
                </Alert>
              )}

              {result.nataEligible && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" component="h3" gutterBottom>
                    Next Steps
                  </Typography>
                  <Typography variant="body2">
                    You are eligible to appear for NATA. Register at the official COA website
                    (nata.in) and start your preparation. Join Neram Classes for expert NATA
                    coaching.
                  </Typography>
                </Alert>
              )}
            </Box>
          )}
        </Box>

        {/* Reference card: below the result on phones, under the form on laptops */}
        <Paper sx={{ gridArea: 'ref', p: 2 }}>
          <Typography variant="subtitle2" component="h2" gutterBottom fontWeight={600}>
            Key Requirements
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            NATA: 10+2 or equivalent with subjects from COA list
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            B.Arch: Physics + Math + one more subject + 45% aggregate
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Diploma: 10+3 with Mathematics + 45% aggregate
          </Typography>
        </Paper>

        {/* Info Section */}
        <Paper sx={{ gridArea: 'info', p: { xs: 2, md: 3 } }}>
          <Typography variant="h6" component="h2" gutterBottom>
            About NATA Eligibility
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            The National Aptitude Test in Architecture (NATA) is conducted by the Council of
            Architecture (COA). Eligibility criteria are set by COA and may be updated each year.
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            For B.Arch admission, students must have passed 10+2 with Physics, Mathematics, and
            one additional subject from the approved list, with a minimum of 45% aggregate marks.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This tool provides guidance based on current COA guidelines. Always verify with the
            official NATA website (nata.in) for the most up-to-date eligibility criteria.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}
