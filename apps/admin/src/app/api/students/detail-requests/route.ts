// @ts-nocheck
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  createOrReuseDetailRequest,
  markDetailRequestSent,
  cancelDetailRequest,
  getLiveDetailRequestForUser,
  detailRequestProgress,
} from '@neram/database';
import { studentDetailUrl, whatsappMessage } from '@/lib/marketing-links';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One pass over a selection is capped, so a mis-click on "select all" cannot mint 500 links. */
const MAX_PER_CALL = 100;

function originOf(request: NextRequest): string {
  return (
    request.headers.get('origin') ||
    (request.headers.get('host') ? `https://${request.headers.get('host')}` : '') ||
    ''
  );
}

/**
 * POST /api/students/detail-requests
 * Make (or reuse) a link for each selected student and hand them all back in one
 * response, so staff can send a whole chase list without opening 30 drawers.
 *
 * Body: { userIds: string[], adminId?: string, regenerate?: boolean }
 *
 * Why this exists in Admin and not only in Nexus: 11 of the students with no
 * application form are in no active Nexus classroom at all, and the Nexus sheet is
 * classroom-scoped, so it can never show them. Admin is the only surface that sees
 * the whole roster.
 *
 * Alumni are refused rather than skipped silently. /students can show a past cohort
 * through the batch selector, and quietly dropping half a selection is worse than
 * saying why.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userIds, adminId, regenerate } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one student.' }, { status: 400 });
    }
    if (userIds.length > MAX_PER_CALL) {
      return NextResponse.json(
        { error: `Too many at once. Select ${MAX_PER_CALL} students or fewer.` },
        { status: 400 }
      );
    }
    if (!userIds.every((id: unknown) => typeof id === 'string' && UUID_REGEX.test(id))) {
      return NextResponse.json({ error: 'userIds must all be valid UUIDs.' }, { status: 400 });
    }
    if (adminId && !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Read the people first: the names go in the message, and is_alumni is the gate.
    const { data: people, error: peopleError } = await supabase
      .from('users')
      .select('id, first_name, name, is_alumni, user_type')
      .in('id', userIds);
    if (peopleError) throw peopleError;

    const byId = new Map((people || []).map((p: any) => [p.id, p]));
    const missing = userIds.filter((id: string) => !byId.has(id));
    if (missing.length) {
      return NextResponse.json(
        { error: `${missing.length} of the selected students could not be found.` },
        { status: 404 }
      );
    }

    const alumni = (people || []).filter((p: any) => p.is_alumni);
    if (alumni.length) {
      const names = alumni.slice(0, 3).map((p: any) => p.name || 'a graduate').join(', ');
      return NextResponse.json(
        {
          error:
            `${alumni.length} of the selected students have graduated (${names}${alumni.length > 3 ? ', and others' : ''}). ` +
            'Application links are for current students. Deselect them and try again.',
        },
        { status: 400 }
      );
    }

    const origin = originOf(request);
    const configured = process.env.NEXT_PUBLIC_MARKETING_URL;

    const links: any[] = [];
    const failed: { userId: string; name: string; reason: string }[] = [];

    // Sequential on purpose. createOrReuseDetailRequest cancels before it inserts to
    // satisfy the one-active-per-student partial unique index, and firing those
    // read-cancel-insert cycles concurrently for the same roster invites a race for
    // no real gain at this size.
    for (const userId of userIds) {
      const person = byId.get(userId);
      try {
        const { request: req, reused } = await createOrReuseDetailRequest(
          { userId, createdBy: adminId || null, regenerate: !!regenerate },
          supabase
        );
        const url = studentDetailUrl(req.token, { adminOrigin: origin, configured });
        links.push({
          userId,
          name: person?.name || 'Unnamed student',
          firstName: person?.first_name || null,
          url,
          message: whatsappMessage(person?.first_name || person?.name, url),
          expiresAt: req.expires_at,
          reused,
          progress: detailRequestProgress(req),
          requestId: req.id,
        });
      } catch (e: any) {
        failed.push({ userId, name: person?.name || 'Unnamed student', reason: e?.message || 'Unknown error' });
      }
    }

    return NextResponse.json({ success: true, links, failed, created: links.filter((l) => !l.reused).length });
  } catch (error: any) {
    console.error('Student detail-requests error:', error);
    return NextResponse.json({ error: error.message || 'Failed to make links' }, { status: 500 });
  }
}

/**
 * PATCH /api/students/detail-requests
 * Record that staff actually took the links away (pressed Copy). Separate from POST
 * so that merely opening the dialog to look does not mark a whole cohort "asked",
 * which would make the Asked column lie about who has been contacted.
 *
 * Body: { requestIds: string[], adminId?: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { requestIds, adminId } = body;

    if (!Array.isArray(requestIds) || requestIds.length === 0) {
      return NextResponse.json({ error: 'requestIds must be a non-empty array' }, { status: 400 });
    }
    if (requestIds.length > MAX_PER_CALL) {
      return NextResponse.json({ error: 'Too many at once.' }, { status: 400 });
    }
    if (!requestIds.every((id: unknown) => typeof id === 'string' && UUID_REGEX.test(id))) {
      return NextResponse.json({ error: 'requestIds must all be valid UUIDs.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    for (const id of requestIds) {
      // markDetailRequestSent only ever stamps the first copy, so repeating this is safe.
      await markDetailRequestSent(id, adminId || null, supabase);
    }
    return NextResponse.json({ success: true, marked: requestIds.length });
  } catch (error: any) {
    console.error('Student detail-requests mark-sent error:', error);
    return NextResponse.json({ error: error.message || 'Failed to record' }, { status: 500 });
  }
}

/**
 * DELETE /api/students/detail-requests?userId=
 * Withdraw a student's live link, for when it went to the wrong number.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '';
    const adminId = searchParams.get('adminId') || null;

    if (!UUID_REGEX.test(userId)) {
      return NextResponse.json({ error: 'userId must be a valid UUID.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const live = await getLiveDetailRequestForUser(userId, supabase);
    if (!live) return NextResponse.json({ success: true, cancelled: false });

    await cancelDetailRequest(live.id, adminId && UUID_REGEX.test(adminId) ? adminId : null, supabase);
    return NextResponse.json({ success: true, cancelled: true });
  } catch (error: any) {
    console.error('Student detail-request cancel error:', error);
    return NextResponse.json({ error: error.message || 'Failed to withdraw the link' }, { status: 500 });
  }
}
