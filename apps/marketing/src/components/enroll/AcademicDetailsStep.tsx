'use client';

import {
  Box,
  TextField,
  Grid,
  Typography,
  MenuItem,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@neram/ui';
import {
  CLASS_OPTIONS,
  YEAR_OF_STUDY_OPTIONS,
  COMPLETED_GRADE_OPTIONS,
  getExamYearOptions,
  get12thYearOptions,
} from '@/components/apply/types';
import type { AcademicDetailsData } from '@/components/apply/types';

const APPLICANT_CATEGORIES = [
  { value: 'school_student', label: 'School Student' },
  { value: 'diploma_student', label: 'Diploma Student' },
  { value: 'college_student', label: 'College Student' },
  { value: 'working_professional', label: 'Working Professional' },
];

const CASTE_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'obc', label: 'OBC' },
  { value: 'sc', label: 'SC' },
  { value: 'st', label: 'ST' },
  { value: 'ews', label: 'EWS' },
  { value: 'other', label: 'Other' },
];

const BOARD_OPTIONS = [
  { value: 'cbse', label: 'CBSE' },
  { value: 'icse', label: 'ICSE' },
  { value: 'state_tn', label: 'Tamil Nadu State Board' },
  { value: 'matriculation', label: 'Matriculation' },
  { value: 'state_ka', label: 'Karnataka State Board' },
  { value: 'state_ap', label: 'AP/Telangana State Board' },
  { value: 'state_ke', label: 'Kerala State Board' },
  { value: 'ib', label: 'IB' },
  { value: 'igcse', label: 'IGCSE' },
  { value: 'nios', label: 'NIOS' },
  { value: 'other', label: 'Other' },
];

const SCHOOL_TYPE_OPTIONS = [
  { value: 'private_school', label: 'Private School' },
  { value: 'government_aided', label: 'Government-Aided School' },
  { value: 'government_school', label: 'Government School' },
];

interface AcademicDetailsStepProps {
  academic: AcademicDetailsData;
  updateAcademic: (data: Partial<AcademicDetailsData>) => void;
}

