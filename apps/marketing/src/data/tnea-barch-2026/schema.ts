export interface Tfc {
  sl_no: number;
  tfc_number: string;
  district: string;
  name: string;
  address: string;
  pincode?: string;
  coordinator_name?: string;
  coordinator_role?: string;
  coordinator_phone?: string;
  asst_coordinator_name?: string;
  asst_coordinator_role?: string;
  asst_coordinator_phone?: string;
}

export type DateCategory =
  | 'notification'
  | 'registration'
  | 'verification'
  | 'rank'
  | 'counselling'
  | 'special'
  | 'closure';

export interface ImportantDate {
  id: string;
  label: string;
  description?: string;
  iso_date: string | null;
  display_date: string;
  status: 'confirmed' | 'tentative';
  category: DateCategory;
}

export interface ReservationCategory {
  code: string;
  name: string;
  percent: number;
  description: string;
}

export interface SpecialReservation {
  category: string;
  quota: string;
  notes: string;
}

export interface ReservationData {
  general: ReservationCategory[];
  special: SpecialReservation[];
  pwd_disability_list: string[];
  govt_school_quota: {
    percent: number;
    eligibility: string;
  };
}

export interface FeeConcessionItem {
  name: string;
  description: string;
  eligibility: string[];
  benefit: string;
}

export interface FeeData {
  registration_fee: {
    oc_bc_bcm_mbc: number;
    sc_sca_st: number;
    payment_modes: string[];
  };
  concessions: FeeConcessionItem[];
  govt_school_categories: string[];
}

export interface DocumentItem {
  name: string;
  required_for: string;
  format_notes?: string;
  certificate_authority?: string;
}

export interface ConfirmationOption {
  id: string;
  title: string;
  short: string;
  description: string;
}

export interface CounsellingStage {
  name: string;
  duration: string;
  description: string;
}

export interface CounsellingData {
  rounds_count: number;
  stages_per_round: CounsellingStage[];
  confirmation_options: ConfirmationOption[];
  notes: string[];
}

export type EligibilityCategory = 'nativity' | 'academic' | 'aptitude' | 'special';

export interface EligibilityRule {
  id: string;
  category: EligibilityCategory;
  title: string;
  description: string;
}

export interface EligibilityData {
  academic: {
    qualification: string;
    required_subjects: string[];
    elective_subjects: string[];
    minimum_aggregate_percent: number;
    diploma_alternative: string;
  };
  aptitude: {
    accepted_exams: string[];
    nata_minimum: string;
    notes: string[];
  };
  nativity_rules: EligibilityRule[];
  merit_formula: {
    board_component: number;
    aptitude_component: number;
    total: number;
    tiebreaker: string[];
  };
}

export type FaqCategory =
  | 'eligibility'
  | 'documents'
  | 'reservation'
  | 'fees'
  | 'counselling'
  | 'tfcs'
  | 'special'
  | 'nata_jee'
  | 'general';

export interface Faq {
  id: string;
  question: string;
  answer: string;
  category: FaqCategory;
}

export const TFC_DISTRICTS = [
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore',
  'Dharmapuri', 'Dindigul', 'Erode', 'Kallakurichi', 'Kancheepuram',
  'Kanniyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai',
  'Nagapattinam', 'Namakkal', 'Perambalur', 'Pudukottai', 'Ramanathapuram',
  'Ranipet', 'Salem', 'Sivagangai', 'Tenkasi', 'Thanjavur', 'The Nilgiris',
  'Theni', 'Thiruvallur', 'Thiruvarur', 'Thoothukudi', 'Tiruchirappalli',
  'Tirunelveli', 'Tirupathur', 'Tiruppur', 'Tiruvannamalai', 'Vellore',
  'Viluppuram', 'Virudhunagar',
] as const;
