/**
 * The real ports for class accounts (packages/auth/src/student-accounts/class-account.ts):
 * Supabase for the student record and the saved steps, Graph for Microsoft.
 * Server only. Never writes a password anywhere.
 */
import { randomInt } from 'node:crypto';
import { addStudentToClassroomTeams } from '@neram/auth';
import {
  addUserToGroup,
  assignLicense,
  createEntraUser,
  detectStudentLicense,
  emptySteps,
  findUserByUpn,
  generateTempPassword,
  normalizeIndianMobile,
  readStudentAccountDefaults,
  readUserPrincipalName,
  saveStudentAccountDefaults,
  setOtherMails,
  type ClassAccountPorts,
  type ClassAccountSetup,
  type ClassAccountStudent,
} from '@neram/auth/student-accounts';
import { enrollUser, getCurrentClassroom, recordUserHistory } from '@neram/database';
import { sendClassAccountWelcomeEmail } from '@neram/database/class-account';
import { surnameFrom } from '@neram/database/person-name';

const STAFF_TYPES = new Set(['admin', 'teacher']);
const OWN_DOMAIN = /@(neramclasses\.com|neramclasses\.onmicrosoft\.com)$/i;

function rowToSetup(row: any): ClassAccountSetup {
  return {
    userId: row.user_id,
    upn: row.upn,
    msOid: row.ms_oid ?? null,
    passwordMode: row.password_mode === 'random' ? 'random' : 'start',
    accountCreatedAt: row.account_created_at ?? null,
    steps: { ...emptySteps(), ...(row.steps || {}) },
    createdBy: row.created_by ?? null,
  };
}

export async function readClassAccountSetup(supabase: any, userId: string): Promise<(ClassAccountSetup & { row: any }) | null> {
  const { data, error } = await supabase.from('class_account_setups').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? { ...rowToSetup(data), row: data } : null;
}

/** The student's name as typed on their demo requests and enrolment links. */
async function namesOnFile(supabase: any, userId: string): Promise<string[]> {
  const [{ data: demos }, { data: links }] = await Promise.all([
    supabase.from('demo_class_registrations').select('name').eq('user_id', userId).limit(5),
    supabase
      .from('direct_enrollment_links')
      .select('student_name')
      .or(`user_id.eq.${userId},submitted_user_id.eq.${userId},used_by.eq.${userId}`)
      .limit(5),
  ]);
  return [...(demos || []).map((d: any) => d.name), ...(links || []).map((l: any) => l.student_name)].filter(Boolean);
}

/** The record a class account is made for, with the father's name the login ID is built from. */
export async function readClassAccountStudent(supabase: any, userId: string): Promise<ClassAccountStudent | null> {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, first_name, last_name, phone, email, personal_email, ms_oid, user_type, staff_role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!user) return null;

  const { data: lead } = await supabase
    .from('lead_profiles')
    .select('father_name')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let fatherName: string | null = lead?.father_name?.trim() || null;
  if (!fatherName) {
    const { data: details } = await supabase
      .from('post_enrollment_details')
      .select('father_name')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    fatherName = details?.father_name?.trim() || null;
  }

  const nameWords = String(user.name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = String(user.first_name || nameWords[0] || '').trim();
  // Teams shows first and last name. Enrolment keeps only the first name, so the
  // surname comes from the fullest name we hold: the record, the demo, the link.
  const lastName = String(user.last_name || '').trim() || surnameFrom(firstName, [user.name, ...(await namesOnFile(supabase, userId))]);
  // The Gmail they enrolled with. A login already on our domain is not a personal address.
  const personal = [user.personal_email, user.email].find((e) => e && !OWN_DOMAIN.test(String(e))) || null;

  return {
    id: user.id,
    firstName,
    lastName,
    fatherName,
    phone: normalizeIndianMobile(user.phone),
    personalEmail: personal ? String(personal).trim() : null,
    msOid: user.ms_oid ?? null,
    isStaff: !!user.staff_role || STAFF_TYPES.has(String(user.user_type || '')),
    isStudent: user.user_type === 'student',
  };
}

/**
 * The classroom a new student belongs in: the live year classroom they are
 * already enrolled in (enrolment puts them there), else the current one.
 */
async function yearClassroomFor(supabase: any, userId: string): Promise<{ id: string; name: string }> {
  const { data: enrolments } = await supabase
    .from('nexus_enrollments')
    .select('classroom:nexus_classrooms(id, name, academic_year, is_archived, is_active)')
    .eq('user_id', userId)
    .eq('role', 'student')
    .eq('is_active', true);
  const live = ((enrolments || []) as any[])
    .map((row) => row.classroom)
    .find((c) => c && c.academic_year && !c.is_archived && c.is_active !== false);
  if (live) return { id: live.id, name: live.name };
  const current = await getCurrentClassroom(supabase);
  if (!current) throw new Error('No live classroom is set up for this year');
  return { id: current.id, name: current.name };
}

