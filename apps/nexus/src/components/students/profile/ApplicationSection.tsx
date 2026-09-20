'use client';

import { Box, Divider, Typography } from '@neram/ui';
import { EmptyNote, Field, FieldGrid } from './FieldGrid';
import ProfileSection from './ProfileSection';
import AcademicDataBlock from './AcademicDataBlock';
import AskForDetailsCard from './AskForDetailsCard';
import {
  APPLICANT_CATEGORY_LABEL,
  EMPTY_SENTENCE,
  LEARNING_MODE_LABEL,
  LOCATION_SOURCE_LABEL,
  SCHOOL_TYPE_LABEL,
  formatDateIN,
  humanise,
  labelFor,
  yesNo,
} from '@/lib/student-profile-fields';
import type { ProfileApplication } from '@/lib/student-profile-types';

/**
 * Everything the student told us when they applied.
 *
 * `application` is null for every student a staff member added by hand, which is
 * a large share of the roster. That case renders one sentence, never a grid of
 * dashes: an absent form is a fact about how they enrolled, not a fault.
 */
/**
 * Whether the fields THIS SECTION shows still have gaps.
 *
 * Deliberately not assessApplication from @neram/database: that is the authoritative
 * rule and it also reads first name, father's name and date of birth, which the
 * ProfileApplication shape does not carry. Running it here would report those three
 * as missing for every student and make the offer permanent. This subset decides one
 * thing only, whether to offer the ask button, and the chips elsewhere still answer
 * to the shared rule. Offering the button once too often costs nothing; claiming a
 * form is complete when it is not is the failure that matters.
 */
function hasVisibleGaps(a: ProfileApplication): boolean {
  const academic = (a.academic_data || {}) as Record<string, unknown>;
  const hasAcademicDetail = Boolean(
    academic.current_class || academic.college_name || a.applicant_category === 'working_professional',
  );
  return (
    !a.applicant_category || !a.target_exam_year || !a.city || !a.state || !hasAcademicDetail
  );
}

export default function ApplicationSection({
  application,
  ask,
}: {
  application: ProfileApplication | null;
  /** Omit to render the section read-only, as the parent portal does. */
  ask?: {
    studentId: string;
    studentName: string | null;
    firstName: string | null;
    classroomId: string | null;
    getToken: () => Promise<string | null>;
  };
}) {
  if (!application) {
    return (
      <ProfileSection
        id="profile-application"
        title="Application form"
        headline="No application on file"
      >
        <EmptyNote>{EMPTY_SENTENCE.application}</EmptyNote>
        {/* The whole point of naming the absence is being able to fix it. Without
            this the section was a dead end, and staff went looking for the button
            on a different screen. */}
        {ask && (
          <AskForDetailsCard
            studentId={ask.studentId}
            studentName={ask.studentName}
            firstName={ask.firstName}
            classroomId={ask.classroomId}
            getToken={ask.getToken}
          />
        )}
      </ProfileSection>
    );
  }

  const place = [application.city, application.district, application.state]
    .filter(Boolean)
    .join(', ');

  return (
    <ProfileSection
      id="profile-application"
      title="Application form"
      headline={
        application.application_number
          ? `Application ${application.application_number}`
          : application.status
            ? humanise(application.status)
            : null
      }
    >
      <FieldGrid>
        <Field label="Application number" value={application.application_number} />
        <Field
          label="Status"
          value={application.status ? humanise(application.status) : null}
        />
        <Field label="Submitted on" value={formatDateIN(application.form_completed_at)} />
        <Field label="Started on" value={formatDateIN(application.created_at)} />
        <Field
          label="Applicant category"
          value={labelFor(APPLICANT_CATEGORY_LABEL, application.applicant_category)}
        />
        <Field label="Target exam year" value={application.target_exam_year} />
        <Field
          label="School type"
          value={
            application.school_type
              ? labelFor(SCHOOL_TYPE_LABEL, application.school_type)
              : null
          }
        />
        <Field
          label="Learning mode"
          value={
            application.learning_mode
              ? labelFor(LEARNING_MODE_LABEL, application.learning_mode)
              : null
          }
        />
        <Field
          label="Course of interest"
          value={application.interest_course ? humanise(application.interest_course) : null}
        />
        <Field
          label="Accepted hybrid learning"
          value={yesNo(application.hybrid_learning_accepted)}
        />
        <Field
          label="Phone verified"
          value={yesNo(application.phone_verified)}
          hint={
            application.phone_verified_at
              ? `Verified on ${formatDateIN(application.phone_verified_at)}`
              : null
          }
        />
        <Field
          label="Form progress"
          value={
            application.form_completed_at
              ? 'Completed'
              : application.form_step_completed !== null
                ? `Reached step ${application.form_step_completed}`
                : null
          }
        />
      </FieldGrid>

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        Where they live
      </Typography>
      <FieldGrid>
        <Field label="City" value={application.city} />
        <Field label="District" value={application.district} />
        <Field label="State" value={application.state} />
        <Field label="Country" value={application.country} />
        <Field label="Pincode" value={application.pincode} />
        <Field label="Address" value={application.address} full />
      </FieldGrid>
      {application.location_source && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            {/* How the address was arrived at changes how far to trust it. */}
            {labelFor(LOCATION_SOURCE_LABEL, application.location_source)}
            {place ? `: ${place}` : ''}
          </Typography>
        </Box>
      )}

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        Academic background
      </Typography>
      <AcademicDataBlock
        applicantCategory={application.applicant_category}
        academicData={application.academic_data}
      />

      {/* A form with gaps is the common case, not the exception, so the offer sits
          below the detail rather than shouting above it. */}
      {ask && hasVisibleGaps(application) && (
        <>
          <Divider sx={{ my: 3 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            Some details are still missing
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Send them a link and they can fill in the rest themselves, with no password.
          </Typography>
          <AskForDetailsCard
            studentId={ask.studentId}
            studentName={ask.studentName}
            firstName={ask.firstName}
            classroomId={ask.classroomId}
            getToken={ask.getToken}
          />
        </>
      )}
    </ProfileSection>
  );
}
