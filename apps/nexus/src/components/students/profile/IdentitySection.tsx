'use client';

import { Box, Chip, Tooltip } from '@neram/ui';
import CopyEmailButton from '@/components/students/CopyEmailButton';
import EmailDomainFlag from '@/components/students/EmailDomainFlag';
import { Field, FieldGrid } from './FieldGrid';
import ProfileSection from './ProfileSection';
import { classifyDomain, pickClassroomEmail } from '@/lib/classroom-email';
import {
  formatDateIN,
  formatDateTimeIN,
  formatPhone,
  humanise,
} from '@/lib/student-profile-fields';
import type { ProfileStudent, ProfileStudentRecord } from '@/lib/student-profile-types';

/**
 * Who this student is and how to reach them.
 *
 * The classroom email is resolved with pickClassroomEmail, the same helper the
 * students list uses, so the address shown here and the address shown on the
 * list can never disagree.
 *
 * The Microsoft row is a presence check, not the raw ms_oid. What a teacher
 * needs to know is "can they sign in"; a uuid answers that badly.
 */
export default function IdentitySection({
  student,
  record,
  onCopyEmail,
}: {
  student: ProfileStudent;
  record: ProfileStudentRecord | null;
  onCopyEmail: (e: React.MouseEvent, email: string) => void;
}) {
  const hasMicrosoft = !!student.ms_oid;

  const classroom = pickClassroomEmail({
    ms_teams_email: record?.ms_teams_email,
    linked_classroom_email: student.linked_classroom_email,
    email: student.email,
  });

  return (
    <ProfileSection
      id="profile-identity"
      title="Identity and contact"
      headline={classroom.email || 'No email on file'}
      defaultExpanded
    >
      <FieldGrid>
        <Field
          label="Classroom email"
          value={
            classroom.email ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                <span>{classroom.email}</span>
                <EmailDomainFlag
                  status={classroom.status}
                  awaitingMicrosoft={!hasMicrosoft}
                />
                <CopyEmailButton
                  email={classroom.email}
                  title="Copy this email"
                  onCopy={onCopyEmail}
                />
              </Box>
            ) : null
          }
        />
        <Field
          label="Account email"
          value={student.email}
          hint={
            student.email && classifyDomain(student.email) === 'personal'
              ? 'A personal address, not the organisation domain.'
              : null
          }
        />
        <Field label="Personal email" value={student.personal_email} />
        <Field label="Phone" value={formatPhone(student.phone)} />
        <Field label="Date of birth" value={formatDateIN(student.date_of_birth)} />
        <Field label="Gender" value={student.gender ? humanise(student.gender) : null} />
        <Field
          label="Microsoft account"
          value={
            <Tooltip
              title={
                hasMicrosoft
                  ? 'This student can sign in to Nexus with their Microsoft account.'
                  : 'Without a Microsoft account this student cannot sign in to Nexus at all.'
              }
            >
              <Chip
                size="small"
                label={hasMicrosoft ? 'Linked' : 'Awaiting Microsoft'}
                color={hasMicrosoft ? 'success' : 'warning'}
                variant={hasMicrosoft ? 'filled' : 'outlined'}
                sx={{ fontWeight: 700 }}
              />
            </Tooltip>
          }
        />
        <Field label="Roll number" value={record?.student_id} />
        <Field
          label="First opened Nexus"
          value={formatDateTimeIN(student.nexus_first_login_at)}
          hint={student.nexus_first_login_at ? null : 'Has never opened Nexus'}
        />
        <Field label="Last opened Nexus" value={formatDateTimeIN(student.nexus_last_login_at)} />
        <Field label="Last signed in anywhere" value={formatDateTimeIN(student.last_login_at)} />
        <Field
          label="Programme"
          value={student.student_program ? humanise(student.student_program) : null}
        />
      </FieldGrid>
    </ProfileSection>
  );
}
