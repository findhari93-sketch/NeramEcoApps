// College Hub — TypeScript interfaces
// Column names match the Supabase database exactly.
// Note: DB uses 'type' (not 'college_type') and 'neram_tier' (not 'tier').

export type CollegeTier = 'free' | 'silver' | 'gold' | 'platinum';
export type FeeCategory = 'general' | 'obc' | 'obc_ncl' | 'sc' | 'st' | 'ews' | 'management' | 'nri';
export type CounselingSystem =
  | 'TNEA' | 'JoSAA' | 'KEAM' | 'KCET'
  | 'AP_EAPCET' | 'TS_EAPCET'
  | 'UPSEE' | 'MHT_CET' | 'WBJEE' | 'OJEE' | 'REAP'
  | 'COMEDK' | 'BCECE' | 'GUJCET'
  | 'other';
export type CutoffType = 'rank' | 'score' | 'percentile';

export interface College {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  city: string;
  state: string;
  state_slug: string | null;
  district: string | null;
  address: string | null;
  pincode: string | null;
  type: string | null;
  affiliation: string | null;
  affiliated_university: string | null;
  established_year: number | null;
  intake_capacity: number | null;
  total_barch_seats: number | null;
  annual_fee_min: number | null;
  annual_fee_max: number | null;
  annual_fee_approx: number | null;
  // Accreditation
  coa_approved: boolean;
  coa_validity_till: string | null;
  naac_grade: string | null;
  naac_valid_till: string | null;
  nba_accredited: boolean;
  nirf_rank: number | null;
  nirf_rank_architecture: number | null;
  nirf_score: number | null;
  arch_index_score: number | null;
  // Exams
  accepted_exams: string[] | null;
  counseling_systems: string[] | null;
  has_management_quota: boolean;
  has_nri_quota: boolean;
  // Contact
  website: string | null;
  email: string | null;
  phone: string | null;
  admissions_email: string | null;
  admissions_phone: string | null;
  // Social
  youtube_channel_url: string | null;
  instagram_handle: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  // Tier / Premium
  neram_tier: CollegeTier;
  tier_start_date: string | null;
  tier_end_date: string | null;
  tier_amount: number | null;
  // Claim / Verification
  claimed: boolean;
  claimed_by: string | null;
  claimed_at: string | null;
  verified: boolean;
  verified_at: string | null;
  // Media
  logo_url: string | null;
  hero_image_url: string | null;
  gallery_images: string[] | null;
  virtual_tour_scenes?: VirtualTourScene[] | null;
  // Partnership SEO
  partnership_page_url?: string | null;
  partnership_page_status?: 'none' | 'pending' | 'approved' | 'rejected' | null;
  // Content
  highlights: string[] | null;
  about: string | null;
  // Data quality
  data_source: string | null;
  data_completeness: number;
  // Placement salary data
  avg_placement_salary: number | null;
  min_placement_salary: number | null;
  max_placement_salary: number | null;
  // Downloads
  brochure_url: string | null;
  // City routing
  city_slug: string | null;
  last_data_update: string | null;
  // Location details
  location_type: string | null;
  nearest_railway: string | null;
  nearest_airport: string | null;
  railway_distance_km: number | null;
  airport_distance_km: number | null;
  // Timestamps
  created_at: string | null;
  updated_at: string | null;
}

export interface CollegeFee {
  id: string;
  college_id: string;
  academic_year: string;
  year_number: number;
  fee_category: FeeCategory;
  tuition: number | null;
  hostel: number | null;
  mess: number | null;
  exam_fees: number | null;
  lab_fees: number | null;
  library_fees: number | null;
  caution_deposit: number | null;
  other_fees: number | null;
  estimated_materials: number | null;
  estimated_field_trips: number | null;
  verified: boolean;
  verified_source: string | null;
}

export interface CollegeCutoff {
  id: string;
  college_id: string;
  academic_year: string;
  counseling_system: CounselingSystem;
  round_number: number | null;
  category: string;
  cutoff_type: CutoffType;
  cutoff_value: number | null;
  total_seats: number | null;
  filled_seats: number | null;
  source: string | null;
}

export interface CollegePlacement {
  id: string;
  college_id: string;
  academic_year: string;
  highest_package_lpa: number | null;
  average_package_lpa: number | null;
  median_package_lpa: number | null;
  placement_rate_percent: number | null;
  students_placed: number | null;
  total_eligible: number | null;
  top_recruiters: string[] | null;
  top_sectors: string[] | null;
  higher_studies_percent: number | null;
  entrepreneurship_percent: number | null;
  verified: boolean;
  source: string | null;
}

