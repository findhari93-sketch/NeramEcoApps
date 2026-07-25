import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { sendNudge } from '@/lib/nudge-delivery';
import { toPhotoStatus, type PhotoStatus } from '@/lib/photo-gate';

/**
 * Teacher photo review queue.
 *
 * Every student profile photo is judged by a human. There is no AI check
 * anywhere in this flow. GET lists the classroom roster bucketed by status
 * (the "Needs review" bucket doubles as the one-time bulk backfill grid for
 * photos that already existed). POST records approve/reject decisions.
 *
 * Staff only. Rejection always requires a reason, because that reason is the
 * only thing the blocked student is shown.
 */

/** Cap per request so a huge classroom cannot blow the serverless time budget. */
const MAX_DECISIONS = 200;

interface RosterUser {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  is_alumni: boolean | null;
  photo_status: string | null;
  photo_submitted_at: string | null;
  photo_reviewed_at: string | null;
  photo_rejection_reason: string | null;
  nexus_last_login_at: string | null;
}

/** Active, non-alumni students of one classroom. Same population the assignment
 *  roster and engagement dashboard use, so the counts always agree. */
async function loadRoster(supabase: any, classroomId: string): Promise<RosterUser[]> {
  const { data } = await supabase
    .from('nexus_enrollments')
    .select(
      'user_id, user:users(id, name, email, avatar_url, is_alumni, photo_status, photo_submitted_at, photo_reviewed_at, photo_rejection_reason, nexus_last_login_at)',
    )
    .eq('classroom_id', classroomId)
    .eq('role', 'student')
    .eq('is_active', true);

  return ((data || []) as any[])
    .map((row) => row.user as RosterUser | null)
    .filter((u): u is RosterUser => !!u && u.is_alumni !== true);
}

/**
 * GET /api/photo-review?classroom=<id>&status=pending|missing|rejected|approved
 * Returns the per-status counts (always all four, for the tab badges) plus the
 * rows of the requested bucket.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom is required' }, { status: 400 });
    }
    const status = toPhotoStatus(request.nextUrl.searchParams.get('status') || 'pending');

    const supabase = getSupabaseAdminClient() as any;
    const roster = await loadRoster(supabase, classroomId);

    const counts = { pending: 0, missing: 0, rejected: 0, approved: 0 };
    for (const u of roster) counts[toPhotoStatus(u.photo_status)] += 1;

    const rows = roster
      .filter((u) => toPhotoStatus(u.photo_status) === status)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((u) => ({
        student: { id: u.id, name: u.name, email: u.email, avatar_url: u.avatar_url },
        photo_status: toPhotoStatus(u.photo_status),
        photo_submitted_at: u.photo_submitted_at,
        photo_reviewed_at: u.photo_reviewed_at,
        photo_rejection_reason: u.photo_rejection_reason,
        nexus_last_login_at: u.nexus_last_login_at,
      }));

    return NextResponse.json({ counts, rows, status });
  } catch (err) {
    return errorResponse(err, 'Failed to load photo review queue');
  }
}

interface Decision {
  studentId: string;
  decision: PhotoStatus;
  reason?: string;
}

/**
 * POST /api/photo-review
 * Body: { decisions: [{ studentId, decision: 'approved'|'rejected'|'pending', reason? }] }
 *
 * 'pending' is accepted as "undo approval" for the inevitable misclick during
 * the bulk backfill pass.
 */
