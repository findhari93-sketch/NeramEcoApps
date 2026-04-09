/**
 * Neram Classes - Database Types
 * 
 * This file contains TypeScript types for the Supabase database.
 * Run `pnpm db:generate` to regenerate from the actual database schema.
 * 
 * This manual definition serves as documentation and type safety
 * until the actual Supabase schema is created.
 */

// ============================================
// ENUMS
// ============================================

export type UserType = 'lead' | 'student' | 'teacher' | 'admin' | 'parent';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'active' | 'inactive';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type ApplicationSource = 'website_form' | 'app' | 'referral' | 'manual' | 'direct_link';
export type CourseType = 'nata' | 'jee_paper2' | 'both' | 'not_sure';
export type ExamType = 'NATA' | 'JEE_PAPER_2' | 'BOTH';

// New enums for application form
export type ScholarshipVerificationStatus = 'pending' | 'verified' | 'rejected';
export type CashbackType = 'youtube_subscription' | 'instagram_follow' | 'direct_payment';
export type CashbackStatus = 'pending' | 'verified' | 'processed' | 'rejected' | 'expired';
export type DocumentType = 'school_id_card' | 'income_certificate' | 'payment_screenshot' | 'aadhar_card' | 'marksheet' | 'photo' | 'signature' | 'other';
export type InstallmentStatus = 'pending' | 'paid' | 'overdue' | 'waived';
export type PaymentScheme = 'full' | 'installment';
export type AllowedPaymentModes = 'full_only' | 'full_and_installment';
export type SourceCategory = 'youtube' | 'instagram' | 'facebook' | 'google_search' | 'friend_referral' | 'school_visit' | 'newspaper' | 'hoarding' | 'whatsapp' | 'other';
export type CasteCategory = 'general' | 'obc' | 'sc' | 'st' | 'ews' | 'other';

// Profile enums
export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export type AreaOfInterest = 'nata' | 'jee_paper_2' | 'b_arch' | 'interior_design' | 'landscape_architecture' | 'urban_planning' | 'other';
export type ProfileChangeSource = 'user' | 'admin' | 'system';

// Application form enums (migration 005)
export type ApplicantCategory = 'school_student' | 'diploma_student' | 'college_student' | 'working_professional';
export type ApplicationStatus = 'draft' | 'pending_verification' | 'submitted' | 'under_review' | 'approved' | 'enrolled' | 'partial_payment' | 'rejected' | 'deleted';
export type LocationSource = 'geolocation' | 'pincode' | 'manual';
export type CallbackStatus = 'pending' | 'scheduled' | 'attempted' | 'completed' | 'cancelled' | 'dead_lead';
export type CallbackSlot = 'morning' | 'afternoon' | 'evening';
export type VisitBookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type DeletionType = 'user_requested' | 'admin_deleted' | 'duplicate' | 'spam' | 'test_data';
export type CourseCategory = 'entrance_exam' | 'training' | 'workshop';

// Demo class enums (migration 006)
export type DemoSlotStatus = 'draft' | 'scheduled' | 'confirmed' | 'conducted' | 'cancelled';
export type DemoRegistrationStatus = 'pending' | 'approved' | 'rejected' | 'attended' | 'no_show' | 'cancelled';
export type DemoMode = 'online' | 'offline' | 'hybrid';
export type EnrollmentInterest = 'yes' | 'maybe' | 'no';

// Learning mode enum (migration 008)
export type LearningMode = 'hybrid' | 'online_only';

// School type enum (migration 010)
export type SchoolType = 'private_school' | 'government_aided' | 'government_school';

// Admin application management (migration 015)
export type ContactedStatus = 'talked' | 'unreachable' | 'callback_scheduled' | 'dead_lead' | 'irrelevant';

// Account tier (computed, not stored) — used for avatar ring and CRM badges
export type AccountTier = 'enrolled_student' | 'active_lead' | 'visitor';
export type PaymentRecommendation = 'full' | 'installment';

// Scholarship application status enum (migration 010)
export type ScholarshipApplicationStatus =
  | 'not_eligible'
  | 'eligible_pending'
  | 'documents_submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'revision_requested';

// ============================================
// BASE TYPES
// ============================================

export interface Timestamps {
  created_at: string;
  updated_at: string;
}

// ============================================
// USER TABLES
// ============================================

/**
 * Main users table - unified identity across all apps
 */
export interface User extends Timestamps {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  username: string | null;
  avatar_url: string | null;

  // Profile fields (added in migration 004)
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  description: string | null;
  area_of_interest: AreaOfInterest[] | null;
  date_of_birth: string | null;     // ISO date string
  gender: Gender | null;

  // Password auth fields
  has_password: boolean;
  password_updated_at: string | null;

  // External auth identifiers
  firebase_uid: string | null;      // From Firebase (app.neramclasses.com)
  ms_oid: string | null;            // Microsoft Object ID (nexus & admin)
  google_id: string | null;         // Google account ID

  // Status
  user_type: UserType;
  status: UserStatus;
  email_verified: boolean;
  phone_verified: boolean;
  email_opt_out: boolean;
  email_opt_out_at: string | null;

  // Preferences
  preferred_language: string;       // 'en' | 'ta' | 'hi' | 'kn' | 'ml'

  // Classroom linking (admin links tools app user to Nexus classroom email)
  linked_classroom_email: string | null;
  linked_classroom_at: string | null;
  linked_classroom_by: string | null;

  // Disable / restrict access
  is_disabled: boolean;
  disabled_at: string | null;
  disabled_by: string | null;

  // Metadata
  last_login_at: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * User profile history - tracks all profile changes for admin visibility
 */
export interface UserProfileHistory {
  id: string;
  user_id: string;

  // What changed
  field_name: string;
  old_value: string | null;
  new_value: string | null;

  // Change metadata
  changed_by: string | null;        // Admin user_id, null if user changed own
  change_source: ProfileChangeSource;
  ip_address: string | null;
  user_agent: string | null;

  created_at: string;
}

/**
 * User avatars - stores avatar history with crop data
 */
export interface UserAvatar extends Timestamps {
  id: string;
  user_id: string;

  // Avatar data
  storage_path: string;             // Supabase Storage path
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;

  // Dimensions
  width: number | null;
  height: number | null;
  crop_data: {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom?: number;
    rotation?: number;
  } | null;

  // Status
  is_current: boolean;
}

/**
 * Input type for updating user profile
 */
export interface UpdateUserProfileInput {
  first_name?: string;
  last_name?: string;
  nickname?: string;
  description?: string;
  area_of_interest?: AreaOfInterest[];
  date_of_birth?: string;
  gender?: Gender;
  username?: string;
}

/**
 * Area of interest display labels
 */
export const AREA_OF_INTEREST_LABELS: Record<AreaOfInterest, string> = {
  nata: 'NATA',
  jee_paper_2: 'JEE Paper 2',
  b_arch: 'B.Arch',
  interior_design: 'Interior Design',
  landscape_architecture: 'Landscape Architecture',
  urban_planning: 'Urban Planning',
  other: 'Other',
};

// ============================================
// ACADEMIC DATA TYPES (for conditional form fields)
// ============================================

/**
 * Academic data for school students
 */
export interface SchoolStudentAcademicData {
  current_class: string;              // '8', '9', '10', '11', '12'
  school_name: string;
  school_place_id?: string;           // Google Places ID
  board: string;                      // 'cbse', 'icse', 'state_tn', etc.
  previous_percentage?: number;       // Optional
  school_type?: SchoolType;           // Private, Government-Aided, Government (migration 010)
}

/**
 * Academic data for diploma students
 */
export interface DiplomaStudentAcademicData {
  college_name: string;
  college_place_id?: string;
  department: string;
  completed_grade: '10th' | '12th';   // Which grade they completed before diploma
  marks?: number;
}

/**
 * Academic data for college students
 */
export interface CollegeStudentAcademicData {
  college_name: string;
  college_place_id?: string;
  department: string;
  year_of_study: number;              // 1, 2, 3, 4
  twelfth_year: number;               // Year of 12th completion
  twelfth_percentage?: number;
  reason_for_exam?: string;           // Why writing entrance exam while in college
}

/**
 * Academic data for working professionals
 */
export interface WorkingProfessionalAcademicData {
  twelfth_year: number;
  occupation?: string;
  company?: string;
}

/**
 * Union type for all academic data
 */
export type AcademicData =
  | SchoolStudentAcademicData
  | DiplomaStudentAcademicData
  | CollegeStudentAcademicData
  | WorkingProfessionalAcademicData;

/**
 * Lead profiles - for users who submitted application forms
 */
export interface LeadProfile extends Timestamps {
  id: string;
  user_id: string;

  // Application number (auto-generated)
  application_number: string | null;

  // Source tracking
  source: ApplicationSource;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referral_code: string | null;

  // Personal data (migration 005)
  father_name: string | null;

  // Application data (legacy)
  interest_course: CourseType;
  qualification: string | null;
  school_college: string | null;
  city: string | null;
  state: string | null;

  // Location fields (migration 005)
  country: string;
  pincode: string | null;
  address: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  location_source: LocationSource | null;

  // Applicant category (migration 005)
  applicant_category: ApplicantCategory | null;

  // Academic data (category-specific, migration 005)
  academic_data: AcademicData | null;

  // Common academic fields (migration 005)
  caste_category: CasteCategory | null;
  target_exam_year: number | null;

  // Course selection (migration 005)
  selected_course_id: string | null;
  selected_center_id: string | null;
  hybrid_learning_accepted: boolean;
  learning_mode: LearningMode;

  // Application status (migration 005)
  status: ApplicationStatus;

  // Phone verification (migration 005)
  phone_verified: boolean;
  phone_verified_at: string | null;

  // Soft delete (migration 005)
  deleted_at: string | null;
  deletion_reason: string | null;

  // Application form data (JSON - legacy, for backward compatibility)
  application_data: {
    father_name?: string;
    mother_name?: string;
    dob?: string;
    address?: string;
    how_did_you_hear?: string;
    additional_notes?: string;
    [key: string]: unknown;
  } | null;

  // Admin review
  reviewed_by: string | null;       // Admin user_id
  reviewed_at: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;

  // Fee & Payment (added for enhanced workflow)
  assigned_fee: number | null;
  discount_amount: number | null;
  coupon_code: string | null;
  final_fee: number | null;
  payment_scheme: PaymentScheme;
  payment_deadline: string | null;
  installment_reminder_date: string | null;
  full_payment_discount: number | null;

  // Cashback tracking
  total_cashback_eligible: number;
  total_cashback_processed: number;

  // Form completion tracking
  form_step_completed: number;
  form_completed_at: string | null;

  // Admin contact tracking (migration 015)
  contacted_status: ContactedStatus | null;
  contacted_at: string | null;
  contacted_by: string | null;
  payment_recommendation: PaymentRecommendation;

  // Notification tracking
  email_sent_at: string | null;
  whatsapp_sent_at: string | null;
  last_reminder_sent_at: string | null;

  // School type & scholarship (migration 010)
  school_type: SchoolType | null;
  scholarship_eligible: boolean;
  scholarship_opened_at: string | null;
  scholarship_opened_by: string | null;

  // Fee payment flow (migration 20260222)
  allowed_payment_modes: AllowedPaymentModes;
  installment_1_amount: number | null;
  installment_2_amount: number | null;
  installment_2_due_days: number;
  admin_coupon_id: string | null;

  // Shareable payment link (for students without email/Google auth)
  payment_link_token: string | null;
  payment_link_expires_at: string | null;
}

/**
 * Scholarship applications - for government school student scholarship
 */
export interface ScholarshipApplication extends Timestamps {
  id: string;
  lead_profile_id: string;
  user_id: string | null;

  // School verification
  is_government_school: boolean;
  government_school_years: number;
  school_name: string | null;

  // Documents
  school_id_card_url: string | null;
  income_certificate_url: string | null;
  aadhar_card_url: string | null;
  mark_sheet_url: string | null;

  // Income verification
  is_low_income: boolean;
  annual_income_range: string | null;

  // Scholarship eligibility
  scholarship_percentage: number;
  eligibility_reason: string | null;

  // Legacy admin verification
  verification_status: ScholarshipVerificationStatus;
  verified_by: string | null;
  verified_at: string | null;
  verification_notes: string | null;
  rejection_reason: string | null;

  // Enhanced scholarship workflow (migration 010)
  scholarship_status: ScholarshipApplicationStatus;
  approved_fee: number | null;
  revision_notes: string | null;
  revision_requested_at: string | null;
  revision_requested_by: string | null;
  submitted_at: string | null;
  admin_notes: string | null;
}

/**
 * Cashback claims - YouTube, Instagram, Direct Payment
 */
export interface CashbackClaim extends Timestamps {
  id: string;
  lead_profile_id: string | null;
  user_id: string;

  // Cashback details
  cashback_type: CashbackType;
  amount: number;

  // YouTube verification
  youtube_channel_subscribed: boolean;
  youtube_verification_data: Record<string, unknown> | null;
  youtube_verified_at: string | null;

  // Instagram verification
  instagram_username: string | null;
  instagram_self_declared: boolean;
  instagram_screenshot_url: string | null;

  // Direct payment link
  payment_id: string | null;

  // Processing
  status: CashbackStatus;
  processed_by: string | null;
  processed_at: string | null;
  processing_notes: string | null;

  // Transfer details
  cashback_phone: string | null;
  cashback_upi_id: string | null;
  cashback_transferred_at: string | null;
}

/**
 * Application documents - uploaded files
 */
export interface ApplicationDocument extends Timestamps {
  id: string;
  lead_profile_id: string;
  user_id: string | null;

  // Document details
  document_type: DocumentType;
  file_url: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;

  // Verification
  is_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  verification_notes: string | null;

  // Metadata
  uploaded_from: string | null;
}

/**
 * Payment installments - for partial payment scheme
 */
export interface PaymentInstallment extends Timestamps {
  id: string;
  lead_profile_id: string;
  payment_id: string | null;

  // Installment details
  installment_number: number;
  amount: number;
  due_date: string;

  // Reminder
  reminder_date: string | null;
  reminder_sent: boolean;
  reminder_sent_at: string | null;

  // Status
  status: InstallmentStatus;
  paid_at: string | null;
  paid_amount: number | null;

  // Late fee
  late_fee: number;
  late_fee_waived: boolean;

  admin_notes: string | null;
}

/**
 * Source tracking - "How did you hear about us?"
 */
export interface SourceTracking {
  id: string;
  lead_profile_id: string;

  // Source info
  source_category: SourceCategory | null;
  source_detail: string | null;

  // Referral
  friend_referral_name: string | null;
  friend_referral_phone: string | null;
  referral_code: string | null;

  // UTM tracking
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;

  created_at: string;
}

/**
 * Post-enrollment details - after payment
 */
export interface PostEnrollmentDetails extends Timestamps {
  id: string;
  student_profile_id: string;
  user_id: string | null;

  // Caste details
  caste_category: CasteCategory | null;
  caste_certificate_url: string | null;

  // Aadhar details
  aadhar_number: string | null;
  aadhar_verified: boolean;
  aadhar_document_url: string | null;

  // Parent details
  father_name: string | null;
  father_phone: string | null;
  father_occupation: string | null;
  mother_name: string | null;
  mother_phone: string | null;
  mother_occupation: string | null;

  // Emergency contact
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;

  // Medical info
  blood_group: string | null;
  medical_conditions: string | null;

  // Nexus (MS Teams) account
  nexus_account_created: boolean;
  nexus_email: string | null;
  nexus_password_set: boolean;
  nexus_created_at: string | null;
  nexus_created_by: string | null;

  // Passport photo (migration 20260308)
  passport_photo_url: string | null;

  // Form completion
  form_completed: boolean;
  form_completed_at: string | null;
}

// ============================================
// DIRECT ENROLLMENT LINKS (migration 20260308)
// ============================================

export type DirectEnrollmentLinkStatus = 'active' | 'used' | 'expired' | 'cancelled';

/**
 * Direct enrollment links - admin-generated links for students who paid directly
 */
export interface DirectEnrollmentLink extends Timestamps {
  id: string;

  // Unique token for the shareable link
  token: string;

  // Admin who created this link
  created_by: string;

  // Link status and expiry
  status: DirectEnrollmentLinkStatus;
  expires_at: string;

  // Student reference info (for admin tracking)
  student_name: string;
  student_phone: string | null;
  student_email: string | null;

  // Pre-selected course details
  course_id: string | null;
  batch_id: string | null;
  center_id: string | null;
  interest_course: CourseType;
  learning_mode: LearningMode;

  // Fee details
  total_fee: number;
  discount_amount: number;
  final_fee: number;

  // Payment confirmation (already paid by student)
  amount_paid: number;
  payment_method: string;
  transaction_reference: string | null;
  payment_date: string | null;

  // Admin notes
  admin_notes: string | null;

  // Payment proof attachment
  payment_proof_url: string | null;

  // Usage tracking (filled when student completes enrollment)
  used_by: string | null;
  used_at: string | null;
  lead_profile_id: string | null;
  student_profile_id: string | null;

  // Regeneration tracking
  regenerated_from: string | null;
  regenerated_to: string | null;
}

// ============================================
// POST-ENROLLMENT ONBOARDING STEPS (migration 20260309)
// ============================================

export type OnboardingStepActionType = 'link' | 'in_app' | 'manual';
export type OnboardingCompletedByType = 'student' | 'admin';
export type EnrollmentType = 'regular' | 'direct';
export type OnboardingPhase = 'get_ready' | 'access_your_account' | 'complete_nexus_setup' | 'secure_your_account';
export type OnboardingStepStatus = 'pending' | 'in_progress' | 'completed' | 'need_help';

/**
 * Admin-configurable onboarding step template
 */
export interface OnboardingStepDefinition extends Timestamps {
  id: string;
  step_key: string;
  title: string;
  description: string | null;
  icon_name: string | null;
  action_type: OnboardingStepActionType;
  action_config: Record<string, unknown>;
  display_order: number;
  is_active: boolean;
  is_required: boolean;
  applies_to: EnrollmentType[];
  phase: OnboardingPhase;
}

/**
 * Per-student onboarding step completion tracking
 */
export interface StudentOnboardingProgress extends Timestamps {
  id: string;
  student_profile_id: string;
  step_definition_id: string;
  user_id: string | null;
  is_completed: boolean;
  completed_at: string | null;
  completed_by_type: OnboardingCompletedByType | null;
  completed_by_user_id: string | null;
  admin_notes: string | null;
  status: OnboardingStepStatus;
  terms_accepted_at: string | null;
  auto_add_attempted: boolean;
  auto_add_result: string | null;
}

/**
 * Joined type for display — progress row with its step definition
 */
export interface StudentOnboardingStepWithDefinition extends StudentOnboardingProgress {
  step_definition: OnboardingStepDefinition;
}

/**
 * Per-course group links for WhatsApp and Teams
 */
export interface CourseGroupLinks extends Timestamps {
  id: string;
  course_id: string;
  whatsapp_group_url: string | null;
  teams_group_chat_url: string | null;
  teams_group_chat_id: string | null;
  teams_class_team_url: string | null;
  teams_class_team_id: string | null;
  updated_by: string | null;
}

// ============================================
// OFFLINE CENTERS & VISIT BOOKINGS (migration 005)
// ============================================

/**
 * Operating hours structure
 */
export interface OperatingHours {
  [day: string]: {
    open: string;   // "09:00"
    close: string;  // "18:00"
  } | null;         // null means closed
}

export type CenterType = 'headquarters' | 'sub_office';

/**
 * Offline learning centers for hybrid classes
 */
export interface OfflineCenter extends Timestamps {
  id: string;
  name: string;
  slug: string;

  // Address
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string | null;

  // Coordinates
  latitude: number | null;
  longitude: number | null;

  // Google integration
  google_business_url: string | null;
  google_maps_url: string | null;
  google_place_id: string | null;

  // Media
  photos: string[];

  // Facilities
  facilities: string[];

  // Operating info
  operating_hours: OperatingHours | null;
  preferred_visit_times: string[];

  // Contact
  contact_phone: string | null;
  contact_email: string | null;

  // Capacity
  capacity: number | null;
  current_students: number;

  // Status
  is_active: boolean;
  display_order: number;

  // Center classification
  center_type: CenterType;
  description: string | null;

  // Google reviews
  google_reviews_url: string | null;
  rating: number | null;
  review_count: number;

  // SEO
  seo_slug: string | null;
  nearby_cities: string[];
}

/**
 * Contact form message submissions
 */
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  center_id: string | null;
  source: string;
  status: 'unread' | 'read' | 'replied';
  replied_by: string | null;
  replied_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export type ReplyChannel = 'email' | 'whatsapp';
export type ReplyStatus = 'sent' | 'failed';

export interface MessageReply {
  id: string;
  message_id: string;
  channel: ReplyChannel;
  reply_body: string;
  sent_to: string;
  sent_from: string;
  sent_by: string;
  sent_by_name: string;
  status: ReplyStatus;
  error_message: string | null;
  created_at: string;
}

/**
 * Center visit bookings for prospective students
 */
export interface CenterVisitBooking extends Timestamps {
  id: string;
  center_id: string;
  user_id: string | null;

  // Visitor details
  visitor_name: string;
  visitor_phone: string;
  visitor_email: string | null;

  // Booking details
  visit_date: string;
  visit_time_slot: string;
  purpose: string | null;

  // Status
  status: VisitBookingStatus;

  // Admin handling
  confirmed_by: string | null;
  confirmed_at: string | null;
  admin_notes: string | null;

  // Follow-up
  follow_up_required: boolean;
  follow_up_notes: string | null;
}

// ============================================
// CALLBACK REQUESTS (migration 005)
// ============================================

/**
 * Callback requests for users who prefer to be called
 */
export interface CallbackRequest extends Timestamps {
  id: string;
  user_id: string | null;

  // Contact info
  name: string;
  phone: string;
  email: string | null;

  // Preferred time
  preferred_date: string | null;
  preferred_slot: CallbackSlot | null;
  timezone: string;

  // Interest
  course_interest: CourseType | null;
  query_type: string | null;
  notes: string | null;

  // Status
  status: CallbackStatus;

  // Admin handling
  assigned_to: string | null;
  scheduled_at: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  completed_at: string | null;
  call_notes: string | null;
  call_outcome: string | null;

  // Link to lead if form submitted later
  lead_profile_id: string | null;

