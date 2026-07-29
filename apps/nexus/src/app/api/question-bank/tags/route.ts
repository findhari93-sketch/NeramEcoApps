import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { listQBTags, getQBTagsWithCounts, createQBTag, findOrCreateQBTag } from '@neram/database';
import type { NexusQBTagGroup } from '@neram/database';
import { resolveStaffRole } from '@/lib/staff-capabilities';

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

    // Only staff may see inactive tags. Gated on the tier, not user_type: a
    // manager row is user_type='student' with staff_role='manager'.
    const isStaff = resolveStaffRole(access.caller) !== null;
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
 * POST /api/question-bank/tags   (staff only)
 * Create a new tag. Body: { group_type, label, slug?, parent_id?, color?, icon?, sort_order? }
 *
 * Pass `find_or_create: true` when the caller wants the tag to exist rather than
 * to be new: a slug that is already taken comes back as the existing tag with
 * `created: false` instead of a 409. The registry admin screen wants the 409 (it
 * is telling someone they are about to duplicate a tag); the wrap-up panel wants
 * the tag, because a 409 there just meant the suggestion silently attached nothing.
 */
export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    // Any staff tier, matching the capability model the rest of the wrap-up flow
    // uses. The old ['teacher','admin'].includes(user_type) test refused every
    // manager, who could edit the wrap-up but never create a tag from it.
    if (resolveStaffRole(access.caller) === null) {
      return NextResponse.json({ error: 'Only staff can manage tags' }, { status: 403 });
    }

    const body = await request.json();
    const { group_type, label, slug, parent_id, color, icon, sort_order, find_or_create } = body || {};

    if (!group_type || !GROUPS.includes(group_type)) {
      return NextResponse.json({ error: 'group_type must be one of exam|subject|theme' }, { status: 400 });
    }
    if (!label || typeof label !== 'string' || !label.trim()) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }

    const input = {
      group_type,
      label,
      slug,
      parent_id: parent_id ?? null,
      color: color ?? null,
      icon: icon ?? null,
      sort_order: typeof sort_order === 'number' ? sort_order : 0,
      created_by: access.caller.id,
    };

    if (find_or_create) {
      const { tag, created } = await findOrCreateQBTag(input);
      return NextResponse.json({ data: tag, created }, { status: created ? 201 : 200 });
    }

    const tag = await createQBTag(input);
    return NextResponse.json({ data: tag, created: true }, { status: 201 });
  } catch (err) {
    // A PostgrestError is a plain object, not an Error, so `err instanceof Error`
    // discarded its message and every duplicate slug came back as a 500. The
    // panel's 409 branch could therefore never fire.
    const e = err as { message?: string; code?: string } | null;
    const message = e?.message || 'Failed to create tag';
    if (e?.code === '23505' || /duplicate key|unique/i.test(message)) {
      return NextResponse.json({ error: 'A tag with that name already exists' }, { status: 409 });
    }
    console.error('QB tags POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
