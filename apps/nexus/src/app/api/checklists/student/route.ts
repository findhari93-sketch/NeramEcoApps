import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getChecklistsByClassroomV2,
  getFoundationChaptersWithProgress,
} from '@neram/database/queries/nexus';

/**
 * GET /api/checklists/student?classroom={id}
 *
 * Returns all V2 checklists assigned to the student's active classroom,
 * with per-entry progress. If any checklist entry references a Foundation module,
 * also returns Foundation chapter data with progress.
 */
export async function GET(request: NextRequest) {
  try {
    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom parameter is required' }, { status: 400 });
    }

    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch all checklists assigned to this classroom with student progress
    const checklists = await getChecklistsByClassroomV2(classroomId, user.id);

    // Check if any checklist entry references a Foundation module
    let foundation = null;
    const hasFoundation = checklists.some((cl: any) =>
      (cl.entries || []).some(
        (entry: any) =>
          entry.entry_type === 'module' &&
          entry.module?.module_type === 'foundation'
      )
    );

    if (hasFoundation) {
      const chapters = await getFoundationChaptersWithProgress(user.id);
      const completedCount = chapters.filter(
        (ch: any) => ch.progress?.status === 'completed'
      ).length;

      // Find the current chapter (first non-completed)
      let currentChapter = null;
      for (const ch of chapters) {
        if (ch.progress?.status !== 'completed') {
          currentChapter = { id: ch.id, title: ch.title };
          break;
        }
      }

      foundation = {
        chapters,
        currentChapter,
        completedCount,
        totalCount: chapters.length,
      };
    }

    return NextResponse.json({ checklists, foundation });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load student checklists';
    console.error('Student checklists GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
