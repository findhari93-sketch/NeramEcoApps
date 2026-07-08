import { NextRequest, NextResponse } from 'next/server';
import {
  getCourseTopic,
  updateCourseTopic,
  getCourseTopicMeta,
  countTopicPlanUsage,
  deleteCourseTopic,
  addTopicResource,
  removeTopicResource,
  linkTopicTest,
  unlinkTopicTest,
} from '@neram/database';
import { getRequestUser, assertStaff, assertCanMutate } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';

/** GET /api/curriculum/topics/[id]  (staff) — full topic detail. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const topic = await getCourseTopic(params.id);
    if (!topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    return NextResponse.json({ topic });
  } catch (err) {
    return errorResponse(err, 'Failed to load topic');
  }
}

/**
 * PATCH /api/curriculum/topics/[id]  (staff) — edit fields, incl. status ('class_ready').
 * Ownership: admin OR the topic's creator (assertCanMutate).
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const meta = await getCourseTopicMeta(params.id);
    if (!meta) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    assertCanMutate(user, meta.created_by);
    const body = await request.json();
    const allowed = [
      'title',
      'module_id',
      'priority',
      'status',
      'intended_delivery',
      'estimated_sessions',
      'summary',
      'activities',
      'drills',
      'sort_order',
      'is_active',
      'visible_to_students',
      'is_self_learning',
    ] as const;
    const updates: Record<string, unknown> = {};
    for (const key of allowed) if (key in body) updates[key] = body[key];
    const topic = await updateCourseTopic(params.id, updates);
    return NextResponse.json({ topic });
  } catch (err) {
    return errorResponse(err, 'Failed to update topic');
  }
}

/**
 * POST /api/curriculum/topics/[id]  (staff) — resource + test-link + lifecycle ops.
 * body { action: 'add_resource', kind, title, url?, study_file_id? }
 * body { action: 'remove_resource', resource_id }
 * body { action: 'link_test', test_id, purpose? }
 * body { action: 'unlink_test', test_id }
 * body { action: 'archive_topic' }   // soft-hide from the repository (reversible)
 * body { action: 'delete_topic' }     // hard delete; blocked if used in a plan
 *
 * archive/delete require admin OR the topic's creator (assertCanMutate).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);
    const body = await request.json();

    switch (body.action) {
      case 'archive_topic': {
        const meta = await getCourseTopicMeta(params.id);
        if (!meta) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
        assertCanMutate(user, meta.created_by);
        await updateCourseTopic(params.id, { is_active: false });
        return NextResponse.json({ ok: true });
      }
      case 'delete_topic': {
        const meta = await getCourseTopicMeta(params.id);
        if (!meta) return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
        assertCanMutate(user, meta.created_by);
        const usage = await countTopicPlanUsage(params.id);
        if (usage > 0) {
          return NextResponse.json(
            { error: 'This topic is placed in a course plan. Archive it instead.' },
            { status: 400 },
          );
        }
        await deleteCourseTopic(params.id);
        return NextResponse.json({ ok: true });
      }
      case 'add_resource': {
        if (!body.title?.trim()) {
          return NextResponse.json({ error: 'Resource title is required' }, { status: 400 });
        }
        const resource = await addTopicResource({
          topic_id: params.id,
          kind: body.kind || 'link',
          title: body.title.trim(),
          url: body.url ?? null,
          study_file_id: body.study_file_id ?? null,
          section: body.section === 'drill' ? 'drill' : 'resource',
        });
        return NextResponse.json({ resource });
      }
      case 'remove_resource':
        await removeTopicResource(body.resource_id);
        return NextResponse.json({ ok: true });
      case 'link_test': {
        const link = await linkTopicTest({
          topic_id: params.id,
          test_id: body.test_id,
          purpose: body.purpose,
        });
        return NextResponse.json({ link });
      }
      case 'unlink_test':
        await unlinkTopicTest(params.id, body.test_id);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    return errorResponse(err, 'Failed to save');
  }
}
