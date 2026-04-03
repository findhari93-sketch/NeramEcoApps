import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

const SEED_TAG = 'test-seed-data';

/**
 * POST /api/exam-recall/seed-test-data
 *
 * Insert 3 sample drawing recall threads with questions for testing.
 * Requires: ?classroom_id=...
 * Only works for teacher/admin users.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
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
    const classroomId = body.classroom_id;

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 });
    }

    const examDate = '2026-04-01';
    const examYear = 2026;
    const sessionNumber = 1;

    // Sample drawing questions (realistic NATA Part A)
    const sampleDrawings = [
      {
        drawingType: 'composition_2d' as const,
        promptEn:
          'Create a 2D composition using triangles (x4), circles (x2), and straight lines. Use maximum 4 colors. The composition should represent "harmony in nature".',
        materials: [
          { name: 'Triangle', count: 4 },
          { name: 'Circle', count: 2 },
          { name: 'Straight line', count: 0 },
        ],
        constraints: {
          colorRestriction: true,
          intersectionAllowed: true,
          bwOnly: false,
          themeRequired: true,
        },
        theme: 'Harmony in nature',
        marks: 25,
      },
      {
        drawingType: 'object_sketching' as const,
        promptEn:
          'Sketch a clay pot with a plant growing out of it. Show light and shadow. Use pencil shading only.',
        materials: [],
        constraints: {
          colorRestriction: false,
          intersectionAllowed: false,
          bwOnly: true,
          themeRequired: false,
        },
        theme: '',
        marks: 25,
      },
      {
        drawingType: '3d_model' as const,
        promptEn:
          'Design a bus stop shelter using cubes and cylinders. Show the 3D form from a 3/4 view with proper perspective.',
        materials: [
          { name: 'Cube', count: 3 },
          { name: 'Cylinder', count: 2 },
        ],
        constraints: {
          colorRestriction: false,
          intersectionAllowed: true,
          bwOnly: false,
          themeRequired: false,
        },
        theme: '',
        marks: 30,
      },
    ];

    const createdThreads: string[] = [];

    for (let i = 0; i < sampleDrawings.length; i++) {
      const sample = sampleDrawings[i];

      // Create thread
      const { data: thread, error: threadError } = await supabase
        .from('nexus_exam_recall_threads')
        .insert({
          classroom_id: classroomId,
          exam_year: examYear,
          exam_date: examDate,
          session_number: sessionNumber,
          question_type: 'drawing',
          section: 'part_a',
          topic_category: 'drawing',
          has_image: false,
          status: 'raw',
          confirm_count: 0,
          vouch_count: 0,
          version_count: 1,
          created_by: user.id,
        })
        .select('id')
        .single();

      if (threadError) throw threadError;

      // Create version (required for thread to show in listings)
      const { error: versionError } = await supabase
        .from('nexus_exam_recall_versions')
        .insert({
          thread_id: thread.id,
          version_number: 1,
          author_id: user.id,
          author_role: user.user_type || 'student',
          recall_text: `[${SEED_TAG}] ${sample.promptEn}`,
          clarity: 'clear',
          has_image_in_original: false,
          sub_topic_hint: sample.drawingType.replace('_', ' '),
          status: 'pending_review',
          vouch_count: 0,
        });

      if (versionError) throw versionError;

      // Create drawing record
      const { error: drawingError } = await supabase
        .from('nexus_exam_recall_drawings')
        .insert({
          thread_id: thread.id,
          question_number: i + 1,
          drawing_type: sample.drawingType,
          prompt_text_en: sample.promptEn,
          prompt_text_hi: null,
          objects_materials: sample.materials.length > 0 ? sample.materials : null,
          constraints: sample.constraints,
          marks: sample.marks,
          paper_photo_url: null,
          attempt_photo_url: null,
          created_by: user.id,
        });

      if (drawingError) throw drawingError;

      createdThreads.push(thread.id);
    }

    return NextResponse.json({
      message: `Created ${createdThreads.length} test drawing threads`,
      thread_ids: createdThreads,
      exam_date: examDate,
      session_number: sessionNumber,
      tag: SEED_TAG,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to seed test data';
    console.error('[exam-recall/seed-test-data] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/exam-recall/seed-test-data
 *
 * Remove all test seed data (identified by the test-seed-data tag in recall_text).
 */
export async function DELETE(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find all seed versions by the tag
    const { data: seedVersions } = await supabase
      .from('nexus_exam_recall_versions')
      .select('thread_id')
      .like('recall_text', `%[${SEED_TAG}]%`);

    if (!seedVersions || seedVersions.length === 0) {
      return NextResponse.json({ message: 'No test data found to delete', deleted: 0 });
    }

    const threadIds = [...new Set(seedVersions.map((v: any) => v.thread_id))];

    // Delete in order: drawings → versions → confirms → comments → threads
    await supabase.from('nexus_exam_recall_drawings').delete().in('thread_id', threadIds);
    await supabase.from('nexus_exam_recall_versions').delete().in('thread_id', threadIds);
    await supabase.from('nexus_exam_recall_confirms').delete().in('thread_id', threadIds);
    await supabase.from('nexus_exam_recall_comments').delete().in('thread_id', threadIds);
    await supabase.from('nexus_exam_recall_threads').delete().in('id', threadIds);

    return NextResponse.json({
      message: `Deleted ${threadIds.length} test threads and all related data`,
      deleted: threadIds.length,
      thread_ids: threadIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete test data';
    console.error('[exam-recall/seed-test-data] DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