export async function POST(request: NextRequest) {
  try {
    const reviewer = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(reviewer);

    const body = await request.json();
    const decisions: Decision[] = Array.isArray(body?.decisions)
      ? body.decisions
          .filter((d: any) => typeof d?.studentId === 'string')
          .map((d: any) => ({
            studentId: d.studentId,
            decision: toPhotoStatus(d.decision),
            reason: typeof d.reason === 'string' ? d.reason.trim() : undefined,
          }))
      : [];

    if (decisions.length === 0) {
      return NextResponse.json({ error: 'No decisions provided' }, { status: 400 });
    }
    if (decisions.length > MAX_DECISIONS) {
      return NextResponse.json(
        { error: `Too many at once. Send at most ${MAX_DECISIONS} per request.` },
        { status: 400 },
      );
    }
    const badReject = decisions.find((d) => d.decision === 'rejected' && !d.reason);
    if (badReject) {
      return NextResponse.json(
        { error: 'A rejection needs a reason. The student is shown that reason.' },
        { status: 400 },
      );
    }
    const invalid = decisions.find((d) => d.decision === 'missing');
    if (invalid) {
      return NextResponse.json(
        { error: 'A photo can be approved, rejected, or sent back to pending.' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminClient() as any;
    const now = new Date().toISOString();
    const studentIds = decisions.map((d) => d.studentId);

    // Current avatar per student, so the audit row records exactly which photo
    // the decision was about even after the student later replaces it.
    const { data: avatars } = await supabase
      .from('user_avatars')
      .select('id, user_id, storage_path')
      .in('user_id', studentIds)
      .eq('is_current', true);
    const avatarBy = new Map<string, { id: string; storage_path: string | null }>(
      ((avatars || []) as any[]).map((a) => [a.user_id, { id: a.id, storage_path: a.storage_path }]),
    );

    const rejected: Decision[] = [];

    await Promise.all(
      decisions.map(async (d) => {
        const avatar = avatarBy.get(d.studentId) || null;

        const updates: Record<string, unknown> = {
          photo_status: d.decision,
          photo_reviewed_by: reviewer.id,
          photo_reviewed_at: now,
          photo_rejection_reason: d.decision === 'rejected' ? d.reason : null,
          photo_avatar_id: avatar?.id ?? null,
          updated_at: now,
        };

        // A photo a teacher judged unacceptable must stop being shown across the
        // whole app immediately, not just block the student. Clearing avatar_url
        // and unsetting is_current takes it off every UserAvatar at once.
        if (d.decision === 'rejected') {
          updates.avatar_url = null;
        }

        await supabase.from('users').update(updates).eq('id', d.studentId);

        if (d.decision === 'rejected') {
          await supabase
            .from('user_avatars')
            .update({ is_current: false })
            .eq('user_id', d.studentId)
            .eq('is_current', true);
          rejected.push(d);
        }

        // 'pending' is an undo, not a decision, so it is not logged as one.
        if (d.decision === 'approved' || d.decision === 'rejected') {
          await supabase.from('nexus_photo_reviews').insert({
            user_id: d.studentId,
            avatar_id: avatar?.id ?? null,
            avatar_url: avatar?.storage_path ?? null,
            decision: d.decision,
            reason: d.reason ?? null,
            reviewed_by: reviewer.id,
          });
        }
      }),
    );

    // Tell rejected students now, so they learn before they hit the blocker on
    // their next login rather than after it. Best-effort: a delivery failure
    // must never fail the review.
    if (rejected.length > 0) {
      await Promise.all(
        rejected.map((d) =>
          sendNudge({
            studentIds: [d.studentId],
            subject: 'Your profile photo needs a change',
            plain:
              `Your teacher looked at your profile photo and asked for a new one.\n\n` +
              `Reason: ${d.reason}\n\n` +
              `Open Nexus and add a clear photo of your face to continue.`,
            teamsText: 'Your profile photo needs a change',
            eventType: 'assignment_nudge',
            metadata: { source: 'photo_review', decision: 'rejected' },
          }).catch((e) => {
            console.error('photo-review reject notification failed:', e);
            return null;
          }),
        ),
      );
    }

    return NextResponse.json({
      approved: decisions.filter((d) => d.decision === 'approved').length,
      rejected: rejected.length,
      reopened: decisions.filter((d) => d.decision === 'pending').length,
    });
  } catch (err) {
    return errorResponse(err, 'Failed to save photo decisions');
  }
}