  // Callback rescheduling (migration 20260307)
  scheduled_callback_at: string | null;
  is_dead_lead: boolean;
}

// ============================================
// CALLBACK ATTEMPTS (migration 20260307)
// ============================================

export type CallbackOutcome = 'talked' | 'not_picked_up' | 'not_reachable' | 'rescheduled' | 'dead_lead';

export interface CallbackAttempt {
  id: string;
  callback_request_id: string;
  user_id: string;
  admin_id: string;
  admin_name: string;
  outcome: CallbackOutcome;
  comments: string | null;
  rescheduled_to: string | null;
  attempted_at: string;
  created_at: string;
}

// ============================================
// PIN CODE CACHE (migration 005)
// ============================================

/**
 * Location data from pin code lookup
 */
export interface PinCodeLocation {
  name: string;
  district: string;
  state: string;
}

/**
 * Cached pin code lookup data
 */
export interface PinCodeCache {
  pincode: string;
  country: string;
  city: string | null;
  district: string | null;
  state: string | null;
  region: string | null;
  raw_data: Record<string, unknown> | null;
  locations: PinCodeLocation[];
  created_at: string;
  expires_at: string;
  hit_count: number;
  last_accessed_at: string;
}

// ============================================
// APPLICATION DELETIONS (migration 005)
// ============================================

/**
 * Audit trail for soft deleted applications
 */
export interface ApplicationDeletion {
  id: string;
  lead_profile_id: string;
  deleted_by: string | null;
  deletion_type: DeletionType;
  deletion_reason: string;
  deleted_at: string;
  can_restore: boolean;
  restored_at: string | null;
  restored_by: string | null;
  restoration_notes: string | null;
}

// ============================================
// EDUCATION BOARDS (migration 005)
// ============================================

/**
 * Education boards lookup
 */
export interface EducationBoard {
  id: string;
  code: string;
  name: string;
  full_name: string | null;
  country: string;
  states: string[];
  is_active: boolean;
  display_order: number;
}

/**
 * Board options for form dropdown
 */
export const EDUCATION_BOARD_OPTIONS: { code: string; name: string; fullName: string }[] = [
  { code: 'cbse', name: 'CBSE', fullName: 'Central Board of Secondary Education' },
  { code: 'icse', name: 'ICSE', fullName: 'Indian Certificate of Secondary Education' },
  { code: 'state_tn', name: 'State Board (TN)', fullName: 'Tamil Nadu State Board' },
  { code: 'matriculation', name: 'Matriculation', fullName: 'Tamil Nadu Matriculation Board' },
  { code: 'state_ka', name: 'State Board (KA)', fullName: 'Karnataka State Board' },
  { code: 'state_ap', name: 'State Board (AP)', fullName: 'Andhra Pradesh State Board' },
  { code: 'state_ke', name: 'State Board (KE)', fullName: 'Kerala State Board' },
  { code: 'ib', name: 'IB', fullName: 'International Baccalaureate' },
  { code: 'igcse', name: 'IGCSE', fullName: 'Cambridge IGCSE' },
  { code: 'nios', name: 'NIOS', fullName: 'National Institute of Open Schooling' },
  { code: 'other', name: 'Other', fullName: 'Other Board' },
];

/**
 * Caste category options for form dropdown
 */
export const CASTE_CATEGORY_OPTIONS: { value: CasteCategory; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'obc', label: 'OBC (Other Backward Classes)' },
  { value: 'sc', label: 'SC (Scheduled Caste)' },
  { value: 'st', label: 'ST (Scheduled Tribe)' },
  { value: 'ews', label: 'EWS (Economically Weaker Section)' },
];

/**
 * Applicant category options for form
 */
export const APPLICANT_CATEGORY_OPTIONS: { value: ApplicantCategory; label: string; description: string }[] = [
  { value: 'school_student', label: 'School Student', description: 'Currently studying in class 8-12' },
  { value: 'diploma_student', label: 'Diploma Student', description: 'Currently pursuing diploma course' },
  { value: 'college_student', label: 'College Student', description: 'Currently in degree college' },
  { value: 'working_professional', label: 'Working Professional', description: 'Working or completed education' },
];

/**
 * School type options for form dropdown (migration 010)
 */
export const SCHOOL_TYPE_OPTIONS: { value: SchoolType; label: string }[] = [
  { value: 'private_school', label: 'Private School' },
  { value: 'government_aided', label: 'Government-Aided School' },
  { value: 'government_school', label: 'Government School' },
];

/**
 * Scholarship application status labels
 */
export const SCHOLARSHIP_STATUS_CONFIG: Record<ScholarshipApplicationStatus, { label: string; color: string }> = {
  not_eligible: { label: 'Not Eligible', color: '#9E9E9E' },
  eligible_pending: { label: 'Eligible - Pending Documents', color: '#FF9800' },
  documents_submitted: { label: 'Documents Submitted', color: '#2196F3' },
  under_review: { label: 'Under Review', color: '#9C27B0' },
  approved: { label: 'Approved', color: '#4CAF50' },
  rejected: { label: 'Rejected', color: '#F44336' },
  revision_requested: { label: 'Revision Requested', color: '#FF5722' },
};

// ============================================
// STUDENT & TEACHER PROFILES
// ============================================

/**
 * Student profiles - for enrolled, paying students
 */
export interface StudentProfile extends Timestamps {
  id: string;
  student_id: string;
  user_id: string;

  // Enrollment
  enrollment_date: string;
  batch_id: string | null;
  course_id: string | null;
  
  // Microsoft Teams integration
  ms_teams_id: string | null;
  ms_teams_email: string | null;
  
  // Payment status
  payment_status: PaymentStatus;
  total_fee: number;
  fee_paid: number;
  fee_due: number;
  next_payment_date: string | null;
  
  // Progress
  lessons_completed: number;
  assignments_completed: number;
  total_watch_time: number;         // in minutes
  last_activity_at: string | null;
  
  // Metadata
  parent_contact: string | null;
  emergency_contact: string | null;
  notes: string | null;
}

/**
 * Teacher profiles
 */
export interface TeacherProfile extends Timestamps {
  id: string;
  user_id: string;
  
  designation: string;
  department: string | null;
  bio: string | null;
  
  // Microsoft Teams
  ms_teams_id: string | null;
  
  // Subjects/specializations
  subjects: string[];
  
  // Metadata
  is_active: boolean;
  join_date: string;
}

// ============================================
// COURSE & BATCH TABLES
// ============================================

/**
 * Courses offered
 */
export interface Course extends Timestamps {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;

  course_type: CourseType;
  duration_months: number;
  total_lessons: number;

  // Pricing
  regular_fee: number;
  discounted_fee: number | null;
  discount_valid_until: string | null;

  // Content
  syllabus: string | null;          // Markdown content
  features: string[];

  // SEO
  meta_title: string | null;
  meta_description: string | null;

  // Status
  is_active: boolean;
  is_featured: boolean;
  display_order: number;

  // Admin control fields (migration 005)
  course_category: CourseCategory;
  target_audience: string | null;
  enrollment_open: boolean;
  enrollment_deadline: string | null;
  max_students: number | null;
  current_students: number;
}

/**
 * Batches (cohorts of students)
 */
export interface Batch extends Timestamps {
  id: string;
  name: string;
  course_id: string;
  
  start_date: string;
  end_date: string | null;
  
  // Microsoft Teams
  ms_team_id: string | null;
  ms_team_name: string | null;
  ms_team_sync_enabled: boolean;

  // Capacity
  capacity: number;
  enrolled_count: number;
  
  // Schedule
  schedule: {
    day: string;
    start_time: string;
    end_time: string;
  }[];
  
  is_active: boolean;
}

// ============================================
// TOOLS DATA TABLES
// ============================================

/**
 * Colleges for college predictor
 */
export type CollegeType = 'government' | 'private' | 'deemed' | 'government_aided' | 'autonomous';

export interface College extends Timestamps {
  id: string;
  name: string;
  short_name: string | null;
  slug: string;

  // Location
  city: string;
  state: string;
  district: string | null;
  address: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;

  // Classification
  type: CollegeType;
  affiliation: string | null;        // e.g., "AICTE Approved"
  established_year: number | null;
  coa_approved: boolean;

  // Courses offered
  courses_offered: string[];         // ['B.Arch', 'B.Plan', etc.]
  intake_capacity: number | null;
  total_barch_seats: number | null;

  // Rankings & ratings
  nirf_rank: number | null;
  nirf_rank_architecture: number | null;
  rating: number | null;             // 1-5
  naac_grade: string | null;         // 'A++', 'A+', 'A', 'B++', etc.
  neram_tier: string | null;         // 'T1', 'T2', 'T3'

  // Fees
  annual_fee_min: number | null;
  annual_fee_max: number | null;
  annual_fee_approx: number | null;  // Single approx value in INR

  // Contact
  website: string | null;
  email: string | null;
  phone: string | null;

  // Content
  description: string | null;
  facilities: string[];
  placement_data: Record<string, unknown> | null;
  facilities_data: Record<string, unknown> | null;

  // Media
  logo_url: string | null;
  images: string[];

  // SEO
  meta_title: string | null;
  meta_description: string | null;

  // Audit
  created_by: string | null;
  updated_by: string | null;

  is_active: boolean;
}

/**
 * Cutoff data for colleges
 */
export interface CutoffData extends Timestamps {
  id: string;
  college_id: string;
  
  year: number;
  exam_type: ExamType;
  round: number;                     // Counselling round (1, 2, 3, etc.)
  
  // Category-wise cutoffs
  general_cutoff: number | null;
  obc_cutoff: number | null;
  sc_cutoff: number | null;
  st_cutoff: number | null;
  ews_cutoff: number | null;
  
  // State quota cutoffs
  state_quota_cutoff: number | null;
  all_india_cutoff: number | null;
  
  // Additional info
  seats_filled: number | null;
  total_seats: number | null;
  
  notes: string | null;
}

// ============================================
// COUNSELING INTELLIGENCE TYPES
// ============================================

/**
 * Counseling system configuration
 * One row per state/national counseling process (TNEA B.Arch, KEAM, etc.)
 */
export interface CounselingSystem {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  slug: string;
  state: string;
  conducting_body: string;
  conducting_body_full: string | null;
  official_website: string | null;
  merit_formula: CounselingMeritFormula;
  exams_accepted: string[];
  categories: CounselingCategoryDef[];
  special_reservations: CounselingSpecialReservation[] | null;
  typical_counseling_months: string | null;
  typical_rounds: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CounselingMeritFormula {
  method: string;                   // 'raw_sum', 'weighted', etc.
  components: CounselingMeritComponent[];
  total_marks: number;
}

export interface CounselingMeritComponent {
  name: string;
  key: string;
  max_marks: number;
  source: string;                   // 'board_marks', 'entrance_exam'
  description?: string;
}

export interface CounselingCategoryDef {
  code: string;
  name: string;
  description?: string;
}

export interface CounselingSpecialReservation {
  code: string;
  name: string;
  percentage?: number | null;
}

/**
 * College participation in a counseling system for a given year
 */
export interface CollegeCounselingParticipation {
  id: string;
  college_id: string;
  counseling_system_id: string;
  college_code: string;
  branches: CounselingBranch[];
  year: number;
  seat_matrix: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CounselingBranch {
  code: string;
  name: string;
}

/**
 * Historical cutoff entry — one row per college x year x round x branch x category
 */
export interface HistoricalCutoff {
  id: string;
  counseling_system_id: string;
  college_id: string;
  year: number;
  round: string;
  branch_code: string;
  category: string;
  closing_mark: number | null;
  closing_rank: number | null;
  opening_mark: number | null;
  opening_rank: number | null;
  seats_available: number | null;
  seats_filled: number | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/**
 * Rank list entry — anonymized record from rank list PDFs
 * Used for Score → Rank prediction
 */
export interface RankListEntry {
  id: string;
  counseling_system_id: string;
  year: number;
  serial_number: number | null;
  rank: number;
  application_number: string | null;
  candidate_name: string | null;
  date_of_birth: string | null;
  hsc_aggregate_mark: number | null;
  entrance_exam_mark: number | null;
  aggregate_mark: number;
  community: string;
  community_rank: number | null;
  created_at: string;
  created_by: string | null;
}

/**
 * Allotment list entry — anonymized record from allotment list PDFs
 * Used for college-specific predictions
 */
export interface AllotmentListEntry {
  id: string;
  counseling_system_id: string;
  year: number;
  serial_number: number | null;
  rank: number | null;
  aggregate_mark: number | null;
  community: string;
  college_code: string;
  college_id: string | null;
  branch_code: string;
  allotted_category: string;
  application_number: string | null;
  candidate_name: string | null;
  date_of_birth: string | null;
  college_name: string | null;
  branch_name: string | null;
  created_at: string;
  created_by: string | null;
}

/**
 * Prediction log — tracks every prediction run for analytics
 */
export interface PredictionLog {
  id: string;
  user_id: string | null;
  prediction_type: 'forward' | 'reverse' | 'rank';
  counseling_systems: string[];
  data_year: number;
  input_data: Record<string, unknown>;
  results_summary: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Counseling audit log — tracks admin data changes
 */
export interface CounselingAuditLog {
  id: string;
  table_name: string;
  record_id: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  change_type: 'CREATE' | 'UPDATE' | 'DELETE';
  changed_by: string;
  changed_at: string;
  context: Record<string, unknown> | null;
}

/**
 * Extended user exam profile — counseling-specific fields
 */
export interface UserExamProfileCounselingFields {
  state_domicile: string | null;
  board_type: string | null;         // 'TN_STATE', 'CBSE', 'ICSE', 'OTHER_STATE'
  board_marks: BoardMarksData | null;
  nata_score: number | null;
  jee_paper2_score: number | null;
  counseling_categories: Record<string, string> | null;  // {"TNEA_BARCH": "BC", "KEAM_ARCH": "EZ"}
  gender: string | null;
  first_graduate: boolean;
  govt_school_student: boolean;
  pwd_status: boolean;
  nri_status: boolean;
  preferred_states: string[] | null;
  college_type_preference: string[] | null;
  budget_max: number | null;
}

export interface BoardMarksData {
  total_percentage: number;
  maths: number;
  physics: number;
  chemistry: number;
  maths_max?: number;
  physics_max?: number;
  chemistry_max?: number;
}

/** Rank prediction result */
export type PredictionDataSource = 'rank_list' | 'allotment_list';

export interface RankPredictionResult {
  predictedRankMin: number;
  predictedRankMax: number;
  categoryRankMin: number | null;
  categoryRankMax: number | null;
  percentile: number;
  totalCandidates: number;
  matchedEntries: number;
  year: number;
  similarStudents: RankListEntry[];
  dataSource: PredictionDataSource;
  dataSourceLabel: string;
}

/** College prediction with tier */
export type CollegeTier = 'safe' | 'moderate' | 'reach';

export interface CounselingCollegePrediction {
  college: College;
  tier: CollegeTier;
  closingRank: number | null;
  closingMark: number | null;
  predictedRank: number;
  scoreDifference: number;
  year: number;
  category: string;
}

/** Allotment-based college prediction */
export interface AllotmentCollegePrediction {
  collegeCode: string;
  collegeName: string | null;
  branchCode: string;
  branchName: string | null;
  allottedCount: number;
  minRank: number;
  maxRank: number;
  avgScore: number;
  categories: string[];
  year: number;
}

/** Seat matrix for a college in a counseling system */
export interface SeatMatrix {
  total: number;
  by_category: Record<string, number>;
}

/** Seat-aware college prediction with occupancy info */
export interface SeatAwareCollegePrediction {
  collegeCode: string;
  collegeName: string | null;
  city: string | null;
  tier: CollegeTier;
  // Seat info
  totalSeats: number | null;
  categorySeats: number | null;
  seatsFilledByHigherRank: number;
  categoryFilledByHigherRank: number;
  estimatedRemainingSeats: number | null;
  estimatedRemainingCategorySeats: number | null;
  isFull: boolean;
  isCategoryFull: boolean;
  // Rank/score info
  closingRank: number | null;
  closingMark: number | null;
  predictedRank: number;
  // Metadata
  matchCategory: 'general' | 'community';
  studentCategory: string | null;
  coaInstitutionCode: string | null;
  seatDataAvailable: boolean;
}

/**
 * Exam centers for NATA/JEE
 */
export interface ExamCenter extends Timestamps {
  id: string;
  name: string;
  code: string | null;
  
  // Location
  city: string;
  state: string;
  address: string;
  pincode: string | null;
  
  // Coordinates for map
  latitude: number | null;
  longitude: number | null;
  
  // Exam types conducted
  exam_types: ExamType[];
  
  // Capacity
  capacity: number | null;
  
  // Contact
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  
  // Facilities
  facilities: string[];
  
  is_active: boolean;
}

// ============================================
// NATA EXAM CENTERS (Rich, NATA-specific)
// ============================================

export type CenterConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type CityPopulationTier = 'Metro' | 'Tier-1' | 'Tier-2' | 'Tier-3' | 'International';

/**
 * NATA-specific exam center with rich metadata
 */
export interface NataExamCenter extends Timestamps {
  id: string;
  state: string;
  city_brochure: string;
  brochure_ref: string | null;
  latitude: number;
  longitude: number;
  city_population_tier: CityPopulationTier | null;

  // Primary probable center
  probable_center_1: string | null;
  center_1_address: string | null;
  center_1_evidence: string | null;

  // Alternate probable center
  probable_center_2: string | null;
  center_2_address: string | null;
  center_2_evidence: string | null;

  // Classification
  confidence: CenterConfidence;
  is_new_2025: boolean;
  was_in_2024: boolean;
  tcs_ion_confirmed: boolean;
  has_barch_college: boolean;
  notes: string | null;

  // Year tracking
  year: number;

  // Audit
  created_by: string | null;
  updated_by: string | null;
}

export interface NataExamCenterWithDistance extends NataExamCenter {
  distance: number;
}

export interface NataStateSummary {
  state: string;
  year: number;
  total_cities: number;
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  tcs_confirmed: number;
  with_barch_colleges: number;
}

export interface NataExamCenterStats {
  total: number;
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  tcs_confirmed: number;
  with_barch: number;
  states_count: number;
  new_this_year: number;
}

// ============================================
// TOOL USAGE TRACKING
// ============================================

/**
 * Track tool usage for analytics
 */
export interface ToolUsageLog extends Timestamps {
  id: string;
  user_id: string | null;           // null for anonymous users
  session_id: string | null;        // For anonymous tracking
  
  tool_name: 'cutoff_calculator' | 'college_predictor' | 'exam_center_locator';
  
  // Input/Output
  input_data: Record<string, unknown>;
  result_data: Record<string, unknown> | null;
  
  // Context
  ip_address: string | null;
  user_agent: string | null;
  referrer: string | null;
  
  // Performance
  execution_time_ms: number | null;
}

// ============================================
// PAYMENTS
// ============================================

/**
 * Payment records
 */
export interface Payment extends Timestamps {
  id: string;
  user_id: string;
  student_profile_id: string | null;
  lead_profile_id: string | null;

  // Amount
  amount: number;
  currency: string;                  // 'INR'

  // Razorpay details
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;

  // Status
  status: PaymentStatus;

  // Details
  description: string | null;
  payment_method: string | null;     // 'razorpay', 'upi_screenshot', 'bank_transfer'

  // Receipt
  receipt_number: string | null;
  receipt_url: string | null;

  // Screenshot verification (for direct payment)
  screenshot_url: string | null;
  screenshot_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  verification_notes: string | null;

  // Installment tracking
  installment_number: number | null;

  // Metadata
  metadata: Record<string, unknown> | null;

  // Razorpay enriched data (fetched after verification)
  razorpay_method: string | null;       // 'upi', 'card', 'netbanking', 'wallet'
  razorpay_bank: string | null;
  razorpay_vpa: string | null;          // UPI ID (e.g., user@paytm)
  razorpay_card_last4: string | null;
  razorpay_card_network: string | null; // 'Visa', 'Mastercard', etc.
  razorpay_fee: number | null;          // Razorpay processing fee
  razorpay_tax: number | null;          // GST on Razorpay fee

  // Failure info
  failure_code: string | null;
  failure_reason: string | null;

  paid_at: string | null;

  // Payer info (who actually paid — may differ from student)
  payer_name: string | null;
  payer_relationship: 'self' | 'parent' | 'guardian' | 'sibling' | 'other' | null;
}

// ============================================
// CONTENT MANAGEMENT
// ============================================

/**
 * Blog posts for marketing site
 */
export interface BlogPost extends Timestamps {
  id: string;
  slug: string;
  
  // Content (multilingual)
  title: Record<string, string>;     // { en: '', ta: '', hi: '' }
  excerpt: Record<string, string>;
  content: Record<string, string>;   // Markdown
  
  // Media
  featured_image: string | null;
  
  // Categorization
  category: string;
  tags: string[];
  
  // Author
  author_id: string;
  
  // SEO
  meta_title: Record<string, string> | null;
  meta_description: Record<string, string> | null;
  canonical_url: string | null;
  
  // Status
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  
  // Stats
  view_count: number;
}

/**
 * Testimonials
 */
export type TestimonialLearningMode = 'online' | 'hybrid' | 'offline';

export interface Testimonial extends Timestamps {
  id: string;

  student_name: string;
  student_photo: string | null;

  // Content (multilingual)
  content: Record<string, string>;

  // Results
  exam_type: ExamType;
  score: number | null;
  rank: number | null;
  college_admitted: string | null;
  year: number;

  // Filtering dimensions
  course_name: string;
  course_slug: string | null;
  city: string;
  state: string;
  learning_mode: TestimonialLearningMode;

  // Enhanced content
  rating: number | null;
  video_url: string | null;

  // Display
  is_featured: boolean;
  is_homepage: boolean;
  display_order: number;
  is_active: boolean;
}

/**
 * Social Proofs (media testimonials - video, audio, screenshots)
 * Separate from text-based Testimonial system
 */
export type SocialProofType = 'video' | 'audio' | 'screenshot';
export type SocialProofLanguage = 'tamil' | 'english' | 'hindi' | 'kannada' | 'malayalam' | 'telugu';

export interface SocialProof extends Timestamps {
  id: string;

  // Type
  proof_type: SocialProofType;

  // Video
  youtube_url: string | null;
  youtube_id: string | null;

  // Audio
  audio_url: string | null;
  audio_duration: number | null;

