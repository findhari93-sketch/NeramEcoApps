'use client';

import { useState } from 'react';
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
} from '@neram/ui';
import { AuthGate } from '@/components/AuthGate';

// Education status options
const EDUCATION_OPTIONS = [
  'Appearing in 10+1',
  'Appearing in 10+2',
  'Passed 10+2',
  '10+3 Diploma (Appearing)',
  '10+3 Diploma (Passed)',
];

// Subjects list from COA guidelines
const SUBJECTS = [
  'Physics',
  'Mathematics',
  'Chemistry',
  'Biology',
  'Computer Science',
  'IT',
  'Informatics Practices',
  'Engineering Graphics',
  'Business Studies',
  'Technical Vocational',
];

// Subjects that qualify as the "third subject" for B.Arch
const BARCH_THIRD_SUBJECTS = [
  'Chemistry',
  'Biology',
  'Technical Vocational',
  'Computer Science',
  'IT',
  'Informatics Practices',
  'Engineering Graphics',
  'Business Studies',
];

interface EligibilityResult {
  nataEligible: boolean;
  barchEligible: boolean | null; // null = not checked
  conditions: {
    label: string;
    met: boolean;
    explanation: string;
  }[];
}

export default function NataEligibilityCheckerPage() {
  const [education, setEducation] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [aggregate, setAggregate] = useState('');
  const [purpose, setPurpose] = useState('Just NATA Exam');
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [hasChecked, setHasChecked] = useState(false);

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
    const conditions: EligibilityResult['conditions'] = [];
    let nataEligible = true;
    let barchEligible: boolean | null = null;

    // --- NATA Appearance Eligibility ---

    // Condition 1: Education status
    const validEducation = education !== '';
    conditions.push({
      label: 'Education Qualification',
      met: validEducation,
      explanation: validEducation
        ? `${education} is a valid qualification for NATA`
        : 'Please select your education status',
    });
    if (!validEducation) nataEligible = false;

    // Condition 2: Subjects
    if (isDiploma) {
      const hasMath = subjects.includes('Mathematics');
      conditions.push({
        label: 'Mathematics (Diploma)',
        met: hasMath,
        explanation: hasMath
          ? 'Mathematics is included in your diploma subjects'
          : 'Diploma students must have Mathematics in their curriculum',
      });
      if (!hasMath) nataEligible = false;
    } else {
      // 10+2 path: subjects should be from COA approved list
      const hasSubjects = subjects.length > 0;
      conditions.push({
        label: 'Subjects from COA List',
        met: hasSubjects,
        explanation: hasSubjects
          ? `${subjects.length} subject(s) selected from COA approved list`
          : 'Select at least one subject from the approved list',
      });
      if (!hasSubjects) nataEligible = false;
    }

    // --- B.Arch Admission Eligibility (only if selected) ---
    if (purpose === 'B.Arch Admission') {
      barchEligible = true;

      if (isDiploma) {
        // Diploma path for B.Arch
        const hasMath = subjects.includes('Mathematics');
        conditions.push({
          label: 'Mathematics (B.Arch - Diploma)',
          met: hasMath,
          explanation: hasMath
            ? 'Mathematics requirement met for B.Arch through Diploma'
            : 'Diploma students need Mathematics for B.Arch admission',
        });
        if (!hasMath) barchEligible = false;

        // Check if passed for percentage requirement
        if (education === '10+3 Diploma (Passed)') {
          const aggValue = parseFloat(aggregate);
          const hasMinAggregate = !isNaN(aggValue) && aggValue >= 45;
          conditions.push({
            label: 'Minimum 45% Aggregate (Diploma)',
            met: hasMinAggregate,
            explanation: hasMinAggregate
              ? `Your aggregate of ${aggValue}% meets the minimum 45% requirement`
              : aggregate
                ? `Your aggregate of ${aggregate}% is below the minimum 45% requirement`
                : 'Enter your aggregate percentage (minimum 45% required)',
          });
          if (!hasMinAggregate) barchEligible = false;
        } else {
          conditions.push({
            label: 'Minimum 45% Aggregate (Diploma)',
            met: true,
            explanation:
              'You are still appearing; ensure you score at least 45% aggregate upon completion',
          });
        }
      } else {
        // 10+2 path for B.Arch
        const hasPhysics = subjects.includes('Physics');
        conditions.push({
          label: 'Physics (B.Arch)',
          met: hasPhysics,
          explanation: hasPhysics
            ? 'Physics requirement met'
            : 'Physics is mandatory for B.Arch admission',
        });
        if (!hasPhysics) barchEligible = false;

        const hasMath = subjects.includes('Mathematics');
        conditions.push({
          label: 'Mathematics (B.Arch)',
          met: hasMath,
          explanation: hasMath
            ? 'Mathematics requirement met'
            : 'Mathematics is mandatory for B.Arch admission',
        });
        if (!hasMath) barchEligible = false;

        // Third subject check
        const hasThirdSubject = subjects.some((s) => BARCH_THIRD_SUBJECTS.includes(s));
        conditions.push({
          label: 'Third Subject (B.Arch)',
          met: hasThirdSubject,
          explanation: hasThirdSubject
            ? `Additional subject requirement met (${subjects.filter((s) => BARCH_THIRD_SUBJECTS.includes(s)).join(', ')})`
            : 'Need one of: Chemistry, Biology, Technical Vocational, CS, IT, Informatics Practices, Engineering Graphics, or Business Studies',
        });
        if (!hasThirdSubject) barchEligible = false;

        // Percentage check (only for Passed 10+2)
        if (education === 'Passed 10+2') {
          const aggValue = parseFloat(aggregate);
          const hasMinAggregate = !isNaN(aggValue) && aggValue >= 45;
          conditions.push({
            label: 'Minimum 45% Aggregate',
            met: hasMinAggregate,
            explanation: hasMinAggregate
              ? `Your aggregate of ${aggValue}% meets the minimum 45% requirement`
              : aggregate
                ? `Your aggregate of ${aggregate}% is below the minimum 45% requirement`
                : 'Enter your aggregate percentage (minimum 45% required)',
          });
          if (!hasMinAggregate) barchEligible = false;
        } else if (education === 'Appearing in 10+2' || education === 'Appearing in 10+1') {
          conditions.push({
            label: 'Minimum 45% Aggregate',
            met: true,
            explanation:
              'You are still appearing; ensure you score at least 45% aggregate upon completion',
          });
        }
      }
    }

    setResult({ nataEligible, barchEligible, conditions });
    setHasChecked(true);
  };

  const resetForm = () => {
    setEducation('');
    setSubjects([]);
    setAggregate('');
    setPurpose('Just NATA Exam');
    setResult(null);
    setHasChecked(false);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 1 }}>
        NATA Eligibility Checker
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Check if you meet the eligibility criteria for NATA exam and B.Arch admission as per COA
        guidelines.
      </Typography>

      <Grid container spacing={3}>
        {/* Input Section */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" gutterBottom>
              Your Details
            </Typography>

            {/* Education Status */}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Education Status</InputLabel>
              <Select
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
            <Box sx={{ mb: 2 }}>
              <FormLabel sx={{ mb: 1, display: 'block', fontSize: '0.875rem' }}>
                Subjects Taken
              </FormLabel>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {SUBJECTS.map((subject) => (
                  <FormControlLabel
                    key={subject}
                    control={
                      <Checkbox
                        checked={subjects.includes(subject)}
                        onChange={() => handleSubjectToggle(subject)}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                        {subject}
                      </Typography>
                    }
                    sx={{ mr: 1, mb: 0 }}
                  />
                ))}
              </Box>
            </Box>

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
                placeholder="e.g. 75"
                inputProps={{ min: 0, max: 100, step: 0.1 }}
                sx={{ mb: 2 }}
              />
            )}

            {/* Purpose */}
            <FormControl sx={{ mb: 3 }}>
              <FormLabel sx={{ fontSize: '0.875rem', mb: 0.5 }}>Purpose</FormLabel>
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
                  control={<Radio size="small" />}
                  label={<Typography variant="body2">Just NATA Exam</Typography>}
                />
                <FormControlLabel
                  value="B.Arch Admission"
                  control={<Radio size="small" />}
                  label={<Typography variant="body2">B.Arch Admission</Typography>}
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

          {/* Info card */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
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
        </Grid>

        {/* Results Section */}
        <Grid item xs={12} md={7}>
          {!hasChecked ? (
            <Paper
              sx={{
                p: { xs: 2, md: 3 },
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 400,
              }}
            >
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Enter your details
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Fill in your education details and subjects to check NATA eligibility
                </Typography>
              </Box>
            </Paper>
          ) : result ? (
            <Box>
              {/* Summary Cards */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={purpose === 'B.Arch Admission' ? 6 : 12}>
                  <Paper
                    sx={{
                      p: 2,
                      textAlign: 'center',
                      border: 2,
                      borderColor: result.nataEligible ? 'success.main' : 'error.main',
                      bgcolor: result.nataEligible
                        ? 'rgba(46, 125, 50, 0.04)'
                        : 'rgba(198, 40, 40, 0.04)',
                    }}
                  >
                    {result.nataEligible ? (
                      <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                    ) : (
                      <CancelIcon sx={{ fontSize: 48, color: 'error.main', mb: 1 }} />
                    )}
                    <Typography variant="h6" fontWeight={600}>
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
                        bgcolor: result.barchEligible
                          ? 'rgba(46, 125, 50, 0.04)'
                          : 'rgba(198, 40, 40, 0.04)',
                      }}
                    >
                      {result.barchEligible ? (
                        <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                      ) : (
                        <CancelIcon sx={{ fontSize: 48, color: 'error.main', mb: 1 }} />
                      )}
                      <Typography variant="h6" fontWeight={600}>
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

              {/* Detailed Breakdown - Gated */}
              <AuthGate
                hasData={hasChecked}
                pendingData={{ education, subjects, aggregate, purpose }}
                onAuthenticated={checkEligibility}
                title="Sign up for detailed eligibility breakdown"
                description="Create a free account to see the detailed condition-by-condition analysis."
              >
                <Paper sx={{ p: { xs: 2, md: 3 } }}>
                  <Typography variant="h6" gutterBottom>
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
                        borderBottom:
                          index < result.conditions.length - 1 ? '1px solid' : 'none',
                        borderColor: 'divider',
                      }}
                    >
                      {condition.met ? (
                        <CheckCircleIcon
                          sx={{ color: 'success.main', mt: 0.25, flexShrink: 0 }}
                        />
                      ) : (
                        <CancelIcon sx={{ color: 'error.main', mt: 0.25, flexShrink: 0 }} />
                      )}
                      <Box>
                        <Typography variant="subtitle2" fontWeight={600}>
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
                    <Typography variant="subtitle2" gutterBottom>
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
                    <Typography variant="subtitle2" gutterBottom>
                      Next Steps
                    </Typography>
                    <Typography variant="body2">
                      You are eligible to appear for NATA! Register at the official COA website
                      (nata.in) and start your preparation. Join Neram Classes for expert NATA
                      coaching.
                    </Typography>
                  </Alert>
                )}
              </AuthGate>
            </Box>
          ) : null}
        </Grid>

        {/* Info Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" gutterBottom>
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
        </Grid>
      </Grid>
    </Box>
  );
}
