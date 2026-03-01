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

export type UserType = 'lead' | 'student' | 'teacher' | 'admin';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'active' | 'inactive';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type ApplicationSource = 'website_form' | 'app' | 'referral' | 'manual';
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
export type CallbackStatus = 'pending' | 'scheduled' | 'attempted' | 'completed' | 'cancelled';
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
export type ContactedStatus = 'talked' | 'unreachable' | 'callback_scheduled';
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

  // Preferences
  preferred_language: string;       // 'en' | 'ta' | 'hi' | 'kn' | 'ml'

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

  // Form completion
  form_completed: boolean;
  form_completed_at: string | null;
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
export interface College extends Timestamps {
  id: string;
  name: string;
  slug: string;
  
  // Location
  city: string;
  state: string;
  address: string | null;
  pincode: string | null;
  
  // Classification
  type: 'government' | 'private' | 'deemed';
  affiliation: string | null;        // e.g., "AICTE Approved"
  established_year: number | null;
  
  // Courses offered
  courses_offered: string[];         // ['B.Arch', 'B.Plan', etc.]
  intake_capacity: number | null;
  
  // Rankings & ratings
  nirf_rank: number | null;
  rating: number | null;             // 1-5
  
  // Fees
  annual_fee_min: number | null;
  annual_fee_max: number | null;
  
  // Contact
  website: string | null;
  email: string | null;
  phone: string | null;
  
  // Content
  description: string | null;
  facilities: string[];
  
  // Media
  logo_url: string | null;
  images: string[];
  
  // SEO
  meta_title: string | null;
  meta_description: string | null;
  
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
  
  // Display
  is_featured: boolean;
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

export type MarketingContentType = 'achievement' | 'important_date' | 'announcement' | 'update';
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

export type MarketingContentMetadata =
  | AchievementMetadata
  | ImportantDateMetadata
  | AnnouncementMetadata
  | UpdateMetadata;

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
  | 'contact_message_received';

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
  search?: string;
  status?: UserStatus;
  userType?: UserType;
  applicationStatus?: ApplicationStatus;
  interestCourse?: CourseType;
  hasDemoRegistration?: boolean;
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
  created_at: string;
  updated_at: string;
}

export interface UserExamAttempt {
  id: string;
  user_id: string;
  exam_date: string | null;
  exam_year: number;
  session_label: string | null;
  created_at: string;
}

export interface CreateExamProfileInput {
  nata_status: NataExamStatus;
  attempt_count?: number;
  next_exam_date?: string;
  planning_year?: number;
  attempts?: { exam_year: number; exam_date?: string; session_label?: string }[];
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
// DATABASE SCHEMA TYPE
// ============================================

export interface Database {
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
      // Marketing content (dynamic CMS)
      marketing_content: {
        Row: MarketingContent;
        Insert: Omit<MarketingContent, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<MarketingContent, 'id' | 'created_at' | 'updated_at'>>;
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
      user_qb_stats: {
        Row: UserQBStats;
        Insert: Omit<UserQBStats, 'id' | 'created_at' | 'updated_at' | 'contribution_score'> & { id?: string };
        Update: Partial<Omit<UserQBStats, 'id' | 'created_at' | 'updated_at' | 'contribution_score'>>;
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
    };
  };
}
