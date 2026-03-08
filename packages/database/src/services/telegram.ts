/**
 * Neram Classes - Telegram Bot Service
 *
 * Sends notifications to a Telegram group/channel via the Bot API.
 *
 * Setup:
 * 1. Open Telegram → search @BotFather → /newbot → name it "Neram Notifications Bot"
 * 2. Copy the bot token
 * 3. Create a Telegram group → add the bot → make it admin
 * 4. Get chat ID: POST a message, then visit https://api.telegram.org/bot{TOKEN}/getUpdates
 * 5. Add to .env.local: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
  }
  return token;
}

function getChatId(): string {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    throw new Error('TELEGRAM_CHAT_ID environment variable is not set');
  }
  return chatId;
}

/**
 * Send a message to the configured Telegram group/channel
 */
export async function sendTelegramMessage(
  message: string,
  options: { parseMode?: 'HTML' | 'Markdown' } = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getBotToken();
    const chatId = getChatId();
    const parseMode = options.parseMode || 'HTML';

    // 10-second timeout to prevent Vercel function hangs
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: parseMode,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = (errorData as any)?.description || `HTTP ${response.status}`;
      console.error('[Telegram] API error:', errorMsg, { status: response.status });
      return { success: false, error: errorMsg };
    }

    console.log('[Telegram] Message sent successfully');
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    console.error('[Telegram] Service error:', isTimeout ? 'Request timed out (10s)' : errorMsg);
    return { success: false, error: isTimeout ? 'Request timed out' : errorMsg };
  }
}

/**
 * Check if Telegram is configured
 */
export function isTelegramConfigured(): boolean {
  const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
  const hasChatId = !!process.env.TELEGRAM_CHAT_ID;
  if (!hasToken || !hasChatId) {
    console.warn('[Telegram] Not configured:', { hasToken, hasChatId });
  }
  return hasToken && hasChatId;
}

// ============================================
// MESSAGE FORMATTERS
// ============================================

export interface OnboardingNotificationData {
  userName: string;
  phone: string;
  examInterest?: string;
  educationStage?: string;
  referralSource?: string;
  sourceApp: string;
}

export interface ApplicationNotificationData {
  userName: string;
  phone: string;
  course: string;
  schoolName?: string;
  city?: string;
  state?: string;
  applicationNumber?: string;
}

export interface PaymentNotificationData {
  userName: string;
  amount: number;
  method: string;
  paymentId?: string;
}

export interface ScholarshipNotificationData {
  userName: string;
  phone: string;
  schoolName?: string;
  applicationNumber?: string;
  scholarshipStatus?: string;
  approvedFee?: number;
  revisionNotes?: string;
}

/**
 * Format new onboarding notification
 */
export function formatOnboardingMessage(data: OnboardingNotificationData): string {
  const lines = [
    '<b>New User Onboarded</b>',
    '',
    `<b>Name:</b> ${escapeHtml(data.userName)}`,
    `<b>Phone:</b> ${escapeHtml(data.phone)}`,
  ];

  if (data.examInterest) {
    lines.push(`<b>Interested in:</b> ${escapeHtml(data.examInterest)}`);
  }
  if (data.educationStage) {
    lines.push(`<b>Stage:</b> ${escapeHtml(data.educationStage)}`);
  }
  if (data.referralSource) {
    lines.push(`<b>Found via:</b> ${escapeHtml(data.referralSource)}`);
  }
  lines.push(`<b>Source:</b> ${escapeHtml(data.sourceApp)}`);

  return lines.join('\n');
}

/**
 * Format onboarding skipped notification
 */
export function formatOnboardingSkippedMessage(userName: string, phone: string): string {
  return [
    '<b>User Skipped Onboarding</b>',
    '',
    `<b>Name:</b> ${escapeHtml(userName)}`,
    `<b>Phone:</b> ${escapeHtml(phone)}`,
  ].join('\n');
}

/**
 * Format new application notification
 */
export function formatApplicationMessage(data: ApplicationNotificationData): string {
  const lines = [
    '<b>New Application</b>',
    '',
    `<b>Name:</b> ${escapeHtml(data.userName)}`,
    `<b>Phone:</b> ${escapeHtml(data.phone)}`,
    `<b>Course:</b> ${escapeHtml(data.course)}`,
  ];

  if (data.schoolName) {
    lines.push(`<b>School:</b> ${escapeHtml(data.schoolName)}`);
  }
  if (data.city || data.state) {
    lines.push(`<b>Location:</b> ${escapeHtml([data.city, data.state].filter(Boolean).join(', '))}`);
  }
  if (data.applicationNumber) {
    lines.push(`<b>Application #:</b> ${escapeHtml(data.applicationNumber)}`);
  }

  return lines.join('\n');
}

