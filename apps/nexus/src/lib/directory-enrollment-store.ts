/**
 * The real DirectoryEnrollStore: Supabase for records, Graph for directory hints.
 * Kept apart from directory-enrollment.ts so the resolver's tests never load a
 * database client or a Graph token.
 */

import { reconcileMsIdentity, recordUserHistory } from '@neram/database';
import { getUserProfile } from '@neram/auth';
import type { DirectoryEnrollStore } from './directory-enrollment';

export function createSupabaseDirectoryEnrollStore(supabase: any): DirectoryEnrollStore {
  return {
    async getUser(userId) {
      const { data, error } = await supabase.from('users').select('id, ms_oid').eq('id', userId).maybeSingle();
      if (error) throw error;
      return data ?? null;
    },

    async findUserIdByMsOid(msOid) {
      const { data, error } = await supabase.from('users').select('id').eq('ms_oid', msOid).maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },

    async linkMicrosoft(userId, msOid, upn, actorId) {
      const now = new Date().toISOString();
      const { data: current, error: readError } = await supabase
        .from('users')
        .select('linked_classroom_email')
        .eq('id', userId)
        .maybeSingle();
      if (readError) throw readError;

      const updates: Record<string, unknown> = { ms_oid: msOid, updated_at: now };
      if (!current?.linked_classroom_email) {
        updates.linked_classroom_email = upn;
        updates.linked_classroom_at = now;
      }
      const { error: updateError } = await supabase.from('users').update(updates).eq('id', userId);
      if (updateError) throw updateError;

      // Teams grant and revoke read ms_teams_email from the fee record, so a
      // linked student must carry it or the next Teams sync silently skips them.
      const { error: profileError } = await supabase
        .from('student_profiles')
        .update({ ms_teams_email: upn })
        .eq('user_id', userId)
        .is('ms_teams_email', null);
      if (profileError) throw profileError;

      await recordUserHistory(supabase, userId, 'ms_oid', null, msOid, actorId);
    },

    async listClassroomStudentsWithoutMicrosoft(classroomId) {
      const { data, error } = await supabase
        .from('nexus_enrollments')
        .select(
          'enrolled_at, user:users!nexus_enrollments_user_id_fkey!inner(id, name, email, personal_email, phone, ms_oid)',
        )
        .eq('classroom_id', classroomId)
        .eq('role', 'student')
        .eq('is_active', true)
        .is('users.ms_oid', null);
      if (error) throw error;
      return (data || []).map((row: any) => ({
        user_id: row.user.id,
        name: row.user.name ?? null,
        email: row.user.email ?? null,
        personal_email: row.user.personal_email ?? null,
        phone: row.user.phone ?? null,
        enrolled_at: row.enrolled_at ?? null,
      }));
    },

    async getDirectoryHints(msOid) {
      const profile = await getUserProfile(msOid).catch(() => null);
      if (!profile) return { phones: [], emails: [] };
      return {
        phones: [profile.mobilePhone, ...(profile.businessPhones || [])].filter(Boolean),
        emails: (profile.otherMails || []).filter(Boolean),
      };
    },

    async reconcile(request) {
      const result = await reconcileMsIdentity(supabase, {
        msOid: request.msOid,
        upn: request.upn,
        name: request.name,
        phoneHints: request.phoneHints,
        emailHints: request.emailHints,
        allowCreate: request.allowCreate,
        createDefaults: {
          user_type: request.userType,
          phone_verified: false,
          preferred_language: 'en',
        },
      });
      return result.user?.id ?? null;
    },
  };
}
