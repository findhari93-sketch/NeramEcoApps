/**
 * Telling people what happened to a test door.
 *
 * The reopen flow is a conversation between two people who are not looking at
 * the same screen. A teacher approves a request on their roster; the student
 * finds out by trying the test again and seeing whether it works. That is not a
 * conversation, it is a guess, and it is why students ask the same thing twice.
 *
 * EVERY WRITE HERE IS FAIL-SOFT, and that is a decision rather than laziness.
 * These run inside the request that opens or closes the door. If a notification
 * insert threw, the teacher's approve button would return 500 after the grant
 * had already been written: the door would be open, the screen would say it
 * failed, and the teacher would press it again. Losing a bell entry is a far
 * smaller harm than that, so the notification never gets a vote on whether the
 * action succeeded.
 *
 * This also means the feature works on an environment where
 * 20260903090000_test_access_notifications.sql has not run yet. The enum insert
 * fails, it is swallowed, and the door still opens.
 */
import {
  createAdminNotification,
  createUserNotification,
  getSupabaseAdminClient,
} from '@neram/database';

/** What the student is told when a door opens or shuts on them. */
export async function notifyStudentAccessDecision(input: {
  studentId: string;
  testId: string;
  placementId: string;
  testTitle: string | null;
  decision: 'granted' | 'declined';
  closesAt?: string | null;
  note?: string | null;
}): Promise<void> {
  const title = input.testTitle || 'your test';
  try {
    if (input.decision === 'granted') {
      // The deadline is the whole point of the message. "You can take it now"
      // without saying until when just moves the question.
      const until = input.closesAt
        ? new Date(input.closesAt).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'Asia/Kolkata',
          })
        : null;
      await createUserNotification(
        {
          user_id: input.studentId,
          event_type: 'test_access_granted' as never,
          title: 'Your teacher opened a test for you',
          message: until
            ? `You can now take ${title}. It closes on ${until}.`
            : `You can now take ${title}.`,
          metadata: { test_id: input.testId, placement_id: input.placementId },
        },
        getSupabaseAdminClient(),
      );
      return;
    }

    await createUserNotification(
      {
        user_id: input.studentId,
        event_type: 'test_access_declined' as never,
        title: 'Your teacher did not reopen that test',
        // The reason travels with the decision. A bare "declined" is the thing
        // students bring straight back to the teacher to ask about.
        message: input.note?.trim()
          ? `${title}: ${input.note.trim()}`
          : `Your request to retake ${title} was not approved.`,
        metadata: { test_id: input.testId, placement_id: input.placementId },
      },
      getSupabaseAdminClient(),
    );
  } catch (err) {
    console.warn('[test-access] student notification skipped:', (err as Error)?.message);
  }
}

/**
 * What the teaching staff are told when a student asks.
 *
 * Goes to the shared staff inbox through createAdminNotification, the same
 * primitive foundation issue reports already use, rather than to a list of
 * individual teachers. There is no classroom-to-staff table to address, and
 * inventing a fan-out here would put a second, quieter answer to "who teaches
 * this class" in the codebase.
 *
 * The request row on the teacher's roster is the durable record either way.
 * This is the nudge, not the queue.
 */
export async function notifyStaffAccessRequest(input: {
  studentName: string | null;
  testId: string;
  placementId: string;
  testTitle: string | null;
  note?: string | null;
}): Promise<void> {
  const who = input.studentName || 'A student';
  const title = input.testTitle || 'a test';
  try {
    await createAdminNotification({
      event_type: 'test_access_requested' as never,
      title: 'A student asked to retake a test',
      message: input.note?.trim()
        ? `${who} asked to retake ${title}: ${input.note.trim()}`
        : `${who} asked to retake ${title}.`,
      metadata: {
        test_id: input.testId,
        placement_id: input.placementId,
        student_name: input.studentName,
      },
    });
  } catch (err) {
    console.warn('[test-access] staff notification skipped:', (err as Error)?.message);
  }
}
