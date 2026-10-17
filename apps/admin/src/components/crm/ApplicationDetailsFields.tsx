'use client';

import { Grid, MenuItem, TextField, Typography, Divider } from '@neram/ui';

/**
 * The application form's fields, shared by EditApplicationDialog (details only)
 * and ApplicationAndFeesDialog (details and fees). The columns written are
 * STAFF_APPLICATION_FIELDS in @neram/database.
 */

export const COURSE_OPTIONS = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee_paper2', label: 'JEE Paper 2' },
  { value: 'both', label: 'Both NATA & JEE' },
  { value: 'not_sure', label: 'Not Sure' },
];

export const LEARNING_MODES = [
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'online_only', label: 'Online Only' },
];

export const APPLICANT_CATEGORIES = [
  { value: 'school_student', label: 'School Student' },
  { value: 'diploma_student', label: 'Diploma Student' },
  { value: 'college_student', label: 'College Student' },
  { value: 'working_professional', label: 'Working Professional' },
];

/** The values the apply form stores in academic_data.current_class. Nexus reads them. */
export const CLASS_OPTIONS = [
  { value: '10', label: 'Class 10' },
  { value: '11', label: 'Class 11' },
  { value: '12', label: 'Class 12' },
  { value: '12_completed', label: '12th completed' },
];

export const CASTE_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'obc', label: 'OBC' },
  { value: 'sc', label: 'SC' },
  { value: 'st', label: 'ST' },
  { value: 'ews', label: 'EWS' },
  { value: 'other', label: 'Other' },
];

export const SCHOOL_TYPES = [
  { value: 'private_school', label: 'Private School' },
  { value: 'government_aided', label: 'Government Aided' },
  { value: 'government_school', label: 'Government School' },
];

export const DETAIL_TEXT_FIELDS = [
  'father_name',
  'applicant_category',
  'interest_course',
  'learning_mode',
  'city',
  'state',
  'pincode',
  'school_type',
  'caste_category',
] as const;

export const EMPTY_DETAILS = {
  father_name: '',
  applicant_category: '',
  current_class: '',
  interest_course: '',
  learning_mode: '',
  city: '',
  state: '',
  pincode: '',
  school_type: '',
  caste_category: '',
  target_exam_year: '',
};

export type ApplicationDetailsForm = typeof EMPTY_DETAILS;

export const FIELD_SX = { '& .MuiOutlinedInput-root': { borderRadius: 0.75 } };

/** The form values for a lead row (or blanks for a student with none). */
export function detailsFormFromLead(lead: Record<string, any> | null | undefined): ApplicationDetailsForm {
  const current = (lead || {}) as Record<string, any>;
  const academic = (current.academic_data || {}) as Record<string, unknown>;
  return {
    father_name: current.father_name || '',
    applicant_category: current.applicant_category || '',
    current_class: academic.current_class ? String(academic.current_class) : '',
    interest_course: current.interest_course || '',
    learning_mode: current.learning_mode || '',
    city: current.city || '',
    state: current.state || '',
    pincode: current.pincode || '',
    school_type: current.school_type || '',
    caste_category: current.caste_category || '',
    target_exam_year: current.target_exam_year?.toString() || '',
  };
}

/**
 * Only the fields that changed, as column values. `error` is set when the exam
 * year is not a year.
 */
export function detailsUpdatesFromForm(
  form: ApplicationDetailsForm,
  lead: Record<string, any> | null | undefined,
): { updates: Record<string, unknown>; error: string | null } {
  const current = (lead || {}) as Record<string, any>;
  const updates: Record<string, unknown> = {};
  for (const field of DETAIL_TEXT_FIELDS) {
    if (form[field] !== (current[field] || '')) updates[field] = form[field] || null;
  }
  if (form.target_exam_year !== (current.target_exam_year?.toString() || '')) {
    const year = form.target_exam_year ? Number(form.target_exam_year) : null;
    if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
      return { updates, error: 'Target exam year must be a year such as 2027.' };
    }
    updates.target_exam_year = year;
  }
  const academic = (current.academic_data || {}) as Record<string, unknown>;
  if (form.current_class !== (academic.current_class ? String(academic.current_class) : '')) {
    updates.academic_data = { ...academic, current_class: form.current_class || null };
  }
  return { updates, error: null };
}

const OVERLINE_SX = { fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5 } as const;

