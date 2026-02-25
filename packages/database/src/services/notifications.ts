/**
 * Neram Classes - Unified Notification Dispatcher
 *
 * Dispatches notifications across 5 channels:
 * 1. Telegram Bot (instant team channel notification)
 * 2. Email to active recipients (via Resend)
 * 3. Admin in-app notification (bell icon)
 * 4. WhatsApp to user (via Meta Cloud API)
 * 5. User in-app notification (student bell icon in apps/app & apps/marketing)
 */

import type { NotificationEvent, NotificationEventType } from '../types';
import {
  sendTelegramMessage,
  isTelegramConfigured,
  formatOnboardingMessage,
  formatOnboardingSkippedMessage,
  formatApplicationMessage,
  formatPaymentMessage,
  formatScholarshipSubmittedMessage,
  formatScholarshipApprovedMessage,
  formatScholarshipRejectedMessage,
  type OnboardingNotificationData,
  type ApplicationNotificationData,
  type PaymentNotificationData,
  type ScholarshipNotificationData,
  formatCallbackRequestMessage,
  type CallbackNotificationData,
} from './telegram';
import { sendEmail } from './email';
import {
  getActiveRecipientsForEvent,
  createAdminNotification,
} from '../queries/notifications';
import {
  getEmailTemplate,
  renderEmailTemplate,
} from '../queries/emails';
import {
  isWhatsAppConfigured,
  sendApplicationConfirmation,
  sendApplicationApproved,
  sendScholarshipAvailableNotification,
  sendScholarshipApprovedNotification,
  sendScholarshipRejectedNotification,
  sendRefundApprovedNotification,
  sendRefundRejectedNotification,
} from './whatsapp';
import type { TypedSupabaseClient } from '../client';
import { createUserNotification } from '../queries/user-notifications';

// ============================================
// UNIFIED DISPATCHER
// ============================================

/**
 * Dispatch a notification to all configured channels.
 * Each channel fires independently (non-blocking).
 * Failures in one channel don't block others.
 */
// Events that should create a user-facing in-app notification
// (only events where event.data.user_id identifies the target student)
const USER_NOTIFICATION_EVENTS: Set<NotificationEventType> = new Set([
  'application_approved',
  'payment_received',
  'scholarship_approved',
  'scholarship_rejected',
  'scholarship_opened',
  'scholarship_revision_requested',
  'refund_requested',
  'refund_approved',
  'refund_rejected',
]);

// User-friendly titles (friendlier than admin-facing titles)
const USER_NOTIFICATION_TITLES: Partial<Record<NotificationEventType, string>> = {
  application_approved: 'Application Approved! 🎉',
  payment_received: 'Payment Confirmed ✅',
  scholarship_approved: 'Scholarship Approved! 🎓',
  scholarship_rejected: 'Scholarship Update',
  scholarship_opened: 'Scholarship Available! 📋',
  scholarship_revision_requested: 'Documents Need Revision',
  refund_requested: 'Refund Request Received',
  refund_approved: 'Refund Approved ✅',
  refund_rejected: 'Refund Request Update',
};

