'use client';

import { useId, useState } from 'react';
import {
  Alert,
  Box,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@neram/ui';
import ButtonBase from '@mui/material/ButtonBase';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { useTranslations } from 'next-intl';
import { tokens as t } from '@/design-system';
import { useFormContext } from '../FormContext';
import Field from '../fields/Field';
import {
  CLASS_OPTIONS,
  YEAR_OF_STUDY_OPTIONS,
  COMPLETED_GRADE_OPTIONS,
  getExamYearOptions,
  get12thYearOptions,
} from '../types';
import {
  EDUCATION_BOARD_OPTIONS,
  CASTE_CATEGORY_OPTIONS,
  APPLICANT_CATEGORY_OPTIONS,
  SCHOOL_TYPE_OPTIONS,
  type ApplicantCategory,
  type SchoolType,
  type SchoolStudentAcademicData,
  type DiplomaStudentAcademicData,
  type CollegeStudentAcademicData,
  type WorkingProfessionalAcademicData,
} from '@neram/database';

/** Two fields side by side from about 500px, one per row on a phone. */
const fieldGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
  gap: '20px 16px',
} as const;

const questionSx = { m: 0, mb: 1.5, fontSize: 17, fontWeight: 700, lineHeight: 1.35, color: t.ink } as const;

interface SelectFieldProps {
  id: string;
  label: string;
  value: string | number;
  options: readonly { value: string | number; label: string }[];
  onChange: (value: string) => void;
  name?: string;
  required?: boolean;
}

/** A Select at the 48px input spec with its label above (Field), never a floating label. */
function SelectField({ id, label, value, options, onChange, name, required }: SelectFieldProps) {
  return (
    <Field id={id} label={label}>
      <Select
        id={id}
        labelId={`${id}-label`}
        fullWidth
        displayEmpty
        value={value}
        onChange={(e) => onChange(String(e.target.value))}
        inputProps={{ name, 'aria-required': required || undefined }}
        renderValue={(selected) => {
          const match = options.find((o) => String(o.value) === String(selected));
          return match ? match.label : <Box component="span" sx={{ color: t.inkMuted }}>Select</Box>;
        }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value} sx={{ minHeight: 48 }}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </Field>
  );
}

interface InputFieldProps {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  type?: string;
  required?: boolean;
  multiline?: boolean;
  inputProps?: Record<string, unknown>;
}

