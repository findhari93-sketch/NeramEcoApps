export type CollegeTier = 'free' | 'silver' | 'gold' | 'platinum';
export type ContactStatus =
  | 'never_contacted'
  | 'emailed_v1'
  | 'replied'
  | 'engaged'
  | 'claimed'
  | 'bounced'
  | 'opted_out';

// Minimum set of college columns we need for outreach.
// Intentionally NOT imported from @neram/marketing to keep admin decoupled.
export interface CollegeOutreachRow {
  id: string;
  name: string;
  slug: string;
  state: string;
  state_slug: string | null;
  city: string;
  type: string | null;
  neram_tier: CollegeTier | null;
  coa_approved: boolean;
  naac_grade: string | null;
  established_year: number | null;
  total_barch_seats: number | null;
  annual_fee_approx: number | null;
  affiliated_university: string | null;
  highlights: string[] | null;
  data_completeness: number | null;
  email: string | null;
  admissions_email: string | null;
  contact_status: ContactStatus | null;
  last_outreach_at: string | null;
  outreach_count: number | null;
  claimed: boolean | null;
  verified: boolean | null;
}
