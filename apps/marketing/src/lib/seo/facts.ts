/**
 * The one place the marketing site states facts about Neram Classes.
 *
 * Pages, JSON-LD, llms.txt and the location pages read from here so that search
 * engines and AI assistants see one consistent entity. Only verifiable facts go
 * here: no "#1", no success percentages, no city counts that imply centres.
 *
 * Fees live in lib/fees.ts (re-exported below). Ratings come only from
 * lib/review-stats.ts, never from a constant.
 */

import { unstable_cache } from 'next/cache';
import { createAdminClientISR } from '@neram/database';
import { COURSE_FEES, FEE_MIN, FEE_MAX } from '@/lib/fees';

export { COURSE_FEES, FEE_MIN, FEE_MAX };

export const FACTS_REVALIDATE = 86400;

export const ORG_FACTS = {
  name: 'Neram Classes',
  foundingYear: 2009,
  founder: 'Pushparaj Manoharan',
  founderCredential: 'B.Arch, NIT Trichy',
  phone: '+91-9176137043',
  email: 'info@neramclasses.com',
  url: 'https://neramclasses.com',
  /** Head office. Must match the Google Business Profile exactly. */
  headOffice: {
    streetAddress: 'Electronic City Phase 1, Near M5 Mall',
    addressLocality: 'Bangalore',
    addressRegion: 'Karnataka',
    postalCode: '560100',
    addressCountry: 'IN',
  },
  exams: ['NATA', 'JEE Main Paper 2 (B.Arch)', 'AAT (IIT B.Arch)', 'PGETA (M.Arch)'],
  /** Where students can attend in person. Everywhere else is live online. */
  classroomRegions: ['Tamil Nadu', 'Bangalore'],
  teachingModes: 'Live online classes for students anywhere in India and the Gulf, and classroom batches in Tamil Nadu and Bangalore.',
} as const;

/** Plain-language profile used by meta descriptions, Organization schema and llms.txt. */
export const ORG_PROFILE =
  'Neram Classes has coached students for NATA, JEE Main Paper 2 (B.Arch), AAT and PGETA since 2009. ' +
  'Live online classes reach students across India and the Gulf, with classroom batches in Tamil Nadu and Bangalore. ' +
  'Every student gets drawing feedback, mock tests and help with B.Arch counselling.';

// ─── Classroom centres ───────────────────────────────────────────────────────

export interface ClassroomCentre {
  slug: string;
  seoSlug: string;
  name: string;
  /** The city name as stored, e.g. "Tiruchirapalli". */
  city: string;
  /** The location-page slug this centre serves, e.g. "trichy". */
  citySlug: string;
  /** Area label shown to users, e.g. "Tambaram, Chennai". */
  areaLabel: string;
  state: string;
  pincode: string | null;
  lat: number;
  lng: number;
  isHeadquarters: boolean;
  updatedAt: string | null;
}

/** Stored city names that differ from the location-page slug. */
const CENTRE_CITY_SLUGS: Record<string, string> = {
  tiruchirapalli: 'trichy',
  tiruchirappalli: 'trichy',
  bengaluru: 'bangalore',
};

/** Centres whose row city is the metro but the classroom is in a named suburb. */
const CENTRE_AREA_LABELS: Record<string, string> = {
  tambaram: 'Tambaram, Chennai',
  'bangalore-hq': 'Electronic City, Bangalore',
  chennai: 'Ashok Nagar, Chennai',
};

export function centreCitySlug(city: string): string {
  const key = city.trim().toLowerCase().replace(/\s+/g, '-');
  return CENTRE_CITY_SLUGS[key] ?? key;
}

interface CentreRow {
  slug: string;
  seo_slug: string | null;
  name: string;
  city: string;
  state: string;
  pincode: string | null;
  center_type: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  updated_at: string | null;
}

export function toClassroomCentre(row: CentreRow): ClassroomCentre | null {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!row.seo_slug || !Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) return null;
  const citySlug = centreCitySlug(row.city);
  const cityLabel = citySlug === 'trichy' ? 'Trichy' : row.city;
  return {
    slug: row.slug,
    seoSlug: row.seo_slug,
    name: row.name,
    city: row.city,
    citySlug,
    areaLabel: CENTRE_AREA_LABELS[row.slug] ?? cityLabel,
    state: row.state,
    pincode: row.pincode,
    lat,
    lng,
    isHeadquarters: row.center_type === 'headquarters',
    updatedAt: row.updated_at,
  };
}

/** Active classroom centres (all of them hold classes, the Bangalore HQ included). */
export const getClassroomCentres = unstable_cache(
  async (): Promise<ClassroomCentre[]> => {
    try {
      const { data, error } = await createAdminClientISR(FACTS_REVALIDATE)
        .from('offline_centers')
        .select('slug, seo_slug, name, city, state, pincode, center_type, latitude, longitude, updated_at')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as CentreRow[])
        .map(toClassroomCentre)
        .filter((c): c is ClassroomCentre => c !== null);
    } catch {
      // Missing env at build time: render without classroom facts rather than fail.
      return [];
    }
  },
  ['marketing-classroom-centres-v2'],
  { revalidate: FACTS_REVALIDATE, tags: ['geo-facts'] },
);
