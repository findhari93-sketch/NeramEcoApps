import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getFoundationIssueById,
  resolveFoundationIssue,
  updateFoundationIssueStatus,
  assignFoundationIssue,
  delegateFoundationIssue,
  returnFoundationIssue,
  updateFoundationIssuePriority,
  getIssueActivityLog,
  addIssueComment,
  markIssueSeen,
  confirmFoundationIssue,
  reopenFoundationIssue,
  cleanupIssueScreenshots,
  deleteFoundationIssue,
} from '@neram/database/queries/nexus';
import { notifyUser, plainToHtmlWithLink } from '@/lib/nudge-delivery';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { shareBaseUrl } from '@/lib/class-share-links';
import { studentIssuePath, studentIssueUrl, teacherIssuePath } from '@/lib/issue-link';
import type { FoundationIssueStatus } from '@neram/database/types';

interface Caller {
  id: string;
  user_type: string | null;
  staff_role: string | null;
  can_teach: boolean | null;
  name: string | null;
}

/**
 * Whoever is asking, staff or student.
 *
 * staff_role and can_teach come back too, because a manager is user_type
 * 'student' with staff_role 'manager'. Reading user_type alone is what locked
 * managers out of every action on this route: they hold coord.issue.triage and
 * could not so much as change a priority.
 */
async function verifyAnyUser(request: NextRequest): Promise<Caller> {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, staff_role, can_teach, name')
    .eq('ms_oid', msUser.oid)
    .single();

  if (!user) throw new Error('User not found');
  return user as Caller;
}

async function verifyStaff(request: NextRequest): Promise<Caller> {
  const user = await verifyAnyUser(request);
  if (resolveStaffRole(user) === null) throw new Error('Not authorized');
  return user;
}

/** Staff-only columns, stripped before a student's copy of the ticket leaves the server. */
function withoutStaffOnlyFields<T extends object>(issue: T): T {
  const { console_logs: _c, device_info: _d, context: _x, ...rest } = issue as Record<string, unknown>;
  return rest as T;
}