  // Screenshot
  image_url: string | null;

  // People
  speaker_name: string;
  student_name: string | null;
  parent_photo: string | null;

  // Context
  batch: string | null;
  language: SocialProofLanguage;
  description: Record<string, string>;
  caption: string | null;

  // Display
  is_featured: boolean;
  is_homepage: boolean;
  display_order: number;
  is_active: boolean;
}

/**
 * FAQs
 */
export interface FAQ extends Timestamps {
  id: string;
  
  // Content (multilingual)
  question: Record<string, string>;
  answer: Record<string, string>;
  
  // Categorization
  category: string;
  
  // Display
  display_order: number;
  is_active: boolean;
}

// ============================================
// MARKETING CONTENT (dynamic CMS for marketing site)
// ============================================

export type MarketingContentType = 'achievement' | 'important_date' | 'announcement' | 'update' | 'broadcast';
export type MarketingContentStatus = 'draft' | 'published' | 'archived';

export interface ImageCrops {
  square?: string;  // URL for 1:1 crop (thumbnails)
  banner?: string;  // URL for 2.2:1 crop (desktop expanded)
  mobile?: string;  // URL for 16:9 crop (mobile expanded)
}

export interface AchievementMetadata {
  student_name: string;
  exam: string;
  score?: number | null;
  rank?: number | null;
  percentile?: number | null;
  college?: string | null;
  academic_year: string;       // e.g. '2025-26'
  batch?: string | null;
  student_quote?: string | null;
  image_crops?: ImageCrops | null;
}

export interface ImportantDateMetadata {
  target_date: string;
  original_date?: string | null;
  is_extended?: boolean;
  event_type: string;          // 'application_deadline' | 'exam_date' | 'result_date'
}

export interface AnnouncementMetadata {
  link_url?: string | null;
  link_text?: string | null;
  badge_text?: string | null;
  badge_color?: string | null; // 'error' | 'success' | 'warning' | 'info'
}

export interface UpdateMetadata {
  category?: string | null;
  link_url?: string | null;
}

export interface BroadcastMetadata {
  link_url?: string | null;
  link_text?: string | null;
  style?: 'info' | 'success' | 'warning' | 'urgent' | null;
}

export type MarketingContentMetadata =
  | AchievementMetadata
  | ImportantDateMetadata
  | AnnouncementMetadata
  | UpdateMetadata
  | BroadcastMetadata;

export interface MarketingContent extends Timestamps {
  id: string;
  type: MarketingContentType;
  title: Record<string, string>;
  description: Record<string, string>;
  image_url: string | null;
  metadata: MarketingContentMetadata;
  status: MarketingContentStatus;
  is_pinned: boolean;
  display_priority: number;
  starts_at: string | null;
  expires_at: string | null;
  published_at: string | null;
  created_by: string | null;
}

export type CreateMarketingContentInput = Omit<MarketingContent, 'id' | 'created_at' | 'updated_at'>;

// ============================================
// CAREERS / JOB POSTINGS
// ============================================

export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship';
export type JobTargetAudience = 'college_students' | 'experienced' | 'any';
export type JobPostingStatus = 'draft' | 'published' | 'closed' | 'archived';
export type JobApplicationStatus = 'new' | 'reviewing' | 'shortlisted' | 'interview' | 'offered' | 'rejected' | 'withdrawn';
export type ScreeningQuestionType = 'text' | 'number' | 'select' | 'multi_select' | 'boolean';

export interface ScreeningQuestion {
  id: string;
  question: string;
  type: ScreeningQuestionType;
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface ContractTerms {
  min_duration_months?: number;
  probation_period_months?: number;
  early_termination_note?: string;
  remuneration_note?: string;
  additional_terms?: string[];
}

export interface JobPosting extends Timestamps {
  id: string;
  title: string;
  slug: string;
  department: string;
  description: string;
  skills_required: string[];
  employment_type: EmploymentType;
  target_audience: JobTargetAudience;
  schedule_details: string | null;
  location: string;
  experience_required: string | null;
  screening_questions: ScreeningQuestion[];
  contract_terms: ContractTerms;
  status: JobPostingStatus;
  display_priority: number;
  published_at: string | null;
  closed_at: string | null;
  created_by: string | null;
}

export interface ScreeningAnswer {
  question_id: string;
  answer: string | number | boolean | string[];
}

export interface JobApplication extends Timestamps {
  id: string;
  job_posting_id: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string;
  resume_url: string | null;
  portfolio_url: string | null;
  screening_answers: ScreeningAnswer[];
  terms_agreed: boolean;
  terms_agreed_at: string | null;
  status: JobApplicationStatus;
  admin_notes: string | null;
}

export interface JobApplicationWithJob extends JobApplication {
  job_posting: Pick<JobPosting, 'id' | 'title' | 'slug' | 'department'>;
}

export type CreateJobPostingInput = Omit<JobPosting, 'id' | 'created_at' | 'updated_at'>;
export type CreateJobApplicationInput = Omit<JobApplication, 'id' | 'created_at' | 'updated_at' | 'status' | 'admin_notes'>;

// ============================================
// NOTIFICATIONS & EMAILS
// ============================================

/**
 * Email templates
 */
export interface EmailTemplate extends Timestamps {
  id: string;
  name: string;
  slug: string;
  
  subject: Record<string, string>;   // Multilingual
  body_html: Record<string, string>;
  body_text: Record<string, string>;
  
  variables: string[];               // Required template variables
  
  is_active: boolean;
}

/**
 * Sent email logs
 */
export interface EmailLog extends Timestamps {
  id: string;
  
  template_id: string | null;
  user_id: string | null;
  
  to_email: string;
  subject: string;
  
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  
  // External service IDs
  resend_id: string | null;
  
  // Error tracking
  error_message: string | null;
  
  sent_at: string | null;
}

// ============================================
// YOUTUBE SUBSCRIPTION COUPONS
// ============================================

/**
 * YouTube subscription coupons - tracks users who subscribed and received coupons
 */
export interface YouTubeSubscriptionCoupon extends Timestamps {
  id: string;
  user_id: string;
  coupon_id: string;
  youtube_channel_id: string;
  youtube_subscription_id: string | null;
  subscribed_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

// ============================================
// ANALYTICS & TRACKING
// ============================================

/**
 * Page views for analytics
 */
export interface PageView extends Timestamps {
  id: string;
  
  user_id: string | null;
  session_id: string;
  
  page_url: string;
  page_title: string | null;
  referrer: string | null;
  
  // Device info
  device_type: 'desktop' | 'mobile' | 'tablet';
  browser: string | null;
  os: string | null;
  
  // Location (from IP)
  country: string | null;
  city: string | null;
  
  // Duration
  time_on_page: number | null;       // seconds
}

// ============================================
// DEMO CLASS TABLES (migration 006)
// ============================================

/**
 * Demo class slots - admin-created time slots for demo classes
 */
export interface DemoClassSlot extends Timestamps {
  id: string;

  // Slot Details
  title: string;
  description: string | null;

  // Scheduling
  slot_date: string;                 // ISO date (YYYY-MM-DD)
  slot_time: string;                 // Time (HH:mm:ss)
  duration_minutes: number;

  // Capacity Management
  min_registrations: number;
  max_registrations: number;
  current_registrations: number;

  // Meeting Details
  meeting_link: string | null;
  meeting_password: string | null;
  venue_address: string | null;
  demo_mode: DemoMode;

  // Status
  status: DemoSlotStatus;

  // Instructor
  instructor_name: string | null;
  instructor_id: string | null;

  // Course association
  course_id: string | null;

  // Admin tracking
  created_by: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;

  // Notification tracking
  confirmation_notifications_sent: boolean;
  reminder_24h_sent: boolean;
  reminder_1h_sent: boolean;
}

/**
 * Demo class registrations - user bookings for demo slots
 */
export interface DemoClassRegistration extends Timestamps {
  id: string;

  // References
  slot_id: string;
  user_id: string | null;

  // Contact Info
  name: string;
  email: string | null;
  phone: string;

  // Student Context
  current_class: string | null;
  interest_course: string | null;
  city: string | null;

  // Status
  status: DemoRegistrationStatus;

  // Admin Processing
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;

  // Notification Tracking
  confirmation_email_sent: boolean;
  confirmation_email_sent_at: string | null;
  whatsapp_sent: boolean;
  whatsapp_sent_at: string | null;
  calendar_invite_sent: boolean;
  reminder_24h_sent: boolean;
  reminder_1h_sent: boolean;

  // Survey tracking
  survey_email_sent: boolean;
  survey_email_sent_at: string | null;
  survey_completed: boolean;

  // Attendance
  attended: boolean | null;
  attendance_marked_at: string | null;
  attendance_marked_by: string | null;

  // Conversion tracking
  converted_to_lead: boolean;
  lead_profile_id: string | null;

  // Source Tracking (UTM)
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referral_code: string | null;
}

/**
 * Demo class surveys - post-demo feedback from attendees
 */
export interface DemoClassSurvey {
  id: string;
  registration_id: string;

  // Ratings (1-5 scale)
  overall_rating: number | null;
  teaching_rating: number | null;

  // Net Promoter Score (1-5)
  nps_score: number | null;

  // Open-ended feedback
  liked_most: string | null;
  suggestions: string | null;

  // Enrollment interest
  enrollment_interest: EnrollmentInterest | null;

  // Additional feedback
  additional_comments: string | null;

  // Follow-up preference
  contact_for_followup: boolean;

