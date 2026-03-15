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
} from '@neram/database/queries/nexus';
import { createUserNotification } from '@neram/database/queries';
import type { FoundationIssueStatus } from '@neram/database/types';

async function verifyTeacherOrAdmin(request: NextRequest) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, name')
    .eq('ms_oid', msUser.oid)
    .single();

  if (!user || (user.user_type !== 'teacher' && user.user_type !== 'admin')) {
    throw new Error('Not authorized');
  }
  return user;
}

/**
 * GET /api/foundation/issues/[id]
 * Get issue details + activity log
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyTeacherOrAdmin(request);
    const { id } = await params;

    const [issue, activity] = await Promise.all([
      getFoundationIssueById(id),
      getIssueActivityLog(id),
    ]);

    return NextResponse.json({ issue, activity });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load issue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/foundation/issues/[id]
 * Actions: status change, assign, delegate, return, resolve, priority, comment
 * Body: { action, ...params }
 *
 * action: 'status'    → { status: 'open' | 'in_progress' | 'resolved', resolution_note? }
 * action: 'assign'    → { assigned_to: userId }
 * action: 'delegate'  → { delegated_to: userId, reason: string }
 * action: 'return'    → { reason: string }
 * action: 'resolve'   → { resolution_note: string }
 * action: 'priority'  → { priority: 'low' | 'medium' | 'high' }
 * action: 'comment'   → { comment: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyTeacherOrAdmin(request);
    const { id: issueId } = await params;
    const body = await request.json();
    const action = body.action || 'status'; // backward compat

    const supabase = getSupabaseAdminClient();

    // Get issue details for notifications
    const { data: issueData } = await supabase
      .from('nexus_foundation_issues')
      .select('student_id, title, chapter:nexus_foundation_chapters!nexus_foundation_issues_chapter_id_fkey(title)')
      .eq('id', issueId)
      .single();

    let issue;

    switch (action) {
      case 'assign': {
        if (!body.assigned_to) {
          return NextResponse.json({ error: 'assigned_to is required' }, { status: 400 });
        }
        issue = await assignFoundationIssue(issueId, body.assigned_to, user.id);

        // Notify the assignee
        if (body.assigned_to !== user.id) {
          const { data: assignee } = await supabase
            .from('users')
            .select('name')
            .eq('id', body.assigned_to)
            .single();

          await createUserNotification({
            user_id: body.assigned_to,
            event_type: 'foundation_issue_assigned',
            title: 'Issue Assigned to You',
            message: `${user.name} assigned you an issue: "${issueData?.title || 'Unknown'}"`,
            metadata: { issue_id: issueId, assigned_by: user.name },
          }).catch(console.error);
        }

        // Notify the student that issue is being worked on
        if (issueData) {
          await createUserNotification({
            user_id: issueData.student_id,
            event_type: 'foundation_issue_in_progress',
            title: 'Issue Being Reviewed',
            message: `Your issue "${issueData.title}" is now being reviewed.`,
            metadata: { issue_id: issueId },
          }).catch(console.error);
        }
        break;
      }

      case 'delegate': {
        if (!body.delegated_to || !body.reason?.trim()) {
          return NextResponse.json({ error: 'delegated_to and reason are required' }, { status: 400 });
        }
        issue = await delegateFoundationIssue(issueId, body.delegated_to, user.id, body.reason.trim());

        // Notify the new assignee
        await createUserNotification({
          user_id: body.delegated_to,
          event_type: 'foundation_issue_delegated',
          title: 'Issue Delegated to You',
          message: `${user.name} delegated an issue to you: "${issueData?.title || 'Unknown'}". Reason: ${body.reason.trim()}`,
          metadata: { issue_id: issueId, delegated_by: user.name, reason: body.reason.trim() },
        }).catch(console.error);
        break;
      }

      case 'return': {
        if (!body.reason?.trim()) {
          return NextResponse.json({ error: 'reason is required' }, { status: 400 });
        }
        issue = await returnFoundationIssue(issueId, user.id, body.reason.trim());
        break;
      }

      case 'resolve': {
        const note = body.resolution_note?.trim() || 'Issue resolved';
        issue = await resolveFoundationIssue(issueId, user.id, note);

        // Notify the student
        if (issueData) {
          await createUserNotification({
            user_id: issueData.student_id,
            event_type: 'foundation_issue_resolved',
            title: 'Issue Resolved',
            message: `Your issue "${issueData.title}" has been resolved: ${note}`,
            metadata: {
              issue_id: issueId,
              resolution_note: note,
              resolved_by: user.name,
            },
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
        const activity = await addIssueComment(issueId, user.id, body.comment.trim());
        return NextResponse.json({ activity });
      }

      // Backward-compatible: status change
      case 'status':
      default: {
        const status = body.status as FoundationIssueStatus;
        if (!status || !['open', 'in_progress', 'resolved'].includes(status)) {
          return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        if (status === 'resolved') {
          issue = await resolveFoundationIssue(issueId, user.id, body.resolution_note || 'Issue resolved');

          if (issueData) {
            await createUserNotification({
              user_id: issueData.student_id,
              event_type: 'foundation_issue_resolved',
              title: 'Issue Resolved',
              message: `Your issue "${issueData.title}" has been resolved.`,
              metadata: { issue_id: issueId, resolved_by: user.name },
            }).catch(console.error);
          }
        } else {
          issue = await updateFoundationIssueStatus(issueId, status, user.id);

          // Notify student when marked in progress
          if (status === 'in_progress' && issueData) {
            await createUserNotification({
              user_id: issueData.student_id,
              event_type: 'foundation_issue_in_progress',
              title: 'Issue Being Reviewed',
              message: `Your issue "${issueData.title}" is now being reviewed.`,
              metadata: { issue_id: issueId },
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
