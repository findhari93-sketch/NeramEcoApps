export interface KeralaCollege {
  sl_no: number;
  code: string;
  name: string;
  city: string;
  district: string;
  state: 'Kerala';
  university: 'Calicut' | 'CUSAT' | 'KTU' | 'Kerala' | 'MG';
  type: 'Government' | 'Aided' | 'Self-financing';
  seats: number;
  phones: string[];
  pincode?: string;
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
  clause_ref?: string;
}

export type EligibilityCategory = 'academic' | 'aptitude' | 'age' | 'nativity' | 'other';

export interface EligibilityRule {
  id: string;
  category: EligibilityCategory;
  title: string;
  description: string;
  clause_ref?: string;
}

export interface EligibilityData {
  academic: {
    qualification: string;
    compulsory_subjects: string[];
    elective_subjects: string[];
    minimum_aggregate_percent: number;
    rounding_note: string;
    diploma_alternative: string;
  };
  aptitude: {
    required_test: string;
    accepted_years: string[];
    relaxation_note: string;
    no_keam_arch_exam_note: string;
  };
  age: {
    minimum_age: number;
    age_reference_date: string;
    upper_age_limit: string;
  };
  merit_formula: {
    nata_component: number;
    qualifying_component: number;
    total: number;
    description: string;
    tiebreaker: string[];
  };
  no_lateral_entry: string;
  rules: EligibilityRule[];
}

export interface DocumentItem {
  name: string;
  required_for: string;
  format_notes?: string;
  certificate_authority?: string;
  mandatory: boolean;
  clause_ref?: string;
}

export interface ReservationCategory {
  code: string;
  name: string;
  percent: number;
  description: string;
}

export interface SebcSubCategory {
  code: string;
  name: string;
  percent: number;
}

export interface SpecialReservation {
  category: string;
  quota: string;
  notes: string;
  clause_ref?: string;
}

export interface ReservationData {
  general: ReservationCategory[];
  sebc_sub_categories: SebcSubCategory[];
  special: SpecialReservation[];
  pwd: {
    percent: number;
    minimum_disability_percent: number;
    document: string;
    clause_ref: string;
  };
  ews: {
    description: string;
    clause_ref: string;
  };
  sports_ncc_additive: {
    description: string;
    bonus_max: number;
    final_index_max: number;
    clause_ref: string;
  };
}

export interface FeeConcessionItem {
  name: string;
  description: string;
  eligibility: string[];
  benefit: string;
  clause_ref?: string;
}

export interface FeeData {
  application_fee: {
    general: number;
    sc: number;
    st: number;
    uae_centre_extra: number;
    payment_modes: string[];
  };
  tuition_fee: {
    to_be_notified: boolean;
    note: string;
    notification_url: string;
  };
  concessions: FeeConcessionItem[];
  refund_rules: {
    title: string;
    description: string;
    clause_ref?: string;
  }[];
}

export interface AllotmentPhase {
  id: string;
  name: string;
  status: 'confirmed' | 'tentative';
  description: string;
}

export interface AllotmentData {
  authority: string;
  governing_council: string;
  phases: AllotmentPhase[];
  option_registration_note: string;
  fee_remittance_note: string;
  reporting_documents: string[];
  liquidated_damages_note: string;
  clause_refs: Record<string, string>;
}

export type FaqCategory =
  | 'eligibility'
  | 'nata'
  | 'application'
  | 'rank_list'
  | 'reservation'
  | 'fees'
  | 'allotment'
  | 'colleges'
  | 'nri'
  | 'general';

export interface Faq {
  id: string;
  question: string;
  answer: string;
  category: FaqCategory;
  clause_ref?: string;
}

export interface AkshayaCallout {
  description: string;
  helpline_url: string;
  finder_url: string;
  representative_centres: { city: string; district: string; note: string }[];
}

export const KERALA_DISTRICTS = [
  'Thiruvananthapuram',
  'Kollam',
  'Pathanamthitta',
  'Alappuzha',
  'Kottayam',
  'Idukki',
  'Ernakulam',
  'Thrissur',
  'Palakkad',
  'Malappuram',
  'Kozhikode',
  'Wayanad',
  'Kannur',
  'Kasaragod',
] as const;

export type KeralaDistrict = (typeof KERALA_DISTRICTS)[number];

export const KERALA_UNIVERSITIES = ['Calicut', 'CUSAT', 'KTU', 'Kerala', 'MG'] as const;
