/**
 * The real ports for student accounts: Supabase for records, Graph for the
 * Microsoft side. Kept apart from student-account-provisioning.ts so its ordering
 * tests never load a database client or a Graph token.
 */

import { enrollUser, examYearFromAcademicYear, recordUserHistory } from '@neram/database';
import { addStudentToClassroomTeams } from '@neram/auth';
import { createSupabaseDirectoryEnrollStore } from './directory-enrollment-store';
import {
  addUserToGroup,
  assignLicense,
  createEntraUser,
  isUpnAvailable,
  readUserPrincipalName,
  resetEntraPassword,
  setOtherMails,
} from './entra-accounts';
import { findIdentityCandidates, normalizePhone, type IdentityCandidateRow } from './identity-candidates';
import { escapeIlike } from './people-search';
import type {
  AccountGraphPort,
  AccountStorePort,
  ResetPasswordPorts,
  StudentRecord,
  TeamsSyncOutcome,
} from './student-account-provisioning';

const STUDENT_FIELDS = 'id, name, first_name, ms_oid, user_type, staff_role, phone, email, personal_email';

export const graphAccountPort: AccountGraphPort = {
  isUpnAvailable,
  createUser: createEntraUser,
  assignLicense: (userId, skuId) => assignLicense(userId, skuId),
  addToGroup: (groupId, userId) => addUserToGroup(groupId, userId),
  setOtherMails,
};

async function readStudent(supabase: any, userId: string): Promise<StudentRecord | null> {
  const { data, error } = await supabase.from('users').select(STUDENT_FIELDS).eq('id', userId).maybeSingle();
  if (error) throw error;
  return (data as StudentRecord | null) ?? null;
}

