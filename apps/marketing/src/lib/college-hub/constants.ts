// College Hub — Constants and Configuration
import { CollegeTier } from './types';

// ─── Tier Configuration ──────────────────────────────────────────────────────
export const TIER_CONFIG: Record<CollegeTier, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  features: string[];
}> = {
  free: {
    label: 'Basic',
    color: '#64748b',
    bgColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    features: ['Name, city, state', 'COA status', 'Basic fee info', 'Accepted exams'],
  },
  silver: {
    label: 'Silver',
    color: '#64748b',
    bgColor: '#f8fafc',
    borderColor: '#94a3b8',
    features: ['All Basic features', 'Gallery photos', 'Detailed fees', 'Faculty list', 'Infrastructure details'],
  },
  gold: {
    label: 'Gold',
    color: '#d97706',
    bgColor: '#fffbeb',
    borderColor: '#fbbf24',
    features: ['All Silver features', 'Placement stats', 'TNEA cutoffs', 'Verified badge', 'Priority in listings'],
  },
  platinum: {
    label: 'Platinum',
    color: '#7c3aed',
    bgColor: '#faf5ff',
    borderColor: '#a78bfa',
    features: ['All Gold features', 'Lead notifications', 'Analytics dashboard', 'Admin profile editor', 'AI chat widget'],
  },
};

// ─── ArchIndex Weights ───────────────────────────────────────────────────────
export const ARCH_INDEX_CONFIG = {
  studio: { weight: 0.25, label: 'Studio Quality', icon: 'palette' },
  faculty: { weight: 0.20, label: 'Faculty Strength', icon: 'school' },
  placement: { weight: 0.20, label: 'Placements', icon: 'work' },
  infrastructure: { weight: 0.15, label: 'Infrastructure', icon: 'apartment' },
  satisfaction: { weight: 0.10, label: 'Student Satisfaction', icon: 'star' },
  alumni: { weight: 0.10, label: 'Alumni Network', icon: 'groups' },
} as const;

// ─── Indian State Slugs ──────────────────────────────────────────────────────
export const STATE_SLUGS: Record<string, string> = {
  'Tamil Nadu': 'tamil-nadu',
  'Karnataka': 'karnataka',
  'Kerala': 'kerala',
  'Andhra Pradesh': 'andhra-pradesh',
  'Telangana': 'telangana',
  'Maharashtra': 'maharashtra',
  'Delhi': 'delhi',
  'West Bengal': 'west-bengal',
  'Rajasthan': 'rajasthan',
  'Gujarat': 'gujarat',
  'Uttar Pradesh': 'uttar-pradesh',
  'Madhya Pradesh': 'madhya-pradesh',
  'Punjab': 'punjab',
  'Haryana': 'haryana',
  'Bihar': 'bihar',
  'Odisha': 'odisha',
  'Jharkhand': 'jharkhand',
  'Chhattisgarh': 'chhattisgarh',
  'Assam': 'assam',
  'Himachal Pradesh': 'himachal-pradesh',
  'Uttarakhand': 'uttarakhand',
  'Goa': 'goa',
  'Chandigarh': 'chandigarh',
  'Puducherry': 'puducherry',
};

export const STATE_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_SLUGS).map(([name, slug]) => [slug, name])
);

// ─── Counseling Systems ──────────────────────────────────────────────────────
export const COUNSELING_LABELS: Record<string, string> = {
  TNEA: 'TNEA (Tamil Nadu)',
  JoSAA: 'JoSAA (All India)',
  KEAM: 'KEAM (Kerala)',
  KCET: 'KCET (Karnataka)',
  AP_EAPCET: 'AP EAPCET (Andhra Pradesh)',
  // B.Arch in Andhra Pradesh goes through APSCHE, not EAPCET; CENTAC runs Puducherry admissions.
  APSCHE: 'APSCHE (Andhra Pradesh)',
  CENTAC: 'CENTAC (Puducherry)',
  TS_EAPCET: 'TS EAPCET (Telangana)',
  UPSEE: 'UPSEE (Uttar Pradesh)',
  MHT_CET: 'MHT CET (Maharashtra)',
  WBJEE: 'WBJEE (West Bengal)',
  OJEE: 'OJEE (Odisha)',
  REAP: 'REAP (Rajasthan)',
  COMEDK: 'COMEDK (Karnataka Private)',
  BCECE: 'BCECE (Bihar)',
  GUJCET: 'GUJCET (Gujarat)',
  other: 'Other',
};

export const COUNSELING_SLUGS: Record<string, string> = Object.fromEntries(
  Object.keys(COUNSELING_LABELS).map((key) => [key.toLowerCase().replace(/_/g, '-'), key])
);

// ─── Fee Category Labels ─────────────────────────────────────────────────────
export const FEE_CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  obc: 'OBC',
  obc_ncl: 'OBC-NCL',
  sc: 'SC',
  st: 'ST',
  ews: 'EWS',
  management: 'Management Quota',
  nri: 'NRI Quota',
};

// ─── NAAC Grade Labels ───────────────────────────────────────────────────────
export const NAAC_GRADES = ['A++', 'A+', 'A', 'B++', 'B+', 'B'] as const;

// ─── Sort Options ────────────────────────────────────────────────────────────
// Labels follow the directory copy guide: "Recommended" is the default.
export const SORT_OPTIONS = [
  { value: 'arch_index', label: 'Recommended' },
  { value: 'fee_low', label: 'Fee: low to high' },
  { value: 'fee_high', label: 'Fee: high to low' },
  { value: 'rating_high', label: 'Highest rated' },
  { value: 'nirf_rank', label: 'NIRF rank' },
  { value: 'placement_high', label: 'Highest package' },
  { value: 'name', label: 'Name (A to Z)' },
] as const;

