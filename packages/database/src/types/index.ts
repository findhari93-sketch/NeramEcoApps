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
export type CourseType = 'nata' | 'jee_paper2' | 'both';
export type ExamType = 'NATA' | 'JEE_PAPER_2' | 'BOTH';

// New enums for application form
export type ScholarshipVerificationStatus = 'pending' | 'verified' | 'rejected';
export type CashbackType = 'youtube_subscription' | 'instagram_follow' | 'direct_payment';
export type CashbackStatus = 'pending' | 'verified' | 'processed' | 'rejected' | 'expired';
export type DocumentType = 'school_id_card' | 'income_certificate' | 'payment_screenshot' | 'aadhar_card' | 'marksheet' | 'photo' | 'signature' | 'other';
export type InstallmentStatus = 'pending' | 'paid' | 'overdue' | 'waived';
export type PaymentScheme = 'full' | 'installment';
export type SourceCategory = 'youtube' | 'instagram' | 'facebook' | 'google_search' | 'friend_referral' | 'school_visit' | 'newspaper' | 'hoarding' | 'whatsapp' | 'other';
export type CasteCategory = 'general' | 'obc' | 'sc' | 'st' | 'ews' | 'other';

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
 * Lead profiles - for users who submitted application forms
 */
export interface LeadProfile extends Timestamps {
  id: string;
  user_id: string;

  // Source tracking
  source: ApplicationSource;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referral_code: string | null;

  // Application data
  interest_course: CourseType;
  qualification: string | null;
  school_college: string | null;
  city: string | null;
  state: string | null;

  // Application form data (JSON)
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

  // Notification tracking
  email_sent_at: string | null;
  whatsapp_sent_at: string | null;
  last_reminder_sent_at: string | null;
}

/**
 * Scholarship applications - for 95% scholarship eligibility
 */
export interface ScholarshipApplication extends Timestamps {
  id: string;
  lead_profile_id: string;

  // School verification
  is_government_school: boolean;
  government_school_years: number;
  school_name: string | null;

  // Documents
  school_id_card_url: string | null;
  income_certificate_url: string | null;

  // Income verification
  is_low_income: boolean;
  annual_income_range: string | null;

  // Scholarship eligibility
  scholarship_percentage: number;
  eligibility_reason: string | null;

  // Admin verification
  verification_status: ScholarshipVerificationStatus;
  verified_by: string | null;
  verified_at: string | null;
  verification_notes: string | null;
  rejection_reason: string | null;
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
    };
    Views: Record<string, never>;
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
    };
  };
}
