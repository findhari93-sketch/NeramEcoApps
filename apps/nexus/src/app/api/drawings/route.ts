import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getDrawingLearningPath,
  createDrawingLevel,
  createDrawingCategory,
  createDrawingExercise,
  updateDrawingExercise,
  getDrawingProgressSummary,
} from '@neram/database/queries';

/**
 * GET /api/drawings?classroom={id}&mode={path|progress}
 *
 * mode=path (default): Returns full learning path (levels → categories → exercises) with student progress
 * mode=progress: Returns summary progress stats
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const classroomId = request.nextUrl.searchParams.get('classroom');
    const mode = request.nextUrl.searchParams.get('mode') || 'path';

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (mode === 'progress') {
      const progress = await getDrawingProgressSummary(user.id, classroomId);
      return NextResponse.json(progress);
    }

    // Default: full learning path
    const levels = await getDrawingLearningPath(classroomId, user.id);
    return NextResponse.json({ levels });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load drawings';
    console.error('Drawings GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/drawings
 *
 * Create drawing content (teacher only).
 * Body: { type: 'level' | 'category' | 'exercise', ...data }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { type, ...data } = body;

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify teacher role
    const classroomId = data.classroom_id || data.classroomId;
    if (classroomId) {
      const { data: enrollment } = await supabase
        .from('nexus_enrollments')
        .select('role')
        .eq('classroom_id', classroomId)
        .eq('user_id', user.id)
        .eq('role', 'teacher')
        .single();

      if (!enrollment) {
        return NextResponse.json({ error: 'Only teachers can manage drawing content' }, { status: 403 });
      }
    }

    let result;
    switch (type) {
      case 'level':
        result = await createDrawingLevel({
          classroom_id: data.classroom_id,
          title: data.title,
          description: data.description,
          sort_order: data.sort_order,
        });
        break;
      case 'category':
        result = await createDrawingCategory({
          level_id: data.level_id,
          title: data.title,
          description: data.description,
          sort_order: data.sort_order,
        });
        break;
      case 'exercise':
        result = await createDrawingExercise({
          category_id: data.category_id,
          title: data.title,
          description: data.description,
          instructions: data.instructions,
          dos_and_donts: data.dos_and_donts,
          reference_images: data.reference_images,
          demo_video_url: data.demo_video_url,
          sort_order: data.sort_order,
        });
        break;
      default:
        return NextResponse.json({ error: 'Invalid type. Must be level, category, or exercise' }, { status: 400 });
    }

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create drawing content';
    console.error('Drawings POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/drawings
 *
 * Update drawing exercise (teacher only).
 * Body: { exercise_id, ...updates }
 */
export async function PATCH(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const { exercise_id, ...updates } = body;

    if (!exercise_id) {
      return NextResponse.json({ error: 'Missing exercise_id' }, { status: 400 });
    }

    const result = await updateDrawingExercise(exercise_id, updates);
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update exercise';
    console.error('Drawings PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
