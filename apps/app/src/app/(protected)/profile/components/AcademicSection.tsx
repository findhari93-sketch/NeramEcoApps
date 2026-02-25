'use client';

import { Box, Typography } from '@neram/ui';
import InfoRow from './InfoRow';
import {
  APPLICANT_CATEGORY_OPTIONS,
  CASTE_CATEGORY_OPTIONS,
  EDUCATION_BOARD_OPTIONS,
  SCHOOL_TYPE_OPTIONS,
  type LeadProfile,
  type SchoolStudentAcademicData,
  type DiplomaStudentAcademicData,
  type CollegeStudentAcademicData,
  type WorkingProfessionalAcademicData,
} from '@neram/database';

interface AcademicSectionProps {
  leadProfile: LeadProfile;
}

function getLabel(options: { value: string; label: string }[], value: string | null): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label || value;
}

function getBoardLabel(code: string | null): string | null {
  if (!code) return null;
  return EDUCATION_BOARD_OPTIONS.find((b) => b.code === code)?.name || code;
}

export default function AcademicSection({ leadProfile }: AcademicSectionProps) {
  const { applicant_category, academic_data, caste_category, target_exam_year, school_type } = leadProfile;

  if (!applicant_category && !academic_data && !caste_category) return null;

  const categoryLabel = applicant_category
    ? APPLICANT_CATEGORY_OPTIONS.find((o) => o.value === applicant_category)?.label || applicant_category
    : null;

  return (
    <Box>
      <InfoRow label="Applicant Type" value={categoryLabel} />

      {applicant_category === 'school_student' && academic_data && (() => {
        const d = academic_data as SchoolStudentAcademicData;
        return (
          <>
            <InfoRow label="Current Class" value={d.current_class ? `Class ${d.current_class}` : null} />
            <InfoRow label="School Name" value={d.school_name} />
            <InfoRow label="Board" value={getBoardLabel(d.board)} />
            <InfoRow label="School Type" value={getLabel(SCHOOL_TYPE_OPTIONS, school_type)} />
            {d.previous_percentage != null && (
              <InfoRow label="Previous Percentage" value={`${d.previous_percentage}%`} />
            )}
          </>
        );
      })()}

      {applicant_category === 'diploma_student' && academic_data && (() => {
        const d = academic_data as DiplomaStudentAcademicData;
        return (
          <>
            <InfoRow label="College" value={d.college_name} />
            <InfoRow label="Department" value={d.department} />
            <InfoRow label="Completed Grade" value={d.completed_grade} />
            {d.marks != null && <InfoRow label="Marks" value={`${d.marks}%`} />}
          </>
        );
      })()}

      {applicant_category === 'college_student' && academic_data && (() => {
        const d = academic_data as CollegeStudentAcademicData;
        return (
          <>
            <InfoRow label="College" value={d.college_name} />
            <InfoRow label="Department" value={d.department} />
            <InfoRow label="Year of Study" value={d.year_of_study ? `Year ${d.year_of_study}` : null} />
            <InfoRow label="12th Completion Year" value={d.twelfth_year?.toString()} />
            {d.twelfth_percentage != null && (
              <InfoRow label="12th Percentage" value={`${d.twelfth_percentage}%`} />
            )}
          </>
        );
      })()}

      {applicant_category === 'working_professional' && academic_data && (() => {
        const d = academic_data as WorkingProfessionalAcademicData;
        return (
          <>
            <InfoRow label="12th Completion Year" value={d.twelfth_year?.toString()} />
            <InfoRow label="Occupation" value={d.occupation || null} />
            <InfoRow label="Company" value={d.company || null} />
          </>
        );
      })()}

      <InfoRow label="Caste Category" value={getLabel(CASTE_CATEGORY_OPTIONS, caste_category)} />
      <InfoRow label="Target Exam Year" value={target_exam_year?.toString() || null} />

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        From your application. Contact support to update.
      </Typography>
    </Box>
  );
}