export function createSupabaseAccountStore(supabase: any): AccountStorePort {
  const directory = createSupabaseDirectoryEnrollStore(supabase);

  return {
    getStudent: (userId) => readStudent(supabase, userId),

    async findCandidates({ classroomId, name, phone, personalEmail }) {
      const inClass = await directory.listClassroomStudentsWithoutMicrosoft(classroomId);

      // Someone outside this class too: a lead who applied with this phone or email.
      const local = normalizePhone(phone);
      const email = personalEmail ? personalEmail.trim().toLowerCase() : null;
      const outside: IdentityCandidateRow[] = [];
      if (local || email) {
        const filters: string[] = [];
        if (local) filters.push(`phone.ilike.%${local}`);
        if (email) {
          const safe = escapeIlike(email);
          filters.push(`email.ilike.${safe}`, `personal_email.ilike.${safe}`);
        }
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email, personal_email, phone, user_type, staff_role')
          .is('ms_oid', null)
          .or(filters.join(','))
          .limit(10);
        if (error) throw error;
        const known = new Set(inClass.map((row) => row.user_id));
        for (const user of (data || []) as any[]) {
          if (known.has(user.id)) continue;
          if (user.staff_role || user.user_type === 'admin' || user.user_type === 'teacher') continue;
          outside.push({
            user_id: user.id,
            name: user.name ?? null,
            email: user.email ?? null,
            personal_email: user.personal_email ?? null,
            phone: user.phone ?? null,
            enrolled_at: null,
          });
        }
      }

      return findIdentityCandidates(
        { name, upn: null, phones: [phone], emails: [personalEmail] },
        [...inClass, ...outside],
      );
    },

    linkMicrosoft: (userId, msOid, upn, actorId) => directory.linkMicrosoft(userId, msOid, upn, actorId),

    createOrMatchRecord: ({ msOid, upn, name, phoneHints, emailHints }) =>
      directory.reconcile({ msOid, upn, name, phoneHints, emailHints, allowCreate: true, userType: 'student' }),

    async fillContact(userId, contact) {
      const { data, error } = await supabase
        .from('users')
        .select('first_name, last_name, phone, personal_email, email')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;

      const updates: Record<string, unknown> = {};
      if (!data?.first_name && contact.firstName) updates.first_name = contact.firstName;
      if (!data?.last_name && contact.lastName) updates.last_name = contact.lastName;
      if (
        !data?.personal_email &&
        contact.personalEmail &&
        contact.personalEmail.toLowerCase() !== String(data?.email || '').toLowerCase()
      ) {
        updates.personal_email = contact.personalEmail;
      }
      if (Object.keys(updates).length) {
        updates.updated_at = new Date().toISOString();
        const { error: updateError } = await supabase.from('users').update(updates).eq('id', userId);
        if (updateError) throw updateError;
      }

      // users.phone is unique across the whole ecosystem, so a number already on
      // another record (a parent's, say) must not fail the step. Written apart.
      if (!data?.phone && contact.phone) {
        await supabase.from('users').update({ phone: `+91${contact.phone}` }).eq('id', userId);
      }
    },

    async enroll({ userId, classroomId, batchId }) {
      // enrollUser also builds the catch-up backlog for a student joining mid-course.
      await enrollUser(
        { user_id: userId, classroom_id: classroomId, role: 'student', ...(batchId ? { batch_id: batchId } : {}) },
        supabase,
      );
      // It upserts without is_active, so a student removed earlier would come back inactive.
      const { error } = await supabase
        .from('nexus_enrollments')
        .update({ is_active: true })
        .eq('user_id', userId)
        .eq('classroom_id', classroomId)
        .eq('is_active', false);
      if (error) throw error;
    },

    async classify({ userId, classroomId, studyStage, academicYear, actorId }) {
      const now = new Date().toISOString();
      const reason = 'Set when the Microsoft account was created';
      const { data: enrollment, error: readError } = await supabase
        .from('nexus_enrollments')
        .select('id, current_standard')
        .eq('user_id', userId)
        .eq('classroom_id', classroomId)
        .eq('role', 'student')
        .maybeSingle();
      if (readError) throw readError;

      const events: Record<string, unknown>[] = [];

      if (studyStage && enrollment) {
        const { error } = await supabase
          .from('nexus_enrollments')
          .update({
            current_standard: studyStage,
            current_standard_source: 'staff',
            current_standard_set_at: now,
            current_standard_set_by: actorId,
          })
          .eq('id', enrollment.id);
        if (error) throw error;
        if ((enrollment.current_standard ?? null) !== studyStage) {
          events.push({
            enrollment_id: enrollment.id,
            classroom_id: classroomId,
            student_id: userId,
            axis: 'study_stage',
            from_value: enrollment.current_standard ?? null,
            to_value: studyStage,
            reason,
            performed_by: actorId,
          });
        }
      }

      if (academicYear) {
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('academic_year')
          .eq('id', userId)
          .maybeSingle();
        if (userError) throw userError;
        const before = user?.academic_year ?? null;
        if (before !== academicYear) {
          const { error } = await supabase
            .from('users')
            .update({ academic_year: academicYear, updated_at: now })
            .eq('id', userId);
          if (error) throw error;
          await recordUserHistory(supabase, userId, 'academic_year', before, academicYear, actorId);
          // Batch and target exam year are one concept; keep the mirror in step.
          try {
            await supabase
              .from('lead_profiles')
              .update({ target_exam_year: examYearFromAcademicYear(academicYear) })
              .eq('user_id', userId);
          } catch {
            /* non-blocking */
          }
          if (enrollment) {
            events.push({
              enrollment_id: enrollment.id,
              classroom_id: classroomId,
              student_id: userId,
              axis: 'academic_year',
              from_value: before,
              to_value: academicYear,
              reason,
              performed_by: actorId,
            });
          }
        }
      }

      if (events.length) {
        const { error } = await supabase.from('nexus_enrollment_classification_events').insert(events);
        if (error) console.error('Classification audit insert failed:', error);
      }
    },

    async syncTeams({ userId, classroomId, upn }): Promise<TeamsSyncOutcome> {
      const result = await addStudentToClassroomTeams(supabase, {
        classroomId,
        userId,
        upn,
        source: 'nexus_account_create',
      });
      if (!result.team) return { status: 'skipped', reason: 'This class has no linked Microsoft Team.' };
      if (result.team.success) return { status: 'done' };
      return {
        status: 'failed',
        reason: 'Not in the class Team yet. A brand new account can take a few minutes to reach Microsoft Teams.',
      };
    },

    async audit(userId, field, value, actorId) {
      await recordUserHistory(supabase, userId, field, null, value, actorId);
    },
  };
}

export function createResetPasswordPorts(supabase: any): ResetPasswordPorts {
  return {
    getStudent: (userId) => readStudent(supabase, userId),
    resetPassword: resetEntraPassword,
    readUpn: readUserPrincipalName,
    audit: (userId, field, value, actorId) => recordUserHistory(supabase, userId, field, null, value, actorId),
  };
}
