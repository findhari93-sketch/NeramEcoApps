'use client';

import { Alert, Divider, Typography } from '@neram/ui';
import { EmptyNote, Field, FieldGrid } from './FieldGrid';
import ProfileSection from './ProfileSection';
import { EMPTY_SENTENCE, formatDateTimeIN, formatPhone, yesNo } from '@/lib/student-profile-fields';
import type { ProfileGuardian, ProfileParentAccess } from '@/lib/student-profile-types';

/**
 * Parents, guardians and the emergency contact, plus whether a parent has a
 * Nexus login.
 *
 * The data comes from three tables and the richest one covers only about a fifth
 * of the roster, so the caption names WHICH source this record came from.
 * Silently falling back makes a card look empty when the details exist on the
 * application form, which reads as broken rather than incomplete.
 *
 * Blood group and medical conditions are visible to every staff member by
 * deliberate choice: a teacher running a class needs them, and gating safety
 * information behind a management tier helps nobody.
 */
const SOURCE_NOTE: Record<NonNullable<ProfileGuardian['source']>, string> = {
  post_enrollment: 'From the post-enrolment form.',
  application: 'From the application form. The post-enrolment form has not been filled in yet.',
  student_profile: 'From the student record. No detailed guardian form is on file.',
};

export default function GuardianSection({
  guardian,
  parentAccess,
}: {
  guardian: ProfileGuardian;
  parentAccess: ProfileParentAccess;
}) {
  const primaryName = guardian.father_name || guardian.mother_name;

  return (
    <ProfileSection
      id="profile-guardian"
      title="Parent and guardian"
      headline={
        primaryName ||
        (parentAccess.linked ? 'Parent has a Nexus login' : 'No guardian details on file')
      }
    >
      {guardian.source === null ? (
        <EmptyNote>{EMPTY_SENTENCE.guardian}</EmptyNote>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            {SOURCE_NOTE[guardian.source]}
          </Typography>

          <FieldGrid>
            <Field label="Father" value={guardian.father_name} />
            <Field label="Father's phone" value={formatPhone(guardian.father_phone)} />
            <Field label="Father's occupation" value={guardian.father_occupation} />
            <Field label="Mother" value={guardian.mother_name} />
            <Field label="Mother's phone" value={formatPhone(guardian.mother_phone)} />
            <Field label="Mother's occupation" value={guardian.mother_occupation} />
            <Field label="Emergency contact" value={guardian.emergency_contact_name} />
            <Field
              label="Emergency phone"
              value={formatPhone(guardian.emergency_contact_phone)}
              hint={guardian.emergency_contact_relation}
            />
            <Field label="Blood group" value={guardian.blood_group} />
          </FieldGrid>

          {guardian.medical_conditions && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Medical conditions
              </Typography>
              <Typography variant="body2">{guardian.medical_conditions}</Typography>
            </Alert>
          )}
        </>
      )}

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        Parent portal access
      </Typography>
      {parentAccess.linked ? (
        <FieldGrid>
          <Field label="Login ID" value={parentAccess.login_id} />
          <Field label="Relationship" value={parentAccess.relationship} />
          <Field label="Primary contact" value={yesNo(parentAccess.is_primary)} />
          <Field
            label="Login active"
            value={yesNo(parentAccess.credential_active)}
            hint={
              parentAccess.credential_active === false
                ? 'Access has been revoked, so this parent cannot sign in.'
                : null
            }
          />
          <Field
            label="Parent last signed in"
            value={formatDateTimeIN(parentAccess.last_login_at)}
            hint={parentAccess.last_login_at ? null : 'Has never signed in'}
          />
        </FieldGrid>
      ) : (
        <EmptyNote>
          No parent has been given a Nexus login for this student yet.
        </EmptyNote>
      )}
    </ProfileSection>
  );
}
