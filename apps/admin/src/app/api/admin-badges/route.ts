// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { countStuckPhonePeople, createAdminClient, istDayBounds } from '@neram/database';
import { ZERO_BADGES, badgeWindow, normalizeBadgeCounts, collectionsBadgeCount, demoBadgeQuery, istTodayKey } from '@/lib/admin-badges';
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
    const [{ data, error }, reviewQueue, collections, phoneStuck, paymentsToVerify, demosToCall] = await Promise.all([
      supabase.rpc('admin_badge_counts', {
        p_chat_since: chatSince,
        p_follow_up_before: followUpBefore,
      }),
      countReviewQueue(supabase),
      countCollections(supabase),
      countStuckPhonePeople({ days: 7 }, supabase),
      countPaymentsToVerify(supabase),
      countDemosToCall(supabase),
    ]);
    if (error) throw error;
    // Aintra Inbox: the badge is the Review queue (wrong or unanswered, not yet
    // corrected), the same number as the page's header button.
    const counts = normalizeBadgeCounts(data);
    if (reviewQueue !== null) counts.chat_history = reviewQueue;
    counts.collections = collections;
    // Stuck at phone sign-in: people with no progress for 10 minutes in the
    // last 7 days, not marked done. Same rule as the phone-stuck alert.
    counts.phone_stuck = phoneStuck ?? 0;
    // Direct Enroll: student-pays links where the student sent a UTR that
    // staff have not verified or rejected yet.
    counts.direct_enrollment = paymentsToVerify;
    // Demo Classes: the desk's calls to make (see demoBadgeQuery). The SQL
    // function still counts every pending row, old v1 registrations included.
    counts.demo_classes = demosToCall;
    return NextResponse.json(counts, { headers: NO_STORE });
  } catch (rpcErr) {
    // The function ships in a migration; until it is applied in an environment,
    // fall back to the old per-table counts so the sidebar never goes blank.
    console.warn('[admin-badges] RPC unavailable, using per-table counts:', (rpcErr as any)?.message);
    const counts = await legacyCounts(supabase);
    counts.collections = await countCollections(supabase);
    counts.phone_stuck = (await countStuckPhonePeople({ days: 7 }, supabase)) ?? 0;
    counts.direct_enrollment = await countPaymentsToVerify(supabase);
    counts.demo_classes = await countDemosToCall(supabase);
    return NextResponse.json(counts, { headers: NO_STORE });
  }
}

/** Demo desk requests waiting on a call: new, or back from Try later. 0 on any error. */
async function countDemosToCall(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  try {
    const { since, statusFilter } = demoBadgeQuery();
    const { count, error } = await supabase
      .from('demo_class_registrations')
      .select('id', { count: 'exact', head: true })
      .not('ref_code', 'is', null)
      .gte('created_at', since)
      .or(statusFilter);
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

/** Student-pays links with a submitted payment waiting for staff. 0 on any error. */
async function countPaymentsToVerify(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('direct_enrollment_links')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'payment_submitted');
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Collections: open fee reports from students, unpaid installments due today or
 * earlier (IST), and balance payments from the pay balance page waiting to be
 * verified (fee_payment_claims, status pending). Head counts kept outside the
 * SQL function so the badge works before any migration to admin_badge_counts.
 * A failed count is 0 and never hides the others.
 */
async function countCollections(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  try {
    const [reports, due, claims] = await Promise.all([
      supabase.from('fee_correction_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase
        .from('payment_installments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lte('due_date', istTodayKey()),
      supabase.from('fee_payment_claims').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    return collectionsBadgeCount(
      reports.error ? 0 : reports.count,
      due.error ? 0 : due.count,
      claims.error ? 0 : claims.count,
    );
  } catch {
    return 0;
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