export default function AcademicDetailsStep({
  academic,
  updateAcademic,
}: AcademicDetailsStepProps) {
  const examYearOptions = getExamYearOptions();
  const twelfthYearOptions = get12thYearOptions();

  const handleCategoryChange = (category: string) => {
    updateAcademic({
      applicantCategory: category as any,
      schoolStudentData: null,
      diplomaStudentData: null,
      collegeStudentData: null,
      workingProfessionalData: null,
      schoolType: null,
    });
  };

  return (
    <Box>
      <Typography variant="h6" fontWeight={600} mb={2}>
        Academic Details
      </Typography>

      {/* Applicant Category */}
      <FormControl component="fieldset" sx={{ mb: 3 }}>
        <FormLabel component="legend" sx={{ mb: 1, fontWeight: 600 }}>
          I am a... *
        </FormLabel>
        <RadioGroup
          value={academic.applicantCategory || ''}
          onChange={(e) => handleCategoryChange(e.target.value)}
        >
          <Grid container spacing={1}>
            {APPLICANT_CATEGORIES.map((cat) => (
              <Grid item xs={6} sm={3} key={cat.value}>
                <FormControlLabel
                  value={cat.value}
                  control={<Radio />}
                  label={cat.label}
                  sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
                />
              </Grid>
            ))}
          </Grid>
        </RadioGroup>
      </FormControl>

      {/* Category-specific fields */}
      {academic.applicantCategory === 'school_student' && (
        <Grid container spacing={2} mb={3}>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              label="Current Class"
              required
              fullWidth
              value={academic.schoolStudentData?.current_class || ''}
              onChange={(e) =>
                updateAcademic({
                  schoolStudentData: {
                    ...(academic.schoolStudentData || { current_class: '', school_name: '', board: '' }),
                    current_class: e.target.value,
                  },
                })
              }
              size="medium"
            >
              {CLASS_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="School Name"
              required
              fullWidth
              value={academic.schoolStudentData?.school_name || ''}
              onChange={(e) =>
                updateAcademic({
                  schoolStudentData: {
                    ...(academic.schoolStudentData || { current_class: '', school_name: '', board: '' }),
                    school_name: e.target.value,
                  },
                })
              }
              size="medium"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              label="Board"
              required
              fullWidth
              value={academic.schoolStudentData?.board || ''}
              onChange={(e) =>
                updateAcademic({
                  schoolStudentData: {
                    ...(academic.schoolStudentData || { current_class: '', school_name: '', board: '' }),
                    board: e.target.value,
                  },
                })
              }
              size="medium"
            >
              {BOARD_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              label="School Type"
              fullWidth
              value={academic.schoolType || ''}
              onChange={(e) => updateAcademic({ schoolType: e.target.value as any })}
              size="medium"
            >
              {SCHOOL_TYPE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      )}

      {academic.applicantCategory === 'diploma_student' && (
        <Grid container spacing={2} mb={3}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="College Name"
              required
              fullWidth
              value={academic.diplomaStudentData?.college_name || ''}
              onChange={(e) =>
                updateAcademic({
                  diplomaStudentData: {
                    ...(academic.diplomaStudentData || { college_name: '', department: '', completed_grade: '10th' as const }),
                    college_name: e.target.value,
                  },
                })
              }
              size="medium"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Department"
              required
              fullWidth
              value={academic.diplomaStudentData?.department || ''}
              onChange={(e) =>
                updateAcademic({
                  diplomaStudentData: {
                    ...(academic.diplomaStudentData || { college_name: '', department: '', completed_grade: '10th' as const }),
                    department: e.target.value,
                  },
                })
              }
              size="medium"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              label="Completed Grade"
              fullWidth
              value={academic.diplomaStudentData?.completed_grade || ''}
              onChange={(e) =>
                updateAcademic({
                  diplomaStudentData: {
                    ...(academic.diplomaStudentData || { college_name: '', department: '', completed_grade: '10th' as const }),
                    completed_grade: e.target.value as '10th' | '12th',
                  },
                })
              }
              size="medium"
            >
              {COMPLETED_GRADE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      )}

      {academic.applicantCategory === 'college_student' && (
        <Grid container spacing={2} mb={3}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="College Name"
              required
              fullWidth
              value={academic.collegeStudentData?.college_name || ''}
              onChange={(e) =>
                updateAcademic({
                  collegeStudentData: {
                    ...(academic.collegeStudentData || { college_name: '', department: '', year_of_study: 1, twelfth_year: new Date().getFullYear() }),
                    college_name: e.target.value,
                  },
                })
              }
              size="medium"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Department"
              required
              fullWidth
              value={academic.collegeStudentData?.department || ''}
              onChange={(e) =>
                updateAcademic({
                  collegeStudentData: {
                    ...(academic.collegeStudentData || { college_name: '', department: '', year_of_study: 1, twelfth_year: new Date().getFullYear() }),
                    department: e.target.value,
                  },
                })
              }
              size="medium"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              label="Year of Study"
              fullWidth
              value={academic.collegeStudentData?.year_of_study || ''}
              onChange={(e) =>
                updateAcademic({
                  collegeStudentData: {
                    ...(academic.collegeStudentData || { college_name: '', department: '', year_of_study: 1, twelfth_year: new Date().getFullYear() }),
                    year_of_study: Number(e.target.value),
                  },
                })
              }
              size="medium"
            >
              {YEAR_OF_STUDY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              label="12th Completion Year"
              fullWidth
              value={academic.collegeStudentData?.twelfth_year || ''}
              onChange={(e) =>
                updateAcademic({
                  collegeStudentData: {
                    ...(academic.collegeStudentData || { college_name: '', department: '', year_of_study: 1, twelfth_year: new Date().getFullYear() }),
                    twelfth_year: Number(e.target.value),
                  },
                })
              }
              size="medium"
            >
              {twelfthYearOptions.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      )}

      {academic.applicantCategory === 'working_professional' && (
        <Grid container spacing={2} mb={3}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Occupation"
              fullWidth
              value={academic.workingProfessionalData?.occupation || ''}
              onChange={(e) =>
                updateAcademic({
                  workingProfessionalData: {
                    ...(academic.workingProfessionalData || { twelfth_year: new Date().getFullYear() - 5 }),
                    occupation: e.target.value,
                  },
                })
              }
              size="medium"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              select
              label="12th Completion Year"
              fullWidth
              value={academic.workingProfessionalData?.twelfth_year || ''}
              onChange={(e) =>
                updateAcademic({
                  workingProfessionalData: {
                    ...(academic.workingProfessionalData || { twelfth_year: new Date().getFullYear() - 5 }),
                    twelfth_year: Number(e.target.value),
                  },
                })
              }
              size="medium"
            >
              {twelfthYearOptions.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      )}

      {/* Common fields */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            select
            label="Caste Category"
            fullWidth
            value={academic.casteCategory || ''}
            onChange={(e) => updateAcademic({ casteCategory: e.target.value as any })}
            size="medium"
          >
            {CASTE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            select
            label="Target Exam Year"
            fullWidth
            value={academic.targetExamYear || ''}
            onChange={(e) => updateAcademic({ targetExamYear: e.target.value })}
            size="medium"
          >
            {examYearOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>
    </Box>
  );
}