export async function dispatchNotification(
  event: NotificationEvent,
  client?: TypedSupabaseClient
): Promise<{
  telegram: { success: boolean; error?: string };
  email: { sent: number; failed: number };
  admin: { success: boolean; error?: string };
  whatsapp: { success: boolean; error?: string };
  userNotification: { success: boolean; error?: string };
}> {
  const results = {
    telegram: { success: false, error: undefined as string | undefined },
    email: { sent: 0, failed: 0 },
    admin: { success: false, error: undefined as string | undefined },
    whatsapp: { success: false, error: undefined as string | undefined },
    userNotification: { success: false, error: undefined as string | undefined },
  };

  // Run all channels concurrently
  const [telegramResult, emailResult, adminResult, whatsappResult, userNotifResult] = await Promise.allSettled([
    // 1. Telegram (instant)
    sendTelegramNotification(event),
    // 2. Email to active recipients
    sendEmailNotifications(event, client),
    // 3. Admin in-app notification
    createInAppNotification(event, client),
    // 4. WhatsApp to user
    sendWhatsAppNotification(event),
    // 5. User in-app notification (student bell icon)
    createUserInAppNotification(event, client),
  ]);

  // Process Telegram result
  if (telegramResult.status === 'fulfilled') {
    results.telegram = { success: telegramResult.value.success, error: telegramResult.value.error };
  } else {
    results.telegram = { success: false, error: telegramResult.reason?.message || 'Unknown error' };
  }

  // Process email result
  if (emailResult.status === 'fulfilled') {
    results.email = emailResult.value;
  } else {
    results.email = { sent: 0, failed: 1 };
  }

  // Process admin notification result
  if (adminResult.status === 'fulfilled') {
    results.admin = { success: adminResult.value.success, error: adminResult.value.error };
  } else {
    results.admin = { success: false, error: adminResult.reason?.message || 'Unknown error' };
  }

  // Process WhatsApp result
  if (whatsappResult.status === 'fulfilled') {
    results.whatsapp = { success: whatsappResult.value.success, error: whatsappResult.value.error };
  } else {
    results.whatsapp = { success: false, error: whatsappResult.reason?.message || 'Unknown error' };
  }

  // Process user notification result
  if (userNotifResult.status === 'fulfilled') {
    results.userNotification = { success: userNotifResult.value.success, error: userNotifResult.value.error };
  } else {
    results.userNotification = { success: false, error: userNotifResult.reason?.message || 'Unknown error' };
  }

  return results;
}

// ============================================
// CHANNEL HANDLERS
// ============================================

/**
 * Send Telegram notification for an event
 */
async function sendTelegramNotification(
  event: NotificationEvent
): Promise<{ success: boolean; error?: string }> {
  if (!isTelegramConfigured()) {
    return { success: false, error: 'Telegram not configured' };
  }

  const message = formatTelegramMessage(event);
  if (!message) {
    return { success: false, error: 'No message format for event type' };
  }

  return sendTelegramMessage(message);
}

/**
 * Send email to all active recipients with matching preferences
 */
async function sendEmailNotifications(
  event: NotificationEvent,
  client?: TypedSupabaseClient
): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };

  try {
    const recipients = await getActiveRecipientsForEvent(event.type, client);
    if (recipients.length === 0) return result;

    const templateSlug = getEmailTemplateSlug(event.type);
    if (!templateSlug) return result;

    const template = await getEmailTemplate(templateSlug, client);
    if (!template) return result;

    const rendered = renderEmailTemplate(template, event.data as Record<string, string>);

    // Send to each recipient concurrently
    const sendResults = await Promise.allSettled(
      recipients.map(recipient =>
        sendEmail({
          to: recipient.email,
          subject: rendered.subject,
          html: rendered.bodyHtml,
        })
      )
    );

    sendResults.forEach(r => {
      if (r.status === 'fulfilled' && r.value.success) {
        result.sent++;
      } else {
        result.failed++;
      }
    });
  } catch (err) {
    console.error('Email notification dispatch error:', err);
    result.failed++;
  }

  return result;
}

/**
 * Create in-app notification for admin panel
 */
