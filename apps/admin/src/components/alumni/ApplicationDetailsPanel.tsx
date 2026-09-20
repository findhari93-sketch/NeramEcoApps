'use client';

import { Box, Typography, Chip, Alert } from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { Field, SectionCard } from './uiPrimitives';
import { academicYearFromExamYear } from '../crm/academic-years';
import { assessApplication } from '@neram/database';

interface ApplicationDetailsPanelProps {
  leadProfile: any;
}

const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'Both',
  not_sure: 'Not sure yet',
};

const CATEGORY_LABELS: Record<string, string> = {
  school_student: 'School student',
  diploma_student: 'Diploma student',
  college_student: 'College student',
  working_professional: 'Working professional',
};

function titleCase(v?: string | null): string {
  if (!v) return '';
  return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Whether the student completed the basic application form.
 *
 * This used to hold its own copy of the /api/students rule, a set of "complete"
 * lead statuses, and the two copies could drift. Both now read assessApplication in
 * @neram/database, which checks the fields rather than the status. The signature is
 * kept so the existing callers do not change.
 *
 * Note it cannot see the users row from here, so a date of birth held only on users
 * reads as missing in this panel. That makes the banner slightly pessimistic and
 * never falsely reassuring, which is the right way round for a panel whose job is to
 * tell staff what still needs collecting.
 */
export function isApplicationComplete(lead: any): boolean {
  return assessApplication({ lead }).state === 'complete';
}

/**
 * Read-only view of what a student filled in the marketing application form
 * (lead_profiles): the basics, their academic background, course interest and
 * location. Headed by a completeness banner so staff can tell at a glance whether
 * the student still needs to finish the form. Mounted in the student / alumni drawer.
 */
export default function ApplicationDetailsPanel({ leadProfile: lead }: ApplicationDetailsPanelProps) {
  const assessment = assessApplication({ lead });
  const complete = assessment.state === 'complete';
  const academic = lead?.academic_data || {};

  // academic_data is category-specific; surface the common fields generically.
  const school = academic.school_name || academic.college_name || null;
  const grade = academic.current_class || academic.department || academic.year_of_study || academic.completed_grade || null;
  const board = academic.board || null;
  const percentage = academic.previous_percentage || academic.twelfth_percentage || academic.marks || null;

  const location = [lead?.city, lead?.district, lead?.state].filter(Boolean).join(', ');

  return (
    <SectionCard title="Application form">
      {complete ? (
        <Alert icon={<CheckCircleOutlineIcon fontSize="inherit" />} severity="success" sx={{ mb: 2, py: 0.25 }}>
          Application complete. Every detail we ask for is on file.
        </Alert>
      ) : (
        <Alert severity={lead ? 'warning' : 'info'} sx={{ mb: 2, py: 0.25 }}>
          {lead
            ? `Partly filled. ${assessment.summary}`
            : 'No application form yet. Send the student a link to fill it in, or fill it in for them below.'}
        </Alert>
      )}

      {lead && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 3 }}>
          <Field
            label="Application status"
            value={lead.status ? <Chip label={titleCase(lead.status)} size="small" sx={{ height: 22, fontSize: 11 }} /> : ''}
          />
          <Field label="Application number" value={lead.application_number} />
          <Field label="Course interest" value={lead.interest_course ? COURSE_LABELS[lead.interest_course] || lead.interest_course : ''} />
          <Field label="Applicant type" value={lead.applicant_category ? CATEGORY_LABELS[lead.applicant_category] || titleCase(lead.applicant_category) : ''} />
          <Field label="School / College" value={school} />
          <Field label="Class / Year" value={grade ? titleCase(String(grade)) : ''} />
          <Field label="Board" value={board ? String(board).toUpperCase() : ''} />
          <Field label="Marks / Percentage" value={percentage ? `${percentage}%` : ''} />
          <Field label="Exam batch" value={academicYearFromExamYear(lead.target_exam_year)} />
          <Field label="Category" value={lead.caste_category ? String(lead.caste_category).toUpperCase() : ''} />
          <Field label="Location" value={location} />
          <Field label="Pincode" value={lead.pincode} />
          <Field label="Join method" value={lead.source === 'direct_link' ? 'Direct enrollment' : titleCase(lead.source)} />
          <Field label="Final fee" value={lead.final_fee != null ? `INR ${Number(lead.final_fee).toLocaleString('en-IN')}` : ''} />
        </Box>
      )}

      {!lead && (
        <Typography variant="body2" sx={{ color: '#94A3B8' }}>
          Nothing to show until the student fills the application form.
        </Typography>
      )}
    </SectionCard>
  );
}
