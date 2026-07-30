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
  createAdminClientISR,
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
  sendFirstTouchEmail,
  sendPhoneDripEmail,
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
  sendWhatsAppTextMessage,
  isWhatsAppRepliesEnabled,
  sendApplicationConfirmation as sendWhatsAppApplicationConfirmation,
  sendApplicationApproved as sendWhatsAppApplicationApproved,
  sendScholarshipAvailableNotification as sendWhatsAppScholarshipAvailable,
  sendScholarshipApprovedNotification as sendWhatsAppScholarshipApproved,
  sendScholarshipRejectedNotification as sendWhatsAppScholarshipRejected,
  isWhatsAppConfigured,
  sendDemoClassApproved,
  sendDemoClassReminder,
  sendTicketConfirmation as sendWhatsAppTicketConfirmation,
  sendFirstTouchQuickQuestion,
  sendFirstTouchResultsVideo,
  sendFirstTouchEnglishIntro,
  WA_ERROR_PREFIXES,
  formatWhatsAppError,
  isPermanentWhatsAppFailure,
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
  notifyClassroomAccessRequested,
  notifyRefundRequested,
} from './services/notifications';

// Services - Teams Webhook
export { sendTeamsWebhook } from './services/teams-webhook';

// Utils - Academic year
// currentAcademicYear / deriveAcademicYearFromExamYear / examYearFromAcademicYear
// already reach consumers through `export * from './queries'` (crm.ts re-exports
// them), so only the names that are new here are listed, to avoid an ambiguous
// re-export.
export {
  ACADEMIC_YEAR_REGEX,
  academicYearOptions,
  addAcademicYears,
  startYearOf,
  expectedYearForStage,
  yearTier,
  pairStatus,
  parseExamYearAnswer,
} from './utils/academic-year';
export type { YearTier, PairStatus } from './utils/academic-year';

// Utils
export { rewriteStorageUrl } from './utils/storage-url';
export { createUnsubscribeToken, verifyUnsubscribeToken } from './utils/unsubscribe-token';
export {
  classifyCatchupCandidate,
  catchupItemStep,
  isCatchupItemComplete,
  resolveCatchupBacklog,
  summariseCatchupBacklog,
  summariseMissedClasses,
  missedClassDueOn,
  isOverdue,
  addDaysYmd,
  MISSED_CLASS_FALLBACK_DAYS,
} from './utils/catchup';
export { computeAssignmentClock, isSubmissionOnTime, istTodayStr } from './utils/assignment-clock';
export type {
  AssignmentClock,
  AssignmentClockInput,
  AssignmentClockStatus,
} from './utils/assignment-clock';
export type {
  CatchupCandidateClass,
  CatchupCandidateRecap,
  CatchupCandidateVerdict,
  CatchupItemFacts,
  CatchupStep,
  CatchupItemStatus,
  ResolvedCatchupItem,
} from './utils/catchup';

// Data
export {
  locations,
  getLocationByCity,
  getLocationsByState,
  getLocationsByRegion,
  getAllCities,
  getSitemapLocations,
  getHighPriorityLocations,
  getIndianStates,
  getSitemapStates,
} from './data/locations';
export type { Location, StateInfo } from './data/locations';
export { locationSeoContent, getLocationSeoContent } from './data/location-seo-content';
export type { LocationSeoContent } from './data/location-seo-content';
export { stateSeoContent, getStateSeoContent } from './data/state-seo-content';
export type { StateSeoContent } from './data/state-seo-content';
