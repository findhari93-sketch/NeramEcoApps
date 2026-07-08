import { NextRequest, NextResponse } from 'next/server';
import {
  listCourseModules,
  createCourseModule,
  updateCourseModule,
  getCourseModuleMeta,
  countModulePlanUsage,
  deleteCourseModule,
  createCourseTopic,
  getTopicUsageCounts,
} from '@neram/database';
import { getRequestUser, assertStaff, assertCanMutate } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

/**
 * GET /api/curriculum  (staff)
 * The whole repository: modules with their topics, plus "used in N plans" counts.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const includeArchived = request.nextUrl.searchParams.get('include_archived') === '1';
    const modules = await listCourseModules({ includeInactive: includeArchived });
    const topicIds = modules.flatMap((m) => m.topics.map((t) => t.id));
    const usage = await getTopicUsageCounts(topicIds);

    return NextResponse.json({
      modules: modules.map((m) => ({
        ...m,
        topics: m.topics.map((t) => ({ ...t, used_in_plans: usage[t.id] || 0 })),
      })),
    });
  } catch (err) {
    return errorResponse(err, 'Failed to load curriculum');
  }
}

/**
 * POST /api/curriculum  (staff). "Subject" is the user-facing name for a module.
 * body { action: 'create_module', title, description?, exam_tags?, color? }
 * body { action: 'create_topic', module_id, title, priority?, intended_delivery?, estimated_sessions? }
 * body { action: 'update_module', module_id, title?, description?, exam_tags?, color?, sort_order?, is_active? }
 * body { action: 'archive_module', module_id }   // soft-hide from the repository (reversible)
 * body { action: 'delete_module', module_id }     // hard delete; blocked if any topic is used in a plan
 *
 * Ownership: create is open to any staff; edit/archive/delete require admin OR the
 * row's creator (assertCanMutate).
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
        return NextResponse.json({ error: 'Subject id is required' }, { status: 400 });
      }
      const meta = await getCourseModuleMeta(body.module_id);
      if (!meta) return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
      assertCanMutate(user, meta.created_by);
      const updates: Record<string, unknown> = {};
      for (const key of ['title', 'description', 'exam_tags', 'color', 'sort_order', 'is_active'] as const) {
        if (key in body) updates[key] = body[key];
      }
      const courseModule = await updateCourseModule(body.module_id, updates);
      return NextResponse.json({ module: courseModule });
    }

    if (body.action === 'archive_module') {
      if (!body.module_id) {
        return NextResponse.json({ error: 'Subject id is required' }, { status: 400 });
      }
      const meta = await getCourseModuleMeta(body.module_id);
      if (!meta) return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
      assertCanMutate(user, meta.created_by);
      const courseModule = await updateCourseModule(body.module_id, { is_active: false });
      return NextResponse.json({ module: courseModule });
    }

    if (body.action === 'delete_module') {
      if (!body.module_id) {
        return NextResponse.json({ error: 'Subject id is required' }, { status: 400 });
      }
      const meta = await getCourseModuleMeta(body.module_id);
      if (!meta) return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
      assertCanMutate(user, meta.created_by);
      const usage = await countModulePlanUsage(body.module_id);
      if (usage > 0) {
        return NextResponse.json(
          { error: 'This subject has topics placed in a course plan. Archive it instead.' },
          { status: 400 },
        );
      }
      await deleteCourseModule(body.module_id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return errorResponse(err, 'Failed to save');
  }
}
