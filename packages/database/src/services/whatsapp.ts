/**
 * Neram Classes - WhatsApp Cloud API Service
 *
 * Sends notifications to users via Meta WhatsApp Cloud API.
 * Uses pre-approved template messages.
 *
 * Setup:
 * 1. Go to Meta Business Manager → WhatsApp → Getting Started
 * 2. Create a WhatsApp Business App
 * 3. Set up a phone number and get the Phone Number ID
 * 4. Generate a permanent System User token (or use temporary token for testing)
 * 5. Create message templates and get them approved
 * 6. Add to .env.local: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN
 */

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v21.0';

function getPhoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID environment variable is not set');
  }
  return id;
}

function getAccessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    throw new Error('WHATSAPP_ACCESS_TOKEN environment variable is not set');
  }
  return token;
}

/**
 * Check if WhatsApp is configured
 */
export function isWhatsAppConfigured(): boolean {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

// ============================================
// TYPES
// ============================================

interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'url' | 'quick_reply';
  index?: string;
  parameters: Array<{
    type: 'text' | 'currency' | 'date_time' | 'image' | 'document';
    text?: string;
  }>;
}

interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================
// CORE API
// ============================================

/**
 * Send a template message via WhatsApp Cloud API
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string = 'en',
  components?: TemplateComponent[]
): Promise<WhatsAppSendResult> {
  try {
    const phoneNumberId = getPhoneNumberId();
    const accessToken = getAccessToken();

    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: normalizePhone(to),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components && components.length > 0 ? { components } : {}),
      },
    };

    const response = await fetch(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = (data as any)?.error?.message || `HTTP ${response.status}`;
      console.error('WhatsApp API error:', errorMsg);
      return { success: false, error: errorMsg };
    }

    const messageId = (data as any)?.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('WhatsApp service error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Send a free-form text message via WhatsApp Cloud API
 * Used for replying to contact messages (not a template).
 * Note: Business-initiated conversations require the user to have
 * messaged within the last 24 hours, or this will open a new conversation.
 */
export async function sendWhatsAppTextMessage(
  to: string,
  text: string
): Promise<WhatsAppSendResult> {
  try {
    const phoneNumberId = getPhoneNumberId();
    const accessToken = getAccessToken();

    const body = {
      messaging_product: 'whatsapp',
      to: normalizePhone(to),
      type: 'text',
      text: { body: text },
    };

    const response = await fetch(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      const errorMsg = result?.error?.message || `WhatsApp API error (${response.status})`;
      console.error('WhatsApp text send error:', result);
      return { success: false, error: errorMsg };
    }

    return {
      success: true,
      messageId: result?.messages?.[0]?.id,
    };
  } catch (err: any) {
    console.error('WhatsApp text send exception:', err);
    return { success: false, error: err.message || 'Failed to send WhatsApp message' };
  }
}

/**
 * Check if WhatsApp replies are enabled
 */
export function isWhatsAppRepliesEnabled(): boolean {
  return process.env.WHATSAPP_REPLIES_ENABLED === 'true' && isWhatsAppConfigured();
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Send application submitted confirmation to user
 *
 * Template: application_submitted
 * Body parameters: {{1}} = userName, {{2}} = applicationNumber, {{3}} = course
 * Button parameter: {{1}} = applicationNumber (for dynamic URL: neramclasses.com/apply?app={{1}})
 */
export async function sendApplicationConfirmation(
  phone: string,
  data: {
    userName: string;
    applicationNumber: string;
    course: string;
  }
): Promise<WhatsAppSendResult> {
  return sendWhatsAppTemplate(phone, 'application_submitted', 'en', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: data.userName },
        { type: 'text', text: data.applicationNumber },
        { type: 'text', text: data.course },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [
        { type: 'text', text: data.applicationNumber },
      ],
    },
  ]);
}

/**
 * Send application approved notification to user
 *
 * Template: application_approved
 * Body parameters: {{1}} = userName, {{2}} = applicationNumber, {{3}} = finalFee
 * Button parameter: {{1}} = applicationNumber (for dynamic URL: neramclasses.com/pay?app={{1}})
 */
