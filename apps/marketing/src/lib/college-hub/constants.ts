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
export const NAAC_GRADES = ['A++', 'A+', 'A', 'B++', 'B+', 'B', 'C'] as const;

// ─── Sort Options ────────────────────────────────────────────────────────────
export const SORT_OPTIONS = [
  { value: 'arch_index', label: 'ArchIndex Score' },
  { value: 'nirf_rank', label: 'NIRF Rank' },
  { value: 'fee_low', label: 'Fee: Low to High' },
  { value: 'fee_high', label: 'Fee: High to Low' },
  { value: 'name', label: 'Name (A-Z)' },
] as const;

// ─── College Type Options ────────────────────────────────────────────────────
export const COLLEGE_TYPES = [
  { value: 'government', label: 'Government' },
  { value: 'aided', label: 'Government Aided' },
  { value: 'private', label: 'Private' },
  { value: 'deemed', label: 'Deemed University' },
  { value: 'nit', label: 'NIT' },
  { value: 'iit', label: 'IIT' },
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
