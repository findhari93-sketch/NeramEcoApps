// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { addMemberToTeam, addMemberToGroupChat } from '@neram/auth';

/**
 * POST /api/students/[id]/nexus-enroll — Enroll student in a Nexus classroom + optional batch
 * Body: { classroomId, batchId?, remove? }
 *
 * When a classroom with ms_team_sync_enabled is assigned, the student is
 * automatically added to the corresponding Microsoft Teams team via Graph API.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    const body = await request.json();
    const { classroomId, batchId, remove } = body;

    if (!classroomId) {
      return NextResponse.json({ error: 'classroomId is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // Remove enrollment if requested
    if (remove) {
      const { error } = await supabase
        .from('nexus_enrollments')
        .delete()
        .eq('user_id', userId)
        .eq('classroom_id', classroomId);

      if (error) throw error;

      return NextResponse.json({ success: true, removed: true });
    }

    // Upsert enrollment (user_id + classroom_id is unique)
    const { data: enrollment, error } = await supabase
      .from('nexus_enrollments')
      .upsert(
        {
          user_id: userId,
          classroom_id: classroomId,
          role: 'student',
          is_active: true,
          batch_id: batchId || null,
        },
        { onConflict: 'user_id,classroom_id' }
      )
      .select()
      .single();

    if (error) throw error;

    // Auto-approve Nexus onboarding (admin-assigned = pre-approved, skip request flow)
    try {
      await supabase
        .from('nexus_student_onboarding')
        .upsert(
          { student_id: userId, classroom_id: classroomId, status: 'approved' },
          { onConflict: 'student_id,classroom_id' }
        );
    } catch {
      // Non-blocking
    }

    // Auto-add student to Microsoft Teams team if classroom has sync enabled
    let teamsResult: { success: boolean; reason?: string } | null = null;
    try {
      // 1. Check if classroom has a Teams team linked
      const { data: classroom } = await supabase
        .from('nexus_classrooms')
        .select('ms_team_id, ms_team_sync_enabled, name')
        .eq('id', classroomId)
        .single();

      if (classroom?.ms_team_id && classroom.ms_team_sync_enabled) {
        // 2. Get student's ms_teams_email
        const { data: studentProfile } = await supabase
          .from('student_profiles')
          .select('ms_teams_email')
          .eq('user_id', userId)
          .maybeSingle();

        if (studentProfile?.ms_teams_email) {
          // 3. Add to Teams via Graph API
          teamsResult = await addMemberToTeam(classroom.ms_team_id, studentProfile.ms_teams_email);

          // 4. Log the sync attempt
          await supabase.from('nexus_teams_sync_log').insert({
            classroom_id: classroomId,
            user_id: userId,
            action: 'add_member',
            status: teamsResult.success ? 'success' : 'failed',
            error_message: teamsResult.success ? null : teamsResult.reason,
            details: { source: 'admin_enroll', classroom_name: classroom.name },
          }).catch(() => {});
        } else {
          teamsResult = { success: false, reason: 'no_ms_teams_email' };
        }
      }
    } catch (teamsErr: any) {
      console.warn('[nexus-enroll] Teams auto-add failed:', teamsErr?.message);
      teamsResult = { success: false, reason: teamsErr?.message || 'unknown_error' };
    }

    // Auto-complete the join_teams_class onboarding step if ALL enrolled classrooms are synced
    if (teamsResult?.success) {
      try {
        // Check if all enrolled classrooms with Teams sync have been added
        const { data: allEnrollments } = await supabase
          .from('nexus_enrollments')
          .select('classroom_id, classroom:nexus_classrooms(ms_team_id, ms_team_sync_enabled)')
          .eq('user_id', userId)
          .eq('is_active', true);

        const teamsClassrooms = (allEnrollments || []).filter(
          (e: any) => e.classroom?.ms_team_id && e.classroom?.ms_team_sync_enabled
        );

        // Check sync log for successful adds
        const classroomIds = teamsClassrooms.map((e: any) => e.classroom_id);
        const { data: successLogs } = await supabase
          .from('nexus_teams_sync_log')
          .select('classroom_id')
          .eq('user_id', userId)
          .eq('action', 'add_member')
          .eq('status', 'success')
          .in('classroom_id', classroomIds);

        const syncedCount = new Set((successLogs || []).map((l: any) => l.classroom_id)).size;

        if (syncedCount >= teamsClassrooms.length) {
          // All Teams classrooms synced — mark onboarding step complete
          await supabase
            .from('student_onboarding_progress')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              auto_add_attempted: true,
              auto_add_result: 'success',
            })
            .eq('user_id', userId)
            .eq('step_key', 'join_teams_class');
        }
      } catch {
        // Don't block enrollment if onboarding update fails
      }
    }

    // Also auto-add to the configured Teams group chat (if enabled)
    let groupChatResult: { success: boolean; reason?: string } | null = null;
    try {
      const { data: chatSetting } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'teams_group_chat')
        .maybeSingle();

      const chatConfig = chatSetting?.setting_value;
      if (chatConfig?.chat_id && chatConfig?.auto_add_enabled) {
        // Get student's ms_teams_email (may already be fetched above)
        const { data: sp } = await supabase
          .from('student_profiles')
          .select('ms_teams_email')
          .eq('user_id', userId)
          .maybeSingle();

        if (sp?.ms_teams_email) {
          groupChatResult = await addMemberToGroupChat(chatConfig.chat_id, sp.ms_teams_email);
        } else {
          groupChatResult = { success: false, reason: 'no_ms_teams_email' };
        }
      }
    } catch (chatErr: any) {
      console.warn('[nexus-enroll] Group chat auto-add failed:', chatErr?.message);
      groupChatResult = { success: false, reason: chatErr?.message || 'unknown_error' };
    }

    return NextResponse.json({
      success: true,
      enrollment,
      teamsAutoAdd: teamsResult,
      groupChatAutoAdd: groupChatResult,
    });
  } catch (error: any) {
    console.error('Error enrolling student:', error);
    return NextResponse.json({ error: error.message || 'Failed to enroll student' }, { status: 500 });
  }
}

/**
 * GET /api/students/[id]/nexus-enroll — Get student's current Nexus enrollment
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;
    const supabase = getSupabaseAdminClient() as any;

    const { data, error } = await supabase
      .from('nexus_enrollments')
      .select('id, classroom_id, batch_id, role, is_active, classroom:nexus_classrooms(id, name, type), batch:nexus_batches(id, name)')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error: any) {
    console.error('Error fetching enrollments:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch enrollments' }, { status: 500 });
  }
}
