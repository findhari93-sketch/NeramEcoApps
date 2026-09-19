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

// How complete a student's application form is. One rule for the Admin grid, the
// Nexus students sheet and the student's own form, so the three stop disagreeing.
export {
  REQUIRED_APPLICATION_FIELDS,
  assessApplication,
  isApplicationComplete,
} from './utils/application-completeness';
export type {
  ApplicationField,
  ApplicationState,
  ApplicationAssessment,
  ApplicationLeadLike,
  ApplicationUserLike,
} from './utils/application-completeness';

// The application form's vocabulary and validation, shared so the marketing apply
// wizard, the Nexus complete-profile page and the student-link form stop drifting.
export {
  APPLICATION_GENDER_OPTIONS,
  APPLICATION_CATEGORY_OPTIONS,
  APPLICATION_CLASS_OPTIONS,
  APPLICATION_SCHOOL_TYPE_OPTIONS,
  APPLICATION_COURSE_OPTIONS,
  ALLOWED_ANSWER_KEYS,
  examYearOptions,
  validateApplicationAnswers,
  toUserUpdates,
  toLeadUpdates,
} from './utils/application-fields';
export type { FieldOption, FieldError, ApplicationAnswers } from './utils/application-fields';

// Utils
export { log, createLogger } from './utils/logger';
export type { Logger } from './utils/logger';
export { rewriteStorageUrl } from './utils/storage-url';
export { createUnsubscribeToken, verifyUnsubscribeToken } from './utils/unsubscribe-token';
export { fetchAllRows, countRowsByKey, countRowsForIds } from './utils/paged-rows';
export {
  classifyCatchupCandidate,
  catchupItemStep,
  isCatchupItemComplete,
  resolveCatchupTestState,
  resolveCatchupBacklog,
  summariseCatchupBacklog,
  summariseMissedClasses,
  summariseCatchupClock,
  missedClassDueOn,
  isOverdue,
  addDaysYmd,
  diffDaysYmd,
  MISSED_CLASS_FALLBACK_DAYS,
  // The clock: one deadline at a time, started by the student.
  catchupWindowDays,
  catchupDueOn,
  catchupDaysLeft,
  catchupDaysSpent,
  bankCatchupClock,
  isCatchupClockRunning,
  isMissedLiveClass,
  planCatchupActivation,
  DEFAULT_CATCHUP_WINDOWS,
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
  CatchupTestAttemptRow,
  CatchupTestState,
  CatchupStep,
  CatchupItemStatus,
  ResolvedCatchupItem,
  CatchupKind,
  CatchupClock,
  CatchupWindows,
  ResolveCatchupContext,
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