export function createClassAccountPorts(supabase: any, actorId: string): ClassAccountPorts {
  return {
    randomPassword: () => generateTempPassword((max) => randomInt(max)),
    graph: {
      findUserByUpn,
      createUser: createEntraUser,
      assignLicense: (userId, skuId) => assignLicense(userId, skuId),
      addToGroup: (groupId, userId) => addUserToGroup(groupId, userId),
      setOtherMails,
      readUpn: readUserPrincipalName,
    },
    store: {
      getStudent: (userId) => readClassAccountStudent(supabase, userId),

      async getSetup(userId) {
        const setup = await readClassAccountSetup(supabase, userId);
        if (!setup) return null;
        const { row: _row, ...rest } = setup;
        return rest;
      },

      async saveSetup(setup) {
        const { error } = await supabase.from('class_account_setups').upsert(
          {
            user_id: setup.userId,
            upn: setup.upn,
            ms_oid: setup.msOid,
            password_mode: setup.passwordMode,
            account_created_at: setup.accountCreatedAt,
            steps: setup.steps,
            created_by: setup.createdBy ?? actorId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
        if (error) throw error;
      },

      async readDefaults() {
        const { defaults } = await readStudentAccountDefaults(supabase);
        if (defaults.sku_id) return defaults;
        // First class account: take the license most current students hold, as Nexus does, and save it.
        const detected = await detectStudentLicense(supabase);
        if (!detected) return defaults;
        const next = {
          ...defaults,
          sku_id: detected.skuId,
          license_mode: detected.mode,
          license_group_id: detected.mode === 'group' ? detected.groupId : null,
        };
        try {
          await saveStudentAccountDefaults(supabase, next, actorId);
        } catch {
          /* still usable for this run */
        }
        return next;
      },

      async linkMicrosoft(userId, msOid, upn) {
        const now = new Date().toISOString();
        // One Microsoft account belongs to one record: free it from any other first.
        await supabase.from('users').update({ ms_oid: null }).eq('ms_oid', msOid).neq('id', userId);
        const { error } = await supabase
          .from('users')
          .update({ ms_oid: msOid, linked_classroom_email: upn, linked_classroom_at: now, updated_at: now })
          .eq('id', userId);
        if (error) throw error;
        const { error: profileError } = await supabase
          .from('student_profiles')
          .update({ ms_teams_email: upn, ms_teams_id: msOid, updated_at: now })
          .eq('user_id', userId);
        if (profileError) throw profileError;
      },

      async enrolInClassroom(userId) {
        const classroom = await yearClassroomFor(supabase, userId);
        // enrollUser also builds the catch-up backlog for a student joining mid-course.
        await enrollUser({ user_id: userId, classroom_id: classroom.id, role: 'student' } as any, supabase);
        await supabase
          .from('nexus_enrollments')
          .update({ is_active: true })
          .eq('user_id', userId)
          .eq('classroom_id', classroom.id)
          .eq('is_active', false);
        // Staff enrolled them, so Nexus needs no access request.
        await supabase
          .from('nexus_student_onboarding')
          .upsert({ student_id: userId, classroom_id: classroom.id, status: 'approved' }, { onConflict: 'student_id,classroom_id' });
        return { classroomId: classroom.id, classroomName: classroom.name };
      },

      async syncTeams({ userId, classroomId, upn }) {
        const result = await addStudentToClassroomTeams(supabase, { classroomId, userId, upn, source: 'class_account' });
        if (result.team && !result.team.success) {
          return {
            status: 'failed',
            reason: 'Not in the class Team yet. A brand new account can take a few minutes to reach Microsoft Teams. Retry in 5 minutes.',
          };
        }
        // The student group chat is added in the same run. Both adds are safe to repeat,
        // so a chat that did not take keeps the step open for Retry.
        if (result.groupChat && !result.groupChat.success) {
          return {
            status: 'failed',
            reason: result.team
              ? 'In the class Team, but not in the student group chat yet. Retry in 5 minutes, or add them from the group chat in Teams.'
              : 'Not in the student group chat yet. Retry in 5 minutes, or add them from the group chat in Teams.',
          };
        }
        if (!result.team && !result.groupChat) return { status: 'skipped', reason: 'This classroom has no linked Microsoft Team.' };
        return { status: 'done' };
      },

      async sendWelcome({ student, upn }) {
        if (!student.personalEmail) {
          return { status: 'skipped', reason: 'No personal email on file. Copy the WhatsApp message instead.' };
        }
        const sent = await sendClassAccountWelcomeEmail({ to: student.personalEmail, firstName: student.firstName, upn });
        return sent.success
          ? { status: 'done', to: student.personalEmail }
          : { status: 'failed', reason: 'The welcome email did not send. Resend it, or copy the WhatsApp message.' };
      },

      audit: (userId, field, value, actor) => recordUserHistory(supabase, userId, field, null, value, actor),
    },
  };
}