/**
 * Format payment received notification
 */
export function formatPaymentMessage(data: PaymentNotificationData): string {
  const lines = [
    '<b>Payment Received</b>',
    '',
    `<b>Name:</b> ${escapeHtml(data.userName)}`,
    `<b>Amount:</b> Rs. ${data.amount}`,
    `<b>Method:</b> ${escapeHtml(data.method)}`,
  ];

  if (data.paymentId) {
    lines.push(`<b>Payment ID:</b> ${escapeHtml(data.paymentId)}`);
  }

  return lines.join('\n');
}

/**
 * Format scholarship submitted notification (for admin)
 */
export function formatScholarshipSubmittedMessage(data: ScholarshipNotificationData): string {
  const lines = [
    '<b>Scholarship Documents Submitted</b>',
    '',
    `<b>Name:</b> ${escapeHtml(data.userName)}`,
    `<b>Phone:</b> ${escapeHtml(data.phone)}`,
  ];

  if (data.schoolName) {
    lines.push(`<b>School:</b> ${escapeHtml(data.schoolName)}`);
  }
  if (data.applicationNumber) {
    lines.push(`<b>Application #:</b> ${escapeHtml(data.applicationNumber)}`);
  }

  lines.push('', '<i>Review required in admin panel</i>');
  return lines.join('\n');
}

/**
 * Format scholarship approved notification (for tracking)
 */
export function formatScholarshipApprovedMessage(data: ScholarshipNotificationData): string {
  const lines = [
    '<b>Scholarship Approved</b>',
    '',
    `<b>Name:</b> ${escapeHtml(data.userName)}`,
    `<b>Phone:</b> ${escapeHtml(data.phone)}`,
  ];

  if (data.approvedFee !== undefined) {
    lines.push(`<b>Approved Fee:</b> Rs. ${data.approvedFee}`);
  }
  if (data.applicationNumber) {
    lines.push(`<b>Application #:</b> ${escapeHtml(data.applicationNumber)}`);
  }

  return lines.join('\n');
}

/**
 * Format scholarship rejected notification (for tracking)
 */
export function formatScholarshipRejectedMessage(data: ScholarshipNotificationData): string {
  return [
    '<b>Scholarship Rejected</b>',
    '',
    `<b>Name:</b> ${escapeHtml(data.userName)}`,
    `<b>Phone:</b> ${escapeHtml(data.phone)}`,
  ].join('\n');
}

// ============================================
// CALLBACK NOTIFICATION
// ============================================

export interface CallbackNotificationData {
  userName: string;
  phone: string;
  preferredSlot?: string;
  preferredDate?: string;
  courseInterest?: string;
  notes?: string;
}

/**
 * Format callback request notification
 */
export function formatCallbackRequestMessage(data: CallbackNotificationData): string {
  const lines = [
    '<b>New Callback Request</b>',
    '',
    `<b>Name:</b> ${escapeHtml(data.userName)}`,
    `<b>Phone:</b> ${escapeHtml(data.phone)}`,
  ];

  if (data.preferredSlot) {
    lines.push(`<b>Preferred Time:</b> ${escapeHtml(data.preferredSlot)}`);
  }
  if (data.preferredDate) {
    lines.push(`<b>Preferred Date:</b> ${escapeHtml(data.preferredDate)}`);
  }
  if (data.courseInterest) {
    lines.push(`<b>Course Interest:</b> ${escapeHtml(data.courseInterest)}`);
  }
  if (data.notes) {
    lines.push(`<b>Notes:</b> ${escapeHtml(data.notes)}`);
  }

  lines.push('', '<i>Please call back soon</i>');
  return lines.join('\n');
}

export interface ContactMessageNotificationData {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  source?: string;
}

/**
 * Format contact message notification
 */
export function formatContactMessageNotification(data: ContactMessageNotificationData): string {
  const lines = [
    '<b>New Contact Message</b>',
    '',
    `<b>Name:</b> ${escapeHtml(data.name)}`,
    `<b>Email:</b> ${escapeHtml(data.email)}`,
  ];

  if (data.phone) {
    lines.push(`<b>Phone:</b> ${escapeHtml(data.phone)}`);
  }

  lines.push(`<b>Subject:</b> ${escapeHtml(data.subject)}`);

  // Truncate long messages
  const messagePreview = data.message.length > 200
    ? data.message.substring(0, 200) + '...'
    : data.message;
  lines.push(`<b>Message:</b> ${escapeHtml(messagePreview)}`);

  if (data.source && data.source !== 'contact_page') {
    lines.push(`<b>Source:</b> ${escapeHtml(data.source)}`);
  }

  lines.push('', '<i>Please respond within 24 hours</i>');
  return lines.join('\n');
}

/**
 * Escape HTML special characters for Telegram
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
