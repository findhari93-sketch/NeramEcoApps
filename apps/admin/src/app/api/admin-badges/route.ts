// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient, istDayBounds } from '@neram/database';
import { ZERO_BADGES, badgeWindow, normalizeBadgeCounts } from '@/lib/admin-badges';
import { countReviewQueue } from '@/lib/aintra-inbox/server';

const NO_STORE = { 'Cache-Control': 'no-store' };

// GET /api/admin-badges - Every sidebar badge plus the bell's unread count, in one
// call. One SQL function (admin_badge_counts, migration 20261026090000) answers all
// 14 counts. Response keys: the 11 menu badges, plus careers, messages_unread and
// notifications_unread, which used to be three separate polled routes. Those routes
// still exist for any other caller.
export async function GET() {
  const supabase = createAdminClient();
  const { chatSince, followUpBefore } = badgeWindow();
  try {
    const [{ data, error }, reviewQueue] = await Promise.all([
      supabase.rpc('admin_badge_counts', {
        p_chat_since: chatSince,
        p_follow_up_before: followUpBefore,
      }),
      countReviewQueue(supabase),
    ]);
    if (error) throw error;
    // Aintra Inbox: the badge is the Review queue (wrong or unanswered, not yet
    // corrected), the same number as the page's header button.
    const counts = normalizeBadgeCounts(data);
    if (reviewQueue !== null) counts.chat_history = reviewQueue;
    return NextResponse.json(counts, { headers: NO_STORE });
  } catch (rpcErr) {
    // The function ships in a migration; until it is applied in an environment,
    // fall back to the old per-table counts so the sidebar never goes blank.
    console.warn('[admin-badges] RPC unavailable, using per-table counts:', (rpcErr as any)?.message);
    return NextResponse.json(await legacyCounts(supabase), { headers: NO_STORE });
  }
}

async function legacyCounts(supabase: ReturnType<typeof createAdminClient>) {
  try {
    // Chat history: conversations from the last 24 hours that haven't been reviewed
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Follow-ups due before the end of today, India time (same rule as countDueFollowUps).
    const { end: endOfTodayIst } = istDayBounds();

    const [leads, students, demos, tickets, feedback, qa, payments, chatHistory, duplicates, followUps, lifecycle, careers, messages, notifications] = await Promise.all([
      // Leads: phone verified but WA not confirmed, OR submitted but call not made
      supabase
        .from('lead_profiles')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .or('and(phone_verified.eq.true,whatsapp_sent_at.is.null),and(status.eq.submitted,contacted_status.is.null)'),

      // Students: no MS credentials yet OR not added to a batch
      supabase
        .from('student_profiles')
        .select('id', { count: 'exact', head: true })
        .or('ms_teams_email.is.null,batch_id.is.null'),

      // Demo Classes: registrations pending approval
      supabase
        .from('demo_class_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),

      // Support Tickets: open or in-progress
      supabase
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress']),

      // App Feedback: not yet reviewed
      supabase
        .from('app_feedback')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new'),

      // Q&A Moderation: posts pending review
      supabase
        .from('question_posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),

      // Payments: screenshot uploaded but not verified
      supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .not('screenshot_url', 'is', null)
        .eq('screenshot_verified', false),

      // Chat History: new conversations in the last 24 hours not yet reviewed
      supabase
        .from('chatbot_conversations')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', twentyFourHoursAgo)
        .is('admin_correction', null)
        .is('thumbs_up', null),

      // Duplicates: open pairs waiting for a merge or dismiss decision
      supabase
        .from('user_duplicate_candidates')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),

      // Follow-ups: open callbacks due today or overdue
      supabase
        .from('crm_follow_ups')
        .select('callback_id', { count: 'exact', head: true })
        .lt('due_at', endOfTodayIst.toISOString()),

      // Lifecycle: open suggestions from the daily rules
      supabase
        .from('lifecycle_suggestions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
      supabase.from('job_applications').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('status', 'unread'),
      supabase.from('admin_notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
    ]);

    return normalizeBadgeCounts({
      leads: leads.count ?? 0,
      students: students.count ?? 0,
      demo_classes: demos.count ?? 0,
      support_tickets: tickets.count ?? 0,
      app_feedback: feedback.count ?? 0,
      qa_moderation: qa.count ?? 0,
      payments: payments.count ?? 0,
      chat_history: chatHistory.count ?? 0,
      duplicates: duplicates.count ?? 0,
      follow_ups: followUps.count ?? 0,
      lifecycle: lifecycle.count ?? 0,
      careers: careers.count ?? 0,
      messages_unread: messages.count ?? 0,
      notifications_unread: notifications.count ?? 0,
    });
  } catch (err) {
    console.error('Error fetching admin badge counts:', err);
    return { ...ZERO_BADGES };
  }
}
