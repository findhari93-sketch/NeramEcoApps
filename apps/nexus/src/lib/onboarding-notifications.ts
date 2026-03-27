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
 * Post a notification to the classroom's Teams channel when a student submits onboarding.
 * This is fire-and-forget — errors are logged but don't block the caller.
 */
export async function notifyTeachersOnboardingSubmitted(
  studentName: string,
  classroomId: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();

  // 1. Get classroom with ms_team_id
  const { data: classroom } = await supabase
    .from('nexus_classrooms')
    .select('id, name, ms_team_id')
    .eq('id', classroomId)
    .single();

  if (!classroom?.ms_team_id) {
    console.warn('Onboarding notification skipped: no Teams team linked to classroom', classroomId);
    return;
  }

  const token = await getAppOnlyToken();

  // 2. Get the General channel (first channel returned by default)
  const channelsRes = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${classroom.ms_team_id}/channels`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!channelsRes.ok) {
    console.error('Failed to fetch Teams channels:', channelsRes.status);
    return;
  }

  const channelsData = await channelsRes.json();
  const generalChannel = channelsData.value?.[0];

  if (!generalChannel) {
    console.error('General channel not found for team', classroom.ms_team_id);
    return;
  }

  // 3. Post notification message
  const reviewUrl = `${NEXUS_BASE_URL}/teacher/onboarding-reviews`;
  const messageBody = {
    body: {
      contentType: 'html',
      content: `<h3>📋 New Onboarding Submission</h3>
<p><strong>${studentName}</strong> has submitted their onboarding documents for <strong>${classroom.name}</strong> and is waiting for approval.</p>
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
}
