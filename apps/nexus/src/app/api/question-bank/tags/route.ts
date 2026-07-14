import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { listQBTags, getQBTagsWithCounts, createQBTag } from '@neram/database';
import type { NexusQBTagGroup } from '@neram/database';

const GROUPS: NexusQBTagGroup[] = ['exam', 'subject', 'theme'];

/**
 * GET /api/question-bank/tags
 * List the managed tag registry. Available to any QB user (students filter by tag).
 * Query: ?withCounts=1  ?group=exam|subject|theme  ?includeInactive=1
 */
export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;

    const { searchParams } = new URL(request.url);
    const withCounts = searchParams.get('withCounts') === '1';
    const includeInactive = searchParams.get('includeInactive') === '1';
    const groupParam = searchParams.get('group') as NexusQBTagGroup | null;
    const group = groupParam && GROUPS.includes(groupParam) ? groupParam : undefined;

    // Only staff may see inactive tags.
    const isStaff = ['teacher', 'admin'].includes(access.caller.user_type);
    const opts = { includeInactive: includeInactive && isStaff, group };

    const tags = withCounts ? await getQBTagsWithCounts(opts) : await listQBTags(opts);
    return NextResponse.json({ data: tags });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load tags';
    console.error('QB tags GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/question-bank/tags   (teacher/admin only)
 * Create a new tag. Body: { group_type, label, slug?, parent_id?, color?, icon?, sort_order? }
 */
export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can manage tags' }, { status: 403 });
    }

    const body = await request.json();
    const { group_type, label, slug, parent_id, color, icon, sort_order } = body || {};

    if (!group_type || !GROUPS.includes(group_type)) {
      return NextResponse.json({ error: 'group_type must be one of exam|subject|theme' }, { status: 400 });
    }
    if (!label || typeof label !== 'string' || !label.trim()) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }

    const tag = await createQBTag({
      group_type,
      label,
      slug,
      parent_id: parent_id ?? null,
      color: color ?? null,
      icon: icon ?? null,
      sort_order: typeof sort_order === 'number' ? sort_order : 0,
      created_by: access.caller.id,
    });
    return NextResponse.json({ data: tag }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create tag';
    // Unique-violation on slug -> friendly 409
    if (/duplicate key|unique/i.test(message)) {
      return NextResponse.json({ error: 'A tag with that name already exists' }, { status: 409 });
    }
    console.error('QB tags POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
