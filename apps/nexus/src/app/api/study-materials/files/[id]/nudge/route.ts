import { NextRequest, NextResponse } from 'next/server';
import { getFileById } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { sendNudge } from '@/lib/nudge-delivery';

/**
 * POST /api/study-materials/files/[id]/nudge  (staff)
 * Remind selected students about this study file.
 *
 * Through sendNudge like every student message: the teacher's own Teams chat,
 * the Teams activity feed when no chat landed, the Nexus bell always, and a
 * receipt per student. This route used to copy the old delivery tiers by hand,
 * with no dormant filter and no reasons.
 *
 * Body: { studentIds: string[], subject?: string, body: string }. Returns per-channel counts.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = request.headers.get('Authorization');
    const user = await getRequestUser(auth);
    assertStaff(user);

    const body = await request.json();
    const studentIds: string[] = Array.isArray(body?.studentIds) ? body.studentIds.filter((x: any) => typeof x === 'string') : [];
    const text = String(body?.body || '').trim();
    if (studentIds.length === 0) return NextResponse.json({ error: 'No recipients selected' }, { status: 400 });
    if (!text) return NextResponse.json({ error: 'Message is empty' }, { status: 400 });

    const file = await getFileById(params.id);
    const subject = String(body?.subject || '').trim() || `About: ${file?.title || 'your study material'}`;

    const { results, counts } = await sendNudge({
      studentIds,
      subject,
      plain: text,
      teamsText: subject,
      eventType: 'study_material_nudge',
      metadata: { file_id: params.id },
      teacher: { authHeader: auth, userId: user.id },
      source: { kind: 'study_material_nudge', refId: params.id },
    });
    return NextResponse.json({ results, counts, viaTeams: counts.teams + counts.chat });
  } catch (err) {
    return errorResponse(err, 'Failed to send message');
  }
}