interface ApplicationDetailsFieldsProps {
  value: ApplicationDetailsForm;
  onChange: (field: keyof ApplicationDetailsForm, value: string) => void;
  /** No application yet: the course and learning mode selects allow a blank. */
  isNew?: boolean;
  /** Show the section headings (Personal, Course, Location). */
  headings?: boolean;
}

export default function ApplicationDetailsFields({ value, onChange, isNew = false, headings = true }: ApplicationDetailsFieldsProps) {
  const notSet = <MenuItem value="">Not set</MenuItem>;
  return (
    <>
      {headings && (
        <Typography variant="overline" sx={OVERLINE_SX}>
          Personal Details
        </Typography>
      )}

      <TextField
        label="Father's Name"
        value={value.father_name}
        onChange={(e) => onChange('father_name', e.target.value)}
        fullWidth
        size="small"
        sx={FIELD_SX}
      />

      <Grid container spacing={2}>
        <Grid item xs={6}>
          <TextField
            select
            label="Applicant Category"
            value={value.applicant_category}
            onChange={(e) => onChange('applicant_category', e.target.value)}
            fullWidth
            size="small"
            sx={FIELD_SX}
          >
            {notSet}
            {APPLICANT_CATEGORIES.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={6}>
          <TextField
            select
            label="Current Class"
            value={value.current_class}
            onChange={(e) => onChange('current_class', e.target.value)}
            fullWidth
            size="small"
            helperText="For school students"
            sx={FIELD_SX}
          >
            {notSet}
            {CLASS_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>

      {headings && (
        <>
          <Divider sx={{ my: 0.5 }} />
          <Typography variant="overline" sx={OVERLINE_SX}>
            Course & Learning
          </Typography>
        </>
      )}

      <Grid container spacing={2}>
        <Grid item xs={6}>
          <TextField
            select
            label="Course Interest"
            value={value.interest_course}
            onChange={(e) => onChange('interest_course', e.target.value)}
            fullWidth
            size="small"
            sx={FIELD_SX}
          >
            {isNew && notSet}
            {COURSE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={6}>
          <TextField
            select
            label="Learning Mode"
            value={value.learning_mode}
            onChange={(e) => onChange('learning_mode', e.target.value)}
            fullWidth
            size="small"
            sx={FIELD_SX}
          >
            {isNew && notSet}
            {LEARNING_MODES.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={6}>
          <TextField
            select
            label="School Type"
            value={value.school_type}
            onChange={(e) => onChange('school_type', e.target.value)}
            fullWidth
            size="small"
            sx={FIELD_SX}
          >
            {notSet}
            {SCHOOL_TYPES.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={6}>
          <TextField
            select
            label="Caste Category"
            value={value.caste_category}
            onChange={(e) => onChange('caste_category', e.target.value)}
            fullWidth
            size="small"
            sx={FIELD_SX}
          >
            {notSet}
            {CASTE_CATEGORIES.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>
        </Grid>
      </Grid>

      <TextField
        label="Target Exam Year"
        type="number"
        value={value.target_exam_year}
        onChange={(e) => onChange('target_exam_year', e.target.value)}
        fullWidth
        size="small"
        placeholder="e.g. 2027"
        helperText="The calendar year they write the exam. The 2026-27 batch writes in 2027."
        sx={FIELD_SX}
      />

      {headings && (
        <>
          <Divider sx={{ my: 0.5 }} />
          <Typography variant="overline" sx={OVERLINE_SX}>
            Location
          </Typography>
        </>
      )}

      <Grid container spacing={2}>
        <Grid item xs={4}>
          <TextField
            label="City"
            value={value.city}
            onChange={(e) => onChange('city', e.target.value)}
            fullWidth
            size="small"
            sx={FIELD_SX}
          />
        </Grid>
        <Grid item xs={4}>
          <TextField
            label="State"
            value={value.state}
            onChange={(e) => onChange('state', e.target.value)}
            fullWidth
            size="small"
            sx={FIELD_SX}
          />
        </Grid>
        <Grid item xs={4}>
          <TextField
            label="Pincode"
            value={value.pincode}
            onChange={(e) => onChange('pincode', e.target.value)}
            fullWidth
            size="small"
            inputProps={{ inputMode: 'numeric' }}
            sx={FIELD_SX}
          />
        </Grid>
      </Grid>
    </>
  );
}
