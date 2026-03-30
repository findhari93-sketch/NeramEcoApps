/**
 * Teams channel notifications for student onboarding events.
 *
 * Posts to the General channel of the classroom's linked Teams team
 * so all teachers are notified when a student submits onboarding.
 */
import { getAppOnlyToken } from './graph-app-token';
import { getSupabaseAdminClient } from '@neram/database';

const NEXUS_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nexus.neramclasses.com';

/**
 * Post a notification to Teams channels when a student submits onboarding.
 * Notifies all classrooms the student is enrolled in that have a linked Teams team.
 * This is fire-and-forget — errors are logged but don't block the caller.
 */
export async function notifyTeachersOnboardingSubmitted(
  studentName: string,
  studentId: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();

  // 1. Get all classrooms the student is enrolled in
  const { data: enrollments } = await (supabase as any)
    .from('nexus_enrollments')
    .select('classroom:nexus_classrooms(id, name, ms_team_id)')
    .eq('user_id', studentId)
    .eq('is_active', true);

  const classrooms = (enrollments || [])
    .map((e: any) => e.classroom)
    .filter((c: any) => c?.ms_team_id);

  if (classrooms.length === 0) {
    console.warn('Onboarding notification skipped: no Teams teams linked for student', studentId);
    return;
  }

  const token = await getAppOnlyToken();
  const reviewUrl = `${NEXUS_BASE_URL}/teacher/onboarding-reviews`;
  const classroomNames = classrooms.map((c: any) => c.name).join(', ');

  // 2. Post to each classroom's Teams channel
  for (const classroom of classrooms) {
    try {
      const channelsRes = await fetch(
        `https://graph.microsoft.com/v1.0/teams/${classroom.ms_team_id}/channels`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!channelsRes.ok) {
        console.error('Failed to fetch Teams channels:', channelsRes.status);
        continue;
      }

      const channelsData = await channelsRes.json();
      const generalChannel = channelsData.value?.[0];

      if (!generalChannel) {
        console.error('General channel not found for team', classroom.ms_team_id);
        continue;
      }

      const messageBody = {
        body: {
          contentType: 'html',
          content: `<h3>📋 New Onboarding Submission</h3>
<p><strong>${studentName}</strong> has submitted their onboarding documents (enrolled in: ${classroomNames}) and is waiting for approval.</p>
<p><a href="${reviewUrl}">👉 Review &amp; Approve Now</a></p>`,
        },
      };

      const postRes = await fetch(
        `https://graph.microsoft.com/v1.0/teams/${classroom.ms_team_id}/channels/${generalChannel.id}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messageBody),
        }
      );

      if (!postRes.ok) {
        const errText = await postRes.text().catch(() => '');
        console.error('Failed to post onboarding notification to Teams:', postRes.status, errText);
      }
    } catch (err) {
      console.error('Error notifying classroom', classroom.id, err);
    }
  }
}
