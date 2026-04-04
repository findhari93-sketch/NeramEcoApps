/**
 * Neram Classes - Microsoft Teams Incoming Webhook Service
 *
 * Sends Adaptive Cards to a Teams channel via an Incoming Webhook URL.
 *
 * Setup:
 * 1. In Teams → select a channel → Manage channel → Connectors
 * 2. Add "Incoming Webhook" → configure name/icon → copy the webhook URL
 * 3. Add to .env.local: TEAMS_WEBHOOK_URL=<webhook-url>
 */

import type { NotificationEvent } from '../types';

/**
 * Send an Adaptive Card to the configured Teams channel for the given event.
 * Returns gracefully if Teams webhook is not configured.
 */
export async function sendTeamsWebhook(
  event: NotificationEvent
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) {
    return { success: true }; // Not configured — skip silently
  }

  const card = buildAdaptiveCard(event);
  if (!card) {
    // Unsupported event type — skip silently
    return { success: true };
  }

  try {
    // 10-second timeout to prevent Vercel function hangs
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const errorMsg = errorText || `HTTP ${response.status}`;
      console.error('[Teams] Webhook error:', errorMsg, { status: response.status });
      return { success: false, error: errorMsg };
    }

    console.log('[Teams] Adaptive Card sent successfully');
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    console.error('[Teams] Service error:', isTimeout ? 'Request timed out (10s)' : errorMsg);
    return { success: false, error: isTimeout ? 'Request timed out' : errorMsg };
  }
}

/**
 * Check if Teams webhook is configured
 */
export function isTeamsWebhookConfigured(): boolean {
  return !!process.env.TEAMS_WEBHOOK_URL;
}

// ============================================
// ADAPTIVE CARD BUILDER
// ============================================

interface AdaptiveCardPayload {
  type: string;
  attachments: Array<{
    contentType: string;
    contentUrl: null;
    content: {
      $schema: string;
      type: string;
      version: string;
      body: Array<Record<string, unknown>>;
      actions?: Array<Record<string, unknown>>;
    };
  }>;
}

/**
 * Build an Adaptive Card payload for a Teams webhook.
 * Returns null for unsupported event types.
 */
function buildAdaptiveCard(event: NotificationEvent): AdaptiveCardPayload | null {
  const data = event.data;
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.neramclasses.com';

  let title: string;
  let facts: Array<{ title: string; value: string }>;
  let actionUrl: string;
  let actionTitle: string;

  switch (event.type) {
    case 'new_application':
      title = 'New Application Received';
      facts = [
        { title: 'Student', value: String(data.user_name || data.userName || 'Unknown') },
        { title: 'Course', value: String(data.course || 'N/A') },
        { title: 'Phone', value: String(data.phone || 'N/A') },
        { title: 'City', value: String(data.city || 'N/A') },
      ];
      actionUrl = `${adminUrl}/crm`;
      actionTitle = 'View in CRM';
      break;

    case 'payment_received':
      title = 'Payment Received';
      facts = [
        { title: 'Student', value: String(data.user_name || data.userName || 'Unknown') },
        { title: 'Amount', value: `Rs. ${data.amount || 0}` },
        { title: 'Method', value: String(data.method || 'Unknown') },
        { title: 'Receipt', value: String(data.receipt_number || data.receiptNumber || 'N/A') },
      ];
      actionUrl = `${adminUrl}/payments`;
      actionTitle = 'View Payments';
      break;

    case 'application_approved':
      title = 'Application Approved';
      facts = [
        { title: 'Student', value: String(data.user_name || data.userName || 'Unknown') },
        { title: 'Course', value: String(data.course || 'N/A') },
        { title: 'Fee', value: `Rs. ${data.final_fee || data.finalFee || 0}` },
      ];
      actionUrl = `${adminUrl}/crm`;
      actionTitle = 'View in CRM';
      break;

    case 'new_callback':
      title = 'Callback Requested';
      facts = [
        { title: 'Name', value: String(data.user_name || data.userName || 'Unknown') },
        { title: 'Phone', value: String(data.phone || 'N/A') },
        { title: 'Preferred Slot', value: String(data.preferred_slot || data.preferredSlot || 'N/A') },
      ];
      actionUrl = `${adminUrl}/callbacks`;
      actionTitle = 'View Callbacks';
      break;

    case 'scholarship_submitted':
      title = 'Scholarship Docs Submitted';
      facts = [
        { title: 'Student', value: String(data.user_name || data.userName || 'Unknown') },
        { title: 'Phone', value: String(data.phone || 'N/A') },
        { title: 'Application', value: String(data.application_number || data.applicationNumber || 'N/A') },
      ];
      actionUrl = `${adminUrl}/crm`;
      actionTitle = 'Review in CRM';
      break;

    case 'refund_requested':
      title = 'Refund Requested';
      facts = [
        { title: 'Student', value: String(data.user_name || data.userName || 'Unknown') },
        { title: 'Amount', value: `Rs. ${data.refund_amount || data.refundAmount || 0}` },
        { title: 'Reason', value: String(data.reason_for_discontinuing || data.reasonForDiscontinuing || 'Not specified') },
      ];
      actionUrl = `${adminUrl}/crm`;
      actionTitle = 'Review Refund';
      break;

    default:
      return null;
  }

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              size: 'Medium',
              weight: 'Bolder',
              text: title,
            },
            {
              type: 'FactSet',
              facts: facts.map((f) => ({ title: f.title, value: f.value })),
            },
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: actionTitle,
              url: actionUrl,
            },
          ],
        },
      },
    ],
  };
}