  submitted_at: string;
}

/**
 * Input type for creating a demo slot
 */
export interface CreateDemoSlotInput {
  title?: string;
  description?: string;
  slot_date: string;
  slot_time: string;
  duration_minutes?: number;
  min_registrations?: number;
  max_registrations?: number;
  demo_mode?: DemoMode;
  instructor_name?: string;
  instructor_id?: string;
  course_id?: string;
  created_by?: string;
}

/**
 * Input type for creating a demo registration
 */
export interface CreateDemoRegistrationInput {
  slot_id: string;
  user_id?: string;
  name: string;
  email?: string;
  phone: string;
  current_class?: string;
  interest_course?: string;
  city?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referral_code?: string;
}

/**
 * Input type for submitting a survey
 */
export interface CreateDemoSurveyInput {
  registration_id: string;
  overall_rating?: number;
  teaching_rating?: number;
  nps_score?: number;
  liked_most?: string;
  suggestions?: string;
  enrollment_interest?: EnrollmentInterest;
  additional_comments?: string;
  contact_for_followup?: boolean;
}

/**
 * Demo slot with computed fields for display
 */
export interface DemoSlotDisplay extends DemoClassSlot {
  display_date: string;              // "Sunday, Feb 9"
  display_time: string;              // "10:00 AM"
  spots_left: number;
  is_filling: boolean;               // < 20% spots left
  is_full: boolean;
}

/**
 * Demo slot stats for admin dashboard
 */
export interface DemoSlotStats {
  total_registrations: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  attended_count: number;
  no_show_count: number;
  survey_count: number;
  avg_overall_rating: number | null;
  avg_teaching_rating: number | null;
  avg_nps_score: number | null;
  enrollment_interest_breakdown: {
    yes: number;
    maybe: number;
    no: number;
  };
}

/**
 * Options for current class dropdown
 */
export const CURRENT_CLASS_OPTIONS = [
  { value: '10th', label: 'Class 10' },
  { value: '11th', label: 'Class 11' },
  { value: '12th', label: 'Class 12' },
  { value: '12th-pass', label: '12th Pass / Graduate' },
] as const;

/**
 * Options for interest course dropdown
 */
export const INTEREST_COURSE_OPTIONS = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee_paper2', label: 'JEE Paper 2' },
  { value: 'both', label: 'Both NATA & JEE' },
  { value: 'not_sure', label: 'Not Sure Yet' },
] as const;

// ============================================
// ONBOARDING TABLES (migration 007)
// ============================================

export type OnboardingQuestionType = 'single_select' | 'multi_select' | 'scale';
export type OnboardingSessionStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type ProgramType = 'year_long' | 'crash_course';
export type NotificationEventType =
  | 'new_onboarding'
  | 'onboarding_skipped'
  | 'new_application'
  | 'payment_received'
  | 'demo_registration'
  | 'new_callback'
  | 'scholarship_opened'
  | 'scholarship_submitted'
  | 'scholarship_approved'
  | 'scholarship_rejected'
  | 'scholarship_revision_requested'
  | 'application_approved'
  | 'refund_requested'
  | 'refund_approved'
  | 'refund_rejected'
  | 'contact_message_received'
  | 'question_submitted'
  | 'question_edit_requested'
  | 'question_delete_requested'
  | 'callback_reminder'
  | 'direct_enrollment_completed'
  | 'ticket_created'
  | 'ticket_resolved'
  | 'link_regeneration_requested'
  | 'classroom_enrolled'
  | 'batch_assigned'
  | 'batch_changed'
  | 'foundation_issue_resolved'
  | 'foundation_issue_reported'
  | 'foundation_issue_assigned'
  | 'foundation_issue_in_progress'
  | 'foundation_issue_delegated'
  | 'classroom_access_requested'
  | 'classroom_removed'
  | 'classroom_restored'
  | 'device_swap_requested'
  | 'device_swap_approved'
  | 'device_swap_rejected'
  | 'recall_version_added'
  | 'recall_confirmed'
  | 'recall_version_approved'
  | 'recall_version_rejected'
  | 'recall_comment_added'
  | 'recall_published'
  | 'foundation_issue_awaiting_confirmation'
  | 'foundation_issue_reopened'
  | 'foundation_issue_closed'
  | 'auto_first_touch_sent';

// Classroom access request types
export type ClassroomAccessRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ClassroomAccessRequest {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string | null;
  status: ClassroomAccessRequestStatus;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Nexus settings (key-value store)
export interface NexusSetting {
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
}

// Refund request enums & constants
export type RefundRequestStatus = 'pending' | 'approved' | 'rejected';
export const REFUND_PROCESSING_FEE_PERCENT = 30;
export const REFUND_WINDOW_HOURS = 24;
export type NotificationRecipientRole = 'admin' | 'team_lead' | 'team_member';

/**
 * Onboarding questions - admin-configurable
 */
export interface OnboardingQuestion extends Timestamps {
  id: string;
  question_key: string;
  question_text: string;
  question_text_ta: string | null;
  question_type: OnboardingQuestionType;
  options: OnboardingQuestionOption[] | OnboardingScaleOptions;
  display_order: number;
  is_active: boolean;
  is_required: boolean;
  maps_to_field: string | null;
}

export interface OnboardingQuestionOption {
  value: string;
  label: string;
  label_ta?: string;
  icon?: string;
}

export interface OnboardingScaleOptions {
  min: number;
  max: number;
  min_label: string;
  max_label: string;
  min_label_ta?: string;
  max_label_ta?: string;
}

/**
 * Onboarding responses - user answers
 */
export interface OnboardingResponse {
  id: string;
  user_id: string;
  question_id: string;
  response: OnboardingResponseValue;
  responded_at: string;
}

export type OnboardingResponseValue =
  | { value: string }
  | { values: string[] }
  | { scale: number };

/**
 * Onboarding sessions - tracks completion
 */
export interface OnboardingSession extends Timestamps {
  id: string;
  user_id: string;
  status: OnboardingSessionStatus;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  source_app: 'marketing' | 'app' | null;
  questions_answered: number;
  total_questions: number;
  admin_notified: boolean;
  telegram_notified: boolean;
}

/**
 * Fee structures - admin-managed pricing
 */
export interface FeeStructure extends Timestamps {
  id: string;
  course_type: CourseType;
  program_type: ProgramType;
  display_name: string;
  display_name_ta: string | null;
  fee_amount: number;
  combo_extra_fee: number;
  duration: string;
  schedule_summary: string | null;
  features: string[];
  is_active: boolean;
  display_order: number;

  // Payment options (migration 010)
  single_payment_discount: number;
  installment_1_amount: number | null;
  installment_2_amount: number | null;
  is_hidden_from_public: boolean;
}

/**
 * Notification recipients - admin-managed team members
 */
export interface NotificationRecipient extends Timestamps {
  id: string;
  email: string;
  name: string;
  role: NotificationRecipientRole;
  notification_preferences: NotificationPreferences;
  is_active: boolean;
  added_by: string | null;
}

export interface NotificationPreferences {
  new_onboarding: boolean;
  onboarding_skipped: boolean;
  new_application: boolean;
  payment_received: boolean;
  demo_registration: boolean;
  new_callback: boolean;
  daily_summary: boolean;
  // Scholarship events (migration 010)
  scholarship_opened: boolean;
  scholarship_submitted: boolean;
  scholarship_approved: boolean;
  scholarship_rejected: boolean;
  scholarship_revision_requested: boolean;
  // Application approval (migration 015)
  application_approved: boolean;
  // Refund events
  refund_requested: boolean;
  refund_approved: boolean;
  refund_rejected: boolean;
  // Contact messages
  contact_message_received: boolean;
  // Question moderation (migration 20260307)
  question_submitted: boolean;
  question_edit_requested: boolean;
  question_delete_requested: boolean;
  callback_reminder: boolean;
  // Direct enrollment & support tickets (migration 20260310)
  direct_enrollment_completed: boolean;
  ticket_created: boolean;
  ticket_resolved: boolean;
  link_regeneration_requested: boolean;
}

/**
 * Admin notifications - in-app notification bell
 */
export interface AdminNotification {
  id: string;
  event_type: NotificationEventType;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  read_by: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * User notifications - per-user in-app notification bell
 * Unlike admin_notifications (global), these target a specific user.
 * Both apps/app and apps/marketing share the same table for cross-app read sync.
 */
export interface UserNotification {
  id: string;
  user_id: string;
  event_type: NotificationEventType;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

// ============================================
// SUPPORT TICKETS (migration 20260310)
// ============================================

export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportTicketPriority = 'low' | 'medium' | 'high';
export type SupportTicketCategory =
  | 'enrollment_issue'
  | 'payment_issue'
  | 'technical_issue'
  | 'account_issue'
  | 'course_question'
  | 'other';

export interface SupportTicket extends Timestamps {
  id: string;
  ticket_number: string;
  user_id: string | null;
  user_name: string;
  user_email: string | null;
  user_phone: string | null;
  category: SupportTicketCategory;
  subject: string;
  description: string;
  page_url: string | null;
  source_app: string | null;
  enrollment_link_id: string | null;
  screenshot_urls: string[];
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assigned_to: string | null;
  assigned_at: string | null;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
}

export interface SupportTicketComment {
  id: string;
  ticket_id: string;
  user_id: string | null;
  user_name: string;
  is_admin: boolean;
  content: string;
  created_at: string;
}

export interface CreateSupportTicketInput {
  user_id?: string;
  user_name: string;
  user_email?: string;
  user_phone?: string;
  category: SupportTicketCategory;
  subject: string;
  description: string;
  page_url?: string;
  source_app?: string;
  enrollment_link_id?: string;
  screenshot_urls?: string[];
}

export interface UpdateSupportTicketInput {
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  assigned_to?: string;
  assigned_at?: string;
  resolution_notes?: string;
  resolved_by?: string;
  resolved_at?: string;
}

export interface ListSupportTicketsFilters {
  status?: SupportTicketStatus;
  category?: SupportTicketCategory;
  userId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ============================================
// APP FEEDBACK (Play Store Testers)
// ============================================

export type AppFeedbackCategory = 'bug_report' | 'feature_request' | 'ui_ux_issue' | 'performance' | 'other';
export type AppFeedbackStatus = 'new' | 'reviewed' | 'in_progress' | 'resolved' | 'wont_fix';

export interface AppFeedback extends Timestamps {
  id: string;
  feedback_number: string;
  user_id: string | null;
  email: string | null;
  rating: number;
  category: AppFeedbackCategory;
  description: string;
  app_version: string | null;
  device_info: Record<string, unknown>;
  status: AppFeedbackStatus;
  admin_notes: string | null;
  source: string;
}

export interface CreateAppFeedbackInput {
  user_id?: string;
  email?: string;
  rating: number;
  category: AppFeedbackCategory;
  description: string;
  app_version?: string;
  device_info?: Record<string, unknown>;
  source?: string;
}

export interface UpdateAppFeedbackInput {
  status?: AppFeedbackStatus;
  admin_notes?: string;
}

export interface ListAppFeedbackFilters {
  status?: AppFeedbackStatus;
  category?: AppFeedbackCategory;
  rating?: number;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Input types for onboarding
 */
export interface SaveOnboardingResponsesInput {
  user_id: string;
  responses: {
    question_id: string;
    response: OnboardingResponseValue;
  }[];
  source_app: 'marketing' | 'app';
}

export interface CreateFeeStructureInput {
  course_type: CourseType;
  program_type: ProgramType;
  display_name: string;
  display_name_ta?: string;
  fee_amount: number;
  combo_extra_fee?: number;
  duration: string;
  schedule_summary?: string;
  features?: string[];
  display_order?: number;
  // Payment options (migration 010)
  single_payment_discount?: number;
  installment_1_amount?: number;
  installment_2_amount?: number;
  is_hidden_from_public?: boolean;
}

export interface NotificationEvent {
  type: NotificationEventType;
  title: string;
  message: string;
  data: Record<string, unknown>;
}

// ============================================
// REFUND REQUEST TYPES
// ============================================

export interface RefundRequest {
  id: string;
  payment_id: string;
  user_id: string;
  lead_profile_id: string | null;
  payment_amount: number;
  refund_amount: number;
  processing_fee: number;
  reason_for_joining: string;
  reason_for_discontinuing: string;
  additional_notes: string | null;
  status: RefundRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRefundRequestInput {
  payment_id: string;
  reason_for_joining: string;
  reason_for_discontinuing: string;
  additional_notes?: string;
}

// ============================================
// CRM PIPELINE TYPES (for admin user management)
// ============================================

/**
 * Pipeline stages - non-linear, shows highest stage reached.
 * Users can skip stages (e.g., skip demo and go straight to application).
 */
export type PipelineStage =
  | 'new_lead'
  | 'demo_requested'
  | 'demo_attended'
  | 'phone_verified'
  | 'application_submitted'
  | 'admin_approved'
  | 'payment_complete'
  | 'enrolled';

/**
 * Pipeline stage display configuration
 */
export const PIPELINE_STAGE_CONFIG: Record<PipelineStage, { label: string; color: string; order: number }> = {
  new_lead: { label: 'New Lead', color: '#9E9E9E', order: 0 },
  demo_requested: { label: 'Demo Requested', color: '#2196F3', order: 1 },
  demo_attended: { label: 'Demo Attended', color: '#03A9F4', order: 2 },
  phone_verified: { label: 'Phone Verified', color: '#FF9800', order: 3 },
  application_submitted: { label: 'App Submitted', color: '#9C27B0', order: 4 },
  admin_approved: { label: 'Approved', color: '#4CAF50', order: 5 },
  payment_complete: { label: 'Payment Done', color: '#00BCD4', order: 6 },
  enrolled: { label: 'Enrolled', color: '#388E3C', order: 7 },
};

/**
 * Unified user journey row returned from user_journey_view
 */
export interface UserJourney {
  // Core user fields
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  user_type: UserType;
  status: UserStatus;
  phone_verified: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  preferred_language: string;
  linked_classroom_email: string | null;
  is_disabled: boolean;

  // Computed pipeline stage
  pipeline_stage: PipelineStage;

  // Lead profile summary
  lead_profile_id: string | null;
  application_number: string | null;
  application_status: ApplicationStatus | null;
  applicant_category: ApplicantCategory | null;
  interest_course: CourseType | null;
  selected_center_id: string | null;
  learning_mode: LearningMode | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  assigned_fee: number | null;
  final_fee: number | null;
  payment_scheme: PaymentScheme | null;
  form_step_completed: number | null;
  application_created_at: string | null;

  // School type & scholarship (migration 010)
  school_type: SchoolType | null;
  scholarship_eligible: boolean;
  scholarship_status: ScholarshipApplicationStatus | null;

  // Fee payment flow (migration 20260222)
  allowed_payment_modes: AllowedPaymentModes | null;
  installment_1_amount: number | null;
  installment_2_amount: number | null;
  installment_2_due_days: number | null;
  admin_coupon_id: string | null;
  full_payment_discount: number | null;
  coupon_code: string | null;

  // Contact status
  contacted_status: ContactedStatus | null;

  // Demo class summary
  has_demo_registration: boolean;
  demo_registration_count: number;
  latest_demo_status: DemoRegistrationStatus | null;
  demo_attended: boolean;
  demo_survey_completed: boolean;

  // Payment summary
  total_paid: number;
  payment_status: PaymentStatus | null;
  has_pending_payment: boolean;
  payment_count: number;

  // Student profile
  student_profile_id: string | null;
  enrollment_date: string | null;
  batch_id: string | null;
  student_course_id: string | null;

  // Onboarding
  onboarding_status: OnboardingSessionStatus | null;
  onboarding_completed_at: string | null;
  onboarding_questions_answered: number;
}

/**
 * Filter/pagination options for CRM user list
 */
export interface UserJourneyListOptions {
  pipelineStage?: PipelineStage;
  excludeStages?: PipelineStage[];
  search?: string;
  status?: UserStatus;
  userType?: UserType;
  applicationStatus?: ApplicationStatus;
  interestCourse?: CourseType;
  hasDemoRegistration?: boolean;
  contactedStatus?: ContactedStatus;
  isDeadLead?: boolean;
  isIrrelevant?: boolean;
  excludeLinkedToClassroom?: boolean;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

/**
 * Counts per pipeline stage for the funnel component
 */
export interface PipelineStageCounts {
  new_lead: number;
  demo_requested: number;
  demo_attended: number;
  phone_verified: number;
  application_submitted: number;
  admin_approved: number;
  payment_complete: number;
  enrolled: number;
  total: number;
}

/**
 * Comprehensive user detail for CRM detail page
 */
export interface UserJourneyDetail {
  user: User;
  leadProfile: LeadProfile | null;
  studentProfile: StudentProfile | null;
  demoRegistrations: (DemoClassRegistration & { slot?: DemoClassSlot; survey?: DemoClassSurvey })[];
  payments: Payment[];
  installments: PaymentInstallment[];
  onboardingSession: OnboardingSession | null;
  onboardingResponses: (OnboardingResponse & { question?: OnboardingQuestion })[];
  documents: ApplicationDocument[];
  scholarshipApplication: ScholarshipApplication | null;
  cashbackClaims: CashbackClaim[];
  profileHistory: (UserProfileHistory & { changed_by_user?: Pick<User, 'id' | 'name' | 'email'> })[];
  adminNotes: AdminUserNote[];
  pipelineStage: PipelineStage;
  // Callback rescheduling (migration 20260307)
  callbackRequests: CallbackRequest[];
  callbackAttempts: CallbackAttempt[];
  // Nexus classroom enrollments
  nexusEnrollments: (NexusEnrollment & { classroom?: NexusClassroom })[];
  // Nexus onboarding documents
  nexusDocuments: NexusStudentDocument[];
  // Nexus onboarding status
  nexusOnboarding: NexusStudentOnboarding | null;
  // Nexus exam plans
  nexusExamPlans: NexusStudentExamPlan[];
}

/**
 * Admin user note
 */
export interface AdminUserNote {
  id: string;
  user_id: string;
  admin_id: string;
  admin_name: string;
  note: string;
  created_at: string;
}

// ============================================
// QUESTION SHARING (migration 20260301 + 20260302 v2)
// ============================================

export type QuestionPostStatus = 'pending' | 'approved' | 'rejected' | 'flagged';
export type NataQuestionCategory = 'mathematics' | 'general_aptitude' | 'drawing' | 'logical_reasoning' | 'aesthetic_sensitivity' | 'other';
export type VoteType = 'up' | 'down';

export interface QuestionPost extends Timestamps {
  id: string;
  user_id: string;
  title: string;
  body: string;
  category: NataQuestionCategory;
  exam_type: string;
  exam_year: number | null;
  exam_month: number | null;
  exam_session: string | null;
  image_urls: string[];
  tags: string[];
  session_count: number;
  // v2: vote system (replaces like_count)
  vote_score: number;
  upvote_count: number;
  downvote_count: number;
  comment_count: number;
  improvement_count: number;
  // v2: confidence and admin
  confidence_level: number; // 1-5
  is_admin_post: boolean;
  // Moderation
  status: QuestionPostStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

/** @deprecated Use QuestionVote instead */
export interface QuestionLike {
  id: string;
  question_id: string;
  user_id: string;
  created_at: string;
}

export interface QuestionVote {
  id: string;
  question_id: string;
  user_id: string;
  vote: VoteType;
  created_at: string;
}

export interface QuestionComment extends Timestamps {
  id: string;
  question_id: string;
  user_id: string;
  body: string;
  parent_id: string | null;
  vote_score: number; // v2: renamed from like_count
}

/** @deprecated Use CommentVote instead */
export interface CommentLike {
  id: string;
  comment_id: string;
  user_id: string;
  created_at: string;
}

export interface CommentVote {
  id: string;
  comment_id: string;
  user_id: string;
  vote: VoteType;
  created_at: string;
}

// v2: Question Improvements
export interface QuestionImprovement extends Timestamps {
  id: string;
  question_id: string;
  user_id: string;
  body: string;
  image_urls: string[];
  vote_score: number;
  upvote_count: number;
  downvote_count: number;
  is_accepted: boolean;
  status: QuestionPostStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

export interface QuestionImprovementDisplay extends QuestionImprovement {
  author: Pick<User, 'id' | 'name' | 'avatar_url' | 'user_type'>;
  user_vote?: VoteType | null;
}

export interface ImprovementVote {
  id: string;
  improvement_id: string;
  user_id: string;
  vote: VoteType;
  created_at: string;
}

/** Question post with author info for display */
export interface QuestionPostDisplay extends QuestionPost {
  author: Pick<User, 'id' | 'name' | 'avatar_url' | 'user_type'>;
  user_vote?: VoteType | null;
  best_improvement?: QuestionImprovementDisplay | null;
}

/** Comment with author info for display */
export interface QuestionCommentDisplay extends QuestionComment {
  author: Pick<User, 'id' | 'name' | 'avatar_url' | 'user_type'>;
  user_vote?: VoteType | null;
  replies?: QuestionCommentDisplay[];
}

export interface CreateQuestionPostInput {
  title: string;
  body: string;
  category: NataQuestionCategory;
  exam_type?: string;
  exam_year?: number;
  exam_month?: number;
  exam_session?: string;
  image_urls?: string[];
  tags?: string[];
  confidence_level?: number; // 1-5, default 3
}

export interface CreateQuestionCommentInput {
  question_id: string;
  body: string;
  parent_id?: string;
}

export interface CreateImprovementInput {
  question_id: string;
  body: string;
  image_urls?: string[];
}

// v2: Session Tracking (migration 20260303)
export interface QuestionSession {
  id: string;
  question_id: string;
  user_id: string;
  exam_year: number;
  exam_date: string | null;
  session_label: string | null;
  created_at: string;
}

export interface QuestionSessionDisplay extends QuestionSession {
  author: Pick<User, 'id' | 'name' | 'avatar_url'>;
}

export interface CreateQuestionSessionInput {
  question_id: string;
  exam_year: number;
  exam_date?: string;
  session_label?: string;
}

// Question Change Requests (migration 20260307)
export type QuestionChangeRequestType = 'edit' | 'delete';
export type QuestionChangeRequestStatus = 'pending' | 'approved' | 'rejected';

export interface QuestionChangeRequest {
  id: string;
  question_id: string;
  user_id: string;
  request_type: QuestionChangeRequestType;
  // Edit fields (null for delete requests)
  proposed_title: string | null;
  proposed_body: string | null;
  proposed_category: NataQuestionCategory | null;
  proposed_image_urls: string[];
  proposed_tags: string[];
  proposed_exam_year: number | null;
  proposed_exam_month: number | null;
  proposed_exam_session: string | null;
  // Delete field
  reason: string | null;
  // Admin moderation
  status: QuestionChangeRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface QuestionChangeRequestDisplay extends QuestionChangeRequest {
  author: Pick<User, 'id' | 'name' | 'avatar_url' | 'user_type'>;
  question: Pick<QuestionPost, 'id' | 'title' | 'body' | 'category' | 'status'>;
}

// Phase 3: Exam Profile Onboarding (migration 20260304)
export type NataExamStatus = 'attempted' | 'applied_waiting' | 'planning_to_apply' | 'not_interested';

export interface UserExamProfile {
  id: string;
  user_id: string;
  nata_status: NataExamStatus;
  attempt_count: number;
  next_exam_date: string | null;
  planning_year: number | null;
  qb_onboarding_completed: boolean;
  exam_details_completed: boolean;
  exam_details_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserExamAttempt {
  id: string;
  user_id: string;
  exam_date: string | null;
  exam_year: number;
  session_label: string | null;
  exam_city: string | null;
  exam_state: string | null;
  exam_center_id: string | null;
  user_reported_city: string | null;
  status: 'registered' | 'completed' | 'skipped';
  created_at: string;
}

export interface CreateExamProfileInput {
  nata_status: NataExamStatus;
  attempt_count?: number;
  next_exam_date?: string;
  planning_year?: number;
  attempts?: { exam_year: number; exam_date?: string; session_label?: string }[];
}

// Admin-managed exam schedule (migration 20260315)
export interface ExamScheduleSession {
  label: string;
  date: string;
  day: string;
}

export interface ExamSchedule {
  id: string;
  exam_type: string;
  exam_year: number;
  is_active: boolean;
  registration_open_date: string | null;
  registration_close_date: string | null;
  late_registration_close_date: string | null;
  sessions: ExamScheduleSession[];
  brochure_url: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamScheduleInput {
  exam_type: string;
  exam_year: number;
  is_active?: boolean;
  registration_open_date?: string;
  registration_close_date?: string;
  late_registration_close_date?: string;
  sessions: ExamScheduleSession[];
  brochure_url?: string;
  notes?: string;
}

// User exam details collection (migration 20260315)
export interface SaveExamDetailsInput {
  nata_status: NataExamStatus;
  planning_year?: number;
  sessions?: {
    session_label: string;
    exam_date: string;
    exam_city?: string;
    exam_state?: string;
    exam_center_id?: string;
    user_reported_city?: string;
  }[];
  same_city_all_sessions?: boolean;
}

export interface UserReportedExamCenter {
  id: string;
  user_id: string;
  exam_year: number;
  session_label: string | null;
  reported_city: string;
  reported_state: string | null;
  verification_status: 'pending' | 'verified' | 'rejected';
  verified_by: string | null;
  verified_at: string | null;
  linked_center_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamDetailAuditLog {
  id: string;
  user_id: string;
  action: 'created' | 'updated';
  changes: Record<string, { old?: unknown; new?: unknown }>;
  snapshot: Record<string, unknown>;
  created_at: string;
}

// Exam Planner types (migration 20260314)
// ExamPhase is defined in the Exam Tracking Enhancement section below (includes session_1/session_2)
export type ExamTimeSlot = 'morning' | 'afternoon';

export interface UserExamSessionPreference {
  id: string;
  user_id: string;
  exam_schedule_id: string | null;
  phase: ExamPhase;
  exam_date: string;
  time_slot: ExamTimeSlot;
  session_label: string;
  notes: string | null;
  created_at: string;
}

export interface UserReward {
  id: string;
  user_id: string;
  reward_type: string;
  points_awarded: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PlannerSession {
  date: string;
  day: string;
  phase: ExamPhase;
  timeSlot: ExamTimeSlot;
  timeLabel: string;
}

// Phase 4: Contribution Tracking (migration 20260305)
export interface UserQBStats {
  id: string;
  user_id: string;
  questions_posted: number;
  improvements_posted: number;
  sessions_reported: number;
  comments_posted: number;
  questions_viewed: number;
  contribution_score: number; // computed: questions*5 + improvements*3 + sessions*2 + comments*1
  created_at: string;
  updated_at: string;
}

/**
 * Access level derived from exam profile + contributions.
 * Used by frontend to control blur/access.
 */
export type QBAccessLevel =
  | 'full'           // Free full access (planning/waiting with future date)
  | 'blur_contribute' // Progressive blur — must contribute to unlock
  | 'blocked';       // Hard block (no profile or not interested)

export interface QBAccessInfo {
  accessLevel: QBAccessLevel;
  nataStatus: NataExamStatus | null;
  stats: UserQBStats | null;
  freeViews: number;      // How many free views remaining
  canVote: boolean;
  canComment: boolean;
  canPost: boolean;
}

// ============================================
// SCORE CALCULATIONS
// ============================================

export type CalculationPurpose =
  | 'actual_score'  // "This is my actual score"
  | 'prediction'    // "I'm predicting / planning"
  | 'target'        // "Testing a target I want to achieve"
  | 'exploring';    // "Just exploring"

export interface CutoffCalculatorInputData {
  board: string;
  qualificationType: '10+2' | 'diploma';
  maxMarks: number;
  marksSecured: number;
  attempts: Array<{ partA: number; partB: number }>;
  hasPreviousYear: boolean;
  previousYearScore: number;
  attemptCount: number;
}

export interface CutoffCalculatorResultData {
  boardConverted: number;
  boardPercentage: number;
  boardEligible: boolean;
  bestNataScore: number;
  finalCutoff: number;
  overallEligible: boolean;
  prevYearInvalid: boolean;
  nataExplanation: string;
}

export interface ScoreCalculation {
  id: string;
  user_id: string;
  tool_name: string;
  input_data: CutoffCalculatorInputData | Record<string, unknown>;
  result_data: CutoffCalculatorResultData | Record<string, unknown>;
  purpose: CalculationPurpose | null;
  label: string | null;
  academic_year: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// NATA 2026 CONTENT TABLES
// ============================================

export interface NataBrochure extends Timestamps {
  id: string;
  version: string;
  release_date: string;
  year: number;
  file_url: string;
  file_size_bytes: number | null;
  changelog: string | null;
  is_current: boolean;
  download_count: number;
  is_active: boolean;
  display_order: number;
  uploaded_by: string | null;
}

export interface NataFaq extends Timestamps {
  id: string;
  question: Record<string, string>;
  answer: Record<string, string>;
  category: string;
  page_slug: string | null;
  year: number;
  display_order: number;
  is_active: boolean;
}

export interface NataAnnouncement extends Timestamps {
  id: string;
  text: Record<string, string>;
  link: string | null;
  bg_color: string;
  text_color: string;
  severity: 'info' | 'warning' | 'urgent';
  year: number;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  priority: number;
}

export interface NataBanner extends Timestamps {
  id: string;
  spot: string;
  heading: Record<string, string>;
  subtext: Record<string, string>;
  image_url: string | null;
  mobile_image_url: string | null;
  cta_text: Record<string, string>;
  cta_link: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  display_order: number;
}

export type NataAssistanceStatus = 'pending' | 'contacted' | 'resolved' | 'closed';

export interface NataAssistanceRequest extends Timestamps {
  id: string;
  student_name: string;
  phone: string;
  district: string | null;
  school_name: string | null;
  category: string;
  status: NataAssistanceStatus;
  assigned_to: string | null;
  notes: string | null;
}

export interface CreateNataAssistanceRequestInput {
  student_name: string;
  phone: string;
  district?: string;
  school_name?: string;
  category?: string;
}

// ============================================
// CHATBOT CONVERSATIONS
// ============================================

export interface ChatbotConversation {
  id: string;
  user_id: string | null;
  session_id: string;
  user_message: string;
  ai_response: string | null;
  page_url: string | null;
  source: string;
  lead_name: string | null;
  lead_phone: string | null;
  model_used: string | null;
  response_time_ms: number | null;
  error: string | null;
  thumbs_up: boolean | null;
  admin_correction: string | null;
  promoted_to_kb: boolean;
  created_at: string;
}

// ============================================
// AINTRA KNOWLEDGE BASE
// ============================================

export interface AintraKnowledgeBaseItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// ============================================
// DATABASE SCHEMA TYPE
// ============================================

// Use auto-generated Database type from Supabase CLI (includes all tables including nexus_*)
export type { Database } from './database.generated';
export type { Json } from './database.generated';

// Legacy manual Database interface kept commented for reference
/*
interface _LegacyDatabase {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>;
      };
      lead_profiles: {
        Row: LeadProfile;
        Insert: Omit<LeadProfile, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<LeadProfile, 'id' | 'created_at' | 'updated_at'>>;
      };
      student_profiles: {
        Row: StudentProfile;
        Insert: Omit<StudentProfile, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<StudentProfile, 'id' | 'created_at' | 'updated_at'>>;
      };
      teacher_profiles: {
        Row: TeacherProfile;
        Insert: Omit<TeacherProfile, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<TeacherProfile, 'id' | 'created_at' | 'updated_at'>>;
      };
      courses: {
        Row: Course;
        Insert: Omit<Course, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Course, 'id' | 'created_at' | 'updated_at'>>;
      };
      batches: {
        Row: Batch;
        Insert: Omit<Batch, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Batch, 'id' | 'created_at' | 'updated_at'>>;
      };
      colleges: {
        Row: College;
        Insert: Omit<College, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<College, 'id' | 'created_at' | 'updated_at'>>;
      };
      cutoff_data: {
        Row: CutoffData;
        Insert: Omit<CutoffData, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<CutoffData, 'id' | 'created_at' | 'updated_at'>>;
      };
      exam_centers: {
        Row: ExamCenter;
        Insert: Omit<ExamCenter, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<ExamCenter, 'id' | 'created_at' | 'updated_at'>>;
      };
      tool_usage_logs: {
        Row: ToolUsageLog;
        Insert: Omit<ToolUsageLog, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<ToolUsageLog, 'id' | 'created_at' | 'updated_at'>>;
      };
      payments: {
        Row: Payment;
        Insert: Omit<Payment, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Payment, 'id' | 'created_at' | 'updated_at'>>;
      };
      blog_posts: {
        Row: BlogPost;
        Insert: Omit<BlogPost, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<BlogPost, 'id' | 'created_at' | 'updated_at'>>;
      };
      testimonials: {
        Row: Testimonial;
        Insert: Omit<Testimonial, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<Testimonial, 'id' | 'created_at' | 'updated_at'>>;
      };
      faqs: {
        Row: FAQ;
        Insert: Omit<FAQ, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<FAQ, 'id' | 'created_at' | 'updated_at'>>;
      };
      email_templates: {
        Row: EmailTemplate;
        Insert: Omit<EmailTemplate, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<EmailTemplate, 'id' | 'created_at' | 'updated_at'>>;
      };
      email_logs: {
        Row: EmailLog;
        Insert: Omit<EmailLog, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<EmailLog, 'id' | 'created_at' | 'updated_at'>>;
      };
      page_views: {
        Row: PageView;
        Insert: Omit<PageView, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<PageView, 'id' | 'created_at' | 'updated_at'>>;
      };
      // New tables for enhanced application form
      scholarship_applications: {
        Row: ScholarshipApplication;
        Insert: Omit<ScholarshipApplication, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<ScholarshipApplication, 'id' | 'created_at' | 'updated_at'>>;
      };
      cashback_claims: {
        Row: CashbackClaim;
        Insert: Omit<CashbackClaim, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<CashbackClaim, 'id' | 'created_at' | 'updated_at'>>;
      };
      application_documents: {
        Row: ApplicationDocument;
        Insert: Omit<ApplicationDocument, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<ApplicationDocument, 'id' | 'created_at' | 'updated_at'>>;
      };
      payment_installments: {
        Row: PaymentInstallment;
        Insert: Omit<PaymentInstallment, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<PaymentInstallment, 'id' | 'created_at' | 'updated_at'>>;
      };
      source_tracking: {
        Row: SourceTracking;
        Insert: Omit<SourceTracking, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<SourceTracking, 'id' | 'created_at'>>;
      };
      post_enrollment_details: {
        Row: PostEnrollmentDetails;
        Insert: Omit<PostEnrollmentDetails, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<PostEnrollmentDetails, 'id' | 'created_at' | 'updated_at'>>;
      };
      youtube_subscription_coupons: {
        Row: YouTubeSubscriptionCoupon;
        Insert: Omit<YouTubeSubscriptionCoupon, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<YouTubeSubscriptionCoupon, 'id' | 'created_at' | 'updated_at'>>;
      };
      // New tables for application form revamp (migration 005)
      offline_centers: {
        Row: OfflineCenter;
        Insert: Omit<OfflineCenter, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<OfflineCenter, 'id' | 'created_at' | 'updated_at'>>;
      };
      center_visit_bookings: {
        Row: CenterVisitBooking;
        Insert: Omit<CenterVisitBooking, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<CenterVisitBooking, 'id' | 'created_at' | 'updated_at'>>;
      };
      callback_requests: {
        Row: CallbackRequest;
        Insert: Omit<CallbackRequest, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<CallbackRequest, 'id' | 'created_at' | 'updated_at'>>;
      };
      pin_code_cache: {
        Row: PinCodeCache;
        Insert: Omit<PinCodeCache, 'created_at'>;
        Update: Partial<Omit<PinCodeCache, 'pincode' | 'created_at'>>;
      };
      application_deletions: {
        Row: ApplicationDeletion;
        Insert: Omit<ApplicationDeletion, 'id'> & { id?: string };
        Update: Partial<Omit<ApplicationDeletion, 'id' | 'lead_profile_id'>>;
      };
      education_boards: {
        Row: EducationBoard;
        Insert: Omit<EducationBoard, 'id'> & { id?: string };
        Update: Partial<Omit<EducationBoard, 'id'>>;
      };
      // Demo class tables (migration 006)
      demo_class_slots: {
        Row: DemoClassSlot;
        Insert: Omit<DemoClassSlot, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DemoClassSlot, 'id' | 'created_at' | 'updated_at'>>;
      };
      demo_class_registrations: {
        Row: DemoClassRegistration;
        Insert: Omit<DemoClassRegistration, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DemoClassRegistration, 'id' | 'created_at' | 'updated_at'>>;
      };
      demo_class_surveys: {
        Row: DemoClassSurvey;
        Insert: Omit<DemoClassSurvey, 'id' | 'submitted_at'> & { id?: string };
        Update: Partial<Omit<DemoClassSurvey, 'id' | 'registration_id' | 'submitted_at'>>;
      };
      // Onboarding & notifications tables (migration 007)
      onboarding_questions: {
        Row: OnboardingQuestion;
        Insert: Omit<OnboardingQuestion, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<OnboardingQuestion, 'id' | 'created_at' | 'updated_at'>>;
      };
      onboarding_responses: {
        Row: OnboardingResponse;
        Insert: Omit<OnboardingResponse, 'id' | 'responded_at'> & { id?: string };
        Update: Partial<Omit<OnboardingResponse, 'id' | 'user_id' | 'question_id'>>;
      };
      onboarding_sessions: {
        Row: OnboardingSession;
        Insert: Omit<OnboardingSession, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<OnboardingSession, 'id' | 'created_at' | 'updated_at'>>;
      };
      fee_structures: {
        Row: FeeStructure;
        Insert: Omit<FeeStructure, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<FeeStructure, 'id' | 'created_at' | 'updated_at'>>;
      };
      notification_recipients: {
        Row: NotificationRecipient;
        Insert: Omit<NotificationRecipient, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<NotificationRecipient, 'id' | 'created_at' | 'updated_at'>>;
      };
      admin_notifications: {
        Row: AdminNotification;
        Insert: Omit<AdminNotification, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<AdminNotification, 'id' | 'created_at'>>;
      };
      // Contact messages (migration 20260227)
      contact_messages: {
        Row: ContactMessage;
        Insert: Omit<ContactMessage, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<ContactMessage, 'id' | 'created_at'>>;
      };
      message_replies: {
        Row: MessageReply;
        Insert: Omit<MessageReply, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<MessageReply, 'id' | 'created_at'>>;
      };
      // Marketing content (dynamic CMS)
      marketing_content: {
        Row: MarketingContent;
        Insert: Omit<MarketingContent, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<MarketingContent, 'id' | 'created_at' | 'updated_at'>>;
      };
      job_postings: {
        Row: JobPosting;
        Insert: Omit<JobPosting, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<JobPosting, 'id' | 'created_at' | 'updated_at'>>;
      };
      job_applications: {
        Row: JobApplication;
        Insert: Omit<JobApplication, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<JobApplication, 'id' | 'created_at' | 'updated_at'>>;
      };
      // Question sharing tables (migration 20260301)
      question_posts: {
        Row: QuestionPost;
        Insert: Omit<QuestionPost, 'id' | 'created_at' | 'updated_at' | 'like_count' | 'comment_count'> & { id?: string };
        Update: Partial<Omit<QuestionPost, 'id' | 'created_at' | 'updated_at'>>;
      };
      question_likes: {
        Row: QuestionLike;
        Insert: Omit<QuestionLike, 'id' | 'created_at'> & { id?: string };
        Update: never;
      };
      question_comments: {
        Row: QuestionComment;
        Insert: Omit<QuestionComment, 'id' | 'created_at' | 'updated_at' | 'like_count'> & { id?: string };
        Update: Partial<Omit<QuestionComment, 'id' | 'created_at' | 'updated_at'>>;
      };
      comment_likes: {
        Row: CommentLike;
        Insert: Omit<CommentLike, 'id' | 'created_at'> & { id?: string };
        Update: never;
      };
      // CRM tables (migration 009)
      admin_user_notes: {
        Row: AdminUserNote;
        Insert: Omit<AdminUserNote, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<AdminUserNote, 'id' | 'created_at'>>;
      };
      // Question Bank v2 (migration 20260302)
      question_votes: {
        Row: QuestionVote;
        Insert: Omit<QuestionVote, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<QuestionVote, 'id' | 'created_at'>>;
      };
      question_improvements: {
        Row: QuestionImprovement;
        Insert: Omit<QuestionImprovement, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<QuestionImprovement, 'id' | 'created_at' | 'updated_at'>>;
      };
      improvement_votes: {
        Row: ImprovementVote;
        Insert: Omit<ImprovementVote, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<ImprovementVote, 'id' | 'created_at'>>;
      };
      comment_votes: {
        Row: CommentVote;
        Insert: Omit<CommentVote, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<CommentVote, 'id' | 'created_at'>>;
      };
      question_sessions: {
        Row: QuestionSession;
        Insert: Omit<QuestionSession, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<QuestionSession, 'id' | 'created_at'>>;
      };
      user_exam_profiles: {
        Row: UserExamProfile;
        Insert: Omit<UserExamProfile, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<UserExamProfile, 'id' | 'created_at' | 'updated_at'>>;
      };
      user_exam_attempts: {
        Row: UserExamAttempt;
        Insert: Omit<UserExamAttempt, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<UserExamAttempt, 'id' | 'created_at'>>;
      };
      user_exam_session_preferences: {
        Row: UserExamSessionPreference;
        Insert: Omit<UserExamSessionPreference, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<UserExamSessionPreference, 'id' | 'created_at'>>;
      };
      user_rewards: {
        Row: UserReward;
        Insert: Omit<UserReward, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<UserReward, 'id' | 'created_at'>>;
      };
      user_qb_stats: {
        Row: UserQBStats;
        Insert: Omit<UserQBStats, 'id' | 'created_at' | 'updated_at' | 'contribution_score'> & { id?: string };
        Update: Partial<Omit<UserQBStats, 'id' | 'created_at' | 'updated_at' | 'contribution_score'>>;
      };
      // Callback attempts (migration 20260307)
      callback_attempts: {
        Row: CallbackAttempt;
        Insert: Omit<CallbackAttempt, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<CallbackAttempt, 'id' | 'created_at'>>;
      };
      // Question change requests (migration 20260307)
      question_change_requests: {
        Row: QuestionChangeRequest;
        Insert: Omit<QuestionChangeRequest, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<QuestionChangeRequest, 'id' | 'created_at' | 'updated_at'>>;
      };
      // Direct enrollment links (migration 20260308)
      direct_enrollment_links: {
        Row: DirectEnrollmentLink;
        Insert: Omit<DirectEnrollmentLink, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DirectEnrollmentLink, 'id' | 'created_at' | 'updated_at'>>;
      };
      // Post-enrollment onboarding (migration 20260309)
      onboarding_step_definitions: {
        Row: OnboardingStepDefinition;
        Insert: Omit<OnboardingStepDefinition, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<OnboardingStepDefinition, 'id' | 'created_at' | 'updated_at'>>;
      };
      student_onboarding_progress: {
        Row: StudentOnboardingProgress;
        Insert: Omit<StudentOnboardingProgress, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<StudentOnboardingProgress, 'id' | 'created_at' | 'updated_at'>>;
      };
      // Course group links (migration 20260328)
      course_group_links: {
        Row: CourseGroupLinks;
        Insert: Omit<CourseGroupLinks, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<CourseGroupLinks, 'id' | 'created_at' | 'updated_at'>>;
      };
      // NATA 2026 content tables (migration 20260311)
      nata_brochures: {
        Row: NataBrochure;
        Insert: Omit<NataBrochure, 'id' | 'created_at' | 'updated_at' | 'download_count'> & { id?: string };
        Update: Partial<Omit<NataBrochure, 'id' | 'created_at' | 'updated_at'>>;
      };
      nata_faqs: {
        Row: NataFaq;
        Insert: Omit<NataFaq, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<NataFaq, 'id' | 'created_at' | 'updated_at'>>;
      };
      nata_announcements: {
        Row: NataAnnouncement;
        Insert: Omit<NataAnnouncement, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<NataAnnouncement, 'id' | 'created_at' | 'updated_at'>>;
      };
      nata_banners: {
        Row: NataBanner;
        Insert: Omit<NataBanner, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<NataBanner, 'id' | 'created_at' | 'updated_at'>>;
      };
      nata_assistance_requests: {
        Row: NataAssistanceRequest;
        Insert: Omit<NataAssistanceRequest, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<NataAssistanceRequest, 'id' | 'created_at' | 'updated_at'>>;
      };
      chatbot_conversations: {
        Row: ChatbotConversation;
        Insert: Omit<ChatbotConversation, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<ChatbotConversation, 'id' | 'created_at'>>;
      };
    };
    Views: {
      user_journey_view: {
        Row: UserJourney;
      };
    };
    Functions: Record<string, never>;
    Enums: {
      user_type: UserType;
      user_status: UserStatus;
      payment_status: PaymentStatus;
      application_source: ApplicationSource;
      course_type: CourseType;
      exam_type: ExamType;
      scholarship_verification_status: ScholarshipVerificationStatus;
      cashback_type: CashbackType;
      cashback_status: CashbackStatus;
      document_type: DocumentType;
      installment_status: InstallmentStatus;
      payment_scheme: PaymentScheme;
      source_category: SourceCategory;
      caste_category: CasteCategory;
      // New enums (migration 005)
      applicant_category: ApplicantCategory;
      application_status: ApplicationStatus;
      location_source: LocationSource;
      callback_status: CallbackStatus;
      callback_slot: CallbackSlot;
      visit_booking_status: VisitBookingStatus;
      deletion_type: DeletionType;
      course_category: CourseCategory;
      // Demo class enums (migration 006)
      demo_slot_status: DemoSlotStatus;
      demo_registration_status: DemoRegistrationStatus;
      demo_mode: DemoMode;
      enrollment_interest: EnrollmentInterest;
      // Onboarding & notification enums (migration 007)
      onboarding_question_type: OnboardingQuestionType;
      onboarding_session_status: OnboardingSessionStatus;
      program_type: ProgramType;
      notification_event_type: NotificationEventType;
      notification_recipient_role: NotificationRecipientRole;
      // School type & scholarship enums (migration 010)
      school_type: SchoolType;
      scholarship_application_status: ScholarshipApplicationStatus;
      // Refund request enum
      refund_request_status: RefundRequestStatus;
      // Marketing content enums
      marketing_content_type: MarketingContentType;
      marketing_content_status: MarketingContentStatus;
      // Center type enum (migration 20260227)
      center_type: CenterType;
      // Question sharing enums (migration 20260301 + 20260302)
      question_post_status: QuestionPostStatus;
      nata_question_category: NataQuestionCategory;
      vote_type: VoteType;
      // Callback & change request enums (migration 20260307)
      callback_outcome: CallbackOutcome;
      question_change_request_type: QuestionChangeRequestType;
      question_change_request_status: QuestionChangeRequestStatus;
      // Direct enrollment link enums (migration 20260308)
      direct_enrollment_link_status: DirectEnrollmentLinkStatus;
    };
  };
}
*/

// ============================================
// COA INSTITUTIONS
// ============================================

// ============================================
// COUNSELING COLLEGE DIRECTORY
// ============================================

/**
 * Maps counseling-system-specific college codes to college names.
 * Each counseling system (TNEA, KEAM, etc.) has its own code namespace.
 */
export interface CounselingCollegeDirectory {
  id: string;
  counseling_system_id: string;
  college_code: string;
  college_name: string;
  city: string | null;
  district: string | null;
  coa_institution_code: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Similar student entry — may include college info when data source is allotment data
 */
export interface SimilarStudent {
  rank: number;
  aggregate_mark: number;
  community: string;
  community_rank: number | null;
  // Present only when data source is allotment_list:
  candidate_name?: string;
  college_code?: string;
  college_name?: string;
  allotted_category?: string;
}

export type CoaApprovalStatus = 'active' | 'expiring' | 'unknown';

export interface CoaInstitution {
  id: string;
  institution_code: string;
  name: string;
  head_of_dept: string | null;
  address: string | null;
  city: string;
  state: string;
  pincode: string | null;
  affiliating_university: string | null;
  course_name: string;
  commenced_year: number | null;
  current_intake: number | null;
  approval_period_raw: string;
  approval_status: CoaApprovalStatus;
  valid_for_2025_26: boolean;
  phone: string | null;
  fax: string | null;
  email: string | null;
  mobile: string | null;
  website: string | null;
  data_source_url: string | null;
  last_scraped_at: string;
  created_at: string;
  updated_at: string;
}

export interface CoaStatStat {
  state: string;
  college_count: number;
  total_seats: number;
  active_colleges: number;
  active_seats: number;
  expiring_colleges: number;
  oldest_program: number | null;
  newest_program: number | null;
}

// Device Sessions & Diagnostics
export interface UserDeviceSession {
  id: string;
  user_id: string;
  device_type: string | null;
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  os_version: string | null;
  user_agent: string | null;
  screen_width: number | null;
  screen_height: number | null;
  device_pixel_ratio: number | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  timezone: string | null;
  connection_type: string | null;
  effective_bandwidth: number | null;
  language: string | null;
  app_version: string | null;
  is_pwa: boolean;
  session_start: string;
  last_active: string;
  created_at: string;
}

export type UserDeviceSessionInsert = Omit<UserDeviceSession, 'id' | 'created_at' | 'session_start' | 'last_active'>;

export interface UserErrorLog {
  id: string;
  user_id: string | null;
  session_id: string | null;
  error_type: string | null;
  error_message: string | null;
  error_stack: string | null;
  page_url: string | null;
  component: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  created_at: string;
}

export type UserErrorLogInsert = Omit<UserErrorLog, 'id' | 'created_at'>;

// Student Device Registration & Usage Tracking
export type DeviceCategory = 'desktop' | 'mobile';

export interface StudentRegisteredDevice {
  id: string;
  user_id: string;
  device_fingerprint: string;
  device_category: DeviceCategory;
  device_name: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  os_version: string | null;
  screen_width: number | null;
  screen_height: number | null;
  is_pwa: boolean;
  last_latitude: number | null;
  last_longitude: number | null;
  last_location_accuracy: number | null;
  last_city: string | null;
  last_state: string | null;
  last_country: string | null;
  location_consent_given: boolean;
  last_seen_at: string;
  total_active_seconds: number;
  session_count: number;
  is_active: boolean;
  registered_at: string;
  created_at: string;
  updated_at: string;
}

export type StudentRegisteredDeviceInsert = Omit<
  StudentRegisteredDevice,
  'id' | 'created_at' | 'updated_at' | 'registered_at' | 'last_seen_at' | 'total_active_seconds' | 'session_count' | 'is_active' | 'last_latitude' | 'last_longitude' | 'last_location_accuracy' | 'last_city' | 'last_state' | 'last_country' | 'location_consent_given'
>;

export interface DeviceActivityLog {
  id: string;
  user_id: string;
  device_id: string;
  session_id: string | null;
  active_seconds: number;
  idle_seconds: number;
  session_date: string;
  created_at: string;
}

export type DeviceActivityLogInsert = Omit<DeviceActivityLog, 'id' | 'created_at'>;

// Analytics aggregate types
export interface DeviceDistributionStats {
  total_students: number;
  both_devices: number;
  desktop_only: number;
  mobile_only: number;
  no_devices: number;
}

export interface StudentDeviceSummary {
  user_id: string;
  user_name: string;
  user_email: string | null;
  user_avatar: string | null;
  devices: StudentRegisteredDevice[];
  total_active_time: number;
  last_active: string | null;
  device_status: 'both' | 'desktop_only' | 'mobile_only' | 'none';
}

// Device Swap Requests
export type DeviceSwapRequestStatus = 'pending' | 'approved' | 'rejected';

export interface DeviceSwapRequest {
  id: string;
  user_id: string;
  device_category: DeviceCategory;
  reason: string;
  status: DeviceSwapRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceSwapRequestWithUser extends DeviceSwapRequest {
  user_name: string;
  user_email: string | null;
  user_avatar: string | null;
}

// ============================================
// NEXUS CLASSROOM MANAGEMENT TYPES
// ============================================

export type NexusClassroomType = 'nata' | 'jee' | 'revit' | 'other';
export type NexusEnrollmentRole = 'teacher' | 'student';
export type NexusTopicCategory = 'mathematics' | 'aptitude' | 'drawing' | 'architecture_awareness' | 'general';
export type NexusClassStatus = 'scheduled' | 'live' | 'completed' | 'cancelled' | 'rescheduled';
export type NexusAttendanceSource = 'teams' | 'manual';
export type NexusRsvpResponse = 'attending' | 'not_attending';
export type NexusTopicProgressStatus = 'not_started' | 'attended' | 'completed' | 'skipped';
export type NexusResourceType = 'pdf' | 'image' | 'youtube' | 'onenote' | 'link';
export type RemovalReasonCategory = 'fee_nonpayment' | 'course_completed' | 'college_admitted' | 'self_withdrawal' | 'disciplinary' | 'other';
export type EnrollmentHistoryAction = 'enrolled' | 'removed' | 'restored';

export interface NexusClassroom extends Timestamps {
  id: string;
  name: string;
  type: NexusClassroomType;
  description: string | null;
  ms_team_id: string | null;
  ms_team_name: string | null;
  ms_team_sync_enabled: boolean;
  is_active: boolean;
  created_by: string | null;
}

export interface NexusBatch extends Timestamps {
  id: string;
  classroom_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface NexusEnrollment {
  id: string;
  user_id: string;
  classroom_id: string;
  batch_id: string | null;
  role: NexusEnrollmentRole;
  enrolled_at: string;
  is_active: boolean;
  removed_at: string | null;
  removed_by: string | null;
  removal_reason_category: RemovalReasonCategory | null;
  removal_notes: string | null;
}

export interface ProgressSnapshot {
  attendance: { total: number; attended: number; percentage: number };
  checklist: { completed: number; total: number };
  topics: { completed: number; total: number };
  batch_name: string | null;
  enrolled_at: string;
  removed_at: string;
}

export interface NexusEnrollmentHistory {
  id: string;
  enrollment_id: string;
  classroom_id: string;
  user_id: string;
  action: EnrollmentHistoryAction;
  reason_category: RemovalReasonCategory | null;
  notes: string | null;
  performed_by: string;
  progress_snapshot: ProgressSnapshot | null;
  created_at: string;
}

export interface HistoricalStudent {
  enrollment_id: string;
  user: { id: string; name: string; email: string; avatar_url: string | null };
  batch_name: string | null;
  enrolled_at: string;
  removed_at: string;
  removed_by: { id: string; name: string };
  reason_category: RemovalReasonCategory;
  notes: string | null;
  progress_snapshot: ProgressSnapshot | null;
}

export interface NexusParentLink {
  id: string;
  parent_user_id: string | null;
  student_user_id: string;
  invite_token: string;
  invite_expires_at: string;
  linked_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface NexusTopic extends Timestamps {
  id: string;
  classroom_id: string;
  title: string;
  description: string | null;
  category: NexusTopicCategory | null;
  sort_order: number;
  is_active: boolean;
}

export interface NexusScheduledClass extends Timestamps {
  id: string;
  classroom_id: string;
  batch_id: string | null;
  topic_id: string | null;
  teacher_id: string | null;
  title: string;
  description: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  teams_meeting_url: string | null;
  teams_meeting_id: string | null;
  teams_meeting_join_url: string | null;
  recording_url: string | null;
  recording_duration_minutes: number | null;
  transcript_url: string | null;
  recording_fetched_at: string | null;
  status: NexusClassStatus;
  rescheduled_to: string | null;
  notes: string | null;
  teams_meeting_scope: 'link_only' | 'channel_meeting' | 'calendar_event' | null;
  recurrence_rule: string | null;
  recurrence_group_id: string | null;
  lobby_bypass: string | null;
  allowed_presenters: string | null;
}

export interface NexusAttendance {
  id: string;
  scheduled_class_id: string;
  student_id: string;
  attended: boolean;
  joined_at: string | null;
  left_at: string | null;
  duration_minutes: number | null;
  source: NexusAttendanceSource;
  created_at: string;
}

export interface NexusClassRsvp {
  id: string;
  scheduled_class_id: string;
  student_id: string;
  response: NexusRsvpResponse;
  reason: string | null;
  responded_at: string;
}

export interface NexusClassReview {
  id: string;
  scheduled_class_id: string;
  student_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface NexusChecklistItem extends Timestamps {
  id: string;
  classroom_id: string;
  topic_id: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface NexusChecklistResource {
  id: string;
  checklist_item_id: string;
  title: string;
  resource_type: NexusResourceType | null;
  url: string;
  sort_order: number;
  created_at: string;
}

export interface NexusStudentChecklistProgress {
  id: string;
  student_id: string;
  checklist_item_id: string;
  is_completed: boolean;
  completed_at: string | null;
}

export interface NexusStudentTopicProgress {
  id: string;
  student_id: string;
  topic_id: string;
  classroom_id: string;
  status: NexusTopicProgressStatus;
  completed_at: string | null;
}

// ============================================
// NEXUS DOCUMENT VAULT TYPES
// ============================================

export type DocumentStandard = '10th' | '11th' | '12th' | 'gap_year';
export type DocumentCategory = 'identity' | 'academic' | 'exam' | 'photo' | 'other';
export type DocumentStatus = 'pending' | 'verified' | 'rejected';
export type ExamPlanState = 'still_thinking' | 'planning_to_write' | 'applied' | 'completed';
export type ExamPlanType = 'nata' | 'jee';
export type DocumentAuditAction = 'uploaded' | 'verified' | 'rejected' | 're_uploaded' | 'soft_deleted' | 'hard_deleted' | 'restored';

export interface NexusDocumentTemplate {
  id: string;
  name: string;
  description: string | null;
  category: DocumentCategory;
  applicable_standards: DocumentStandard[];
  is_required: boolean;
  unlock_date: string | null;
  linked_exam: 'nata' | 'jee' | 'both' | null;
  exam_state_threshold: ExamPlanState | null;
  max_file_size_mb: number;
  allowed_file_types: string[];
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  is_onboarding_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface NexusStudentExamPlan {
  id: string;
  student_id: string;
  classroom_id: string;
  exam_type: ExamPlanType;
  state: ExamPlanState;
  application_number: string | null;
  notes: string | null;
  last_prompted_at: string | null;
  next_prompt_at: string | null;
  prompt_snooze_until: string | null;
  updated_at: string;
  created_at: string;
}

export interface NexusStudentDocument {
  id: string;
  student_id: string;
  classroom_id: string;
  category: DocumentCategory;
  title: string;
  file_url: string;
  file_type: string | null;
  uploaded_at: string;
  verified_by: string | null;
  verified_at: string | null;
  status: DocumentStatus;
  notes: string | null;
  template_id: string | null;
  sharepoint_item_id: string | null;
  sharepoint_web_url: string | null;
  file_size_bytes: number | null;
  version: number;
  is_current: boolean;
  previous_version_id: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  rejection_reason: string | null;
  uploaded_by: string | null;
}

export interface NexusDocumentAuditLog {
  id: string;
  document_id: string | null;
  student_id: string;
  classroom_id: string;
  action: DocumentAuditAction;
  performed_by: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================
// EXAM TRACKING ENHANCEMENT TYPES
// ============================================

export type ExamPhase = 'phase_1' | 'phase_2' | 'session_1' | 'session_2';
export type ExamAttemptState = 'planning' | 'applied' | 'completed' | 'scorecard_uploaded';
export type ExamBroadcastType = 'scorecard_released' | 'registration_reminder' | 'general';

export interface NexusExamDate {
  id: string;
  exam_type: ExamPlanType;
  year: number;
  phase: ExamPhase;
  attempt_number: number;
  exam_date: string;
  label: string | null;
  registration_deadline: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NexusStudentExamRegistration {
  id: string;
  student_id: string;
  classroom_id: string;
  exam_type: ExamPlanType;
  is_writing: boolean;
  application_number: string | null;
  application_summary_doc_id: string | null;
  notes: string | null;
  updated_at: string;
  created_at: string;
}

export interface NexusStudentExamAttempt {
  id: string;
  student_id: string;
  classroom_id: string;
  exam_type: ExamPlanType;
  phase: ExamPhase;
  attempt_number: number;
  exam_date_id: string | null;
  state: ExamAttemptState;
  application_date: string | null;
  exam_completed_at: string | null;
  scorecard_reminder_sent: boolean;
  aptitude_score: number | null;
  drawing_score: number | null;
  total_score: number | null;
  notes: string | null;
  updated_at: string;
  created_at: string;
}

export interface NexusExamBroadcast {
  id: string;
  classroom_id: string;
  exam_type: ExamPlanType;
  broadcast_type: ExamBroadcastType;
  message: string | null;
  sent_by: string;
  created_at: string;
}

// ============================================
// NEXUS STUDENT ONBOARDING TYPES
// ============================================

export type OnboardingStep = 'welcome' | 'documents' | 'student_info' | 'exam_status' | 'device_setup' | 'pending_review';
export type OnboardingStatus = 'in_progress' | 'submitted' | 'approved' | 'rejected';

export interface NexusStudentOnboarding {
  id: string;
  student_id: string;
  classroom_id: string | null;
  current_step: OnboardingStep;
  current_standard: DocumentStandard | null;
  academic_year: string | null;
  status: OnboardingStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  last_nudge_at: string | null;
  nudge_count: number;
  created_at: string;
  updated_at: string;
}

export interface NexusStudentOnboardingWithStudent extends NexusStudentOnboarding {
  student: Pick<User, 'id' | 'name' | 'email' | 'avatar_url'>;
}

// Nexus joined types for queries
export interface NexusEnrollmentWithUser extends NexusEnrollment {
  user: User;
}

export interface NexusScheduledClassWithTopic extends NexusScheduledClass {
  topic: NexusTopic | null;
  teacher: Pick<User, 'id' | 'name' | 'avatar_url'> | null;
  batch: Pick<NexusBatch, 'id' | 'name'> | null;
}

export interface NexusClassReviewWithStudent extends NexusClassReview {
  student: Pick<User, 'id' | 'name' | 'avatar_url'>;
}

export interface NexusClassRsvpWithStudent extends NexusClassRsvp {
  student: Pick<User, 'id' | 'name' | 'avatar_url'>;
}

export interface NexusChecklistItemWithResources extends NexusChecklistItem {
  topic: NexusTopic | null;
  resources: NexusChecklistResource[];
}

export interface NexusChecklistItemWithProgress extends NexusChecklistItemWithResources {
  progress: NexusStudentChecklistProgress | null;
}

// ============================================
// NEXUS MODULAR CHECKLISTS TYPES
// ============================================

export type NexusModuleType = 'foundation' | 'custom';
export type NexusModuleItemType = 'video' | 'document' | 'quiz_paper' | 'link' | 'chapter';
export type NexusChecklistEntryType = 'module' | 'simple_item';

export interface NexusModule {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  module_type: NexusModuleType;
  is_published: boolean;
  category: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NexusModuleItem {
  id: string;
  module_id: string;
  title: string;
  item_type: NexusModuleItemType;
  content_url: string | null;
  youtube_video_id: string | null;
  video_source: 'youtube' | 'sharepoint' | null;
  sharepoint_video_url: string | null;
  video_duration_seconds: number | null;
  chapter_number: number | null;
  is_published: boolean;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  pdf_page_count: number | null;
  pdf_onedrive_item_id: string | null;
  pdf_source: 'upload' | 'link' | null;
  solution_video_source: 'youtube' | 'sharepoint' | null;
  solution_youtube_video_id: string | null;
  solution_sharepoint_video_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface NexusModuleItemSection {
  id: string;
  module_item_id: string;
  title: string;
  description: string | null;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
  sort_order: number;
  min_questions_to_pass: number | null;
  created_at: string;
}

export interface NexusModuleItemQuizQuestion {
  id: string;
  section_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'a' | 'b' | 'c' | 'd';
  explanation: string | null;
  sort_order: number;
  created_at: string;
}

export interface NexusModuleStudentProgress {
  id: string;
  student_id: string;
  module_item_id: string;
  status: 'locked' | 'in_progress' | 'completed';
  started_at: string | null;
  completed_at: string | null;
  last_section_id: string | null;
  last_video_position_seconds: number;
  last_pdf_page: number;
  last_audio_position_seconds: number;
  last_audio_language: string | null;
  created_at: string;
  updated_at: string;
}

export interface NexusModuleQuizAttempt {
  id: string;
  student_id: string;
  section_id: string;
  score_pct: number;
  answers: Record<string, string>;
  passed: boolean;
  attempt_number: number;
  created_at: string;
}

export interface NexusModuleStudentNote {
  id: string;
  student_id: string;
  section_id: string;
  note_text: string;
  video_timestamp_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface NexusModuleItemSectionWithQuiz extends NexusModuleItemSection {
  quiz_questions: NexusModuleItemQuizQuestion[];
  quiz_attempt: NexusModuleQuizAttempt | null;
  note: NexusModuleStudentNote | null;
}

export interface NexusModuleItemWithSections extends NexusModuleItem {
  sections: NexusModuleItemSectionWithQuiz[];
  progress: NexusModuleStudentProgress | null;
  section_count: number;
  completed_sections: number;
}

export interface NexusChecklist {
  id: string;
  title: string;
  description: string | null;
  created_by: string | null;
  is_active: boolean;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface NexusChecklistEntry {
  id: string;
  checklist_id: string;
  entry_type: NexusChecklistEntryType;
  module_id: string | null;
  title: string | null;
  topic_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface NexusChecklistEntryResource {
  id: string;
  entry_id: string;
  resource_type: string;
  url: string;
  created_at: string;
}

export interface NexusChecklistClassroom {
  id: string;
  checklist_id: string;
  classroom_id: string;
  created_at: string;
}

export type NexusProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface NexusStudentEntryProgress {
  id: string;
  student_id: string;
  entry_id: string;
  is_completed: boolean;
  status: NexusProgressStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface NexusStudentModuleItemProgress {
  id: string;
  student_id: string;
  module_item_id: string;
  is_completed: boolean;
  status: NexusProgressStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// Composite types
export interface NexusModuleWithItems extends NexusModule {
  items: NexusModuleItem[];
}

export interface NexusChecklistEntryWithDetails extends NexusChecklistEntry {
  module: NexusModuleWithItems | null;
  resources: NexusChecklistEntryResource[];
}

export interface NexusChecklistWithEntries extends NexusChecklist {
  entries: NexusChecklistEntryWithDetails[];
  classrooms: NexusChecklistClassroom[];
}

export interface NexusChecklistForStudent extends NexusChecklist {
  entries: (NexusChecklistEntryWithDetails & {
    progress: NexusStudentEntryProgress | null;
    module_item_progress?: NexusStudentModuleItemProgress[];
  })[];
}

// ============================================
// NEXUS FOUNDATION MODULE TYPES
// ============================================

export type FoundationChapterStatus = 'locked' | 'in_progress' | 'completed';

export interface NexusFoundationChapter {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  video_source: 'youtube' | 'sharepoint' | null;
  youtube_video_id: string | null;
  sharepoint_video_url: string | null;
  video_duration_seconds: number | null;
  chapter_number: number;
  min_quiz_score_pct: number;
  is_published: boolean;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  pdf_page_count: number | null;
  pdf_onedrive_item_id: string | null;
  pdf_source: 'upload' | 'link' | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NexusAudioTrack {
  id: string;
  chapter_id: string | null;
  module_item_id: string | null;
  language: string;
  language_label: string;
  audio_url: string;
  audio_storage_path: string;
  onedrive_item_id: string | null;
  audio_duration_seconds: number | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NexusFoundationSection {
  id: string;
  chapter_id: string;
  title: string;
  description: string | null;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
  sort_order: number;
  min_questions_to_pass: number | null;
  created_at: string;
}

export interface NexusFoundationQuizQuestion {
  id: string;
  section_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'a' | 'b' | 'c' | 'd';
  explanation: string | null;
  sort_order: number;
  created_at: string;
}

export interface NexusFoundationStudentProgress {
  id: string;
  student_id: string;
  chapter_id: string;
  status: FoundationChapterStatus;
  started_at: string | null;
  completed_at: string | null;
  last_section_id: string | null;
  last_video_position_seconds: number;
  last_pdf_page: number;
  last_audio_position_seconds: number;
  last_audio_language: string | null;
  created_at: string;
  updated_at: string;
}

export interface NexusFoundationQuizAttempt {
  id: string;
  student_id: string;
  section_id: string;
  score_pct: number;
  answers: Record<string, string>;
  passed: boolean;
  attempt_number: number;
  created_at: string;
}

export interface NexusFoundationStudentNote {
  id: string;
  student_id: string;
  section_id: string;
  note_text: string;
  video_timestamp_seconds: number | null;
  created_at: string;
  updated_at: string;
}

// Foundation joined types

export interface NexusFoundationChapterWithProgress extends NexusFoundationChapter {
  progress: NexusFoundationStudentProgress | null;
  section_count: number;
  completed_sections: number;
}

export interface NexusFoundationSectionWithQuiz extends NexusFoundationSection {
  quiz_questions: NexusFoundationQuizQuestion[];
  quiz_attempt: NexusFoundationQuizAttempt | null;
  note: NexusFoundationStudentNote | null;
}

// Foundation watch sessions (engagement analytics)

export interface NexusFoundationWatchSession {
  id: string;
  student_id: string;
  chapter_id: string;
  section_id: string;
  watched_seconds: number;
  section_duration_seconds: number;
  completion_pct: number;
  play_count: number;
  pause_count: number;
  seek_count: number;
  device_type: 'mobile' | 'tablet' | 'desktop' | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface NexusFoundationWatchSessionUpsert {
  id: string;
  section_id: string;
  watched_seconds: number;
  section_duration_seconds: number;
  completion_pct: number;
  play_count: number;
  pause_count: number;
  seek_count: number;
  device_type: 'mobile' | 'tablet' | 'desktop';
}

// Foundation feedback & issues

export type FoundationReactionType = 'like' | 'dislike';
export type FoundationIssueStatus = 'open' | 'in_progress' | 'resolved' | 'awaiting_confirmation' | 'closed';

export interface NexusFoundationReaction {
  id: string;
  student_id: string;
  chapter_id: string;
  reaction: FoundationReactionType;
  created_at: string;
  updated_at: string;
}

export type FoundationIssuePriority = 'low' | 'medium' | 'high';

export type FoundationIssueCategory = 'bug' | 'content_issue' | 'ui_ux' | 'feature_request' | 'class_schedule' | 'other';

export type FoundationIssueAction =
  | 'created'
  | 'assigned'
  | 'accepted'
  | 'delegated'
  | 'returned'
  | 'marked_in_progress'
  | 'resolved'
  | 'reopened'
  | 'comment'
  | 'confirmed'
  | 'auto_closed';

export interface NexusFoundationIssue {
  id: string;
  student_id: string;
  chapter_id: string | null;
  section_id: string | null;
  title: string;
  description: string;
  status: FoundationIssueStatus;
  priority: FoundationIssuePriority;
  assigned_to: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  ticket_number: string;
  category: FoundationIssueCategory;
  screenshot_urls: string[] | null;
  page_url: string | null;
  auto_close_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NexusFoundationIssueWithDetails extends NexusFoundationIssue {
  student_name: string;
  student_avatar: string | null;
  chapter_title: string;
  chapter_number: number;
  section_title: string | null;
  resolved_by_name: string | null;
  assigned_to_name: string | null;
  assigned_by_name: string | null;
}

export interface NexusFoundationIssueActivity {
  id: string;
  issue_id: string;
  actor_id: string;
  action: FoundationIssueAction;
  target_user_id: string | null;
  reason: string | null;
  old_status: string | null;
  new_status: string | null;
  created_at: string;
  // Joined fields
  actor_name?: string;
  target_user_name?: string;
}

export interface NexusFoundationReactionCounts {
  chapter_id: string;
  like_count: number;
  dislike_count: number;
}

// Foundation transcript types
export interface TranscriptEntry {
  start: number;
  end: number;
  text: string;
}

export interface NexusFoundationTranscript {
  id: string;
  chapter_id: string;
  language: string;
  entries: TranscriptEntry[];
  created_at: string;
  updated_at: string;
}

// Foundation admin types (for teacher CMS)

export interface NexusFoundationChapterInsert {
  title: string;
  description?: string | null;
  video_source?: 'youtube' | 'sharepoint' | null;
  youtube_video_id?: string | null;
  sharepoint_video_url?: string | null;
  video_duration_seconds?: number | null;
  chapter_number: number;
  min_quiz_score_pct?: number;
  is_published?: boolean;
  pdf_url?: string | null;
  pdf_storage_path?: string | null;
  pdf_page_count?: number | null;
  pdf_onedrive_item_id?: string | null;
  pdf_source?: 'upload' | 'link' | null;
  created_by?: string | null;
}

export interface NexusFoundationChapterUpdate {
  title?: string;
  description?: string | null;
  video_source?: 'youtube' | 'sharepoint' | null;
  youtube_video_id?: string | null;
  sharepoint_video_url?: string | null;
  video_duration_seconds?: number | null;
  chapter_number?: number;
  min_quiz_score_pct?: number;
  is_published?: boolean;
  pdf_url?: string | null;
  pdf_storage_path?: string | null;
  pdf_page_count?: number | null;
  pdf_onedrive_item_id?: string | null;
  pdf_source?: 'upload' | 'link' | null;
}

export interface NexusFoundationSectionInsert {
  chapter_id: string;
  title: string;
  description?: string | null;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
  sort_order: number;
  min_questions_to_pass?: number | null;
}

export interface NexusFoundationSectionUpdate {
  title?: string;
  description?: string | null;
  start_timestamp_seconds?: number;
  end_timestamp_seconds?: number;
  sort_order?: number;
  min_questions_to_pass?: number | null;
}

export interface NexusFoundationQuizQuestionInsert {
  section_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'a' | 'b' | 'c' | 'd';
  explanation?: string | null;
  sort_order: number;
}

export interface NexusFoundationQuizQuestionUpdate {
  question_text?: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  correct_option?: 'a' | 'b' | 'c' | 'd';
  explanation?: string | null;
  sort_order?: number;
}

export interface NexusFoundationChapterAdmin extends NexusFoundationChapter {
  section_count: number;
  question_count: number;
}

// ============================================
// QUESTION BANK (PYQ Learning System)
// ============================================

// QB Enums
export type QBQuestionFormat = 'MCQ' | 'NUMERICAL' | 'DRAWING_PROMPT' | 'IMAGE_BASED';
export type QBDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type QBExamType = 'JEE_PAPER_2' | 'NATA';
export type QBExamRelevance = 'JEE' | 'NATA' | 'BOTH';
export type QBAttemptMode = 'practice' | 'year_paper';
export type QBQuestionStatus = 'draft' | 'answer_keyed' | 'complete' | 'active';
export type QBPaperUploadStatus = 'pending' | 'parsed' | 'answer_keyed' | 'complete';

// Recalled papers enums
export type QBConfidenceTier = 1 | 2 | 3; // 1=Verified, 2=Recalled, 3=Topic Only
export type QBAnswerSource = 'official' | 'teacher_verified' | 'student_recalled' | 'unverified';
export type QBFigureType = 'original' | 'recreated' | 'reference' | 'placeholder';
export type QBPaperSource = 'official' | 'recalled';
export type QBShift = 'forenoon' | 'afternoon';
export type QBTopicPriority = 'critical' | 'high' | 'medium' | 'low';

export type QBCategory =
  // Broad categories
  | 'mathematics'
  | 'aptitude'
  | 'drawing'
  // NATA categories
  | 'history_of_architecture'
  | 'general_knowledge'
  | 'puzzle'
  | 'perspective'
  | 'building_materials'
  | 'building_services'
  | 'planning'
  | 'sustainability'
  | 'famous_architects'
  | 'current_affairs'
  | 'visualization_3d'
  // JEE Aptitude subcategories
  | 'spatial_visualization'
  | 'orthographic_projection'
  | 'pattern_recognition'
  | 'analogy'
  | 'counting_figures'
  | 'odd_one_out'
  | 'surface_counting'
  | 'mirror_image'
  | 'embedded_figure'
  | 'architecture_gk'
  | 'building_science'
  | 'design_fundamentals'
  // JEE Mathematics subcategories
  | 'trigonometry'
  | 'probability'
  | 'statistics'
  | 'matrices'
  | 'determinants'
  | 'complex_numbers'
  | 'vectors'
  | '3d_geometry'
  | 'conic_sections'
  | 'circles'
  | 'straight_lines'
  | 'sequences_and_series'
  | 'binomial_theorem'
  | 'permutations_combinations'
  | 'definite_integrals'
  | 'indefinite_integrals'
  | 'differential_equations'
  | 'applications_of_derivatives'
  | 'differentiability'
  | 'continuity'
  | 'mean_value_theorems'
  | 'quadratic_equations'
  | 'functions'
  | 'sets_and_relations'
  | 'mathematical_logic';

// QB Interfaces

export interface NexusQBTopic {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  children?: NexusQBTopic[];
  // Topic Intelligence fields
  study_content_md: string | null;
  study_video_urls: string[];
  session_appearance_count: number;
  priority: QBTopicPriority | null;
  sub_items: Array<{ name: string; description?: string; sessions: string[] }>;
}

export interface NexusQBQuestionOption {
  id: string;
  text: string;
  text_hi?: string;
  image_url?: string;
  nta_id?: string;
}

export interface NexusQBQuestion {
  id: string;
  question_text: string | null;
  question_text_hi: string | null;
  question_image_url: string | null;
  question_format: QBQuestionFormat;
  options: NexusQBQuestionOption[] | null;
  correct_answer: string | null;
  answer_tolerance: number | null;
  explanation_brief: string | null;
  explanation_detailed: string | null;
  explanation_brief_hi: string | null;
  explanation_detailed_hi: string | null;
  solution_image_url: string | null;
  solution_video_url: string | null;
  difficulty: QBDifficulty;
  exam_relevance: QBExamRelevance;
  categories: string[];
  topic_id: string | null;
  sub_topic: string | null;
  repeat_group_id: string | null;
  original_paper_id: string | null;
  original_paper_page: number | null;
  display_order: number | null;
  status: QBQuestionStatus;
  nta_question_id: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Recalled paper fields (NULL for official papers)
  confidence_tier: QBConfidenceTier | null;
  answer_source: QBAnswerSource | null;
  figure_type: QBFigureType | null;
  recall_thread_id: string | null;
  // Drawing-specific fields (for DRAWING_PROMPT format)
  drawing_marks: number | null;
  design_principle_tested: string | null;
  colour_constraint: string | null;
  objects_to_include: Array<{ name: string; count?: number }> | null;
}

export interface NexusQBQuestionSource {
  id: string;
  question_id: string;
  exam_type: QBExamType;
  year: number;
  session: string | null;
  shift: QBShift | null;
  question_number: number | null;
  created_at: string;
}

export interface NexusQBStudentAttempt {
  id: string;
  student_id: string;
  question_id: string;
  selected_answer: string;
  is_correct: boolean;
  time_spent_seconds: number | null;
  mode: QBAttemptMode;
  created_at: string;
}

export interface NexusQBStudyMark {
  id: string;
  student_id: string;
  question_id: string;
  created_at: string;
}

export interface NexusQBSavedPreset {
  id: string;
  student_id: string;
  name: string;
  filters: QBFilterState;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface NexusQBOriginalPaper {
  id: string;
  exam_type: QBExamType;
  year: number;
  session: string | null;
  shift: QBShift | null;
  pdf_url: string | null;
  total_questions: number | null;
  total_marks: number | null;
  duration_minutes: number | null;
  uploaded_by: string | null;
  upload_status: QBPaperUploadStatus;
  questions_parsed: number;
  questions_answer_keyed: number;
  questions_complete: number;
  created_at: string;
  // Recalled paper fields
  paper_source: QBPaperSource;
  exam_date: string | null;
  contributor_summary: Array<{
    user_id: string;
    name: string;
    question_count: number;
    tier: QBConfidenceTier;
  }>;
}

export interface NexusQBPaperContributor {
  id: string;
  paper_id: string;
  user_id: string;
  display_name: string;
  role: 'student' | 'teacher' | 'admin';
  question_count: number;
  tier_1_count: number;
  tier_2_count: number;
  tier_3_count: number;
  notes: string | null;
  created_at: string;
}

export interface NexusQBClassroomLink {
  id: string;
  classroom_id: string;
  is_active: boolean;
  enabled_at: string;
  enabled_by: string | null;
}

// QB Joined/Computed Types

export interface QBAttemptSummary {
  total_attempts: number;
  last_attempt_at: string | null;
  last_was_correct: boolean | null;
  best_result: boolean;
}

export interface NexusQBQuestionWithSources extends NexusQBQuestion {
  sources: NexusQBQuestionSource[];
  topic: NexusQBTopic | null;
}

export interface NexusQBQuestionListItem extends NexusQBQuestion {
  sources: NexusQBQuestionSource[];
  topic: NexusQBTopic | null;
  attempt_summary: QBAttemptSummary | null;
}

export interface NexusQBQuestionDetail extends NexusQBQuestionWithSources {
  attempts: NexusQBStudentAttempt[];
  repeat_sources: NexusQBQuestionSource[];
  is_studied: boolean;
}

// QB Filter & Stats Types

export interface QBFilterState {
  exam_relevance?: QBExamRelevance;
  exam_years?: number[];
  exam_sessions?: string[];
  topic_ids?: string[];
  categories?: string[];
  difficulty?: QBDifficulty[];
  question_format?: QBQuestionFormat[];
  attempt_status?: 'all' | 'unattempted' | 'correct' | 'incorrect';
  search_text?: string;
  // Source-based filters (from exam sidebar)
  exam_type?: QBExamType;
  source_year?: number;
  source_session?: string;
  source_shift?: QBShift;
  // Solution filter
  solution_filter?: 'has_video' | 'has_image' | 'has_explanation' | 'no_solution';
  // Recalled paper filters
  confidence_tier?: QBConfidenceTier[];
  paper_source?: QBPaperSource;
}

// Exam tree types for sidebar navigation
export interface QBExamTreeSession {
  session: string;
  count: number;
}

export interface QBExamTreeYear {
  year: number;
  count: number;
  sessions: QBExamTreeSession[];
}

export interface QBExamTreeExam {
  exam_type: QBExamType;
  label: string;
  total_count: number;
  years: QBExamTreeYear[];
}

export interface QBExamTree {
  exams: QBExamTreeExam[];
}

export interface QBProgressStats {
  total_questions: number;
  attempted_count: number;
  correct_count: number;
  incorrect_count: number;
  accuracy_percentage: number;
  by_category: Record<string, { attempted: number; correct: number; total: number }>;
  by_difficulty: Record<string, { attempted: number; correct: number; total: number }>;
}

// Recalled Papers View Types

export interface QBRecalledSessionCard {
  paper: NexusQBOriginalPaper;
  contributors: NexusQBPaperContributor[];
  tier_counts: { tier_1: number; tier_2: number; tier_3: number };
  topic_distribution: Record<string, number>; // topic_slug -> count
}

export interface QBTopicIntelligenceItem extends NexusQBTopic {
  question_count: number;
  session_names: string[];
}

// QB Input Types

export interface NexusQBQuestionInsert {
  question_text?: string | null;
  question_image_url?: string | null;
  question_format: QBQuestionFormat;
  options?: NexusQBQuestionOption[] | null;
  correct_answer?: string | null;
  answer_tolerance?: number | null;
  explanation_brief?: string | null;
  explanation_detailed?: string | null;
  solution_image_url?: string | null;
  solution_video_url?: string | null;
  difficulty: QBDifficulty;
  exam_relevance: QBExamRelevance;
  categories: string[];
  topic_id?: string | null;
  sub_topic?: string | null;
  repeat_group_id?: string | null;
  original_paper_id?: string | null;
  original_paper_page?: number | null;
  display_order?: number | null;
  status?: QBQuestionStatus;
  nta_question_id?: string | null;
  created_by?: string | null;
  // Recalled paper fields
  confidence_tier?: QBConfidenceTier | null;
  answer_source?: QBAnswerSource | null;
  figure_type?: QBFigureType | null;
  recall_thread_id?: string | null;
  drawing_marks?: number | null;
  design_principle_tested?: string | null;
  colour_constraint?: string | null;
  objects_to_include?: Array<{ name: string; count?: number }> | null;
}

export interface NexusQBQuestionUpdate {
  question_text?: string | null;
  question_image_url?: string | null;
  question_format?: QBQuestionFormat;
  options?: NexusQBQuestionOption[] | null;
  correct_answer?: string | null;
  answer_tolerance?: number | null;
  explanation_brief?: string | null;
  explanation_detailed?: string | null;
  solution_image_url?: string | null;
  solution_video_url?: string | null;
  difficulty?: QBDifficulty;
  exam_relevance?: QBExamRelevance;
  categories?: string[];
  topic_id?: string | null;
  sub_topic?: string | null;
  repeat_group_id?: string | null;
  status?: QBQuestionStatus;
  nta_question_id?: string | null;
  is_active?: boolean;
  // Recalled paper fields
  confidence_tier?: QBConfidenceTier | null;
  answer_source?: QBAnswerSource | null;
  figure_type?: QBFigureType | null;
  recall_thread_id?: string | null;
  drawing_marks?: number | null;
  design_principle_tested?: string | null;
  colour_constraint?: string | null;
  objects_to_include?: Array<{ name: string; count?: number }> | null;
}

export interface NexusQBQuestionSourceInsert {
  question_id: string;
  exam_type: QBExamType;
  year: number;
  session?: string | null;
  shift?: QBShift | null;
  question_number?: number | null;
}

// QB Constants

export const QB_CATEGORY_LABELS: Record<QBCategory, string> = {
  // Broad categories
  mathematics: 'Mathematics',
  aptitude: 'Aptitude',
  drawing: 'Drawing',
  // NATA categories
  history_of_architecture: 'History of Architecture',
  general_knowledge: 'General Knowledge',
  puzzle: 'Puzzles & Logic',
  perspective: 'Perspective',
  building_materials: 'Building Materials',
  building_services: 'Building Services',
  planning: 'Planning & Urban Design',
  sustainability: 'Sustainability',
  famous_architects: 'Famous Architects',
  current_affairs: 'Current Affairs',
  visualization_3d: '3D Visualization',
  // JEE Aptitude subcategories
  spatial_visualization: 'Spatial Visualization',
  orthographic_projection: 'Orthographic Projection',
  pattern_recognition: 'Pattern Recognition',
  analogy: 'Analogy',
  counting_figures: 'Counting Figures',
  odd_one_out: 'Odd One Out',
  surface_counting: 'Surface Counting',
  mirror_image: 'Mirror Image',
  embedded_figure: 'Embedded Figure',
  architecture_gk: 'Architecture GK',
  building_science: 'Building Science',
  design_fundamentals: 'Design Fundamentals',
  // JEE Mathematics subcategories
  trigonometry: 'Trigonometry',
  probability: 'Probability',
  statistics: 'Statistics',
  matrices: 'Matrices',
  determinants: 'Determinants',
  complex_numbers: 'Complex Numbers',
  vectors: 'Vectors',
  '3d_geometry': '3D Geometry',
  conic_sections: 'Conic Sections',
  circles: 'Circles',
  straight_lines: 'Straight Lines',
  sequences_and_series: 'Sequences & Series',
  binomial_theorem: 'Binomial Theorem',
  permutations_combinations: 'Permutations & Combinations',
  definite_integrals: 'Definite Integrals',
  indefinite_integrals: 'Indefinite Integrals',
  differential_equations: 'Differential Equations',
  applications_of_derivatives: 'Applications of Derivatives',
  differentiability: 'Differentiability',
  continuity: 'Continuity',
  mean_value_theorems: 'Mean Value Theorems',
  quadratic_equations: 'Quadratic Equations',
  functions: 'Functions',
  sets_and_relations: 'Sets & Relations',
  mathematical_logic: 'Mathematical Logic',
};

export const QB_CATEGORIES: QBCategory[] = Object.keys(QB_CATEGORY_LABELS) as QBCategory[];

export const QB_DIFFICULTY_COLORS: Record<QBDifficulty, string> = {
  EASY: '#22C55E',
  MEDIUM: '#F59E0B',
  HARD: '#EF4444',
};

export const QB_EXAM_TYPE_LABELS: Record<QBExamType, string> = {
  JEE_PAPER_2: 'JEE Paper 2',
  NATA: 'NATA',
};

export const QB_QUESTION_STATUS_LABELS: Record<QBQuestionStatus, string> = {
  draft: 'Draft',
  answer_keyed: 'Answer Keyed',
  complete: 'Complete',
  active: 'Active',
};

export const QB_QUESTION_STATUS_COLORS: Record<QBQuestionStatus, string> = {
  draft: '#9E9E9E',
  answer_keyed: '#F59E0B',
  complete: '#3B82F6',
  active: '#22C55E',
};

// Recalled Papers Constants

export const QB_CONFIDENCE_TIER_LABELS: Record<QBConfidenceTier, string> = {
  1: 'Verified',
  2: 'Recalled',
  3: 'Topic Signal',
};

export const QB_CONFIDENCE_TIER_COLORS: Record<QBConfidenceTier, string> = {
  1: '#22C55E', // green
  2: '#F59E0B', // amber
  3: '#9E9E9E', // grey
};

export const QB_TOPIC_PRIORITY_LABELS: Record<QBTopicPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

// Bulk Upload Types

export interface NTAParsedQuestion {
  question_number: number;
  nta_question_id: string;
  question_format: QBQuestionFormat;
  question_text?: string | null;
  question_text_hi?: string | null;
  question_image_url?: string | null;
  options: {
    nta_id: string;
    text?: string;
    text_hi?: string;
    label?: string;
    image_url?: string | null;
  }[];
  section: 'math_mcq' | 'math_numerical' | 'aptitude' | 'drawing';
  categories: string[];
  marks_correct?: number;
  marks_negative?: number;
  /** Solution video URL (YouTube unlisted or SharePoint) */
  solution_video_url?: string | null;
  /** Brief explanation of the solution */
  explanation_brief?: string | null;
  /** Detailed step-by-step explanation */
  explanation_detailed?: string | null;
}

export interface NTAParsedPaper {
  questions: NTAParsedQuestion[];
  total: number;
  sections: { name: string; count: number }[];
  warnings: string[];
}

export interface NexusQBAnswerKeyEntry {
  question_number: number;
  correct_answer: string;
}

// QB Report Types

export type QBReportType = 'wrong_answer' | 'no_correct_option' | 'question_error' | 'missing_solution' | 'unclear_question' | 'other';
export type QBReportStatus = 'open' | 'in_review' | 'resolved' | 'dismissed';

export const QB_REPORT_TYPE_LABELS: Record<QBReportType, string> = {
  wrong_answer: 'Wrong Answer Key',
  no_correct_option: 'No Correct Option',
  question_error: 'Question Has Error',
  missing_solution: 'Missing Solution',
  unclear_question: 'Unclear Question',
  other: 'Other',
};

export const QB_REPORT_STATUS_LABELS: Record<QBReportStatus, string> = {
  open: 'Open',
  in_review: 'In Review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export interface NexusQBQuestionReport {
  id: string;
  question_id: string;
  student_id: string;
  report_type: QBReportType;
  description: string | null;
  status: QBReportStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NexusQBReportWithContext extends NexusQBQuestionReport {
  question_text: string | null;
  question_image_url: string | null;
  student_name: string | null;
  student_email: string | null;
  sources: NexusQBQuestionSource[];
}

// ============================================
// Custom Tests (student-created from QB)
// ============================================

export interface NexusCustomTestCreate {
  title: string;
  question_ids: string[];
  timer_type: 'none' | 'full' | 'per_question';
  duration_minutes?: number;
  per_question_seconds?: number;
}

// ============================================
// VIDEO LIBRARY
// ============================================

export type LibraryVideoLanguage = 'ta' | 'en' | 'ta_en';
export type LibraryVideoExam = 'nata' | 'jee_barch' | 'both' | 'general';
export type LibraryVideoDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'mixed';
export type LibraryTranscriptStatus = 'pending' | 'fetched' | 'unavailable' | 'error';
export type LibraryClassificationStatus = 'pending' | 'classified' | 'error' | 'skipped';
export type LibraryReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_reclass';
export type LibrarySyncStatus = 'running' | 'completed' | 'failed';
export type LibraryEngagementStatus = 'active' | 'moderate' | 'inactive' | 'new';
export type LibraryDeviceType = 'mobile' | 'tablet' | 'desktop';

export interface LibraryVideo {
  id: string;
  youtube_video_id: string;
  youtube_channel_id: string | null;
  original_title: string | null;
  original_description: string | null;
  youtube_thumbnail_url: string | null;
  youtube_thumbnail_hq_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  privacy_status: string;
  transcript_text: string | null;
  transcript_language: string | null;
  transcript_is_generated: boolean;
  transcript_segments: unknown | null;
  transcript_status: LibraryTranscriptStatus;
  suggested_title: string | null;
  suggested_description: string | null;
  language: LibraryVideoLanguage | null;
  exam: LibraryVideoExam | null;
  category: string | null;
  subcategories: string[];
  topics: string[];
  difficulty: LibraryVideoDifficulty | null;
  key_concepts: string[];
  is_practical_demo: boolean;
  ai_confidence: number | null;
  classification_status: LibraryClassificationStatus;
  classification_error: string | null;
  approved_title: string | null;
  approved_description: string | null;
  review_status: LibraryReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  is_published: boolean;
  view_count: number;
  total_watch_seconds: number;
  bookmark_count: number;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface LibraryVideoInsert {
  youtube_video_id: string;
  youtube_channel_id?: string;
  original_title?: string;
  original_description?: string;
  youtube_thumbnail_url?: string;
  youtube_thumbnail_hq_url?: string;
  duration_seconds?: number;
  published_at?: string;
  privacy_status?: string;
}

export interface LibraryVideoUpdate {
  suggested_title?: string;
  suggested_description?: string;
  approved_title?: string;
  approved_description?: string;
  language?: LibraryVideoLanguage;
  exam?: LibraryVideoExam;
  category?: string;
  subcategories?: string[];
  topics?: string[];
  difficulty?: LibraryVideoDifficulty;
  key_concepts?: string[];
  is_practical_demo?: boolean;
  ai_confidence?: number;
  classification_status?: LibraryClassificationStatus;
  classification_error?: string;
  review_status?: LibraryReviewStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  admin_notes?: string;
  is_published?: boolean;
  transcript_text?: string;
  transcript_language?: string;
  transcript_is_generated?: boolean;
  transcript_segments?: unknown;
  transcript_status?: LibraryTranscriptStatus;
}

export interface LibraryCollection {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  created_by: string | null;
  classroom_id: string | null;
  exam: LibraryVideoExam | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LibraryCollectionItem {
  id: string;
  collection_id: string;
  video_id: string;
  sort_order: number;
  notes: string | null;
  created_at: string;
}

export interface LibraryBookmark {
  id: string;
  student_id: string;
  video_id: string;
  timestamp_seconds: number | null;
  note: string | null;
  created_at: string;
}

export interface LibraryWatchHistory {
  id: string;
  student_id: string;
  video_id: string;
  last_position_seconds: number;
  total_watched_seconds: number;
  completed: boolean;
  watch_count: number;
  first_watched_at: string;
  last_watched_at: string;
}

export interface LibrarySyncLog {
  id: string;
  started_at: string;
  completed_at: string | null;
  total_videos_found: number | null;
  new_videos_added: number | null;
  transcripts_fetched: number | null;
  transcripts_failed: number | null;
  classifications_run: number | null;
  classifications_failed: number | null;
  status: LibrarySyncStatus;
  error_log: unknown;
  run_by: string | null;
}

// ============================================
// VIDEO LIBRARY - Engagement Tracking
// ============================================

export interface LibraryReplaySegment {
  start: number;
  end: number;
  count: number;
}

export interface LibraryWatchSession {
  id: string;
  student_id: string;
  video_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  watched_seconds: number;
  furthest_position_seconds: number;
  play_count: number;
  pause_count: number;
  seek_count: number;
  rewind_count: number;
  replay_segments: LibraryReplaySegment[];
  completion_pct: number;
  completed: boolean;
  device_type: LibraryDeviceType | null;
  created_at: string;
}

export interface LibraryWatchSessionUpsert {
  id: string;
  video_id: string;
  watched_seconds: number;
  furthest_position_seconds: number;
  completion_pct: number;
  play_count: number;
  pause_count: number;
  seek_count: number;
  rewind_count: number;
  replay_segments: LibraryReplaySegment[];
  device_type: LibraryDeviceType;
}

export interface LibraryEngagementDaily {
  id: string;
  student_id: string;
  activity_date: string;
  videos_watched: number;
  videos_completed: number;
  unique_videos: number;
  total_watch_seconds: number;
  total_session_seconds: number;
  sessions_count: number;
  total_seeks: number;
  total_rewinds: number;
  total_pauses: number;
  bookmarks_created: number;
  search_queries: number;
  avg_completion_pct: number;
  created_at: string;
}

export interface LibraryStudentStreak {
  student_id: string;
  current_streak_days: number;
  current_streak_start: string | null;
  best_streak_days: number;
  best_streak_start: string | null;
  best_streak_end: string | null;
  current_weekly_streak: number;
  best_weekly_streak: number;
  total_active_days: number;
  total_active_weeks: number;
  first_activity_date: string | null;
  last_activity_date: string | null;
  engagement_status: LibraryEngagementStatus;
  engagement_score: number;
  updated_at: string;
}

export interface LibrarySearchLog {
  id: string;
  student_id: string;
  query_text: string;
  results_count: number;
  clicked_video_id: string | null;
  created_at: string;
}

// ============================================
// VIDEO LIBRARY - Dashboard / API Response Types
// ============================================

export interface LibraryVideoWithProgress extends LibraryVideo {
  watch_history: LibraryWatchHistory | null;
  bookmarks: LibraryBookmark[];
}

export interface LibraryCollectionWithVideos extends LibraryCollection {
  items: (LibraryCollectionItem & { video: LibraryVideo })[];
}

export interface LibraryEngagementDashboardStudent {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  engagement_status: LibraryEngagementStatus;
  engagement_score: number;
  videos_watched: number;
  total_watch_hours: number;
  avg_completion_pct: number;
  current_streak: number;
  last_active: string | null;
  bookmark_count: number;
  rewind_ratio: number;
}

export interface LibraryEngagementDashboard {
  class_aggregates: {
    total_students: number;
    active_students: number;
    moderate_students: number;
    inactive_students: number;
    new_students: number;
    total_watch_hours: number;
    avg_completion_pct: number;
    videos_watched: number;
  };
  top_videos: { video_id: string; title: string; watch_count: number; avg_completion: number }[];
  least_watched_videos: { video_id: string; title: string; watch_count: number }[];
  students: LibraryEngagementDashboardStudent[];
}

export interface LibraryStudentEngagementDetail {
  student: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
  streak: LibraryStudentStreak;
  daily_activity: LibraryEngagementDaily[];
  videos_watched: {
    video_id: string;
    title: string;
    completion_pct: number;
    total_watched_seconds: number;
    watch_count: number;
    last_watched_at: string;
  }[];
  replay_patterns: {
    video_id: string;
    title: string;
    segments: LibraryReplaySegment[];
  }[];
  bookmarks: (LibraryBookmark & { video_title: string })[];
}

export interface LibraryMyActivity {
  streak: LibraryStudentStreak;
  total_videos_available: number;
  videos_watched_count: number;
  videos_completed_count: number;
  weekly_activity: { date: string; watched: boolean; watch_seconds: number }[];
  watch_time_this_week: number;
  continue_watching: LibraryVideoWithProgress[];
  bookmarks: (LibraryBookmark & { video: LibraryVideo })[];
}

// ============================================
// EXAM RECALL TYPES (NATA Question Reconstruction)
// ============================================

// Enums / Union Types
export type ExamRecallQuestionType = 'mcq' | 'numerical' | 'fill_blank' | 'drawing';
export type ExamRecallSection = 'part_a' | 'part_b';
export type ExamRecallTopicCategory =
  | 'visual_reasoning'
  | 'logical_derivation'
  | 'gk_architecture'
  | 'language'
  | 'design_sensitivity'
  | 'numerical_ability'
  | 'drawing';
export type ExamRecallThreadStatus = 'raw' | 'under_review' | 'published' | 'dismissed';
export type ExamRecallAuthorRole = 'student' | 'teacher' | 'admin' | 'staff';
export type ExamRecallClarity = 'clear' | 'partial' | 'vague';
export type ExamRecallVersionStatus = 'pending_review' | 'approved' | 'rejected';
export type ExamRecallDrawingType = 'composition_2d' | 'object_sketching' | '3d_model';
export type ExamRecallDifficulty = 'easy' | 'moderate' | 'hard';
export type ExamRecallTimePressure = 'plenty' | 'just_enough' | 'rushed';
export type ExamRecallVariantType = 'exact_repeat' | 'different_values' | 'same_topic';
export type ExamRecallUploadType = 'handwritten_notes' | 'question_paper' | 'reference_image' | 'sketch' | 'drawing_attempt';
export type ExamRecallOCRStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'not_needed';
export type ExamRecallInputMode = 'type_it' | 'photo_notes' | 'quick_list' | 'paper_photo' | 'exam_tips';

// Table Row Interfaces

export interface NexusExamRecallThread {
  id: string;
  classroom_id: string;
  exam_year: number;
  exam_date: string;
  session_number: number;
  question_type: ExamRecallQuestionType;
  section: ExamRecallSection;
  topic_category: ExamRecallTopicCategory | null;
  has_image: boolean;
  status: ExamRecallThreadStatus;
  published_question_id: string | null;
  confirm_count: number;
  vouch_count: number;
  version_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface NexusExamRecallVersion {
  id: string;
  thread_id: string;
  version_number: number;
  author_id: string;
  author_role: ExamRecallAuthorRole;
  recall_text: string | null;
  recall_image_urls: string[] | null;
  options: Array<{ id: string; text: string; image_url?: string }> | null;
  my_answer: string | null;
  my_working: string | null;
  clarity: ExamRecallClarity;
  has_image_in_original: boolean | null;
  image_description: string | null;
  sub_topic_hint: string | null;
  parent_version_id: string | null;
  vouch_count: number;
  status: ExamRecallVersionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface NexusExamRecallConfirm {
  id: string;
  thread_id: string;
  user_id: string;
  exam_date: string | null;
  session_number: number | null;
  note: string | null;
  created_at: string;
}

export interface NexusExamRecallVouch {
  id: string;
  version_id: string;
  user_id: string;
  created_at: string;
}

export interface NexusExamRecallComment {
  id: string;
  thread_id: string;
  parent_comment_id: string | null;
  user_id: string;
  body: string;
  is_staff: boolean;
  created_at: string;
  updated_at: string;
}

export interface NexusExamRecallCheckpoint {
  id: string;
  user_id: string;
  classroom_id: string;
  exam_year: number;
  exam_date: string;
  session_number: number;
  drawing_count: number;
  aptitude_count: number;
  topic_dump_count: number;
  tip_submitted: boolean;
  browse_unlocked: boolean;
  unlocked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NexusExamRecallTopicDump {
  id: string;
  user_id: string;
  classroom_id: string;
  exam_year: number;
  exam_date: string;
  session_number: number;
  topic_category: string;
  estimated_count: number | null;
  brief_details: string | null;
  created_at: string;
}

export interface NexusExamRecallDrawing {
  id: string;
  thread_id: string;
  question_number: number;
  drawing_type: ExamRecallDrawingType;
  prompt_text_en: string | null;
  prompt_text_hi: string | null;
  objects_materials: Array<{ name: string; count: number }> | null;
  constraints: Record<string, any> | null;
  marks: number | null;
  paper_photo_url: string | null;
  attempt_photo_url: string | null;
  created_by: string;
  created_at: string;
}

export interface NexusExamRecallTip {
  id: string;
  user_id: string;
  classroom_id: string;
  exam_year: number;
  exam_date: string;
  session_number: number;
  insights_text: string;
  topic_distribution: Record<string, number> | null;
  difficulty: ExamRecallDifficulty | null;
  time_pressure: ExamRecallTimePressure | null;
  upvote_count: number;
  created_at: string;
}

export interface NexusExamRecallVariant {
  id: string;
  thread_id: string;
  linked_thread_id: string;
  variant_type: ExamRecallVariantType;
  confidence: number | null;
  linked_by: string | null;
  created_at: string;
}

export interface NexusExamRecallUpload {
  id: string;
  user_id: string;
  version_id: string | null;
  thread_id: string | null;
  upload_type: ExamRecallUploadType;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  ocr_status: ExamRecallOCRStatus;
  ocr_extracted_text: string | null;
  ocr_confidence: number | null;
  ocr_extracted_questions: any[] | null;
  created_at: string;
}

// Insert/Update partial types

export type NexusExamRecallThreadInsert = Omit<NexusExamRecallThread, 'id' | 'confirm_count' | 'vouch_count' | 'version_count' | 'created_at' | 'updated_at'>;

export type NexusExamRecallVersionInsert = Omit<NexusExamRecallVersion, 'id' | 'vouch_count' | 'status' | 'reviewed_by' | 'reviewed_at' | 'created_at'>;

export type NexusExamRecallDrawingInsert = Omit<NexusExamRecallDrawing, 'id' | 'created_at'>;

export type NexusExamRecallTipInsert = Omit<NexusExamRecallTip, 'id' | 'upvote_count' | 'created_at'>;

// Joined / View types for queries

export interface ExamRecallThreadListItem extends NexusExamRecallThread {
  latest_version: {
    recall_text: string | null;
    clarity: ExamRecallClarity;
    author_name: string | null;
    author_avatar: string | null;
  } | null;
  contributors: Array<{
    id: string;
    name: string | null;
    avatar_url: string | null;
  }>;
  user_has_confirmed: boolean;
}

export interface ExamRecallThreadDetail extends NexusExamRecallThread {
  versions: Array<NexusExamRecallVersion & {
    author: Pick<User, 'id' | 'name' | 'avatar_url'>;
    vouch_count: number;
    user_has_vouched: boolean;
  }>;
  confirms: Array<NexusExamRecallConfirm & {
    user: Pick<User, 'id' | 'name' | 'avatar_url'>;
  }>;
  comments: Array<NexusExamRecallComment & {
    user: Pick<User, 'id' | 'name' | 'avatar_url'>;
  }>;
  drawings: NexusExamRecallDrawing[];
  variants: Array<NexusExamRecallVariant & {
    linked_thread: Pick<NexusExamRecallThread, 'id' | 'exam_date' | 'session_number' | 'status'>;
  }>;
  uploads: NexusExamRecallUpload[];
}

export interface ExamRecallSessionSummary {
  exam_date: string;
  session_number: number;
  thread_count: number;
  contributor_count: number;
  published_count: number;
  under_review_count: number;
  raw_count: number;
}

export interface ExamRecallCheckpointStatus {
  checkpoint: NexusExamRecallCheckpoint | null;
  is_unlocked: boolean;
  drawing_remaining: number;  // 3 - drawing_count
  aptitude_remaining: number; // 5 - aptitude_count
}

export interface ExamRecallDashboardStats {
  total_threads: number;
  pending_review: number;
  published: number;
  total_contributors: number;
  sessions: ExamRecallSessionSummary[];
}

// ============================================
// REVIEW CAMPAIGN TYPES
// ============================================

export type ReviewPlatform = 'google' | 'sulekha' | 'justdial';
export type ReviewCampaignStatus = 'draft' | 'active' | 'paused' | 'completed';
export type ReviewStudentStatus = 'pending' | 'sent' | 'clicked' | 'completed' | 'skipped';
export type ReviewChannel = 'whatsapp' | 'email' | 'in_app';

export interface ReviewPlatformUrl {
  id: string;
  center_id: string;
  platform: ReviewPlatform;
  review_url: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewCampaign {
  id: string;
  name: string;
  description: string | null;
  target_city: string | null;
  target_center_id: string | null;
  platforms: ReviewPlatform[];
  channels: ReviewChannel[];
  status: ReviewCampaignStatus;
  scheduled_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewCampaignStudent {
  id: string;
  campaign_id: string;
  student_id: string;
  platform: ReviewPlatform;
  status: ReviewStudentStatus;
  sent_at: string | null;
  clicked_at: string | null;
  completed_at: string | null;
  screenshot_url: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  notes: string | null;
  created_at: string;
}

// Joined types for UI
export interface ReviewCampaignWithStats extends ReviewCampaign {
  total_students: number;
  sent_count: number;
  completed_count: number;
  creator_name: string | null;
}

export interface ReviewCampaignStudentWithUser extends ReviewCampaignStudent {
  student_name: string;
  student_email: string | null;
  student_phone: string | null;
  student_avatar: string | null;
  student_city: string | null;
}

// City-wise student aggregation
export interface CityStudentCount {
  city: string;
  student_count: number;
  state: string | null;
}

export interface CityStudent {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  user_type: UserType;
  city: string | null;
  state: string | null;
  course_name: string | null;
  enrolled_at: string | null;
}

// ============================================
// GEOGRAPHIC STUDENT HIERARCHY
// ============================================

// Flat row from DB RPC
export interface GeographicHierarchyRow {
  country: string;
  state: string | null;
  district: string | null;
  city: string;
  student_count: number;
}

// Extended student with full location
export interface GeographicStudent {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  user_type: UserType;
  city: string | null;
  state: string | null;
  district: string | null;
  country: string;
  course_name: string | null;
  enrolled_at: string | null;
}

// Assembled tree nodes for API response
export interface GeographicCityNode {
  city: string;
  student_count: number;
  district: string | null;
}

export interface GeographicStateNode {
  state: string;
  student_count: number;
  city_count: number;
  cities: GeographicCityNode[];
}

export interface GeographicCountryNode {
  country: string;
  country_display: string;
  student_count: number;
  state_count: number;
  city_count: number;
  states: GeographicStateNode[];
}

// ============================================
// WHATSAPP TEMPLATES
// ============================================

export interface WaCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WaTemplate {
  id: string;
  category_id: string;
  title: string;
  body: string;
  placeholders: string[];
  sort_order: number;
  is_archived: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  category?: WaCategory;
}

// ============================================
// GAMIFICATION
// ============================================

export type GamificationBadgeCategory = 'attendance' | 'checklist' | 'growth' | 'leaderboard';
export type GamificationBadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type GamificationPointEventType =
  | 'class_attended'
  | 'checklist_item_completed'
  | 'full_checklist_completed'
  | 'drawing_submitted'
  | 'drawing_reviewed'
  | 'streak_day'
  | 'streak_milestone'
  | 'quiz_completed'
  | 'peer_help'
  | 'badge_bonus'
  | 'manual_teacher_award';

export type GamificationActivityType =
  | 'class_attended'
  | 'checklist_completed'
  | 'checklist_item_completed'
  | 'drawing_submitted'
  | 'drawing_reviewed'
  | 'badge_earned'
  | 'streak_milestone'
  | 'rank_improved'
  | 'manual_award';

export interface GamificationBadgeDefinition {
  id: string;
  display_name: string;
  description: string;
  criteria_description: string;
  category: GamificationBadgeCategory;
  rarity_tier: GamificationBadgeRarity;
  icon_svg_path: string;
  icon_locked_svg_path: string;
  points_bonus: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface GamificationStudentBadge {
  id: string;
  student_id: string;
  badge_id: string;
  earned_at: string;
  earned_context: Record<string, unknown>;
  notified: boolean;
}

export interface GamificationPointEvent {
  id: string;
  student_id: string;
  classroom_id: string;
  batch_id: string | null;
  event_type: GamificationPointEventType;
  points: number;
  metadata: Record<string, unknown>;
  source_id: string | null;
  event_date: string;
  created_at: string;
}

export interface GamificationStudentStreak {
  student_id: string;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  streak_started_date: string | null;
  updated_at: string;
}

export interface GamificationWeeklyLeaderboard {
  id: string;
  student_id: string;
  classroom_id: string;
  batch_id: string | null;
  week_start: string;
  raw_score: number;
  normalized_score: number;
  max_possible_score: number;
  rank_in_batch: number | null;
  rank_all_neram: number | null;
  streak_length: number;
  attendance_pct: number;
  rank_change: number;
  is_rising_star: boolean;
  is_comeback_kid: boolean;
  created_at: string;
}

export interface GamificationMonthlyLeaderboard {
  id: string;
  student_id: string;
  classroom_id: string;
  batch_id: string | null;
  month_start: string;
  raw_score: number;
  normalized_score: number;
  max_possible_score: number;
  rank_in_batch: number | null;
  rank_all_neram: number | null;
  streak_length: number;
  attendance_pct: number;
  rank_change: number;
  badges_earned_this_month: number;
  is_rising_star: boolean;
  is_comeback_kid: boolean;
  created_at: string;
}

export interface GamificationStudentActivityLog {
  id: string;
  student_id: string;
  activity_type: GamificationActivityType;
  title: string;
  metadata: Record<string, unknown>;
  activity_date: string;
}

// Composite types for API responses

export interface LeaderboardEntry {
  rank: number;
  student_id: string;
  student_name: string;
  avatar_url: string | null;
  batch_name: string | null;
  raw_score: number;
  normalized_score: number;
  streak_length: number;
  attendance_pct: number;
  rank_change: number;
  is_rising_star: boolean;
  is_comeback_kid: boolean;
  top_badges: GamificationBadgeDefinition[];
}

export interface StudentAchievementProfile {
  student_id: string;
  student_name: string;
  avatar_url: string | null;
  batch_name: string | null;
  classroom_name: string | null;
  current_rank: number | null;
  streak: GamificationStudentStreak | null;
  attendance_pct: number;
  total_checklists_completed: number;
  total_badges: number;
  badges: (GamificationStudentBadge & { badge: GamificationBadgeDefinition })[];
  recent_activity: GamificationStudentActivityLog[];
  attendance_heatmap: { date: string; attended: boolean }[];
}

export interface BadgeCatalogEntry extends GamificationBadgeDefinition {
  earned: boolean;
  earned_at: string | null;
}

export type PlaceholderValues = Record<string, string>;

// ============================================
// STUDENT CREDENTIALS
// ============================================

export type CredentialType = 'ms_teams';

export interface StudentCredential {
  id: string;
  student_profile_id: string;
  user_id: string;
  credential_type: CredentialType;
  email: string;
  password: string;
  published_by: string | null;
  published_at: string | null;
  viewed_at: string | null;
  destroyed_at: string | null;
  auto_destroy_at: string | null;
  is_active: boolean;
  created_at: string;
}

// ============================================
// AUTO MESSAGES (First Touch Automation)
// ============================================

export type AutoMessageType =
  | 'first_touch'
  | 'follow_up_3d'
  | 'follow_up_7d'
  | 'nurture'
  | 'phone_drip_1'
  | 'phone_drip_2'
  | 'phone_drip_3'
  | 'phone_drip_4'
  | 'phone_drip_5';
export type AutoMessageChannel = 'whatsapp' | 'email';
export type AutoMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export const FIRST_TOUCH_TEMPLATES = [
  'first_touch_quick_question',
  'first_touch_results_video',
  'first_touch_english_intro',
] as const;

export type FirstTouchTemplateName = typeof FIRST_TOUCH_TEMPLATES[number];

export interface AutoMessage {
  id: string;
  user_id: string;
  message_type: AutoMessageType;
  channel: AutoMessageChannel;
  template_name: string;
  delivery_status: AutoMessageStatus;
  external_message_id: string | null;
  error_message: string | null;
  retry_count: number;
  send_after: string;
  sent_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AutoMessageInsert {
  user_id: string;
  message_type?: AutoMessageType;
  channel: AutoMessageChannel;
  template_name: string;
  send_after: string;
  metadata?: Record<string, unknown>;
}

export interface AutoFirstTouchSettings {
  enabled: boolean;
  delay_minutes: number;
  email_enabled: boolean;
}

export * from './expenses';

// ============================================================
// Drawing Module V2
// ============================================================

export type DrawingCategory = '2d_composition' | '3d_composition' | 'kit_sculpture';
export type DrawingDifficulty = 'easy' | 'medium' | 'hard';
export type DrawingSubmissionStatus = 'submitted' | 'under_review' | 'redo' | 'completed' | 'reviewed' | 'published';
export type DrawingSubmissionSource = 'question_bank' | 'homework' | 'free_practice';

export interface TutorResource {
  type: 'nexus_video' | 'youtube' | 'image';
  url: string;
  title: string;
  thumbnail_url?: string;
}

export interface DrawingQuestion {
  id: string;
  year: number;
  session_date: string | null;
  source_student: string | null;
  category: DrawingCategory;
  sub_type: string;
  question_text: string;
  objects: string[];
  color_constraint: string | null;
  design_principle: string | null;
  difficulty_tag: DrawingDifficulty;
  reference_images: Array<{ level: number; url: string; alt_text?: string }>;
  solution_images: Array<{ url: string; caption?: string }> | null;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DrawingSubmission {
  id: string;
  student_id: string;
  question_id: string | null;
  homework_id: string | null;
  source_type: DrawingSubmissionSource;
  original_image_url: string;
  reviewed_image_url: string | null;
  self_note: string | null;
  ai_feedback: {
    grade: string;
    feedback: string[];
    composition?: string;
    proportion?: string;
    shading?: string;
    completeness?: string;
    technique?: string;
    improvement_tip?: string;
    progress_note?: string | null;
  } | null;
  tutor_rating: number | null;
  tutor_feedback: string | null;
  tutor_resources: TutorResource[];
  status: DrawingSubmissionStatus;
  thread_id: string | null;
  attempt_number: number;
  is_gallery_published: boolean;
  submitted_at: string;
  reviewed_at: string | null;
  ai_overlay_annotations: Array<{
    area: string;
    label: string;
    severity: 'high' | 'medium' | 'low';
  }> | null;
  ai_corrected_image_prompt: string | null;
  corrected_image_url: string | null;
  ai_draft_status: 'pending' | 'generating' | 'ready' | 'failed';
  ai_annotation_prompt?: string | null;
  ai_reference_prompts?: {
    beginner: string;
    medium: string;
    expert: string;
  } | null;
}

export interface DrawingNotification {
  id: string;
  student_id: string;
  submission_id: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface DrawingSubmissionWithQuestion extends DrawingSubmission {
  question: DrawingQuestion | null;
}

export interface DrawingSubmissionWithDetails extends DrawingSubmission {
  question: DrawingQuestion | null;
  student: { id: string; name: string; email: string; avatar_url: string | null };
}

// Thread & Comments
export type DrawingThreadStatus = 'active' | 'redo' | 'completed';

export interface DrawingThreadStatusRecord {
  id: string;
  student_id: string;
  question_id: string;
  thread_id: string;
  status: DrawingThreadStatus;
  total_attempts: number;
  latest_submission_id: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DrawingSubmissionComment {
  id: string;
  submission_id: string;
  author_id: string;
  author_role: 'student' | 'teacher';
  comment_text: string;
  created_at: string;
}

export interface DrawingSubmissionCommentWithAuthor extends DrawingSubmissionComment {
  author: { id: string; name: string; avatar_url: string | null };
}

export interface DrawingThreadAttempt extends DrawingSubmissionWithDetails {
  attempt_number: number;
  comments: DrawingSubmissionCommentWithAuthor[];
}

export interface DrawingThreadView {
  thread_status: DrawingThreadStatusRecord;
  question: DrawingQuestion;
  attempts: DrawingThreadAttempt[];
}

// Foundation Checklist
export interface DrawingChecklistItem {
  id: string;
  category: string;
  skill_name: string;
  sort_order: number;
  description: string | null;
  created_at: string;
}

export type DrawingChecklistStatus = 'not_started' | 'in_progress' | 'completed';

export interface DrawingChecklistProgress {
  id: string;
  student_id: string;
  checklist_item_id: string;
  status: DrawingChecklistStatus;
  student_marked_at: string | null;
  tutor_verified: boolean;
  tutor_verified_at: string | null;
  updated_at: string;
}

export interface DrawingChecklistItemWithProgress extends DrawingChecklistItem {
  progress: DrawingChecklistProgress | null;
}

// Object Library
export interface DrawingObject {
  id: string;
  object_name: string;
  family: string;
  reference_images: Array<{ level: number; url: string }>;
  basic_form: string | null;
  difficulty: string;
  tips: string | null;
  video_url: string | null;
  tags: string[];
  is_active: boolean;
  created_at: string;
}

// Gallery Reactions
export type GalleryReactionType = 'heart' | 'clap' | 'fire' | 'star' | 'wow';

export interface DrawingGalleryReaction {
  id: string;
  submission_id: string;
  user_id: string;
  reaction_type: GalleryReactionType;
  created_at: string;
}

export interface GalleryPost extends DrawingSubmissionWithDetails {
  reactions: Record<GalleryReactionType, number>;
  user_reactions: GalleryReactionType[];
  comment_count: number;
}

// Drawing Homework
export interface DrawingHomework {
  id: string;
  title: string;
  description: string | null;
  question_ids: string[];
  reference_images: Array<{ url: string; caption?: string }>;
  assigned_to: 'all_students' | 'specific_students';
  student_ids: string[];
  due_date: string;
  is_mandatory: boolean;
  created_by: string;
  classroom_id: string | null;
  created_at: string;
}

export interface DrawingHomeworkWithStatus extends DrawingHomework {
  submission_count: number;
  my_submission_id: string | null;
}

// ============================================
// STUDENT RESULTS (Marketing Showcase)
// ============================================

export type StudentResultExamType = 'nata' | 'jee_paper2' | 'tnea' | 'other';

export interface StudentResult extends Timestamps {
  id: string;
  student_name: string;
  slug: string;
  photo_url: string | null;
  scorecard_url: string | null;
  scorecard_watermarked_url: string | null;
  exam_type: StudentResultExamType;
  exam_year: number;
  score: number | null;
  max_score: number | null;
  rank: number | null;
  percentile: number | null;
  college_name: string | null;
  college_city: string | null;
  course_name: string | null;
  student_quote: string | null;
  is_featured: boolean;
  is_published: boolean;
  display_order: number;
}

export interface StudentResultFilters {
  search?: string;
  exam_type?: StudentResultExamType;
  year?: number;
  college?: string;
  score_min?: number;
  score_max?: number;
  featured_only?: boolean;
  is_published?: boolean;
  limit?: number;
  offset?: number;
  sort?: 'score_desc' | 'rank_asc' | 'name_asc' | 'newest';
}

export interface StudentResultStats {
  total: number;
  avg_nata_score: number | null;
  top_rank: number | null;
  colleges_count: number;
  by_exam_type: Record<string, number>;
}

// ============================================
// User Funnel Events
// ============================================

export type FunnelType = 'auth' | 'onboarding' | 'application';
export type FunnelEventStatus = 'started' | 'completed' | 'failed' | 'skipped';

export interface UserFunnelEvent {
  id: string;
  user_id: string | null;
  anonymous_id: string | null;
  funnel: FunnelType;
  event: string;
  status: FunnelEventStatus;
  error_message: string | null;
  error_code: string | null;
  metadata: Record<string, unknown>;
  device_session_id: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  source_app: string;
  page_url: string | null;
  created_at: string;
}

export type UserFunnelEventInsert = Omit<UserFunnelEvent, 'id' | 'created_at'>;

export interface AuthFunnelSummary {
  week: string;
  source_app: string;
  auth_started: number;
  auth_completed: number;
  user_registered: number;
  phone_shown: number;
  phone_entered: number;
  otp_requested: number;
  otp_verified: number;
}

export interface UserAuthDiagnostics {
  last_event: string;
  last_status: FunnelEventStatus;
  last_error_message: string | null;
  last_error_code: string | null;
  event_at: string;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  events: UserFunnelEvent[];
  drop_off_reason: string | null;
}
