import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertStaff } from '@/lib/study-materials';
import { errorResponse, describeError, messageOf } from '@/lib/api-errors';
import { sendNudge } from '@/lib/nudge-delivery';
import { toPhotoStatus, type PhotoStatus } from '@/lib/photo-gate';
import { resolvePhotoOrigin } from '@/lib/photo-origin';
import { loadPhotoRoster } from '@/lib/photo-review-roster';
import { searchableName, type PhotoSearchEntry } from '@/lib/photo-review-search';
import {
  aiHintFor,
  needsFaceCheck,
  reviewTabFor,
  toReviewTab,
  type ReviewTab,
} from '@/lib/photo-auto-review';
import { pushApprovedPhotoToMicrosoft, type MsPushResult } from '@/lib/photo-ms-sync';
import { FEATURE_FLAGS_KEY, resolveFlags, type FlagMap } from '@/lib/feature-flags';
import { getNexusSetting } from '@neram/database';

/** Mirroring an approved photo onto the student's real Microsoft identity. */
const MS_PUSH_FEATURE = 'staff.photo-ms-push';

/**
 * Teacher photo review queue.
 *
 * A clear photo of one face is approved automatically by the face check
 * (lib/photo-face-check.ts) and listed on its own Auto-approved tab, where a
 * teacher can confirm it or ask for a new one. Everything the check could not
 * approve waits here for a human. Nothing is ever rejected automatically.
 *
 * GET lists the classroom roster bucketed by tab (the "Needs review" bucket
 * doubles as the one-time bulk backfill grid for photos that already existed).
 * POST records approve/reject decisions.
 *
 * Staff only. Rejection always requires a reason, because that reason is the
 * only thing the blocked student is shown.
 */

/** Cap per request so a huge classroom cannot blow the serverless time budget. */
const MAX_DECISIONS = 200;

/**
 * GET /api/photo-review?classroom=<id>&status=pending|auto|missing|rejected|approved
 * Returns the per-tab counts (always all five, for the tab badges, plus how many
 * pending photos the face check has not looked at yet), the rows of the
 * requested tab, and `search_index`: every student's id, the name their card
 * shows and their tab. The page loads one tab at a time, and the index is what
 * lets a search say "Show 2 in Approved" instead of "nobody here".
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom is required' }, { status: 400 });
    }
    const tab = toReviewTab(request.nextUrl.searchParams.get('status') || 'pending');

    const supabase = getSupabaseAdminClient() as any;
    const roster = await loadPhotoRoster(supabase, classroomId);

    const now = new Date();
    const counts: Record<ReviewTab, number> & { unchecked: number } = {
      pending: 0,
      auto: 0,
      missing: 0,
      rejected: 0,
      approved: 0,
      unchecked: 0,
    };
    const searchIndex: PhotoSearchEntry[] = [];
    for (const u of roster) {
      const bucket = reviewTabFor(u);
      counts[bucket] += 1;
      if (needsFaceCheck(u, now)) counts.unchecked += 1;
      searchIndex.push({ id: u.id, name: searchableName(u), tab: bucket });
    }

    const shown = roster
      .filter((u) => reviewTabFor(u) === tab)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Provenance for just the bucket being shown. Most photos here were never
    // submitted by the student (a background job pulled them from Microsoft, or
    // they arrived with a Google sign-in), and the teacher needs to know that
    // before approving a face. One extra query, only over the visible rows.
    const sourceBy = new Map<string, string | null>();
    if (shown.length > 0) {
      const { data: avatarRows } = await supabase
        .from('user_avatars')
        .select('user_id, source')
        .in(
          'user_id',
          shown.map((u) => u.id),
        )
        .eq('is_current', true);
      for (const a of (avatarRows || []) as any[]) sourceBy.set(a.user_id, a.source ?? null);
    }

    const rows = shown.map((u) => {
      const photoStatus = toPhotoStatus(u.photo_status);
      return {
        student: { id: u.id, name: u.name, email: u.email, avatar_url: u.avatar_url },
        photo_status: photoStatus,
        photo_submitted_at: u.photo_submitted_at,
        photo_reviewed_at: u.photo_reviewed_at,
        photo_rejection_reason: u.photo_rejection_reason,
        nexus_last_login_at: u.nexus_last_login_at,
        photo_origin: resolvePhotoOrigin({
          avatarSource: sourceBy.get(u.id) ?? null,
          avatarUrl: u.avatar_url,
        }),
        /** Who approved it, on approved photos only. A NULL method is a teacher. */
        review_method:
          photoStatus === 'approved' ? (u.photo_review_method === 'auto' ? 'auto' : 'teacher') : null,
        /** Why the face check left this photo for a teacher, when it looked at it. */
        ai_hint: photoStatus === 'pending' ? aiHintFor(u.photo_ai_check, u.avatar_url) : null,
      };
    });

    return NextResponse.json({ counts, rows, status: tab, search_index: searchIndex });
  } catch (err) {
    return errorResponse(err, 'Failed to load photo review queue');
  }
}

