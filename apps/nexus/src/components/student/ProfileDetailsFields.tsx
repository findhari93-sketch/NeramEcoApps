'use client';

import { Box, MenuItem, TextField, Typography } from '@neram/ui';

/**
 * A student's own details, as the student edits them: personal, academic and
 * location. Shared by /student/complete-profile (one section per step) and
 * /student/check-details (all three on one page). Both save through
 * PATCH /api/student/profile-completion, the single writer for these fields.
 *
 * Money is deliberately absent. A student does not set their own fee: the
 * office agrees it per student. On Check your details the student reads the fee
 * and reports a problem instead.
 */

export const APPLICANT_CATEGORIES = [
  { value: 'school_student', label: 'School Student' },
  { value: 'diploma_student', label: 'Diploma Student' },
  { value: 'college_student', label: 'College Student' },
  { value: 'working_professional', label: 'Working Professional' },
];

export const COURSE_OPTIONS = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee_paper2', label: 'JEE Paper 2' },
  { value: 'both', label: 'Both NATA & JEE' },
  { value: 'not_sure', label: 'Not Sure' },
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

// Exam batch options: this academic year and the next three, shown as "YYYY-YY".
// The VALUE is the calendar year that batch writes the exam (2026-27 writes in 2027),
// because lead_profiles.target_exam_year holds exam years everywhere else. It used to
// hold the batch's start year, so every answer saved here landed one year early.
const generateAcademicYears = () => {
  const now = new Date();
  // The academic year starts in April, as in currentAcademicYear from @neram/database.
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 4 }, (_, i) => {
    const yr = startYear + i;
    const yy = String((yr + 1) % 100).padStart(2, '0');
    return { value: String(yr + 1), label: `${yr}-${yy} (exam in ${yr + 1})` };
  });
};

export const ACADEMIC_YEAR_OPTIONS = generateAcademicYears();

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export interface ProfileDetailsValues {
  phone: string;
  dob: string;
  gender: string;
  firstName: string;
  fatherName: string;
  applicantCategory: string;
  interestCourse: string;
  casteCategory: string;
  targetExamYear: string;
  schoolType: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
}

export type ProfileDetailsSection = 'personal' | 'academic' | 'location';

export const EMPTY_PROFILE_DETAILS: ProfileDetailsValues = {
  phone: '',
  dob: '',
  gender: '',
  firstName: '',
  fatherName: '',
  applicantCategory: '',
  interestCourse: '',
  casteCategory: '',
  targetExamYear: '',
  schoolType: '',
  address: '',
  city: '',
  district: '',
  state: '',
  pincode: '',
};

/** Form values from a GET /api/student/profile-completion response. */
export function profileDetailsFrom(data: { user?: any; leadProfile?: any } | null | undefined): ProfileDetailsValues {
  return {
    phone: data?.user?.phone || '',
    dob: data?.user?.date_of_birth || '',
    gender: data?.user?.gender || '',
    firstName: data?.user?.first_name || '',
    fatherName: data?.leadProfile?.father_name || '',
    applicantCategory: data?.leadProfile?.applicant_category || '',
    interestCourse: data?.leadProfile?.interest_course || '',
    casteCategory: data?.leadProfile?.caste_category || '',
    targetExamYear: data?.leadProfile?.target_exam_year?.toString() || '',
    schoolType: data?.leadProfile?.school_type || '',
    address: data?.leadProfile?.address || '',
    city: data?.leadProfile?.city || '',
    district: data?.leadProfile?.district || '',
    state: data?.leadProfile?.state || '',
    pincode: data?.leadProfile?.pincode || '',
  };
}

/** The PATCH body for one section, or for all of them. Empty strings save as null. */
export function profileDetailsUpdates(
  values: ProfileDetailsValues,
  sections: ProfileDetailsSection[],
): { userUpdates: Record<string, unknown>; leadUpdates: Record<string, unknown> } {
  const userUpdates: Record<string, unknown> = {};
  const leadUpdates: Record<string, unknown> = {};
  if (sections.includes('personal')) {
    Object.assign(userUpdates, {
      phone: values.phone || null,
      date_of_birth: values.dob || null,
      gender: values.gender || null,
      first_name: values.firstName || null,
    });
    leadUpdates.father_name = values.fatherName || null;
  }
  if (sections.includes('academic')) {
    Object.assign(leadUpdates, {
      applicant_category: values.applicantCategory || null,
      interest_course: values.interestCourse || null,
      caste_category: values.casteCategory || null,
      target_exam_year: values.targetExamYear ? Number(values.targetExamYear) : null,
      school_type: values.schoolType || null,
    });
  }
  if (sections.includes('location')) {
    Object.assign(leadUpdates, {
      address: values.address || null,
      city: values.city || null,
      district: values.district || null,
      state: values.state || null,
      pincode: values.pincode || null,
    });
  }
  return { userUpdates, leadUpdates };
}

