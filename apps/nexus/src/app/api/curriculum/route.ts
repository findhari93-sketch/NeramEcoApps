import { NextRequest, NextResponse } from 'next/server';
import {
  listCourseModules,
  createCourseModule,
  updateCourseModule,
  createCourseTopic,
  getTopicUsageCounts,
} from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';

/**
 * GET /api/curriculum  (staff)
 * The whole repository: modules with their topics, plus "used in N plans" counts.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const modules = await listCourseModules();
    const topicIds = modules.flatMap((m) => m.topics.map((t) => t.id));
    const usage = await getTopicUsageCounts(topicIds);

    return NextResponse.json({
      modules: modules.map((m) => ({
        ...m,
        topics: m.topics.map((t) => ({ ...t, used_in_plans: usage[t.id] || 0 })),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load curriculum';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/curriculum  (staff)
 * body { action: 'create_module', title, description?, exam_tags?, color? }
 * body { action: 'create_topic', module_id, title, priority?, intended_delivery?, estimated_sessions? }
 * body { action: 'update_module', module_id, title?, description?, exam_tags?, color?, sort_order?, is_active? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const body = await request.json();

    if (body.action === 'create_module') {
      if (!body.title?.trim()) {
        return NextResponse.json({ error: 'Module title is required' }, { status: 400 });
      }
      const courseModule = await createCourseModule({
        title: body.title.trim(),
        description: body.description ?? null,
        exam_tags: Array.isArray(body.exam_tags) ? body.exam_tags : [],
        color: body.color ?? null,
        created_by: user.id,
      });
      return NextResponse.json({ module: courseModule });
    }

    if (body.action === 'create_topic') {
      if (!body.module_id || !body.title?.trim()) {
        return NextResponse.json({ error: 'Module and topic title are required' }, { status: 400 });
      }
      const topic = await createCourseTopic({
        module_id: body.module_id,
        title: body.title.trim(),
        priority: body.priority,
        intended_delivery: body.intended_delivery,
        estimated_sessions: body.estimated_sessions,
        created_by: user.id,
      });
      return NextResponse.json({ topic });
    }

    if (body.action === 'update_module') {
      if (!body.module_id) {
        return NextResponse.json({ error: 'Module id is required' }, { status: 400 });
      }
      const updates: Record<string, unknown> = {};
      for (const key of ['title', 'description', 'exam_tags', 'color', 'sort_order', 'is_active'] as const) {
        if (key in body) updates[key] = body[key];
      }
      const courseModule = await updateCourseModule(body.module_id, updates);
      return NextResponse.json({ module: courseModule });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