export interface CollegeInfrastructure {
  id: string;
  college_id: string;
  design_studios: number | null;
  studio_student_ratio: string | null;
  workshops: string[] | null;
  software_available: string[] | null;
  has_digital_fabrication: boolean;
  has_model_making_lab: boolean;
  has_material_library: boolean;
  has_library: boolean;
  library_books_count: number | null;
  has_hostel_boys: boolean | null;
  has_hostel_girls: boolean | null;
  hostel_capacity: number | null;
  hostel_type: 'on_campus' | 'off_campus' | 'both' | null;
  has_mess: boolean | null;
  has_wifi: boolean;
  has_sports: boolean | null;
  sports_facilities: string[] | null;
  campus_area_acres: number | null;
  campus_type: 'urban' | 'suburban' | 'campus_town' | 'rural' | null;
}

export interface CollegeFaculty {
  id: string;
  college_id: string;
  name: string;
  designation: string | null;
  specialization: string | null;
  qualification: string | null;
  is_practicing_architect: boolean;
  profile_url: string | null;
  display_order: number;
  is_active: boolean;
}

// Rich college detail page data (all relations joined)
export interface CollegeDetail extends College {
  fees: CollegeFee[];
  cutoffs: CollegeCutoff[];
  placements: CollegePlacement[];
  infrastructure: CollegeInfrastructure | null;
  faculty: CollegeFaculty[];
}

// Listing card — minimal fields for performance
export interface CollegeListItem {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  city: string;
  state: string;
  state_slug: string | null;
  type: string | null;
  neram_tier: CollegeTier;
  coa_approved: boolean;
  naac_grade: string | null;
  nirf_rank: number | null;
  nirf_rank_architecture: number | null;
  arch_index_score: number | null;
  annual_fee_min: number | null;
  annual_fee_max: number | null;
  annual_fee_approx: number | null;
  total_barch_seats: number | null;
  accepted_exams: string[] | null;
  counseling_systems: string[] | null;
  logo_url: string | null;
  hero_image_url: string | null;
  admissions_phone: string | null;
  brochure_url: string | null;
  avg_placement_salary: number | null;
  min_placement_salary: number | null;
  max_placement_salary: number | null;
  city_slug: string | null;
  highlights: string[] | null;
  verified: boolean;
  data_completeness: number;
}

// Filter options for listing pages
export interface CollegeFilters {
  state?: string;
  type?: string;
  counselingSystem?: CounselingSystem;
  minFee?: number;
  maxFee?: number;
  naacGrade?: string;
  coa?: boolean;
  search?: string;
  sortBy?: 'arch_index' | 'nirf_rank' | 'fee_low' | 'fee_high' | 'name';
  page?: number;
  limit?: number;
}

// ArchIndex breakdown scores (for display)
export interface ArchIndexBreakdown {
  total: number;
  studio: number;
  faculty: number;
  placement: number;
  infrastructure: number;
  satisfaction: number;
  alumni: number;
}

// Phase 2: Engagement types

export interface CollegeReview {
  id: string;
  college_id: string;
  reviewer_name: string;
  reviewer_phone?: string | null;
  reviewer_year?: string | null;
  firebase_uid?: string | null;
  rating_overall?: number | null;
  rating_studio?: number | null;
  rating_faculty?: number | null;
  rating_campus?: number | null;
  rating_placements?: number | null;
  rating_value?: number | null;
  rating_infrastructure?: number | null;
  title?: string | null;
  body: string;
  pros?: string | null;
  cons?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'flagged';
  rejected_reason?: string | null;
  created_at: string;
}

export interface CollegeComment {
  id: string;
  college_id: string;
  parent_id?: string | null;
  author_name: string;
  author_phone?: string | null;
  firebase_uid?: string | null;
  body: string;
  is_ambassador: boolean;
  status: 'approved' | 'removed';
  created_at: string;
  replies?: CollegeComment[];
}

// Phase 6: Virtual campus tour data (Platinum-tier colleges only)
export interface VirtualTourHotspot {
  pitch: number;
  yaw: number;
  text: string;
  targetScene?: string;
}

export interface VirtualTourScene {
  id: string;
  label: string;
  imageUrl: string;
  hotspots?: VirtualTourHotspot[];
}

export interface CollegeLead {
  id: string;
  college_id: string;
  name: string;
  phone: string;
  email?: string | null;
  nata_score?: number | null;
  jee_score?: number | null;
  city?: string | null;
  message?: string | null;
  consent_given: boolean;
  source?: string | null;
  firebase_uid?: string | null;
  lead_window_active?: boolean | null;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'dropped';
  created_at: string;
  updated_at?: string;
}