export async function sendApplicationApproved(
  phone: string,
  data: {
    userName: string;
    applicationNumber: string;
    finalFee?: number;
    fullPaymentDiscount?: number;
    paymentLink?: string;
  }
): Promise<WhatsAppSendResult> {
  const bodyParameters: Array<{ type: 'text'; text: string }> = [
    { type: 'text', text: data.userName },
    { type: 'text', text: data.applicationNumber },
  ];

  if (data.finalFee) {
    bodyParameters.push({ type: 'text', text: `Rs. ${data.finalFee.toLocaleString('en-IN')}` });
  }

  return sendWhatsAppTemplate(phone, 'application_approved', 'en', [
    {
      type: 'body',
      parameters: bodyParameters,
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [
        { type: 'text', text: data.applicationNumber },
      ],
    },
  ]);
}

/**
 * Send scholarship available notification to student
 *
 * Template: scholarship_available
 * Body parameters: {{1}} = userName
 */
export async function sendScholarshipAvailableNotification(
  phone: string,
  data: { userName: string }
): Promise<WhatsAppSendResult> {
  return sendWhatsAppTemplate(phone, 'scholarship_available', 'en', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: data.userName },
      ],
    },
  ]);
}

/**
 * Send scholarship approved notification to student
 *
 * Template: scholarship_approved
 * Body parameters: {{1}} = userName, {{2}} = approvedFee
 */
export async function sendScholarshipApprovedNotification(
  phone: string,
  data: { userName: string; approvedFee: number }
): Promise<WhatsAppSendResult> {
  return sendWhatsAppTemplate(phone, 'scholarship_approved', 'en', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: data.userName },
        { type: 'text', text: `Rs. ${data.approvedFee}` },
      ],
    },
  ]);
}

/**
 * Send scholarship rejected notification to student
 *
 * Template: scholarship_rejected
 * Body parameters: {{1}} = userName
 */
export async function sendScholarshipRejectedNotification(
  phone: string,
  data: { userName: string }
): Promise<WhatsAppSendResult> {
  return sendWhatsAppTemplate(phone, 'scholarship_rejected', 'en', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: data.userName },
      ],
    },
  ]);
}

/**
 * Send refund approved notification to student
 *
 * Template: refund_approved
 * Body parameters: {{1}} = userName, {{2}} = refundAmount
 */
export async function sendRefundApprovedNotification(
  phone: string,
  data: { userName: string; refundAmount: number }
): Promise<WhatsAppSendResult> {
  return sendWhatsAppTemplate(phone, 'refund_approved', 'en', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: data.userName },
        { type: 'text', text: `Rs. ${data.refundAmount.toLocaleString('en-IN')}` },
      ],
    },
  ]);
}

/**
 * Send payment confirmation notification to student
 *
 * Template: payment_confirmed
 * Body parameters: {{1}} = userName, {{2}} = amount, {{3}} = receiptNumber, {{4}} = courseName
 */
export async function sendPaymentConfirmation(
  phone: string,
  data: {
    userName: string;
    amount: string;
    receiptNumber: string;
    courseName: string;
  }
): Promise<WhatsAppSendResult> {
  return sendWhatsAppTemplate(phone, 'payment_confirmed', 'en', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: data.userName },
        { type: 'text', text: data.amount },
        { type: 'text', text: data.receiptNumber },
        { type: 'text', text: data.courseName },
      ],
    },
  ]);
}

/**
 * Send refund rejected notification to student
 *
 * Template: refund_rejected
 * Body parameters: {{1}} = userName, {{2}} = reason
 */
export async function sendRefundRejectedNotification(
  phone: string,
  data: { userName: string; reason: string }
): Promise<WhatsAppSendResult> {
  return sendWhatsAppTemplate(phone, 'refund_rejected', 'en', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: data.userName },
        { type: 'text', text: data.reason },
      ],
    },
  ]);
}

// ============================================
// SUPPORT TICKETS
// ============================================

