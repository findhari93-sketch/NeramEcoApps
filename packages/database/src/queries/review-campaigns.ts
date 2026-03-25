// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Review Campaign Queries
 *
 * CRUD operations for review campaigns and per-student tracking.
 * Used by Nexus admins/teachers to manage review outreach.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  ReviewCampaign,
  ReviewCampaignWithStats,
  ReviewCampaignStudent,
  ReviewCampaignStudentWithUser,
  ReviewPlatform,
  ReviewCampaignStatus,
  ReviewStudentStatus,
  ReviewChannel,
} from '../types';

// ============================================
// CAMPAIGN CRUD
// ============================================

/**
 * List review campaigns with student stats.
 */
export async function listReviewCampaigns(options: {
  status?: ReviewCampaignStatus;
  limit?: number;
  offset?: number;
} = {}): Promise<{ campaigns: ReviewCampaignWithStats[]; total: number }> {
  const { status, limit = 50, offset = 0 } = options;
  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from('review_campaigns')
    .select(`
      *,
      creator:users!review_campaigns_created_by_fkey(name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('Failed to list review campaigns:', error);
    return { campaigns: [], total: 0 };
  }

  // Get stats for each campaign
  const campaignIds = (data || []).map(c => c.id);
  const stats = campaignIds.length > 0
    ? await getCampaignStats(supabase, campaignIds)
    : new Map();

  const campaigns: ReviewCampaignWithStats[] = (data || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    target_city: c.target_city,
    target_center_id: c.target_center_id,
    platforms: c.platforms,
    channels: c.channels,
    status: c.status,
    scheduled_at: c.scheduled_at,
    completed_at: c.completed_at,
    created_by: c.created_by,
    created_at: c.created_at,
    updated_at: c.updated_at,
    total_students: stats.get(c.id)?.total || 0,
    sent_count: stats.get(c.id)?.sent || 0,
    completed_count: stats.get(c.id)?.completed || 0,
    creator_name: c.creator?.name || null,
  }));

  return { campaigns, total: count || 0 };
}

async function getCampaignStats(
  supabase: TypedSupabaseClient,
  campaignIds: string[]
): Promise<Map<string, { total: number; sent: number; completed: number }>> {
  const { data } = await supabase
    .from('review_campaign_students')
    .select('campaign_id, status')
    .in('campaign_id', campaignIds);

  const statsMap = new Map<string, { total: number; sent: number; completed: number }>();

  for (const row of data || []) {
    const existing = statsMap.get(row.campaign_id) || { total: 0, sent: 0, completed: 0 };
    existing.total++;
    if (row.status === 'sent' || row.status === 'clicked' || row.status === 'completed') {
      existing.sent++;
    }
    if (row.status === 'completed') {
      existing.completed++;
    }
    statsMap.set(row.campaign_id, existing);
  }

  return statsMap;
}

/**
 * Get a single campaign by ID.
 */
export async function getReviewCampaignById(campaignId: string): Promise<ReviewCampaign | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('review_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (error) {
    console.error('Failed to get review campaign:', error);
    return null;
  }

  return data as ReviewCampaign;
}

/**
 * Create a new review campaign.
 */
export async function createReviewCampaign(input: {
  name: string;
  description?: string;
  target_city?: string;
  target_center_id?: string;
  platforms: ReviewPlatform[];
  channels?: ReviewChannel[];
  created_by: string;
}): Promise<{ campaign: ReviewCampaign | null; error: string | null }> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('review_campaigns')
    .insert({
      name: input.name,
      description: input.description || null,
      target_city: input.target_city || null,
      target_center_id: input.target_center_id || null,
      platforms: input.platforms,
      channels: input.channels || ['whatsapp', 'email', 'in_app'],
      status: 'draft',
      created_by: input.created_by,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create review campaign:', error);
    return { campaign: null, error: 'Failed to create campaign.' };
  }

  return { campaign: data as ReviewCampaign, error: null };
}

/**
 * Update a review campaign.
 */
export async function updateReviewCampaign(
  campaignId: string,
  updates: Partial<Pick<ReviewCampaign, 'name' | 'description' | 'target_city' | 'target_center_id' | 'platforms' | 'channels' | 'status'>>
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('review_campaigns')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId);

  if (error) {
    console.error('Failed to update review campaign:', error);
    return { success: false, error: 'Failed to update campaign.' };
  }

  return { success: true };
}

/**
 * Delete a review campaign (only if draft).
 */
export async function deleteReviewCampaign(campaignId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdminClient();

  // Check status first
  const { data: campaign } = await supabase
    .from('review_campaigns')
    .select('status')
    .eq('id', campaignId)
    .single();

  if (!campaign) return { success: false, error: 'Campaign not found.' };
  if (campaign.status !== 'draft') return { success: false, error: 'Can only delete draft campaigns.' };

  const { error } = await supabase
    .from('review_campaigns')
    .delete()
    .eq('id', campaignId);

  if (error) {
    console.error('Failed to delete review campaign:', error);
    return { success: false, error: 'Failed to delete campaign.' };
  }

  return { success: true };
}

// ============================================
// CAMPAIGN STUDENTS
// ============================================

/**
 * Get students in a campaign with user details.
 */
export async function getCampaignStudents(options: {
  campaignId: string;
  platform?: ReviewPlatform;
  status?: ReviewStudentStatus;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ students: ReviewCampaignStudentWithUser[]; total: number }> {
  const { campaignId, platform, status, search, limit = 50, offset = 0 } = options;
  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from('review_campaign_students')
    .select(`
      *,
      student:users!review_campaign_students_student_id_fkey(id, name, email, phone, avatar_url)
    `, { count: 'exact' })
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (platform) query = query.eq('platform', platform);
  if (status) query = query.eq('status', status);

  const { data, count, error } = await query;

  if (error) {
    console.error('Failed to get campaign students:', error);
    return { students: [], total: 0 };
  }

  // Get city info from lead_profiles for these students
  const studentIds = (data || []).map((d: any) => d.student?.id).filter(Boolean);
  const cityMap = new Map<string, string | null>();

  if (studentIds.length > 0) {
    const { data: profiles } = await supabase
      .from('lead_profiles')
      .select('user_id, city')
      .in('user_id', studentIds);
    for (const p of profiles || []) {
      cityMap.set(p.user_id, p.city);
    }
  }

  const students: ReviewCampaignStudentWithUser[] = (data || []).map((row: any) => ({
    id: row.id,
    campaign_id: row.campaign_id,
    student_id: row.student_id,
    platform: row.platform,
    status: row.status,
    sent_at: row.sent_at,
    clicked_at: row.clicked_at,
    completed_at: row.completed_at,
    screenshot_url: row.screenshot_url,
    reminder_count: row.reminder_count,
    last_reminder_at: row.last_reminder_at,
    notes: row.notes,
    created_at: row.created_at,
    student_name: row.student?.name || 'Unknown',
    student_email: row.student?.email || null,
    student_phone: row.student?.phone || null,
    student_avatar: row.student?.avatar_url || null,
    student_city: cityMap.get(row.student_id) || null,
  }));

  // Filter by search (student name/email) in JS since it's on joined data
  let filtered = students;
  if (search) {
    const q = search.toLowerCase();
    filtered = students.filter(s =>
      s.student_name.toLowerCase().includes(q) ||
      (s.student_email && s.student_email.toLowerCase().includes(q))
    );
  }

  return { students: filtered, total: count || 0 };
}

/**
 * Add students to a campaign. Creates one row per student per platform.
 */
export async function addStudentsToCampaign(
  campaignId: string,
  studentIds: string[],
  platforms: ReviewPlatform[]
): Promise<{ added: number; error: string | null }> {
  const supabase = getSupabaseAdminClient();

  const rows = studentIds.flatMap(studentId =>
    platforms.map(platform => ({
      campaign_id: campaignId,
      student_id: studentId,
      platform,
      status: 'pending' as const,
    }))
  );

  const { data, error } = await supabase
    .from('review_campaign_students')
    .upsert(rows, { onConflict: 'campaign_id,student_id,platform', ignoreDuplicates: true })
    .select('id');

  if (error) {
    console.error('Failed to add students to campaign:', error);
    return { added: 0, error: 'Failed to add students.' };
  }

  return { added: data?.length || 0, error: null };
}

/**
 * Update a student's review status (e.g., self-report completion).
 */
export async function updateCampaignStudentStatus(
  id: string,
  updates: {
    status?: ReviewStudentStatus;
    screenshot_url?: string;
    notes?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdminClient();

  const updateData: Record<string, any> = {};
  if (updates.status) {
    updateData.status = updates.status;
    if (updates.status === 'sent') updateData.sent_at = new Date().toISOString();
    if (updates.status === 'clicked') updateData.clicked_at = new Date().toISOString();
    if (updates.status === 'completed') updateData.completed_at = new Date().toISOString();
  }
  if (updates.screenshot_url) updateData.screenshot_url = updates.screenshot_url;
  if (updates.notes !== undefined) updateData.notes = updates.notes;

  const { error } = await supabase
    .from('review_campaign_students')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error('Failed to update campaign student:', error);
    return { success: false, error: 'Failed to update status.' };
  }

  return { success: true };
}

/**
 * Mark students as sent (bulk, after sending review requests).
 */
export async function markStudentsAsSent(
  campaignId: string,
  studentIds: string[],
  platform: ReviewPlatform
): Promise<{ updated: number }> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('review_campaign_students')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    .eq('campaign_id', campaignId)
    .in('student_id', studentIds)
    .eq('platform', platform)
    .eq('status', 'pending')
    .select('id');

  if (error) {
    console.error('Failed to mark students as sent:', error);
    return { updated: 0 };
  }

  return { updated: data?.length || 0 };
}

/**
 * Increment reminder count for a student.
 */
export async function recordReminder(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();

  // Fetch current count
  const { data: row } = await supabase
    .from('review_campaign_students')
    .select('reminder_count')
    .eq('id', id)
    .single();

  await supabase
    .from('review_campaign_students')
    .update({
      reminder_count: (row?.reminder_count || 0) + 1,
      last_reminder_at: new Date().toISOString(),
    })
    .eq('id', id);
}

/**
 * Get pending review tasks for a student (for student-facing view).
 */
export async function getStudentReviewTasks(
  studentId: string
): Promise<Array<ReviewCampaignStudent & { campaign_name: string; review_url: string | null }>> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('review_campaign_students')
    .select(`
      *,
      campaign:review_campaigns!review_campaign_students_campaign_id_fkey(name, status, target_center_id)
    `)
    .eq('student_id', studentId)
    .in('status', ['sent', 'clicked'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to get student review tasks:', error);
    return [];
  }

  // Get review URLs for each platform/center combo
  const tasks = [];
  for (const row of data || []) {
    const campaign = (row as any).campaign;
    if (!campaign || campaign.status !== 'active') continue;

    let reviewUrl: string | null = null;
    if (campaign.target_center_id) {
      const { data: urlRow } = await supabase
        .from('review_platform_urls')
        .select('review_url')
        .eq('center_id', campaign.target_center_id)
        .eq('platform', row.platform)
        .eq('is_active', true)
        .single();
      reviewUrl = urlRow?.review_url || null;
    }

    tasks.push({
      ...row,
      campaign_name: campaign.name,
      review_url: reviewUrl,
    });
  }

  return tasks;
}
