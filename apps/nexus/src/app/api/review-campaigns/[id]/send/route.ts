import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getReviewCampaignById,
  getCampaignStudents,
  markStudentsAsSent,
  updateReviewCampaign,
  getReviewPlatformUrls,
} from '@neram/database';

/**
 * POST /api/review-campaigns/[id]/send
 *
 * Send review requests to all pending students in a campaign.
 * Updates campaign status to 'active' and marks students as 'sent'.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // Verify caller
    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || !['admin', 'teacher'].includes(caller.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const campaign = await getReviewCampaignById(params.id);
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get pending students
    const { students } = await getCampaignStudents({
      campaignId: params.id,
      status: 'pending',
      limit: 1000,
    });

    if (students.length === 0) {
      return NextResponse.json({ error: 'No pending students to send to' }, { status: 400 });
    }

    // Get review URLs for the campaign's center
    let platformUrls: Record<string, string> = {};
    if (campaign.target_center_id) {
      const urls = await getReviewPlatformUrls(campaign.target_center_id);
      for (const u of urls) {
        platformUrls[u.platform] = u.review_url;
      }
    }

    // Group students by platform
    const platformStudents = new Map<string, string[]>();
    for (const s of students) {
      const list = platformStudents.get(s.platform) || [];
      list.push(s.student_id);
      platformStudents.set(s.platform, list);
    }

    // Mark all as sent
    let totalSent = 0;
    for (const [platform, studentIds] of platformStudents) {
      const { updated } = await markStudentsAsSent(params.id, studentIds, platform as any);
      totalSent += updated;
    }

    // Update campaign status to active
    if (campaign.status === 'draft') {
      await updateReviewCampaign(params.id, { status: 'active' });
    }

    // TODO: Actually send WhatsApp/Email/In-app notifications here
    // For now, we just mark as sent. The actual sending integration
    // will use the WhatsApp/Email services from packages/database/src/services/

    return NextResponse.json({
      sent: totalSent,
      platforms: Object.fromEntries(platformStudents),
      message: `Marked ${totalSent} students as sent. Notification delivery will be integrated in next phase.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send';
    console.error('Campaign send error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