// ─── College Type Options ────────────────────────────────────────────────────
// The DB mixes cases ("Private" and "private"); filters match case-insensitively.
export const COLLEGE_TYPES = [
  { value: 'Government', label: 'Government', short: 'Govt' },
  { value: 'Private', label: 'Private', short: 'Private' },
  { value: 'Deemed', label: 'Deemed university', short: 'Deemed' },
  { value: 'Government Aided', label: 'Government aided', short: 'Aided' },
] as const;

// ─── Directory ───────────────────────────────────────────────────────────────
export const COMPARE_MAX = 4;

/**
 * Entrance exam filter options. accepted_exams spells JEE three ways
 * ("JEE Main", "JEE Main Paper 2", "JEE_PAPER_2"); each option lists every
 * spelling it matches. The value stays JEE_PAPER_2 so old URLs keep working.
 */
export const EXAM_FILTERS = [
  { value: 'NATA', label: 'NATA', short: 'NATA', matches: ['NATA'] },
  { value: 'JEE_PAPER_2', label: 'JEE Main Paper 2', short: 'JEE P2', matches: ['JEE_PAPER_2', 'JEE Main Paper 2', 'JEE Main'] },
] as const;

export const RATING_OPTIONS = [4.5, 4, 3.5] as const;

/** Fee presets of the directory filter (annual fee, rupees). */
export const DIRECTORY_FEE_PRESETS = [
  { label: 'Under ₹1L', minFee: undefined, maxFee: 100000 },
  { label: '₹1L to ₹2L', minFee: 100000, maxFee: 200000 },
  { label: '₹2L to ₹3L', minFee: 200000, maxFee: 300000 },
  { label: 'Above ₹3L', minFee: 300000, maxFee: undefined },
] as const;

// ─── Page size ───────────────────────────────────────────────────────────────
export const COLLEGES_PER_PAGE = 20;

// ─── ISR Revalidation Times ──────────────────────────────────────────────────
export const REVALIDATE_COLLEGE_DETAIL = 3600;   // 1 hour
export const REVALIDATE_COLLEGE_LISTING = 3600;  // 1 hour
export const REVALIDATE_CUTOFFS = 86400;          // 24 hours (exam data changes rarely)

// ─── Data Quality Thresholds ─────────────────────────────────────────────────
export const DATA_COMPLETENESS = {
  MINIMAL: 25,
  BASIC: 50,
  GOOD: 75,
  COMPLETE: 90,
} as const;

// ─── City Tier Living Costs (ROI Calculator) ────────────────────────────────

/** Annual living cost estimate by city tier (hostel + food + misc) */
export const CITY_TIER_LIVING_COST: Record<string, number> = {
  // Tier 1: Metro cities
  chennai: 180000, mumbai: 180000, delhi: 180000, bangalore: 180000,
  hyderabad: 180000, kolkata: 180000, pune: 180000,
  // Tier 2: Large cities
  coimbatore: 150000, jaipur: 150000, lucknow: 150000, ahmedabad: 150000,
  chandigarh: 150000, bhopal: 150000, nagpur: 150000, thiruvananthapuram: 150000,
  kochi: 150000, mysore: 150000, madurai: 150000, mangalore: 150000,
};

/** Default living cost for cities not in the mapping (Tier 3) */
export const DEFAULT_LIVING_COST = 120000;

/** Annual materials & travel estimate */
export const MATERIALS_TRAVEL_COST = 60000;

/** B.Arch course duration in years */
export const COURSE_DURATION_YEARS = 5;

export const COLLEGE_TYPE_SLUGS: Record<string, string> = {
  government: 'Government',
  private: 'Private',
  deemed: 'Deemed',
};

export const ACCREDITATION_FILTERS: Record<string, { label: string; description: string }> = {
  'coa-approved': { label: 'COA Approved', description: 'Colleges approved by the Council of Architecture' },
  'naac-a-plus': { label: 'NAAC A+ and Above', description: 'Colleges with NAAC A+ or A++ grade' },
};

// Listing layout
export const FEATURED_COUNT = 5;
export const AD_INTERVAL_COMPACT = 5;
export const AD_AFTER_FEATURED = 2;

export const FEE_PRESETS = [
  { label: 'Under ₹1L', minFee: 0, maxFee: 100000 },
  { label: '₹1-2L', minFee: 100000, maxFee: 200000 },
  { label: '₹2-5L', minFee: 200000, maxFee: 500000 },
  { label: '₹5L+', minFee: 500000, maxFee: undefined },
] as const;

export const EXAM_TYPES = [
  { value: 'NATA', label: 'NATA' },
  { value: 'JEE_PAPER_2', label: 'JEE Paper 2' },
] as const;

// ─── Admission cycle ─────────────────────────────────────────────────────────

/**
 * The B.Arch admission year students are searching for. Counselling for the
 * current year ends by June, so from July (month index 6) the next cycle is
 * the one that matters: in October 2026 students search "B.Arch 2027".
 */
export function admissionYear(now: Date = new Date()): number {
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

/** Admission year at module load. Prefer admissionYear() inside renders. */
export const ADMISSION_YEAR = admissionYear();

/** Display labels for raw accepted_exams values (the DB mixes styles). */
export const EXAM_LABELS: Record<string, string> = {
  JEE_PAPER_2: 'JEE Main Paper 2',
  'MHT-CET': 'MHT CET',
};