/** Pincode to city, district and state. Silent on failure: the student can type them. */
export async function lookupPincodePlace(
  code: string,
): Promise<{ city?: string; district?: string; state?: string } | null> {
  if (!/^\d{6}$/.test(code)) return null;
  try {
    const res = await fetch(`/api/pincode/${code}`);
    const data = await res.json();
    return data.success && data.data ? data.data : null;
  } catch {
    return null;
  }
}

export interface ProfileDetailsFieldsProps {
  section: ProfileDetailsSection;
  values: ProfileDetailsValues;
  onChange: (field: keyof ProfileDetailsValues, value: string) => void;
  /** Called with a full 6-digit pincode, to fill in the place. */
  onPincodeComplete?: (code: string) => void;
  pincodeLoading?: boolean;
  required?: boolean;
  /**
   * Compact fields in rows of two, as complete-profile has always shown them.
   * false gives full-size (48px) fields, one per row on a phone.
   */
  dense?: boolean;
  /** Show the section heading. */
  showHeading?: boolean;
}

const HEADINGS: Record<ProfileDetailsSection, string> = {
  personal: 'Personal Details',
  academic: 'Academic Details',
  location: 'Location',
};

export default function ProfileDetailsFields({
  section,
  values,
  onChange,
  onPincodeComplete,
  pincodeLoading = false,
  required = false,
  dense = true,
  showHeading = true,
}: ProfileDetailsFieldsProps) {
  const size = dense ? ('small' as const) : ('medium' as const);
  // Dense keeps the old side-by-side pairs. Full size stacks them on a phone.
  const pairSx = dense
    ? { display: 'flex', gap: 2 }
    : { display: 'flex', gap: 2, flexDirection: { xs: 'column' as const, sm: 'row' as const } };
  const set = (field: keyof ProfileDetailsValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange(field, e.target.value);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {showHeading && (
        <Typography variant="subtitle2" fontWeight={700}>
          {HEADINGS[section]}
        </Typography>
      )}

      {section === 'personal' && (
        <>
          <TextField
            label="Phone Number" value={values.phone} onChange={set('phone')}
            fullWidth size={size} placeholder="+91XXXXXXXXXX" required={required}
            helperText="Your primary contact number (WhatsApp preferred)"
            inputProps={dense ? undefined : { inputMode: 'tel', autoComplete: 'tel' }}
          />
          <TextField label="First Name" value={values.firstName} onChange={set('firstName')} fullWidth size={size} />
          <TextField label="Father's Name" value={values.fatherName} onChange={set('fatherName')} fullWidth size={size} />
          <Box sx={pairSx}>
            <TextField
              label="Date of Birth" type="date" value={values.dob} onChange={set('dob')}
              fullWidth size={size} InputLabelProps={{ shrink: true }} required={required}
            />
            <TextField
              label="Gender" select value={values.gender} onChange={set('gender')}
              fullWidth size={size} required={required}
            >
              <MenuItem value="">Select</MenuItem>
              {GENDER_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
          </Box>
        </>
      )}

      {section === 'academic' && (
        <>
          <TextField
            label="Applicant Category" select value={values.applicantCategory}
            onChange={set('applicantCategory')} fullWidth size={size}
          >
            <MenuItem value="">Select</MenuItem>
            {APPLICANT_CATEGORIES.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
          <TextField
            label="Course Interest" select value={values.interestCourse}
            onChange={set('interestCourse')} fullWidth size={size}
          >
            <MenuItem value="">Select</MenuItem>
            {COURSE_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
          <Box sx={pairSx}>
            <TextField
              label="Caste Category" select value={values.casteCategory}
              onChange={set('casteCategory')} fullWidth size={size}
            >
              <MenuItem value="">Select</MenuItem>
              {CASTE_CATEGORIES.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
            <TextField
              label="Target Exam Year" select value={values.targetExamYear}
              onChange={set('targetExamYear')} fullWidth size={size}
            >
              <MenuItem value="">Select</MenuItem>
              {ACADEMIC_YEAR_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </TextField>
          </Box>
          <TextField
            label="School Type" select value={values.schoolType}
            onChange={set('schoolType')} fullWidth size={size}
          >
            <MenuItem value="">Select</MenuItem>
            {SCHOOL_TYPES.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
        </>
      )}

      {section === 'location' && (
        <>
          <TextField
            label="Address" value={values.address} onChange={set('address')}
            fullWidth size={size} multiline rows={2}
          />
          <TextField
            label="Pincode"
            value={values.pincode}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 6);
              onChange('pincode', val);
              if (val.length === 6) onPincodeComplete?.(val);
            }}
            fullWidth size={size}
            inputProps={{ maxLength: 6, inputMode: 'numeric' }}
            helperText={pincodeLoading ? 'Looking up...' : values.pincode.length === 6 ? 'Auto-filled from pincode' : ''}
          />
          <Box sx={pairSx}>
            <TextField label="City" value={values.city} onChange={set('city')} fullWidth size={size} />
            <TextField label="District" value={values.district} onChange={set('district')} fullWidth size={size} />
          </Box>
          <TextField label="State" value={values.state} onChange={set('state')} fullWidth size={size} />
        </>
      )}
    </Box>
  );
}