interface Decision {
  studentId: string;
  decision: PhotoStatus;
  reason?: string;
}

/** What actually happened to one decision, as opposed to what was asked for. */
interface DecisionOutcome {
  studentId: string;
  decision: PhotoStatus;
  ok: boolean;
  error?: string;
}

/**
 * POST /api/photo-review
 * Body: { decisions: [{ studentId, decision: 'approved'|'rejected'|'pending', reason? }] }
 *
 * 'pending' is accepted as "undo approval" for the inevitable misclick during
 * the bulk backfill pass.
 *
 * 'approved' is also how a teacher CONFIRMS an automatic approval from the
 * Auto-approved tab. It records the teacher as the approver, and it is the
 * moment that photo is first copied to Microsoft: the face check never pushes.
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

    const outcomes = await Promise.all(
      decisions.map(async (d): Promise<DecisionOutcome> => {
        const avatar = avatarBy.get(d.studentId) || null;

        const updates: Record<string, unknown> = {
          photo_status: d.decision,
          photo_reviewed_by: reviewer.id,
          photo_reviewed_at: now,
          photo_rejection_reason: d.decision === 'rejected' ? d.reason : null,
          photo_avatar_id: avatar?.id ?? null,
          // A person decided, so a person is the approver. This is what moves a
          // confirmed photo off the Auto-approved tab and onto Approved.
          photo_review_method: d.decision === 'approved' ? 'teacher' : null,
          updated_at: now,
        };

        // A photo a teacher judged unacceptable must stop being shown across the
        // whole app immediately, not just block the student. Clearing avatar_url
        // and unsetting is_current takes it off every UserAvatar at once.
        if (d.decision === 'rejected') {
          updates.avatar_url = null;
        }

        // .select('id') is what turns "the update ran" into "the update landed
        // on a row". A PostgREST update matching ZERO rows returns no error at
        // all, so this used to be a bare await with no check and the teacher was
        // told "Approved 1" over a row that never moved. Checking `error` alone
        // would not have caught it either.
        const { data: updated, error: updateError } = await supabase
          .from('users')
          .update(updates)
          .eq('id', d.studentId)
          .select('id');

        if (updateError || (updated?.length ?? 0) !== 1) {
          console.error(
            'photo-review: decision did not persist for',
            d.studentId,
            describeError(updateError),
          );
          return {
            studentId: d.studentId,
            decision: d.decision,
            ok: false,
            error: updateError ? messageOf(updateError) : 'That student no longer exists.',
          };
        }

        // Everything below is behind the guard on purpose. These used to run
        // whichever way the update went, which wrote an audit row for a decision
        // the database never recorded and mailed a student about a rejection
        // that did not happen.
        if (d.decision === 'rejected') {
          const { error: avatarError } = await supabase
            .from('user_avatars')
            .update({ is_current: false })
            .eq('user_id', d.studentId)
            .eq('is_current', true);
          // Not fatal. The decision itself persisted, and users.avatar_url is
          // already null, which is what every UserAvatar actually reads.
          if (avatarError) {
            console.error(
              'photo-review: could not unset the current avatar for',
              d.studentId,
              describeError(avatarError),
            );
          }
          rejected.push(d);
        }

        // 'pending' is an undo, not a decision, so it is not logged as one.
        if (d.decision === 'approved' || d.decision === 'rejected') {
          const { error: auditError } = await supabase.from('nexus_photo_reviews').insert({
            user_id: d.studentId,
            avatar_id: avatar?.id ?? null,
            avatar_url: avatar?.storage_path ?? null,
            decision: d.decision,
            reason: d.reason ?? null,
            reviewed_by: reviewer.id,
            method: 'teacher',
          });
          // Also not fatal. The decision is real; the audit trail is the
          // casualty, and failing here would tell the teacher to redo work that
          // is already done.
          if (auditError) {
            console.error(
              'photo-review: audit row failed for',
              d.studentId,
              describeError(auditError),
            );
          }
        }

        return { studentId: d.studentId, decision: d.decision, ok: true };
      }),
    );

    const persisted = outcomes.filter((o) => o.ok);
    const failures = outcomes.filter((o) => !o.ok);

    // Tell rejected students now, so they learn before they hit the blocker on
    // their next login rather than after it. Best-effort: a delivery failure
    // must never fail the review.
    if (rejected.length > 0) {
      await Promise.all(
        rejected.map((d) =>
          sendNudge({
            // The teacher's own Teams chat (their connected login if this token cannot chat).
            teacher: { authHeader: request.headers.get('Authorization'), userId: reviewer.id },
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

    // Approval is the moment the photo becomes the student's ONE picture, so it
    // is also the moment it goes onto their Microsoft account and therefore into
    // Teams and Outlook. Deliberately not done at upload time: that would put an
    // unreviewed image on a tenant-wide identity. Nor on an automatic approval:
    // that copy waits for a teacher's Confirm, which arrives here as 'approved'.
    //
    // Best-effort in every direction. A Graph failure is expected for accounts
    // without a mailbox and must never undo a decision the teacher already made,
    // so the outcome is reported back rather than thrown.
    // From what PERSISTED, not from what was asked for, so a push to Microsoft
    // can never describe a decision the database refused.
    const approvedIds = persisted
      .filter((o) => o.decision === 'approved')
      .map((o) => o.studentId);
    let microsoft: MsPushResult[] = [];
    if (approvedIds.length > 0) {
      const setting = await getNexusSetting(FEATURE_FLAGS_KEY).catch(() => null);
      const flags: FlagMap = resolveFlags((setting?.value as FlagMap) || {});
      if (flags[MS_PUSH_FEATURE] === true) {
        microsoft = await Promise.all(
          approvedIds.map((id) =>
            pushApprovedPhotoToMicrosoft(id).catch((e) => ({
              userId: id,
              status: 'failed' as const,
              message: e instanceof Error ? e.message : 'Could not reach Microsoft.',
            })),
          ),
        );
      } else {
        microsoft = approvedIds.map((id) => ({
          userId: id,
          status: 'disabled' as const,
          message: 'Copying photos to Microsoft is switched off.',
        }));
      }
    }

    // Every count here is what the database now holds, not what the request
    // asked for. A teacher told "Approved 12" over three writes that never
    // landed has been misled about work they will not come back to.
    const responseBody = {
      approved: approvedIds.length,
      rejected: rejected.length,
      reopened: persisted.filter((o) => o.decision === 'pending').length,
      failed: failures.length,
      failures: failures.map((f) => ({ studentId: f.studentId, error: f.error })),
      microsoft,
    };

    // Nothing at all persisted is a server failure, not a partial success. The
    // client must show it as an error rather than a cheerful "Approved 0".
    return NextResponse.json(responseBody, {
      status: failures.length === decisions.length ? 500 : 200,
    });
  } catch (err) {
    return errorResponse(err, 'Failed to save photo decisions');
  }
}
