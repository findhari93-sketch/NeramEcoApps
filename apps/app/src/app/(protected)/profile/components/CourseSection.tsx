'use client';

import { Box, Typography } from '@neram/ui';
import InfoRow from './InfoRow';
import { INTEREST_COURSE_OPTIONS, type LeadProfile } from '@neram/database';

interface CourseSectionProps {
  leadProfile: LeadProfile;
  courseName: string | null;
  centerName: string | null;
  centerCity: string | null;
}

const LEARNING_MODE_LABELS: Record<string, string> = {
  hybrid: 'Hybrid (Online + Offline)',
  online_only: 'Online Only',
};

export default function CourseSection({
  leadProfile,
  courseName,
  centerName,
  centerCity,
}: CourseSectionProps) {
  const courseLabel =
    INTEREST_COURSE_OPTIONS.find((o) => o.value === leadProfile.interest_course)?.label ||
    leadProfile.interest_course;

  const centerDisplay = centerName
    ? centerCity
      ? `${centerName}, ${centerCity}`
      : centerName
    : null;

  return (
    <Box>
      <InfoRow label="Interest Course" value={courseLabel} />
      {courseName && <InfoRow label="Selected Course" value={courseName} />}
      <InfoRow label="Learning Mode" value={LEARNING_MODE_LABELS[leadProfile.learning_mode] || leadProfile.learning_mode} />
      {centerDisplay && <InfoRow label="Learning Center" value={centerDisplay} />}
      <InfoRow label="Target Exam Year" value={leadProfile.target_exam_year?.toString() || null} />

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        From your application. Visit My Applications to update.
      </Typography>
    </Box>
  );
}