async function createInAppNotification(
  event: NotificationEvent,
  client?: TypedSupabaseClient
): Promise<{ success: boolean; error?: string }> {
  try {
    await createAdminNotification(
      {
        event_type: event.type,
        title: event.title,
        message: event.message,
        metadata: event.data,
      },
      client
    );
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Admin notification creation error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Send WhatsApp notification to user (for supported event types)
 */
async function sendWhatsAppNotification(
  event: NotificationEvent
): Promise<{ success: boolean; error?: string }> {
  if (!isWhatsAppConfigured()) {
    return { success: false, error: 'WhatsApp not configured' };
  }

  const phone = (event.data.phone as string) || '';
  if (!phone) {
    return { success: false, error: 'No phone number in event data' };
  }

  // Only send WhatsApp for specific event types
  switch (event.type) {
    case 'new_application': {
      const userName = (event.data.user_name || event.data.userName || 'Student') as string;
      const applicationNumber = (event.data.application_number || event.data.applicationNumber || '') as string;
      const course = (event.data.course || '') as string;

      if (!applicationNumber) {
        return { success: false, error: 'No application number for WhatsApp' };
      }

      return sendApplicationConfirmation(phone, {
        userName,
        applicationNumber,
        course,
      });
    }

    case 'scholarship_opened': {
      const userName = (event.data.user_name || event.data.userName || 'Student') as string;
      return sendScholarshipAvailableNotification(phone, { userName });
    }

    case 'scholarship_approved': {
      const userName = (event.data.user_name || event.data.userName || 'Student') as string;
      const approvedFee = (event.data.approved_fee || event.data.approvedFee || 5000) as number;
      return sendScholarshipApprovedNotification(phone, { userName, approvedFee });
    }

    case 'scholarship_rejected': {
      const userName = (event.data.user_name || event.data.userName || 'Student') as string;
      return sendScholarshipRejectedNotification(phone, { userName });
    }

    case 'application_approved': {
      const userName = (event.data.user_name || event.data.userName || 'Student') as string;
      const applicationNumber = (event.data.application_number || event.data.applicationNumber || '') as string;
      const finalFee = (event.data.final_fee || event.data.finalFee) as number | undefined;
      const fullPaymentDiscount = (event.data.full_payment_discount || event.data.fullPaymentDiscount) as number | undefined;
      const paymentLink = (event.data.payment_link || event.data.paymentLink || '') as string;

      return sendApplicationApproved(phone, {
        userName,
        applicationNumber,
        finalFee,
        fullPaymentDiscount,
        paymentLink,
      });
    }

    case 'refund_approved': {
      const userName = (event.data.user_name || event.data.userName || 'Student') as string;
      const refundAmount = (event.data.refund_amount || event.data.refundAmount || 0) as number;
      return sendRefundApprovedNotification(phone, { userName, refundAmount });
    }

    case 'refund_rejected': {
      const userName = (event.data.user_name || event.data.userName || 'Student') as string;
      const reason = (event.data.admin_notes || event.data.adminNotes || 'Your request did not meet the refund criteria.') as string;
      return sendRefundRejectedNotification(phone, { userName, reason });
    }

    default:
      return { success: false, error: 'No WhatsApp template for event type' };
  }
}

/**
 * Create in-app notification for the target user (student bell icon).
 * Only fires for events that have a user_id target and are in the allowed set.
 * Both apps/app and apps/marketing share the same user_notifications table.
 */
async function createUserInAppNotification(
  event: NotificationEvent,
  client?: TypedSupabaseClient
): Promise<{ success: boolean; error?: string }> {
  // Only create for relevant event types
  if (!USER_NOTIFICATION_EVENTS.has(event.type)) {
    return { success: false, error: 'Event type not targeted to users' };
  }

  // Must have a target user_id
  const userId = (event.data.user_id || event.data.userId) as string;
  if (!userId) {
    return { success: false, error: 'No user_id in event data for user notification' };
  }

  try {
    const userTitle = USER_NOTIFICATION_TITLES[event.type] || event.title;
    await createUserNotification(
      {
        user_id: userId,
        event_type: event.type,
        title: userTitle,
        message: event.message,
        metadata: event.data,
      },
      client
    );
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('User notification creation error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

// ============================================
// FORMATTERS & HELPERS
// ============================================

/**
 * Format event data into a Telegram message
 */
function formatTelegramMessage(event: NotificationEvent): string | null {
  const data = event.data;

  switch (event.type) {
    case 'new_onboarding':
      return formatOnboardingMessage({
        userName: (data.user_name || data.userName || 'Unknown') as string,
        phone: (data.phone || '') as string,
        examInterest: (data.exam_interest || data.examInterest) as string | undefined,
        educationStage: (data.education_stage || data.educationStage) as string | undefined,
        referralSource: (data.referral_source || data.referralSource) as string | undefined,
        sourceApp: (data.source_app || data.sourceApp || 'app') as string,
      } satisfies OnboardingNotificationData);

    case 'onboarding_skipped':
      return formatOnboardingSkippedMessage(
        (data.user_name || data.userName || 'Unknown') as string,
        (data.phone || '') as string
      );

    case 'new_application':
      return formatApplicationMessage({
        userName: (data.user_name || data.userName || 'Unknown') as string,
        phone: (data.phone || '') as string,
        course: (data.course || '') as string,
        schoolName: (data.school_name || data.schoolName) as string | undefined,
        city: (data.city) as string | undefined,
        state: (data.state) as string | undefined,
        applicationNumber: (data.application_number || data.applicationNumber) as string | undefined,
      } satisfies ApplicationNotificationData);

    case 'payment_received':
      return formatPaymentMessage({
        userName: (data.user_name || data.userName || 'Unknown') as string,
        amount: (data.amount || 0) as number,
        method: (data.method || 'Unknown') as string,
        paymentId: (data.payment_id || data.paymentId) as string | undefined,
      } satisfies PaymentNotificationData);

    case 'demo_registration':
      return [
        '<b>New Demo Registration</b>',
        '',
        `<b>Name:</b> ${data.user_name || data.userName || 'Unknown'}`,
        `<b>Phone:</b> ${data.phone || ''}`,
        data.slot_date ? `<b>Date:</b> ${data.slot_date}` : '',
      ].filter(Boolean).join('\n');

    case 'new_callback':
      return formatCallbackRequestMessage({
        userName: (data.user_name || data.userName || 'Unknown') as string,
        phone: (data.phone || '') as string,
        preferredSlot: (data.preferred_slot || data.preferredSlot) as string | undefined,
        preferredDate: (data.preferred_date || data.preferredDate) as string | undefined,
        courseInterest: (data.course_interest || data.courseInterest) as string | undefined,
        notes: (data.notes) as string | undefined,
      } satisfies CallbackNotificationData);

    case 'scholarship_submitted':
      return formatScholarshipSubmittedMessage({
        userName: (data.user_name || data.userName || 'Unknown') as string,
        phone: (data.phone || '') as string,
        schoolName: (data.school_name || data.schoolName) as string | undefined,
        applicationNumber: (data.application_number || data.applicationNumber) as string | undefined,
      } satisfies ScholarshipNotificationData);

    case 'scholarship_approved':
      return formatScholarshipApprovedMessage({
        userName: (data.user_name || data.userName || 'Unknown') as string,
        phone: (data.phone || '') as string,
        approvedFee: (data.approved_fee || data.approvedFee) as number | undefined,
        applicationNumber: (data.application_number || data.applicationNumber) as string | undefined,
      } satisfies ScholarshipNotificationData);

    case 'scholarship_rejected':
      return formatScholarshipRejectedMessage({
        userName: (data.user_name || data.userName || 'Unknown') as string,
        phone: (data.phone || '') as string,
      } satisfies ScholarshipNotificationData);

    case 'application_approved':
      return [
        '<b>Application Approved</b>',
        '',
        `<b>Name:</b> ${data.user_name || data.userName || 'Unknown'}`,
        `<b>Phone:</b> ${data.phone || ''}`,
        `<b>App #:</b> ${data.application_number || data.applicationNumber || ''}`,
        data.final_fee || data.finalFee ? `<b>Final Fee:</b> Rs. ${data.final_fee || data.finalFee}` : '',
        data.payment_recommendation || data.paymentRecommendation ? `<b>Recommended:</b> ${data.payment_recommendation || data.paymentRecommendation}` : '',
      ].filter(Boolean).join('\n');

    case 'scholarship_opened':
    case 'scholarship_revision_requested':
      // These are primarily user-facing notifications (WhatsApp/Email)
      // Simple Telegram format for admin awareness
      return [
        `<b>${event.title}</b>`,
        '',
        `<b>Name:</b> ${data.user_name || data.userName || 'Unknown'}`,
        `<b>Phone:</b> ${data.phone || ''}`,
      ].join('\n');

    case 'refund_requested':
      return [
        '<b>🔴 Refund Request Received</b>',
        '',
        `<b>Name:</b> ${data.user_name || data.userName || 'Unknown'}`,
        `<b>Phone:</b> ${data.phone || ''}`,
        `<b>Payment Amount:</b> Rs. ${data.payment_amount || data.paymentAmount || 0}`,
        `<b>Refund Amount (70%):</b> Rs. ${data.refund_amount || data.refundAmount || 0}`,
        `<b>Reason:</b> ${data.reason_for_discontinuing || data.reasonForDiscontinuing || 'Not specified'}`,
        '',
        '<i>Review in Admin CRM → Refund Requests</i>',
      ].join('\n');

    case 'refund_approved':
      return [
        '<b>✅ Refund Approved</b>',
        '',
        `<b>Name:</b> ${data.user_name || data.userName || 'Unknown'}`,
        `<b>Refund Amount:</b> Rs. ${data.refund_amount || data.refundAmount || 0}`,
      ].join('\n');

    case 'refund_rejected':
      return [
        '<b>❌ Refund Rejected</b>',
        '',
        `<b>Name:</b> ${data.user_name || data.userName || 'Unknown'}`,
        `<b>Admin Notes:</b> ${data.admin_notes || data.adminNotes || 'No notes'}`,
      ].join('\n');

    default:
      return null;
  }
}

/**
 * Map event type to email template slug
 */
function getEmailTemplateSlug(eventType: NotificationEventType): string | null {
  const map: Record<NotificationEventType, string | null> = {
    new_onboarding: 'team-new-onboarding',
    onboarding_skipped: null,
    new_application: 'team-new-application',
    payment_received: null,
    demo_registration: null,
    new_callback: 'team-new-callback',
    scholarship_opened: null, // User gets WhatsApp, not team email
    scholarship_submitted: 'team-scholarship-submitted',
    scholarship_approved: null, // User gets direct email/WhatsApp
    scholarship_rejected: null,
    scholarship_revision_requested: null,
    application_approved: null, // User gets direct email/WhatsApp, not team email
    refund_requested: 'team-refund-request', // Team gets email about new refund request
    refund_approved: null, // User gets direct email
    refund_rejected: null, // User gets direct email
  };

  return map[eventType];
}

// ============================================
// CONVENIENCE DISPATCHERS
// ============================================

/**
 * Dispatch onboarding completed notification
 */
export async function notifyOnboardingCompleted(
  data: {
    userId: string;
    userName: string;
    phone: string;
    examInterest?: string;
    educationStage?: string;
    referralSource?: string;
    sourceApp: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  await dispatchNotification(
    {
      type: 'new_onboarding',
      title: 'New User Onboarded',
      message: `${data.userName} (${data.phone}) completed onboarding`,
      data: {
        user_id: data.userId,
        user_name: data.userName,
        phone: data.phone,
        exam_interest: data.examInterest || '',
        education_stage: data.educationStage || '',
        referral_source: data.referralSource || '',
        source_app: data.sourceApp,
      },
    },
    client
  );
}

/**
 * Dispatch onboarding skipped notification
 */
export async function notifyOnboardingSkipped(
  data: {
    userId: string;
    userName: string;
    phone: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  await dispatchNotification(
    {
      type: 'onboarding_skipped',
      title: 'User Skipped Onboarding',
      message: `${data.userName} (${data.phone}) skipped onboarding`,
      data: {
        user_id: data.userId,
        user_name: data.userName,
        phone: data.phone,
      },
    },
    client
  );
}

/**
 * Dispatch new application notification
 */
export async function notifyNewApplication(
  data: {
    userId?: string;
    userName: string;
    phone: string;
    course: string;
    schoolName?: string;
    city?: string;
    state?: string;
    applicationNumber?: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  await dispatchNotification(
    {
      type: 'new_application',
      title: 'New Application Submitted',
      message: `${data.userName} (${data.phone}) applied for ${data.course}`,
      data: {
        user_id: data.userId || '',
        user_name: data.userName,
        phone: data.phone,
        course: data.course,
        school_name: data.schoolName || '',
        city: data.city || '',
        state: data.state || '',
        application_number: data.applicationNumber || '',
      },
    },
    client
  );
}

/**
 * Dispatch payment received notification
 */
export async function notifyPaymentReceived(
  data: {
    userId: string;
    userName: string;
    amount: number;
    method: string;
    paymentId?: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  await dispatchNotification(
    {
      type: 'payment_received',
      title: 'Payment Received',
      message: `${data.userName} paid Rs. ${data.amount} via ${data.method}`,
      data: {
        user_id: data.userId,
        user_name: data.userName,
        amount: data.amount,
        method: data.method,
        payment_id: data.paymentId || '',
      },
    },
    client
  );
}

// ============================================
// APPLICATION APPROVED DISPATCHER
// ============================================

/**
 * Dispatch application approved notification.
 * Sends to: admin team (Telegram, bell) + student (Email, WhatsApp)
 */
export async function notifyApplicationApproved(
  data: {
    userId: string;
    userName: string;
    email: string;
    phone: string;
    applicationNumber: string;
    course: string;
    finalFee: number;
    fullPaymentDiscount?: number;
    paymentRecommendation?: string;
    paymentDeadline?: string;
    leadProfileId: string;
    // Enhanced data for email template
    allowedPaymentModes?: string;
    installment1Amount?: number;
    installment2Amount?: number;
    installment2DueDays?: number;
    couponCode?: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com';
  const paymentLink = `${appUrl}/payment/${data.leadProfileId}`;

  // 1. Dispatch to all channels (Telegram, admin bell, WhatsApp, user in-app)
  await dispatchNotification(
    {
      type: 'application_approved',
      title: 'Application Approved',
      message: `${data.userName}'s application approved - Fee: Rs. ${data.finalFee}`,
      data: {
        user_id: data.userId,
        user_name: data.userName,
        phone: data.phone,
        application_number: data.applicationNumber,
        course: data.course,
        final_fee: data.finalFee,
        full_payment_discount: data.fullPaymentDiscount || 0,
        payment_recommendation: data.paymentRecommendation || 'full',
        payment_link: paymentLink,
        lead_profile_id: data.leadProfileId,
      },
    },
    client
  );

  // 2. Send direct email to student with fee breakdown + payment link
  try {
    const { sendTemplateEmail } = await import('./email');
    await sendTemplateEmail(data.email, 'application-approved', {
      name: data.userName,
      course: data.course,
      applicationNumber: data.applicationNumber,
      baseFee: data.finalFee + (data.fullPaymentDiscount || 0),
      finalFee: data.finalFee,
      scholarshipDiscount: 0,
      scholarshipPercentage: 0,
      fullPaymentDiscount: data.fullPaymentDiscount || 0,
      paymentDeadline: data.paymentDeadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
      leadId: data.leadProfileId,
      paymentRecommendation: data.paymentRecommendation || 'full',
      allowedPaymentModes: data.allowedPaymentModes || 'full_and_installment',
      installment1Amount: data.installment1Amount || 0,
      installment2Amount: data.installment2Amount || 0,
      installment2DueDays: data.installment2DueDays || 45,
      couponCode: data.couponCode || '',
    });
  } catch (err) {
    console.error('Failed to send approval email to student:', err);
  }
}

// ============================================
// SCHOLARSHIP NOTIFICATION DISPATCHERS
// ============================================

/**
 * Notify student that scholarship option has been opened for them
 */
export async function notifyScholarshipOpened(
  data: {
    userId: string;
    userName: string;
    phone: string;
    applicationNumber?: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  await dispatchNotification(
    {
      type: 'scholarship_opened',
      title: 'Scholarship Option Available',
      message: `Scholarship option opened for ${data.userName} (${data.phone})`,
      data: {
        user_id: data.userId,
        user_name: data.userName,
        phone: data.phone,
        application_number: data.applicationNumber || '',
      },
    },
    client
  );
}

/**
 * Notify admin that student submitted scholarship documents
 */
export async function notifyScholarshipSubmitted(
  data: {
    userId: string;
    userName: string;
    phone: string;
    schoolName?: string;
    applicationNumber?: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  await dispatchNotification(
    {
      type: 'scholarship_submitted',
      title: 'Scholarship Documents Submitted',
      message: `${data.userName} (${data.phone}) submitted scholarship documents`,
      data: {
        user_id: data.userId,
        user_name: data.userName,
        phone: data.phone,
        school_name: data.schoolName || '',
        application_number: data.applicationNumber || '',
      },
    },
    client
  );
}

/**
 * Notify student that scholarship has been approved
 */
export async function notifyScholarshipApproved(
  data: {
    userId: string;
    userName: string;
    phone: string;
    approvedFee: number;
    applicationNumber?: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  await dispatchNotification(
    {
      type: 'scholarship_approved',
      title: 'Scholarship Approved',
      message: `Scholarship approved for ${data.userName} - Fee: Rs. ${data.approvedFee}`,
      data: {
        user_id: data.userId,
        user_name: data.userName,
        phone: data.phone,
        approved_fee: data.approvedFee,
        application_number: data.applicationNumber || '',
      },
    },
    client
  );
}

/**
 * Notify student that scholarship has been rejected
 */
export async function notifyScholarshipRejected(
  data: {
    userId: string;
    userName: string;
    phone: string;
    rejectionReason?: string;
    applicationNumber?: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  await dispatchNotification(
    {
      type: 'scholarship_rejected',
      title: 'Scholarship Rejected',
      message: `Scholarship rejected for ${data.userName}`,
      data: {
        user_id: data.userId,
        user_name: data.userName,
        phone: data.phone,
        rejection_reason: data.rejectionReason || '',
        application_number: data.applicationNumber || '',
      },
    },
    client
  );
}

/**
 * Notify student that scholarship needs document revision
 */
export async function notifyScholarshipRevisionRequested(
  data: {
    userId: string;
    userName: string;
    phone: string;
    revisionNotes?: string;
    applicationNumber?: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  await dispatchNotification(
    {
      type: 'scholarship_revision_requested',
      title: 'Scholarship Documents Revision Required',
      message: `Revision requested for ${data.userName}'s scholarship`,
      data: {
        user_id: data.userId,
        user_name: data.userName,
        phone: data.phone,
        revision_notes: data.revisionNotes || '',
        application_number: data.applicationNumber || '',
      },
    },
    client
  );
}

// ============================================
// CALLBACK NOTIFICATION DISPATCHER
// ============================================

/**
 * Dispatch new callback request notification
 */
export async function notifyNewCallback(
  data: {
    userId?: string;
    userName: string;
    phone: string;
    preferredSlot?: string;
    preferredDate?: string;
    courseInterest?: string;
    queryType?: string;
    notes?: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  await dispatchNotification(
    {
      type: 'new_callback',
      title: 'New Callback Request',
      message: `${data.userName} (${data.phone}) requested a callback`,
      data: {
        user_id: data.userId || '',
        user_name: data.userName,
        phone: data.phone,
        preferred_slot: data.preferredSlot || '',
        preferred_date: data.preferredDate || '',
        course_interest: data.courseInterest || '',
        query_type: data.queryType || '',
        notes: data.notes || '',
      },
    },
    client
  );
}

// ============================================
// REFUND NOTIFICATION DISPATCHERS
// ============================================

/**
 * Notify admin team that a user has requested a refund.
 * Channels: Telegram + Email to team + Admin in-app
 */
export async function notifyRefundRequested(
  data: {
    userId: string;
    userName: string;
    phone: string;
    email: string;
    paymentAmount: number;
    refundAmount: number;
    processingFee: number;
    reasonForDiscontinuing: string;
    paymentId: string;
    leadProfileId?: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  // Dispatch to all channels (Telegram, team email, admin bell, user in-app)
  await dispatchNotification(
    {
      type: 'refund_requested',
      title: 'Refund Request Received',
      message: `${data.userName} requested a refund of Rs. ${data.refundAmount}`,
      data: {
        user_id: data.userId,
        user_name: data.userName,
        phone: data.phone,
        email: data.email,
        payment_amount: data.paymentAmount,
        refund_amount: data.refundAmount,
        processing_fee: data.processingFee,
        reason_for_discontinuing: data.reasonForDiscontinuing,
        payment_id: data.paymentId,
        lead_profile_id: data.leadProfileId || '',
      },
    },
    client
  );

  // Also send confirmation email to user
  try {
    const { sendTemplateEmail } = await import('./email');
    await sendTemplateEmail(data.email, 'refund-request-submitted', {
      name: data.userName,
      paymentAmount: data.paymentAmount,
      refundAmount: data.refundAmount,
      processingFee: data.processingFee,
    });
  } catch (err) {
    console.error('Failed to send refund request confirmation email:', err);
  }
}

/**
 * Notify user that their refund has been approved.
 * Channels: Email + WhatsApp + User in-app
 */
export async function notifyRefundApproved(
  data: {
    userId: string;
    userName: string;
    phone: string;
    email: string;
    refundAmount: number;
    paymentAmount: number;
    adminNotes?: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  await dispatchNotification(
    {
      type: 'refund_approved',
      title: 'Refund Approved',
      message: `Refund of Rs. ${data.refundAmount} approved for ${data.userName}`,
      data: {
        user_id: data.userId,
        user_name: data.userName,
        phone: data.phone,
        refund_amount: data.refundAmount,
        payment_amount: data.paymentAmount,
        admin_notes: data.adminNotes || '',
      },
    },
    client
  );

  // Send direct email to user
  try {
    const { sendTemplateEmail } = await import('./email');
    await sendTemplateEmail(data.email, 'refund-approved', {
      name: data.userName,
      refundAmount: data.refundAmount,
      paymentAmount: data.paymentAmount,
    });
  } catch (err) {
    console.error('Failed to send refund approved email:', err);
  }
}

/**
 * Notify user that their refund has been rejected.
 * Channels: Email + WhatsApp + User in-app
 */
export async function notifyRefundRejected(
  data: {
    userId: string;
    userName: string;
    phone: string;
    email: string;
    paymentAmount: number;
    adminNotes: string;
  },
  client?: TypedSupabaseClient
): Promise<void> {
  await dispatchNotification(
    {
      type: 'refund_rejected',
      title: 'Refund Request Update',
      message: `Refund request from ${data.userName} has been reviewed`,
      data: {
        user_id: data.userId,
        user_name: data.userName,
        phone: data.phone,
        payment_amount: data.paymentAmount,
        admin_notes: data.adminNotes,
      },
    },
    client
  );

  // Send direct email to user
  try {
    const { sendTemplateEmail } = await import('./email');
    await sendTemplateEmail(data.email, 'refund-rejected', {
      name: data.userName,
      paymentAmount: data.paymentAmount,
      adminNotes: data.adminNotes,
    });
  } catch (err) {
    console.error('Failed to send refund rejected email:', err);
  }
}
