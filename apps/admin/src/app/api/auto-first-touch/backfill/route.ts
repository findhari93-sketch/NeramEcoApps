// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * POST /api/auto-first-touch/backfill
 *
 * Schedules first-touch messages for all existing uncontacted leads.
 * - user_type = 'lead' only (excludes students, teachers, admins)
 * - Tamil Nadu leads → video template (Tamil video)
 * - Other states / unknown → text-only template
 * - Phone leads → WhatsApp, email-only leads → Email
 * - Staggered send_after (2 min apart) to avoid WhatsApp rate limits
 */

import { NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getLeadsWithoutFirstTouch,
  createAutoMessage,
} from '@neram/database';

const TAMIL_NADU_VARIANTS = ['tamil nadu', 'tamilnadu', 'tn'];
const VIDEO_TEMPLATES = ['first_touch_results_video'];
const NON_TN_TEMPLATE = 'first_touch_english_intro';

function isTamilNadu(state: string | null): boolean {
  if (!state) return false;
  return TAMIL_NADU_VARIANTS.includes(state.toLowerCase().trim());
}

function pickTemplate(state: string | null): string {
  if (isTamilNadu(state)) {
    // Random video template for TN leads
    return VIDEO_TEMPLATES[Math.floor(Math.random() * VIDEO_TEMPLATES.length)];
  }
  // English video template for other states or unknown
  return NON_TN_TEMPLATE;
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdminClient();

    // Get all leads who haven't received a first-touch yet
    const leads = await getLeadsWithoutFirstTouch(supabase);

    if (leads.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No uncontacted leads found',
        scheduled: 0,
      });
    }

    let whatsappCount = 0;
    let emailCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    const now = Date.now();
    const STAGGER_MS = 2 * 60 * 1000; // 2 minutes between each message

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];

      try {
        const channel = lead.phone ? 'whatsapp' : (lead.email ? 'email' : null);

        if (!channel) {
          skippedCount++;
          continue;
        }

        const templateName = channel === 'whatsapp'
          ? pickTemplate(lead.state)
          : 'first_touch_quick_question'; // Email always uses text template

        const sendAfter = new Date(now + (i * STAGGER_MS)).toISOString();

        await createAutoMessage({
          user_id: lead.id,
          message_type: 'first_touch',
          channel,
          template_name: templateName,
          send_after: sendAfter,
          metadata: {
            user_name: lead.name || null,
            phone: lead.phone || null,
            email: lead.email || null,
            state: lead.state || null,
            source: 'backfill',
          },
        }, supabase);

        if (channel === 'whatsapp') whatsappCount++;
        else emailCount++;

      } catch (err: any) {
        // Skip duplicates silently (unique index)
        if (err?.code !== '23505') {
          errors.push(`${lead.id}: ${err.message}`);
        }
      }
    }

    const totalScheduled = whatsappCount + emailCount;
    const estimatedMinutes = Math.ceil(totalScheduled * 2); // 2 min stagger

    return NextResponse.json({
      success: true,
      total_leads: leads.length,
      scheduled: totalScheduled,
      whatsapp: whatsappCount,
      email: emailCount,
      skipped: skippedCount,
      estimated_completion_minutes: estimatedMinutes,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Backfill error:', error);
    return NextResponse.json(
      { error: 'Failed to backfill first-touch messages' },
      { status: 500 }
    );
  }
}
