/**
 * Exam Recall notification helpers.
 * Sends in-app notifications via the user_notifications table.
 */

import { createUserNotification } from '@neram/database/queries';
import type { NotificationEventType } from '@neram/database';

interface RecallNotification {
  userId: string;
  eventType: NotificationEventType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

async function notify(n: RecallNotification) {
  try {
    await createUserNotification({
      user_id: n.userId,
      event_type: n.eventType,
      title: n.title,
      message: n.message,
      metadata: n.metadata,
    });
  } catch (err) {
    // Notifications should not block the main flow
    console.error('[exam-recall-notifications]', err);
  }
}

/** Notify thread author when someone adds a new version (refine) */
export async function notifyVersionAdded(
  threadAuthorId: string,
  refinerName: string,
  threadId: string
) {
  await notify({
    userId: threadAuthorId,
    eventType: 'recall_version_added',
    title: 'Someone refined your recalled question',
    message: `${refinerName} added an improved version to your exam recall.`,
    metadata: { thread_id: threadId },
  });
}

/** Notify thread author when someone confirms their question */
export async function notifyConfirmed(
  threadAuthorId: string,
  confirmCount: number,
  threadId: string
) {
  await notify({
    userId: threadAuthorId,
    eventType: 'recall_confirmed',
    title: 'Your recall was confirmed',
    message: `${confirmCount} student${confirmCount > 1 ? 's' : ''} confirmed they also got this question.`,
    metadata: { thread_id: threadId, confirm_count: confirmCount },
  });
}

/** Notify version author when their version is approved */
export async function notifyVersionApproved(
  authorId: string,
  threadId: string
) {
  await notify({
    userId: authorId,
    eventType: 'recall_version_approved',
    title: 'Your recall version was approved',
    message: 'A teacher approved your exam recall contribution.',
    metadata: { thread_id: threadId },
  });
}

/** Notify version author when their version is rejected */
export async function notifyVersionRejected(
  authorId: string,
  threadId: string
) {
  await notify({
    userId: authorId,
    eventType: 'recall_version_rejected',
    title: 'Your recall needs improvement',
    message: 'A teacher reviewed your recall and requested changes. Check the discussion.',
    metadata: { thread_id: threadId },
  });
}

/** Notify thread author when a teacher comments */
export async function notifyCommentAdded(
  threadAuthorId: string,
  commenterName: string,
  threadId: string
) {
  await notify({
    userId: threadAuthorId,
    eventType: 'recall_comment_added',
    title: 'New comment on your recall',
    message: `${commenterName} commented on your exam recall question.`,
    metadata: { thread_id: threadId },
  });
}

/** Notify all contributors when a thread is published to the Question Bank */
export async function notifyPublished(
  contributorIds: string[],
  threadId: string
) {
  for (const userId of contributorIds) {
    await notify({
      userId,
      eventType: 'recall_published',
      title: 'Your recall is now in the Question Bank!',
      message: 'A question you helped reconstruct has been published to the official Question Bank.',
      metadata: { thread_id: threadId },
    });
  }
}
