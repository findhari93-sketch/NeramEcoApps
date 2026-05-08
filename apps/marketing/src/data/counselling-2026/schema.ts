/**
 * Counselling Hub 2026: typed config for data-driven hub pages.
 *
 * Each counselling (JoSAA, MHT-CET, KEAM, etc.) is described as a CounsellingHubConfig,
 * rendered by <CounsellingHubPage>. This keeps 26+ stub-quality hubs maintainable
 * without duplicating layout code.
 *
 * IMPORTANT (CLAUDE.md content rule): no em dashes, double dashes, or &mdash; in any
 * user-visible string (title, description, FAQ answers, etc.). Use commas, colons,
 * periods, parentheses, or rephrase.
 */

export type ExamRoute = 'NATA' | 'JEE_P2' | 'JEE_ADV_AAT';

export type Region = 'national' | 'south' | 'north' | 'east' | 'west' | 'central';

export type Tier = 1 | 2 | 3;

/**
 * Controls section visibility in <CounsellingHubPage>:
 * - stub: hero, status, at-a-glance, eligibility, dates, FAQs, callback (no reservation/fees/colleges/gotchas)
 * - standard: all sections
 * - deep: all sections + reserved for hand-written hubs (TNEA, KEAM) that bypass this component
 */
export type Depth = 'stub' | 'standard' | 'deep';

/**
 * Drives the page status banner color and copy:
 * - live: registration is open or counselling is actively running
 * - tbd: 2026 schedule not yet released, content based on 2025 cycle
 * - coming-soon: hub planned but data not yet curated
 */
export type Status = 'live' | 'tbd' | 'coming-soon';

export interface ImportantDate {
  label: string;
  dateIso?: string;
  dateDisplay: string;
  status?: 'confirmed' | 'expected' | 'tbd';
  note?: string;
}

export interface EligibilityRule {
  label: string;
  detail: string;
}

export interface ReservationCategory {
  category: string;
  percentage: string;
  note?: string;
}

export interface FeeItem {
  label: string;
  amount: string;
  note?: string;
}

export interface ParticipatingCollege {
  name: string;
  city: string;
  intake?: number;
  feesPerYear?: string;
  cutoffNote?: string;
  url?: string;
}

export interface Gotcha {
  title: string;
  detail: string;
}

export interface FAQ {
  question: string;
  answer: string;
  category?: string;
}

export interface AintraConfig {
  topic: string;
  endpoint?: string;
  greeting?: string;
  suggestions?: string[];
  primaryColor?: string;
  primaryColorDark?: string;
  disclaimerSource?: string;
}

export interface CounsellingHubConfig {
  /** URL slug, e.g. 'josaa', 'mht-cet-barch'. Lives at /counseling/{slug}. */
  slug: string;
  /** Full page title used in hero, e.g. 'JoSAA B.Arch Counselling 2026'. */
  title: string;
  /** Short brand name for cards, breadcrumbs, e.g. 'JoSAA'. */
  shortName: string;
  /** Conducting body, e.g. 'Joint Seat Allocation Authority (MoE)'. */
  authority: string;
  /** Authority short form for compact UI, e.g. 'JoSAA'. */
  authorityShort?: string;
  /** Official portal URL. */
  primaryUrl: string;

  tier: Tier;
  region: Region;
  depth: Depth;
  status: Status;
  examRoutes: ExamRoute[];

  /** Single sentence shown under hero title. */
  tagline: string;
  /** 2-3 sentences summarising what this counselling is and who it serves. */
  description: string;

  statusBanner: {
    label: string;
    detail?: string;
    expectedDate?: string;
  };

  /** ISO date (YYYY-MM-DD) when content was last verified against an official source. */
  lastVerified: string;
  /** Optional disclaimer for hubs awaiting 2026 brochure, e.g. 'Based on 2025 cycle, 2026 dates pending official notification'. */
  cycleSourceNote?: string;

  /** 4-6 key facts shown in the at-a-glance card. */
  atAGlance: Array<{ label: string; value: string }>;

  eligibility: EligibilityRule[];
  dates: ImportantDate[];
  reservation?: ReservationCategory[];
  fees?: FeeItem[];
  topColleges?: ParticipatingCollege[];
  gotchas?: Gotcha[];
  faqs: FAQ[];

  /** ISR revalidation in seconds. Stubs default to 86400 (1 day). Active counselling uses 3600. */
  revalidateSeconds: number;

  /** Optional Aintra chat customisation. Falls back to a generic counselling topic if omitted. */
  aintra?: AintraConfig;

  /** SEO overrides; if omitted, defaults derived from title/description. */
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
}
