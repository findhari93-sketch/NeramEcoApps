import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getExamRecallThread,
  createExamRecallVersion,
} from '@neram/database/queries';

/**
 * GET /api/exam-recall/threads/[id]/versions
 *
 * List all versions for a thread.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const thread = await getExamRecallThread(id, user.id);

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    return NextResponse.json({ versions: thread.versions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list versions';
    console.error('[exam-recall/threads/[id]/versions] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/exam-recall/threads/[id]/versions
 *
 * Add a new version (refinement) to a thread.
 * Body: { recall_text, recall_image_urls?, options?, my_answer?, my_working?, clarity, has_image_in_original?, image_description?, sub_topic_hint?, parent_version_id? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      recall_text,
      recall_image_urls,
      options,
      my_answer,
      my_working,
      clarity,
      has_image_in_original,
      image_description,
      sub_topic_hint,
      parent_version_id,
    } = body;

    if (!recall_text || !clarity) {
      return NextResponse.json(
        { error: 'Missing required fields: recall_text, clarity' },
        { status: 400 },
      );
    }

    const authorRoleMap: Record<string, string> = {
      student: 'student',
      teacher: 'teacher',
      admin: 'admin',
    };
    const authorRole = authorRoleMap[user.user_type ?? ''] || 'student';

    const version = await createExamRecallVersion({
      thread_id: id,
      author_id: user.id,
      author_role: authorRole as any,
      recall_text,
      recall_image_urls: recall_image_urls || null,
      options: options || null,
      my_answer: my_answer || null,
      my_working: my_working || null,
      clarity,
      has_image_in_original: has_image_in_original ?? null,
      image_description: image_description || null,
      sub_topic_hint: sub_topic_hint || null,
      parent_version_id: parent_version_id || null,
    });

    return NextResponse.json(version, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create version';
    console.error('[exam-recall/threads/[id]/versions] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
