// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

const ZERO_COUNTS = {
  leads: 0,
  students: 0,
  demo_classes: 0,
  support_tickets: 0,
  app_feedback: 0,
  qa_moderation: 0,
  payments: 0,
};

// GET /api/admin-badges - Get action-required badge counts for sidebar menu items
export async function GET() {
  try {
    const supabase = createAdminClient();

    const [leads, students, demos, tickets, feedback, qa, payments] = await Promise.all([
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
    ]);

    return NextResponse.json({
      leads: leads.count ?? 0,
      students: students.count ?? 0,
      demo_classes: demos.count ?? 0,
      support_tickets: tickets.count ?? 0,
      app_feedback: feedback.count ?? 0,
      qa_moderation: qa.count ?? 0,
      payments: payments.count ?? 0,
    });
  } catch (err) {
    console.error('Error fetching admin badge counts:', err);
    return NextResponse.json(ZERO_COUNTS);
  }
}
