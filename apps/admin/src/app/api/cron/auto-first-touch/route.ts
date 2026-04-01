// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/auto-first-touch
 *
 * Cron endpoint: processes pending auto first-touch messages.
 * Sends WhatsApp (for users with phone) or email (for Google-only users).
 *
 * Called every 15 minutes by Supabase pg_cron via pg_net,
 * or manually via curl for testing.
 */

import { NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getPendingAutoMessages,
  getFailedAutoMessages,
  updateAutoMessageResult,
  sendFirstTouchQuickQuestion,
  sendFirstTouchResultsVideo,
  sendFirstTouchEnglishIntro,
  sendFirstTouchEmail,
  isWhatsAppConfigured,
  dispatchNotification,
} from '@neram/database';

import type { AutoFirstTouchSettings } from '@neram/database';

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();

    // Check if auto first-touch is enabled
    const { data: settingsRow } = await (supabase as any)
      .from('site_settings')
      .select('value')
      .eq('key', 'auto_first_touch')
      .single();

    const settings: AutoFirstTouchSettings = settingsRow?.value ?? { enabled: false };

    if (!settings.enabled) {
      return NextResponse.json({ message: 'Auto first-touch disabled', processed: 0 });
    }

    // Get pending messages ready to send
    const pendingMessages = await getPendingAutoMessages(supabase);

    // Also retry failed messages (max 3 retries, within 24h)
    const failedMessages = await getFailedAutoMessages(3, supabase);

    const allMessages = [...pendingMessages, ...failedMessages];

    if (allMessages.length === 0) {
      return NextResponse.json({ message: 'No pending messages', processed: 0 });
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const msg of allMessages) {
      try {
        const userName = (msg.metadata as any)?.user_name || msg.user_name || 'there';
        let result: { success: boolean; messageId?: string; error?: string };

        if (msg.channel === 'whatsapp') {
          const phone = (msg.metadata as any)?.phone || msg.user_phone;

          if (!phone) {
            await updateAutoMessageResult(msg.id, {
              success: false,
              error: 'No phone number available',
            }, supabase);
            failed++;
            continue;
          }

          if (!isWhatsAppConfigured()) {
            await updateAutoMessageResult(msg.id, {
              success: false,
              error: 'WhatsApp not configured',
            }, supabase);
            failed++;
            continue;
          }

          // Route to the correct template send function
          // Videos are baked into Meta templates (uploaded in editor), no URL needed
          switch (msg.template_name) {
            case 'first_touch_results_video':
              result = await sendFirstTouchResultsVideo(phone, { userName });
              break;
            case 'first_touch_english_intro':
              result = await sendFirstTouchEnglishIntro(phone, { userName });
              break;
            case 'first_touch_quick_question':
            default:
              result = await sendFirstTouchQuickQuestion(phone, { userName });
              break;
          }
        } else {
          // Email channel
          const email = (msg.metadata as any)?.email || msg.user_email;

          if (!email) {
            await updateAutoMessageResult(msg.id, {
              success: false,
              error: 'No email address available',
            }, supabase);
            failed++;
            continue;
          }

          if (!settings.email_enabled) {
            await updateAutoMessageResult(msg.id, {
              success: false,
              error: 'Email first-touch disabled',
            }, supabase);
            failed++;
            continue;
          }

          result = await sendFirstTouchEmail(email, { userName });
        }

        // Update the record
        await updateAutoMessageResult(msg.id, {
          success: result.success,
          externalMessageId: result.messageId,
          error: result.error,
        }, supabase);

        if (result.success) {
          sent++;

          // Notify admin team
          try {
            await dispatchNotification({
              type: 'auto_first_touch_sent',
              title: 'Auto First-Touch Sent',
              message: `${msg.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} welcome sent to ${userName} (${msg.channel === 'whatsapp' ? (msg.metadata as any)?.phone : (msg.metadata as any)?.email})`,
              data: {
                user_id: msg.user_id,
                user_name: userName,
                channel: msg.channel,
                template_name: msg.template_name,
              },
            });
          } catch {
            // Don't fail the cron if notification dispatch fails
          }
        } else {
          failed++;
          errors.push(`${msg.id}: ${result.error}`);
        }

        // Small delay between sends to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err: any) {
        console.error(`Failed to process auto message ${msg.id}:`, err);
        failed++;
        errors.push(`${msg.id}: ${err.message}`);

        try {
          await updateAutoMessageResult(msg.id, {
            success: false,
            error: err.message,
          }, supabase);
        } catch {
          // best effort
        }
      }
    }

    return NextResponse.json({
      success: true,
      total: allMessages.length,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Cron auto-first-touch error:', error);
    return NextResponse.json(
      { error: 'Failed to process auto first-touch messages' },
      { status: 500 }
    );
  }
}
