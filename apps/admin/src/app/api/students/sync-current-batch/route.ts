// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getCurrentBatch,
  listStudentsByYear,
  getDefaultClassroom,
  enrollUserInDefaultClassroom,
} from '@neram/database';
import { addStudentToClassroomTeams } from '@neram/auth';

/**
 * Backfill / keep-in-sync: put every ACTIVE current-batch student into the single
 * default classroom AND the linked Team + global group chat.
 *
 * Runs in CHUNKS because each student triggers Microsoft Graph calls (Team add,
 * group-chat attempt), and a whole cohort would blow the serverless timeout. The
 * admin UI calls this repeatedly until `summary.remaining` reaches 0.
 *   POST body: { userIds?: string[]; limit?: number }
 *     - userIds: process exactly these (UI-controlled chunking); otherwise
 *     - limit:   process the first N not-yet-enrolled current-batch students (default 40).
 *   GET: preview counts (roster / already-enrolled / remaining) without writing.
 */

const DEFAULT_LIMIT = 40;

async function resolveRoster(supabase: any) {
  const classroom = await getDefaultClassroom(supabase);
  if (!classroom) return { classroom: null as any, roster: [] as any[], currentBatchCode: undefined as string | undefined };

  let currentBatchCode: string | undefined;
  try {
    currentBatchCode = (await getCurrentBatch(supabase)).code;
  } catch {
    /* fall back to the calendar helper inside listStudentsByYear */
  }

  const { students: roster } = await listStudentsByYear(
    { year: 'current', status: 'active', program: 'architecture', currentBatchCode },
    supabase
  );
  return { classroom, roster, currentBatchCode };
}

async function enrolledUserIds(supabase: any, classroomId: string, rosterIds: string[]): Promise<Set<string>> {
  const { data } = await supabase
    .from('nexus_enrollments')
    .select('user_id')
    .eq('classroom_id', classroomId)
    .eq('is_active', true)
    .in('user_id', rosterIds.length ? rosterIds : ['__none__']);
  return new Set((data || []).map((r: any) => r.user_id));
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const { classroom, roster, currentBatchCode } = await resolveRoster(supabase);
    if (!classroom) {
      return NextResponse.json({ error: 'No active classroom configured' }, { status: 400 });
    }
    const rosterIds = roster.map((s: any) => s.id);
    const enrolled = await enrolledUserIds(supabase, classroom.id, rosterIds);
    return NextResponse.json({
      classroom: { id: classroom.id, name: classroom.name, batchCode: currentBatchCode || null },
      rosterTotal: rosterIds.length,
      alreadyEnrolled: rosterIds.filter((id: string) => enrolled.has(id)).length,
      remaining: rosterIds.filter((id: string) => !enrolled.has(id)).length,
    });
  } catch (error: any) {
    console.error('Error previewing current-batch sync:', error);
    return NextResponse.json({ error: error.message || 'Failed to preview' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient() as any;
    const body = await request.json().catch(() => ({}));
    const explicitUserIds: string[] | undefined = Array.isArray(body?.userIds) ? body.userIds : undefined;
    const limit = Math.min(Math.max(Number(body?.limit) || DEFAULT_LIMIT, 1), 100);

    const { classroom, roster } = await resolveRoster(supabase);
    if (!classroom) {
      return NextResponse.json({ error: 'No active classroom configured' }, { status: 400 });
    }

    const rosterIds = roster.map((s: any) => s.id);
    const emailByUser = new Map<string, string | null>();
    for (const s of roster) emailByUser.set(s.id, s.ms_teams_email || s.email || null);

    const enrolled = await enrolledUserIds(supabase, classroom.id, rosterIds);

    // Target set: explicit ids (intersected with the roster) OR the next unenrolled chunk.
    let targetIds: string[];
    if (explicitUserIds && explicitUserIds.length) {
      const rosterSet = new Set(rosterIds);
      targetIds = explicitUserIds.filter((id) => rosterSet.has(id));
    } else {
      targetIds = rosterIds.filter((id: string) => !enrolled.has(id)).slice(0, limit);
    }

    const results: any[] = [];
    for (const userId of targetIds) {
      const r: any = { userId, success: true, actions: [] };
      try {
        await enrollUserInDefaultClassroom(userId, {}, supabase);
        r.actions.push('enrolled');

        const sync = await addStudentToClassroomTeams(supabase, {
          classroomId: classroom.id,
          userId,
          upn: emailByUser.get(userId),
          source: 'sync_current_batch',
        });
        if (sync.skipped) r.actions.push('teams_skipped_no_email');
        if (sync.team) r.actions.push(`teams_${sync.team.success ? (sync.team.reason || 'added') : 'failed'}`);
        if (sync.groupChat) r.actions.push(`group_chat_${sync.groupChat.success ? (sync.groupChat.reason || 'added') : 'failed'}`);
        r.inviteLink = sync.inviteLink;
      } catch (err: any) {
        r.success = false;
        r.error = err?.message || 'unknown_error';
      }
      results.push(r);
    }

    const alreadyEnrolled = rosterIds.filter((id: string) => enrolled.has(id)).length;
    const succeeded = results.filter((r) => r.success).length;
    // When the UI drives chunking via explicit ids we can't compute a global remaining.
    const remaining = explicitUserIds
      ? undefined
      : Math.max(0, rosterIds.length - alreadyEnrolled - succeeded);

    return NextResponse.json({
      success: true,
      classroom: { id: classroom.id, name: classroom.name },
      summary: {
        rosterTotal: rosterIds.length,
        alreadyEnrolled,
        processed: results.length,
        succeeded,
        failed: results.length - succeeded,
        remaining,
      },
      results,
    });
  } catch (error: any) {
    console.error('Error syncing current batch:', error);
    return NextResponse.json({ error: error.message || 'Failed to sync current batch' }, { status: 500 });
  }
}