/** A TextField with its label above (Field). */
function InputField({ id, label, value, onChange, placeholder, helper, type, required, multiline, inputProps }: InputFieldProps) {
  return (
    <Field id={id} label={label} helper={helper}>
      <TextField
        id={id}
        fullWidth
        hiddenLabel
        type={type}
        multiline={multiline}
        minRows={multiline ? 2 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputProps={{
          ...inputProps,
          'aria-required': required || undefined,
          'aria-describedby': helper ? `${id}-helper` : undefined,
        }}
      />
    </Field>
  );
}

/**
 * "Your studies", inside the Your course step: which best describes you (pills),
 * the two or three fields that category needs, and the exam year (pills).
 * Caste category and school type are optional and folded under More details.
 */
export default function YourStudiesBlock() {
  const tr = useTranslations('apply');
  const { formData, updateFormData } = useFormContext();
  const { academic } = formData;
  const uid = useId().replace(/:/g, '');
  const moreId = `${uid}-more-details`;
  const [moreOpen, setMoreOpen] = useState(false);

  const handleCategoryChange = (category: ApplicantCategory) => {
    // Reset category-specific data when changing category
    updateFormData('academic', {
      applicantCategory: category,
      schoolStudentData: null,
      diplomaStudentData: null,
      collegeStudentData: null,
      workingProfessionalData: null,
    });

    // Initialize with empty data for the selected category
    switch (category) {
      case 'school_student':
        updateFormData('academic', {
          schoolStudentData: {
            current_class: '',
            school_name: '',
            board: '',
            previous_percentage: undefined,
          },
        });
        break;
      case 'diploma_student':
        updateFormData('academic', {
          diplomaStudentData: {
            college_name: '',
            department: '',
            completed_grade: '10th',
            marks: undefined,
          },
        });
        break;
      case 'college_student':
        updateFormData('academic', {
          collegeStudentData: {
            college_name: '',
            department: '',
            year_of_study: 1,
            twelfth_year: new Date().getFullYear() - 1,
            twelfth_percentage: undefined,
            reason_for_exam: '',
          },
        });
        break;
      case 'working_professional':
        updateFormData('academic', {
          workingProfessionalData: {
            twelfth_year: new Date().getFullYear() - 5,
            occupation: '',
            company: '',
          },
        });
        break;
    }
  };

  const updateSchoolData = (data: Partial<SchoolStudentAcademicData>) => {
    updateFormData('academic', {
      schoolStudentData: {
        ...academic.schoolStudentData,
        ...data,
      } as SchoolStudentAcademicData,
    });
  };

  const updateDiplomaData = (data: Partial<DiplomaStudentAcademicData>) => {
    updateFormData('academic', {
      diplomaStudentData: {
        ...academic.diplomaStudentData,
        ...data,
      } as DiplomaStudentAcademicData,
    });
  };

  const updateCollegeData = (data: Partial<CollegeStudentAcademicData>) => {
    updateFormData('academic', {
      collegeStudentData: {
        ...academic.collegeStudentData,
        ...data,
      } as CollegeStudentAcademicData,
    });
  };

  const updateWorkingData = (data: Partial<WorkingProfessionalAcademicData>) => {
    updateFormData('academic', {
      workingProfessionalData: {
        ...academic.workingProfessionalData,
        ...data,
      } as WorkingProfessionalAcademicData,
    });
  };

  const percentage = (v: string) => (v ? Number(v) : undefined);

  return (
    <Box component="section" aria-labelledby="apply-studies-title" sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
      <Box>
        <Typography id="apply-studies-title" component="h2" sx={{ m: 0, fontSize: 22, fontWeight: 800, lineHeight: 1.25, color: t.ink }}>
          {tr('yourCourse.studiesTitle')}
        </Typography>
        <Typography component="p" sx={{ m: 0, mt: 0.75, fontSize: 15, lineHeight: 1.5, color: t.inkMuted }}>
          {tr('yourCourse.studiesSubtitle')}
        </Typography>
      </Box>

      {/* Which best describes you: separate pills, navy when selected */}
      <Box>
        <Typography id="apply-category-label" component="h3" sx={questionSx}>
          {tr('yourCourse.categoryQuestion')}
        </Typography>
        <ToggleButtonGroup
          exclusive
          aria-labelledby="apply-category-label"
          value={academic.applicantCategory || null}
          onChange={(_, next: ApplicantCategory | null) => {
            // Tapping the chosen pill again keeps it (and the answers under it).
            if (next) handleCategoryChange(next);
          }}
          sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1 }}
        >
          {APPLICANT_CATEGORY_OPTIONS.map((option) => (
            <ToggleButton key={option.value} value={option.value} title={option.description}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* Category-specific fields */}
      {academic.applicantCategory === 'school_student' && (
        <Box sx={fieldGridSx}>
          <InputField
            id={`${uid}-school`}
            label="School name"
            required
            value={academic.schoolStudentData?.school_name || ''}
            onChange={(v) => updateSchoolData({ school_name: v })}
            placeholder="Enter your school name"
          />
          <SelectField
            id={`${uid}-board`}
            label="Board"
            required
            value={academic.schoolStudentData?.board || ''}
            options={EDUCATION_BOARD_OPTIONS.map((o) => ({ value: o.code, label: o.name }))}
            onChange={(v) => updateSchoolData({ board: v })}
          />
          <SelectField
            id={`${uid}-class`}
            label="Current class"
            required
            value={academic.schoolStudentData?.current_class || ''}
            options={CLASS_OPTIONS}
            onChange={(v) => updateSchoolData({ current_class: v })}
          />
          <InputField
            id={`${uid}-prev-pct`}
            label="Previous year percentage (optional)"
            type="number"
            value={academic.schoolStudentData?.previous_percentage || ''}
            onChange={(v) => updateSchoolData({ previous_percentage: percentage(v) })}
            inputProps={{ min: 0, max: 100, inputMode: 'decimal' }}
          />
        </Box>
      )}

      {academic.applicantCategory === 'diploma_student' && (
        <Box sx={fieldGridSx}>
          <InputField
            id={`${uid}-diploma-college`}
            label="College name"
            required
            value={academic.diplomaStudentData?.college_name || ''}
            onChange={(v) => updateDiplomaData({ college_name: v })}
            placeholder="Your polytechnic or diploma college"
          />
          <InputField
            id={`${uid}-diploma-dept`}
            label="Department"
            required
            value={academic.diplomaStudentData?.department || ''}
            onChange={(v) => updateDiplomaData({ department: v })}
            placeholder="e.g., Civil Engineering, Architecture"
          />
          <SelectField
            id={`${uid}-diploma-grade`}
            label="Completed before diploma"
            required
            value={academic.diplomaStudentData?.completed_grade || '10th'}
            options={COMPLETED_GRADE_OPTIONS}
            onChange={(v) => updateDiplomaData({ completed_grade: v as '10th' | '12th' })}
          />
          <InputField
            id={`${uid}-diploma-marks`}
            label="Marks or percentage (optional)"
            type="number"
            value={academic.diplomaStudentData?.marks || ''}
            onChange={(v) => updateDiplomaData({ marks: percentage(v) })}
            inputProps={{ min: 0, max: 100, inputMode: 'decimal' }}
          />
        </Box>
      )}

      {academic.applicantCategory === 'college_student' && (
        <Box sx={fieldGridSx}>
          <InputField
            id={`${uid}-college`}
            label="College name"
            required
            value={academic.collegeStudentData?.college_name || ''}
            onChange={(v) => updateCollegeData({ college_name: v })}
            placeholder="Enter your college name"
          />
          <InputField
            id={`${uid}-college-dept`}
            label="Department"
            required
            value={academic.collegeStudentData?.department || ''}
            onChange={(v) => updateCollegeData({ department: v })}
            placeholder="e.g., Computer Science, Mechanical"
          />
          <SelectField
            id={`${uid}-college-year`}
            label="Year of study"
            required
            value={academic.collegeStudentData?.year_of_study || ''}
            options={YEAR_OF_STUDY_OPTIONS}
            onChange={(v) => updateCollegeData({ year_of_study: Number(v) })}
          />
          <SelectField
            id={`${uid}-college-12th`}
            label="12th completed in"
            required
            value={academic.collegeStudentData?.twelfth_year || ''}
            options={get12thYearOptions()}
            onChange={(v) => updateCollegeData({ twelfth_year: Number(v) })}
          />
          <InputField
            id={`${uid}-college-12th-pct`}
            label="12th percentage (optional)"
            type="number"
            value={academic.collegeStudentData?.twelfth_percentage || ''}
            onChange={(v) => updateCollegeData({ twelfth_percentage: percentage(v) })}
            inputProps={{ min: 0, max: 100, inputMode: 'decimal' }}
          />
          <Box sx={{ gridColumn: '1 / -1' }}>
            <InputField
              id={`${uid}-college-reason`}
              label="Why do you want to write the entrance exam? (optional)"
              multiline
              value={academic.collegeStudentData?.reason_for_exam || ''}
              onChange={(v) => updateCollegeData({ reason_for_exam: v })}
              placeholder="e.g., Career change, interested in architecture"
            />
          </Box>
        </Box>
      )}

      {academic.applicantCategory === 'working_professional' && (
        <Box sx={fieldGridSx}>
          <SelectField
            id={`${uid}-work-12th`}
            label="12th completed in"
            required
            value={academic.workingProfessionalData?.twelfth_year || ''}
            options={get12thYearOptions()}
            onChange={(v) => updateWorkingData({ twelfth_year: Number(v) })}
          />
          <InputField
            id={`${uid}-work-occupation`}
            label="Current occupation (optional)"
            value={academic.workingProfessionalData?.occupation || ''}
            onChange={(v) => updateWorkingData({ occupation: v })}
            placeholder="e.g., Software Engineer, Teacher"
          />
          <InputField
            id={`${uid}-work-company`}
            label="Company or organisation (optional)"
            value={academic.workingProfessionalData?.company || ''}
            onChange={(v) => updateWorkingData({ company: v })}
          />
        </Box>
      )}

      {/* Exam year: always, as pills */}
      <Box>
        <Typography id="apply-exam-year-label" component="p" sx={{ m: 0, mb: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: t.ink }}>
          {tr('yourCourse.examYear')}
        </Typography>
        <ToggleButtonGroup
          exclusive
          aria-labelledby="apply-exam-year-label"
          value={academic.targetExamYear || null}
          onChange={(_, next: string | null) => {
            if (next) updateFormData('academic', { targetExamYear: next });
          }}
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}
        >
          {getExamYearOptions().map((option) => (
            <ToggleButton key={option.value} value={option.value} sx={{ minWidth: 96 }}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <input type="hidden" name="targetExamYear" value={academic.targetExamYear || ''} />
      </Box>

      {/* Caste category and school type: optional, folded away */}
      <Box>
        <ButtonBase
          aria-expanded={moreOpen}
          aria-controls={moreId}
          onClick={() => setMoreOpen((open) => !open)}
          sx={{
            width: '100%',
            minHeight: 56,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
            px: 0.5,
            borderTop: `1px solid ${t.line}`,
            borderBottom: `1px solid ${t.line}`,
            fontFamily: 'inherit',
            fontSize: 15,
            fontWeight: 600,
            color: t.ink,
            textAlign: 'left',
            '&:hover': { bgcolor: t.ground },
            '&.Mui-focusVisible': { outline: t.focusOutline, outlineOffset: '2px' },
          }}
        >
          <span>{tr('yourCourse.moreDetails')}</span>
          <ExpandMoreOutlined
            aria-hidden
            sx={{
              color: t.inkMuted,
              transition: 'transform 200ms ease',
              transform: moreOpen ? 'rotate(180deg)' : 'none',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        </ButtonBase>
        {moreOpen && (
          <Box id={moreId} sx={{ pt: 2.5, pb: 0.5, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box sx={fieldGridSx}>
              <SelectField
                id={`${uid}-caste`}
                name="casteCategory"
                label={tr('yourCourse.casteCategory')}
                value={academic.casteCategory || ''}
                options={CASTE_CATEGORY_OPTIONS}
                onChange={(v) =>
                  updateFormData('academic', { casteCategory: (v || null) as typeof academic.casteCategory })
                }
              />
              {academic.applicantCategory === 'school_student' && (
                <SelectField
                  id={`${uid}-school-type`}
                  name="schoolType"
                  label={tr('yourCourse.schoolType')}
                  value={academic.schoolType || ''}
                  options={SCHOOL_TYPE_OPTIONS}
                  onChange={(v) => updateFormData('academic', { schoolType: (v || null) as SchoolType | null })}
                />
              )}
            </Box>
            {academic.applicantCategory === 'school_student' && academic.schoolType === 'government_school' && (
              <Alert severity="info" icon={<InfoOutlined />}>
                {tr('yourCourse.scholarship')}
              </Alert>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
