'use client';

import { Box, Typography } from '@neram/ui';
import { Field, FieldGrid } from './FieldGrid';
import ProfileSection from './ProfileSection';
import ProgressRow from './ProgressRow';
import { STAGE_LABEL, stageKeyOf } from '@/lib/student-stage';
import { formatDateIN, formatDateTimeIN, humanise } from '@/lib/student-profile-fields';
import type {
  ProfileChecklistItem,
  ProfileEnrollment,
  ProfileProgress,
  ProfileStudentRecord,
  StudentProfileCore,
} from '@/lib/student-profile-types';

/**
 * Where this student sits in the course: their classroom, their stage, and how
 * far through the checklist and the topic list they are.
 *
 * The checklist ships only the OPEN items by default. A teacher opening this
 * section wants to know what is left, and the completed list is a number.
 */
export default function ClassroomSection({
  enrollment,
  record,
  classroom,
  checklist,
  topics,
  currentBatch,
}: {
  enrollment: ProfileEnrollment;
  record: ProfileStudentRecord | null;
  classroom: StudentProfileCore['classroom'];
  checklist: ProfileProgress<ProfileChecklistItem>;
  topics: { completed: number; total: number };
  currentBatch: string | null;
}) {
  const checklistPct =
    checklist.total > 0 ? Math.round((checklist.completed / checklist.total) * 100) : null;
  const topicPct =
    topics.total > 0 ? Math.round((topics.completed / topics.total) * 100) : null;

  const stage = stageKeyOf(enrollment.study_stage);

  return (
    <ProfileSection
      id="profile-classroom"
      title="Class and progress"
      headline={
        checklistPct === null
          ? classroom.name
          : `${checklist.completed} of ${checklist.total} checklist items done`
      }
      defaultExpanded
    >
      <FieldGrid>
        <Field label="Classroom" value={classroom.name} />
        <Field
          label="Study stage"
          value={STAGE_LABEL[stage]}
          hint={
            enrollment.study_stage_source
              ? `Set from ${humanise(enrollment.study_stage_source)}${
                  enrollment.study_stage_set_at
                    ? ` on ${formatDateIN(enrollment.study_stage_set_at)}`
                    : ''
                }`
              : null
          }
        />
        <Field
          label="Enrolled on"
          value={formatDateIN(enrollment.enrolled_at || record?.enrollment_date)}
        />
        <Field
          label="Participation"
          value={enrollment.participation_status === 'dormant' ? 'Dormant' : 'Active'}
          hint={
            enrollment.participation_status === 'dormant'
              ? [
                  enrollment.dormant_since
                    ? `Since ${formatDateIN(enrollment.dormant_since)}`
                    : null,
                  enrollment.dormant_reason,
                ]
                  .filter(Boolean)
                  .join('. ') || null
              : null
          }
        />
        <Field label="Current exam batch" value={currentBatch} />
        <Field label="Last activity" value={formatDateTimeIN(record?.last_activity_at)} />
        <Field label="Staff notes" value={record?.notes} full />
      </FieldGrid>

      <Box sx={{ mt: 3, display: 'grid', gap: 2 }}>
        <ProgressRow
          label="Checklist"
          value={checklistPct}
          caption={`${checklist.completed} of ${checklist.total}`}
          emptyNote="No checklist has been set up for this classroom yet."
          goodAt={50}
        />
        <ProgressRow
          label="Topics"
          value={topicPct}
          caption={`${topics.completed} of ${topics.total}`}
          emptyNote="No topics have been set up for this classroom yet."
          goodAt={50}
        />
      </Box>

      {checklist.items.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Still to do
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.75 }}>
            {checklist.items.map((item) => (
              <Typography key={item.id} component="li" variant="body2">
                {item.title}
                {item.topicTitle && (
                  <Typography component="span" variant="caption" color="text.secondary">
                    {` (${item.topicTitle})`}
                  </Typography>
                )}
              </Typography>
            ))}
          </Box>
          {checklist.truncated && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Showing the first {checklist.items.length}. Open the checklist page for the full list.
            </Typography>
          )}
        </Box>
      )}

    </ProfileSection>
  );
}
