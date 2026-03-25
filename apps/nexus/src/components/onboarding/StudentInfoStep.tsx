'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@neram/ui';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';

const STANDARDS = [
  { value: '10th', label: '10th Standard' },
  { value: '11th', label: '11th Standard' },
  { value: '12th', label: '12th Standard' },
  { value: 'gap_year', label: 'Gap Year' },
];

// Generate academic year options
const currentYear = new Date().getFullYear();
const ACADEMIC_YEARS = [
  `${currentYear - 1}-${String(currentYear).slice(2)}`,
  `${currentYear}-${String(currentYear + 1).slice(2)}`,
];

interface StudentInfoStepProps {
  suggestedAcademicYear: string;
  initialStandard?: string;
  initialYear?: string;
  onNext: (standard: string, year: string) => void;
  onBack: () => void;
}

export default function StudentInfoStep({
  suggestedAcademicYear,
  initialStandard,
  initialYear,
  onNext,
  onBack,
}: StudentInfoStepProps) {
  const [standard, setStandard] = useState(initialStandard || '');
  const [academicYear, setAcademicYear] = useState(initialYear || suggestedAcademicYear);

  const canProceed = standard && academicYear;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Your Academic Info
        </Typography>
        <Typography variant="body2" color="text.secondary">
          This helps us customize your learning experience.
        </Typography>
      </Box>

      {/* Standard selection — big touch-friendly cards */}
      <Paper
        elevation={0}
        sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          Which standard are you currently in?
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          {STANDARDS.map((s) => (
            <Button
              key={s.value}
              variant={standard === s.value ? 'contained' : 'outlined'}
              onClick={() => setStandard(s.value)}
              sx={{
                py: 2,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: standard === s.value ? 700 : 500,
                fontSize: '0.9rem',
                border: standard === s.value ? undefined : '1.5px solid',
                borderColor: standard === s.value ? undefined : 'divider',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SchoolOutlinedIcon sx={{ fontSize: 20 }} />
                {s.label}
              </Box>
            </Button>
          ))}
        </Box>
      </Paper>

      {/* Academic Year */}
      <Paper
        elevation={0}
        sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          Academic Year
        </Typography>
        <FormControl fullWidth>
          <Select
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            sx={{ borderRadius: 2 }}
          >
            {ACADEMIC_YEARS.map((year) => (
              <MenuItem key={year} value={year}>
                {year}
                {year === suggestedAcademicYear && ' (Current)'}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Paper>

      {/* Info about exam tracking */}
      {(standard === '12th' || standard === 'gap_year') && (
        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: 'info.50',
            border: '1px solid',
            borderColor: 'info.100',
          }}
        >
          <Typography variant="body2" color="info.dark">
            Since you&apos;re in {standard === 'gap_year' ? 'a gap year' : '12th standard'}, we&apos;ll ask about your exam plans (NATA/JEE) in the next step.
          </Typography>
        </Paper>
      )}

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
        <Button
          variant="outlined"
          onClick={onBack}
          startIcon={<ArrowBackOutlinedIcon />}
          sx={{ borderRadius: 2, textTransform: 'none', px: 3 }}
        >
          Back
        </Button>
        <Button
          variant="contained"
          size="large"
          fullWidth
          disabled={!canProceed}
          onClick={() => onNext(standard, academicYear)}
          sx={{ py: 1.5, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          Continue
        </Button>
      </Box>
    </Box>
  );
}