/**
 * GET /api/foundation/issues/[id]
 * Get issue details + activity log
 *
 * ?seen=1 also clears this side's unread mark. Gated on the parameter so a
 * retry, a prefetch or a link preview cannot clear somebody's badge.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await verifyAnyUser(request);
    const isStaff = resolveStaffRole(user) !== null;

    const [issue, activity] = await Promise.all([
      getFoundationIssueById(id),
      // The filter is a database predicate, not a UI choice: an internal note
      // names staff and carries delegation reasons, so a student must never
      // receive one, not merely fail to see it on a screen.
      getIssueActivityLog(id, { visibleToStudentOnly: !isStaff }),
    ]);

    // Students can only see their own issues
    if (!isStaff && issue.student_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    if (new URL(request.url).searchParams.get('seen') === '1') {
      await markIssueSeen(id, isStaff ? 'staff' : 'student');
    }

    return NextResponse.json({
      issue: isStaff ? issue : withoutStaffOnlyFields(issue),
      activity,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load issue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/foundation/issues/[id]
 * Actions: status change, assign, delegate, return, resolve, priority, comment, recheck
 * Body: { action, ...params }
 *
 * action: 'status'    -> { status: 'open' | 'in_progress' | 'resolved', resolution_note? }
 * action: 'assign'    -> { assigned_to: userId }
 * action: 'delegate'  -> { delegated_to: userId, reason: string }
 * action: 'return'    -> { reason: string }
 * action: 'resolve'   -> { resolution_note: string }
 * action: 'priority'  -> { priority: 'low' | 'medium' | 'high' }
 * action: 'comment'   -> { comment: string, internal?: boolean }   staff OR the reporter
 * action: 'recheck'   -> { note?: string }                         staff only
 * action: 'confirm'   -> {}                                        the reporter
 * action: 'reopen'    -> { reason: string }                        the reporter
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: issueId } = await params;
    const body = await request.json();
    const action = body.action || 'status'; // backward compat

    const supabase = getSupabaseAdminClient();

    // Actions the reporter may take on their OWN ticket. `comment` is on this
    // list AND available to staff, so the caller is resolved once and each case
    // asks its own question. The old shape cast null into a staff-shaped
    // variable for student actions, which would throw the moment one action was
    // open to both.
    const OWNER_OR_STAFF = ['confirm', 'reopen', 'comment'];
    const caller = OWNER_OR_STAFF.includes(action)
      ? await verifyAnyUser(request)
      : await verifyStaff(request);
    const isStaff = resolveStaffRole(caller) !== null;
    const actorName = caller.name || 'Your teacher';

    // Get issue details for notifications
    const { data: issueData } = await supabase
      .from('nexus_foundation_issues')
      .select('student_id, title, ticket_number, status, assigned_to, resolved_by, chapter:nexus_foundation_chapters!nexus_foundation_issues_chapter_id_fkey(title)')
      .eq('id', issueId)
      .single();

    const ticket = issueData?.ticket_number || issueId;
    const base = shareBaseUrl(request.nextUrl.origin);

    let issue;

    switch (action) {
      case 'assign': {
        if (!body.assigned_to) {
          return NextResponse.json({ error: 'assigned_to is required' }, { status: 400 });
        }
        issue = await assignFoundationIssue(issueId, body.assigned_to, caller.id);

        // Notify the assignee
        if (body.assigned_to !== caller.id) {
          await notifyUser({
            user_id: body.assigned_to,
            event_type: 'foundation_issue_assigned',
            title: 'Issue Assigned to You',
            message: `${actorName} assigned you an issue: "${issueData?.title || 'Unknown'}"`,
            metadata: { issue_id: issueId, ticket_number: ticket, assigned_by: actorName, href: teacherIssuePath(ticket) },
          }, { audience: 'staff' }).catch(console.error);
        }

        // Notify the student that issue is being worked on
        if (issueData) {
          await notifyUser({
            user_id: issueData.student_id,
            event_type: 'foundation_issue_in_progress',
            title: 'Issue Being Reviewed',
            message: `Your issue "${issueData.title}" is now being reviewed.`,
            metadata: { issue_id: issueId, ticket_number: ticket, href: studentIssuePath(ticket) },
          }).catch(console.error);
        }
        break;
      }

      case 'delegate': {
        if (!body.delegated_to || !body.reason?.trim()) {
          return NextResponse.json({ error: 'delegated_to and reason are required' }, { status: 400 });
        }
        issue = await delegateFoundationIssue(issueId, body.delegated_to, caller.id, body.reason.trim());

        // Notify the new assignee
        await notifyUser({
          user_id: body.delegated_to,
          event_type: 'foundation_issue_delegated',
          title: 'Issue Delegated to You',
          message: `${actorName} delegated an issue to you: "${issueData?.title || 'Unknown'}". Reason: ${body.reason.trim()}`,
          metadata: { issue_id: issueId, ticket_number: ticket, delegated_by: actorName, reason: body.reason.trim(), href: teacherIssuePath(ticket) },
        }, { audience: 'staff' }).catch(console.error);
        break;
      }

      case 'return': {
        if (!body.reason?.trim()) {
          return NextResponse.json({ error: 'reason is required' }, { status: 400 });
        }
        issue = await returnFoundationIssue(issueId, caller.id, body.reason.trim());
        break;
      }

      case 'resolve': {
        const note = body.resolution_note?.trim() || 'Issue resolved';
        issue = await resolveFoundationIssue(issueId, caller.id, note);

        // Notify the student
        if (issueData) {
          const plain =
            `Hi {firstName}, ${actorName} has marked your ticket ${ticket} as fixed.\n\n` +
            `"${note}"\n\n` +
            `Please open the ticket, try it once more, and tell us there whether it works. ` +
            `A reply here in Teams will not reach the ticket.`;
          await notifyUser({
            user_id: issueData.student_id,
            event_type: 'foundation_issue_awaiting_confirmation',
            title: `${ticket} is fixed. Please confirm`,
            message: plain,
            metadata: {
              issue_id: issueId,
              ticket_number: ticket,
              resolution_note: note,
              resolved_by: actorName,
              href: studentIssuePath(ticket),
            },
          }, {
            teacher: { authHeader: request.headers.get('Authorization'), userId: caller.id },
            html: plainToHtmlWithLink(plain, studentIssueUrl(base, ticket), 'Open the ticket'),
          }).catch(console.error);
        }
        break;
      }

      case 'priority': {
        if (!body.priority || !['low', 'medium', 'high'].includes(body.priority)) {
          return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
        }
        issue = await updateFoundationIssuePriority(issueId, body.priority);
        break;
      }

      case 'comment': {
        if (!body.comment?.trim()) {
          return NextResponse.json({ error: 'comment is required' }, { status: 400 });
        }
        if (!issueData) {
          return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
        }
        // The reporter may reply on their own ticket, and only on their own.
        if (!isStaff && issueData.student_id !== caller.id) {
          return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }

        const text = body.comment.trim();
        // Only staff can write an internal note, and only by asking for one.
        const internal = isStaff && body.internal === true;

        const activity = await addIssueComment(issueId, caller.id, text, {
          visibleToStudent: !internal,
        });

        if (isStaff && !internal) {
          // A Teams chat from THIS staff member's own account, so the student
          // has a person to answer, and every word of it points back at the
          // ticket. Keeping the thread in one place is the whole point: a
          // conversation split between Teams and a ticket is one nobody can
          // read afterwards.
          const plain =
            `Hi {firstName}, ${actorName} replied on your ticket ${ticket}.\n\n` +
            `"${text}"\n\n` +
            `Please reply on the ticket itself so the whole conversation stays in one place. ` +
            `A reply here in Teams will not reach the ticket.`;
          await notifyUser({
            user_id: issueData.student_id,
            event_type: 'foundation_issue_comment',
            title: `${actorName} replied on ${ticket}`,
            message: plain,
            metadata: { issue_id: issueId, ticket_number: ticket, href: studentIssuePath(ticket) },
          }, {
            teacher: { authHeader: request.headers.get('Authorization'), userId: caller.id },
            html: plainToHtmlWithLink(plain, studentIssueUrl(base, ticket), 'Open the ticket'),
          }).catch(console.error);
        }

        if (!isStaff) {
          // Student to staff. There is no delegated Graph token on a student's
          // request, so this is the bell and the activity feed. Addressed to the
          // person holding the ticket rather than broadcast: an unaddressed
          // reply is one nobody owns.
          const to = issueData.assigned_to || issueData.resolved_by;
          if (to) {
            await notifyUser({
              user_id: to,
              event_type: 'foundation_issue_comment',
              title: `${actorName} replied on ${ticket}`,
              message: `${actorName} replied on ${ticket}: "${text}"`,
              metadata: { issue_id: issueId, ticket_number: ticket, href: teacherIssuePath(ticket) },
            }, { audience: 'staff' }).catch(console.error);
          }
        }

        // Shape kept deliberately: this case has always answered with the row
        // rather than the ticket, and the E2E suite reads body.activity.reason.
        return NextResponse.json({ activity });
      }

      case 'recheck': {
        if (!issueData) {
          return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
        }
        if (issueData.status === 'closed') {
          return NextResponse.json({ error: 'This ticket is already closed' }, { status: 400 });
        }

        const note = (body.note || '').trim();
        // The ask goes into the thread as well as into the chat, so the ticket
        // still reads as a whole conversation a week later.
        const activity = await addIssueComment(
          issueId,
          caller.id,
          note || 'Could you check this once more and tell us whether it is fixed?',
          { visibleToStudent: true },
        );

        const plain =
          `Hi {firstName}, ${actorName} would like you to check ticket ${ticket} again.\n\n` +
          (note ? `"${note}"\n\n` : '') +
          `Open the ticket, try it once more, and tell us there whether it is fixed. ` +
          `Please answer on the ticket, not in this chat.`;
        await notifyUser({
          user_id: issueData.student_id,
          event_type: 'foundation_issue_recheck_requested',
          title: `Please check ${ticket} again`,
          message: plain,
          metadata: { issue_id: issueId, ticket_number: ticket, href: studentIssuePath(ticket) },
        }, {
          teacher: { authHeader: request.headers.get('Authorization'), userId: caller.id },
          html: plainToHtmlWithLink(plain, studentIssueUrl(base, ticket), 'Open the ticket'),
        }).catch(console.error);

        return NextResponse.json({ activity });
      }

      case 'confirm': {
        if (!issueData || issueData.student_id !== caller.id) {
          return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }
        if (issueData.status !== 'awaiting_confirmation') {
          return NextResponse.json({ error: 'Issue is not awaiting confirmation' }, { status: 400 });
        }

        issue = await confirmFoundationIssue(issueId, caller.id);
        await cleanupIssueScreenshots(issueId).catch(console.error);

        await notifyUser({
          user_id: issueData.resolved_by || issueData.student_id,
          event_type: 'foundation_issue_closed',
          title: 'Issue Confirmed Resolved',
          message: `${actorName} confirmed ${ticket} "${issueData.title}" is resolved.`,
          metadata: { issue_id: issueId, ticket_number: ticket, href: teacherIssuePath(ticket) },
        }, { audience: 'staff' }).catch(console.error);
        break;
      }

      case 'reopen': {
        if (!body.reason?.trim()) {
          return NextResponse.json({ error: 'reason is required' }, { status: 400 });
        }
        if (!issueData || issueData.student_id !== caller.id) {
          return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }
        if (issueData.status !== 'awaiting_confirmation') {
          return NextResponse.json({ error: 'Issue is not awaiting confirmation' }, { status: 400 });
        }

        issue = await reopenFoundationIssue(issueId, caller.id, body.reason.trim());

        const notifyUserId = issueData.assigned_to || issueData.resolved_by;
        if (notifyUserId) {
          await notifyUser({
            user_id: notifyUserId,
            event_type: 'foundation_issue_reopened',
            title: 'Issue Reopened',
            message: `${actorName} reopened ${ticket}: "${body.reason.trim()}"`,
            metadata: { issue_id: issueId, ticket_number: ticket, reason: body.reason.trim(), href: teacherIssuePath(ticket) },
          }, { audience: 'staff' }).catch(console.error);
        }
        break;
      }

      // Backward-compatible: status change
      case 'status':
      default: {
        const status = body.status as FoundationIssueStatus;
        if (!status || !['open', 'in_progress', 'resolved'].includes(status)) {
          return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        if (status === 'resolved') {
          const note = body.resolution_note || 'Issue resolved';
          issue = await resolveFoundationIssue(issueId, caller.id, note);

          if (issueData) {
            const plain =
              `Hi {firstName}, ${actorName} has marked your ticket ${ticket} as fixed.\n\n` +
              `"${note}"\n\n` +
              `Please open the ticket, try it once more, and tell us there whether it works. ` +
              `A reply here in Teams will not reach the ticket.`;
            await notifyUser({
              user_id: issueData.student_id,
              event_type: 'foundation_issue_awaiting_confirmation',
              title: `${ticket} is fixed. Please confirm`,
              message: plain,
              metadata: { issue_id: issueId, ticket_number: ticket, resolution_note: note, resolved_by: actorName, href: studentIssuePath(ticket) },
            }, {
              teacher: { authHeader: request.headers.get('Authorization'), userId: caller.id },
              html: plainToHtmlWithLink(plain, studentIssueUrl(base, ticket), 'Open the ticket'),
            }).catch(console.error);
          }
        } else {
          issue = await updateFoundationIssueStatus(issueId, status, caller.id);

          // Notify student when marked in progress
          if (status === 'in_progress' && issueData) {
            await notifyUser({
              user_id: issueData.student_id,
              event_type: 'foundation_issue_in_progress',
              title: 'Issue Being Reviewed',
              message: `Your issue "${issueData.title}" is now being reviewed.`,
              metadata: { issue_id: issueId, ticket_number: ticket, href: studentIssuePath(ticket) },
            }).catch(console.error);
          }
        }
        break;
      }
    }

    return NextResponse.json({ issue });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update issue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/foundation/issues/[id]
 * Permanently deletes an issue and its screenshots. Staff only.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyStaff(request);
    const { id } = await params;
    await deleteFoundationIssue(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete issue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