/**
 * Send ticket confirmation notification to user
 *
 * Template: support_ticket_confirmation
 * Header: static text "Neram Classes Support" (no variables)
 * Body parameters: {{1}} = userName, {{2}} = ticketNumber, {{3}} = subject
 * Footer: static text (no variables)
 * Button[0]: URL with dynamic suffix {{1}} = ticketNumber
 */
export async function sendTicketConfirmation(
  phone: string,
  data: {
    userName: string;
    ticketNumber: string;
    subject: string;
  }
): Promise<WhatsAppSendResult> {
  return sendWhatsAppTemplate(phone, 'support_ticket_confirmation', 'en', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: data.userName },
        { type: 'text', text: data.ticketNumber },
        { type: 'text', text: data.subject },
      ],
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [
        { type: 'text', text: data.ticketNumber },
      ],
    },
  ]);
}

// ============================================
// DEMO CLASS
// ============================================

/**
 * Send demo class approval confirmation to user
 *
 * Template: demo_class_approved
 * Body parameters: {{1}} = userName, {{2}} = date, {{3}} = time, {{4}} = meetingLink/details
 */
export async function sendDemoClassApproved(
  phone: string,
  data: {
    userName: string;
    date: string;
    time: string;
    details: string;
  }
): Promise<WhatsAppSendResult> {
  return sendWhatsAppTemplate(phone, 'demo_class_approved', 'en', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: data.userName },
        { type: 'text', text: data.date },
        { type: 'text', text: data.time },
        { type: 'text', text: data.details },
      ],
    },
  ]);
}

/**
 * Send demo class day-of reminder to user
 *
 * Template: demo_class_reminder
 * Body parameters: {{1}} = userName, {{2}} = time, {{3}} = meetingLink/details
 */
export async function sendDemoClassReminder(
  phone: string,
  data: {
    userName: string;
    time: string;
    details: string;
  }
): Promise<WhatsAppSendResult> {
  return sendWhatsAppTemplate(phone, 'demo_class_reminder', 'en', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: data.userName },
        { type: 'text', text: data.time },
        { type: 'text', text: data.details },
      ],
    },
  ]);
}

// ============================================
// FIRST-TOUCH AUTO MESSAGES
// ============================================

/**
 * Send first-touch: Template A — Quick Question (text only)
 *
 * Meta template: first_touch_quick_question
 * Body: {{1}} = userName
 */
export async function sendFirstTouchQuickQuestion(
  phone: string,
  data: { userName: string }
): Promise<WhatsAppSendResult> {
  return sendWhatsAppTemplate(phone, 'first_touch_quick_question', 'en', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: data.userName },
      ],
    },
  ]);
}

/**
 * Send first-touch: Template B — Student Results Video
 *
 * Meta template: first_touch_results_video
 * Video is baked into the Meta template (uploaded in editor), no URL needed at send time.
 * Body: {{1}} = userName
 */
export async function sendFirstTouchResultsVideo(
  phone: string,
  data: { userName: string }
): Promise<WhatsAppSendResult> {
  return sendWhatsAppTemplate(phone, 'first_touch_results_video', 'en', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: data.userName },
      ],
    },
  ]);
}

/**
 * Send first-touch: English Intro (for non-Tamil Nadu leads)
 *
 * Meta template: first_touch_english_intro
 * Video is baked into the Meta template (Q paper discussion in English).
 * Body: {{1}} = userName
 */
export async function sendFirstTouchEnglishIntro(
  phone: string,
  data: { userName: string }
): Promise<WhatsAppSendResult> {
  return sendWhatsAppTemplate(phone, 'first_touch_english_intro', 'en', [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: data.userName },
      ],
    },
  ]);
}

// ============================================
// HELPERS
// ============================================

/**
 * Normalize phone number to E.164 format (without +)
 *
 * Accepts: "+919876543210", "919876543210", "9876543210" (assumes India)
 * Returns: "919876543210"
 */
function normalizePhone(phone: string): string {
  // Strip all non-digits
  let cleaned = phone.replace(/\D/g, '');

  // If 10 digits starting with 6-9, assume Indian number
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    cleaned = '91' + cleaned;
  }

  return cleaned;
}
