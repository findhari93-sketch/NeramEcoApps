/**
 * Neram Classes - Database Package
 * 
 * Supabase client, types, and queries for Neram Classes ecosystem
 */

// Client
export {
  getSupabaseBrowserClient,
  createServerClient,
  getSupabaseAdminClient,
  getSupabaseAdminClient as createAdminClient,
  isSupabaseConfigured,
  handleSupabaseError,
  supabase,
} from './client';
export type { TypedSupabaseClient } from './client';

// Types
export * from './types';

// Queries
export * from './queries';

// Services - Email
export {
  sendEmail,
  sendTemplateEmail,
  notifyAdmin,
} from './services/email';
export type { EmailData, TemplateData } from './services/email';

// Services - Telegram
export {
  sendTelegramMessage,
  isTelegramConfigured,
  formatOnboardingMessage,
  formatOnboardingSkippedMessage,
  formatApplicationMessage,
  formatPaymentMessage,
  formatScholarshipSubmittedMessage,
  formatScholarshipApprovedMessage,
  formatScholarshipRejectedMessage,
  formatCallbackRequestMessage,
  formatContactMessageNotification,
} from './services/telegram';
export type {
  OnboardingNotificationData,
  ApplicationNotificationData,
  PaymentNotificationData,
  ScholarshipNotificationData,
  CallbackNotificationData,
  ContactMessageNotificationData,
} from './services/telegram';

// Services - WhatsApp
export {
  sendWhatsAppTemplate,
  sendApplicationConfirmation as sendWhatsAppApplicationConfirmation,
  sendApplicationApproved as sendWhatsAppApplicationApproved,
  sendScholarshipAvailableNotification as sendWhatsAppScholarshipAvailable,
  sendScholarshipApprovedNotification as sendWhatsAppScholarshipApproved,
  sendScholarshipRejectedNotification as sendWhatsAppScholarshipRejected,
  isWhatsAppConfigured,
} from './services/whatsapp';

// Services - Unified Notifications
export {
  dispatchNotification,
  notifyOnboardingCompleted,
  notifyOnboardingSkipped,
  notifyNewApplication,
  notifyPaymentReceived,
  notifyApplicationApproved,
  notifyScholarshipOpened,
  notifyScholarshipSubmitted,
  notifyScholarshipApproved,
  notifyScholarshipRejected,
  notifyScholarshipRevisionRequested,
  notifyNewCallback,
  notifyDemoRegistration,
  notifyContactMessageReceived,
} from './services/notifications';

// Data
export {
  locations,
  getLocationByCity,
  getLocationsByState,
  getLocationsByRegion,
  getAllCities,
} from './data/locations';
export type { Location } from './data/locations';
