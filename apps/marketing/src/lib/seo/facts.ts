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
import { normaliseCentrePhotos, type CentrePhoto } from './centre-photos';

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

/**
 * The only proof claims the site makes (founder-confirmed 2026-10-03). Never
 * add success percentages, "#1", city counts or a bigger student number here
 * without proof; lib/seo/claims.test.ts fails the build on the old ones.
 */
export const PROOF_POINTS = {
  years: '10+ years',
  students: '1,000+ students',
  topResult: 'AIR 1 in JEE B.Arch 2024',
  /** One line for heroes and descriptions. */
  line: '10+ years, 1,000+ students, AIR 1 in JEE B.Arch 2024',
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
  /**
   * The one city page that is this centre's page, e.g. "trichy". Only that page
   * may say "classroom"; nearby places say "our nearest classroom is in X".
   */
  citySlug: string;
  /** Area label shown to users, e.g. "Tambaram, Chennai". */
  areaLabel: string;
  state: string;
  pincode: string | null;
  lat: number;
  lng: number;
  isHeadquarters: boolean;
  updatedAt: string | null;
  /** offline_centers.id, for the visit booking API. */
  id?: string;
  /** Street address as stored. A bare city name means the street is still unknown. */
  address?: string | null;
  phone?: string | null;
  /** { mon: { open: '09:00', close: '18:00' } | null, ... } */
  hours?: Record<string, { open: string; close: string } | null> | null;
  /** Real photos, hero first (Admin > Centres). */
  photos?: CentrePhoto[];
  /** Google Maps directions link (search link when no place is set). */
  mapsUrl?: string;
  /** Google Business Profile link, once the profile is claimed. */
  gbpUrl?: string | null;
  nearbyCities?: string[];
  /** Google place ID: the map embed and the review link use it. */
  placeId?: string | null;
  landmark?: string | null;
  establishedYear?: number | null;
  facilities?: string[];
  /** The staff-written "About this centre" paragraph, only once a reviewer ticked it. */
  description?: string | null;
  /** Google rating as staff copied it, with the date they checked. */
  googleRating?: { value: number; count: number; checkedAt: string; url: string | null } | null;
}

/** True when the row has a real street address and pincode (needed for LocalBusiness). */
export function hasFullAddress(c: ClassroomCentre): boolean {
  const addr = (c.address ?? '').trim();
  return !!c.pincode && addr.length > 0 && addr.toLowerCase() !== c.city.trim().toLowerCase();
}

/** Stored city names that differ from the location-page slug. */
const CENTRE_CITY_SLUGS: Record<string, string> = {
  tiruchirapalli: 'trichy',
  tiruchirappalli: 'trichy',
  bengaluru: 'bangalore',
};

/** Centres with their own city page although the row city is the metro. */
const CENTRE_PAGE_SLUGS: Record<string, string> = {
  tambaram: 'tambaram',
};

/** Centres whose row city is the metro but the classroom is in a named suburb. */
const CENTRE_AREA_LABELS: Record<string, string> = {
  tambaram: 'Tambaram, Chennai',
  'bangalore-hq': 'Electronic City, Bangalore',
  chennai: 'Ashok Nagar, Chennai',
  // Localities from the street addresses (offline_centers, 2026-10-03).
  madurai: 'Vasanth Nagar, Madurai',
  coimbatore: 'Saibaba Colony, Coimbatore',
  trichy: 'Thillai Nagar, Trichy',
  tiruppur: 'Ramaiah Colony, Tiruppur',
  // Two classrooms in one town need names that tell them apart.
  'pudukkottai-nata': 'Nathampannai, Pudukkottai',
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
  id?: string;
  address?: string | null;
  contact_phone?: string | null;
  operating_hours?: ClassroomCentre['hours'];
  photos?: unknown;
  google_maps_url?: string | null;
  google_business_url?: string | null;
  nearby_cities?: string[] | null;
  google_place_id?: string | null;
  landmark?: string | null;
  established_year?: number | null;
  facilities?: string[] | null;
  description?: string | null;
  description_reviewed?: boolean | null;
  rating?: number | string | null;
  review_count?: number | null;
  rating_checked_at?: string | null;
  google_reviews_url?: string | null;
}

function googleRatingOf(row: CentreRow): ClassroomCentre['googleRating'] {
  const value = Number(row.rating);
  const count = Number(row.review_count);
  if (!row.rating_checked_at || !Number.isFinite(value) || value <= 0 || value > 5 || !Number.isFinite(count) || count < 1) return null;
  return { value, count, checkedAt: row.rating_checked_at, url: row.google_reviews_url || row.google_business_url || null };
}

export function toClassroomCentre(row: CentreRow): ClassroomCentre | null {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!row.seo_slug || !Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) return null;
  const citySlug = CENTRE_PAGE_SLUGS[row.slug] ?? centreCitySlug(row.city);
  const cityLabel = citySlug === 'trichy' ? 'Trichy' : citySlug === 'tambaram' ? 'Tambaram' : row.city;
  const areaLabel = CENTRE_AREA_LABELS[row.slug] ?? cityLabel;
  // One reviewer tick covers the "About" block: the description and the
  // facilities (seeded rows carry template facilities on every centre).
  const reviewed = row.description_reviewed === true;
  const description = reviewed && row.description?.trim() ? row.description.trim() : null;
  return {
    slug: row.slug,
    seoSlug: row.seo_slug,
    name: row.name,
    city: row.city,
    citySlug,
    areaLabel,
    state: row.state,
    pincode: row.pincode,
    lat,
    lng,
    isHeadquarters: row.center_type === 'headquarters',
    updatedAt: row.updated_at,
    id: row.id,
    address: row.address ?? null,
    phone: row.contact_phone ?? null,
    hours: row.operating_hours ?? null,
    photos: normaliseCentrePhotos(row.photos, `Neram Classes NATA classroom, ${areaLabel}`),
    mapsUrl: row.google_maps_url || `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    gbpUrl: row.google_business_url ?? null,
    nearbyCities: Array.isArray(row.nearby_cities) ? row.nearby_cities : [],
    placeId: row.google_place_id?.trim() || null,
    landmark: row.landmark?.trim() || null,
    establishedYear: row.established_year ?? null,
    facilities: reviewed ? (row.facilities ?? []).filter((f) => typeof f === 'string' && f.trim()) : [],
    description,
    googleRating: googleRatingOf(row),
  };
}

/**
 * A Google Business Profile link stored on two centres (prod 2026-10-03: both
 * Pudukkottai rows; Kanchipuram carries Tambaram's) cannot be either centre's
 * profile, so it is dropped until staff fix the rows.
 */
export function dropSharedProfiles(centres: ClassroomCentre[]): ClassroomCentre[] {
  const count = new Map<string, number>();
  for (const c of centres) if (c.gbpUrl) count.set(c.gbpUrl, (count.get(c.gbpUrl) ?? 0) + 1);
  return centres.map((c) => (c.gbpUrl && (count.get(c.gbpUrl) ?? 0) > 1 ? { ...c, gbpUrl: null } : c));
}

/** Active classroom centres (all of them hold classes, the Bangalore HQ included). */
export const getClassroomCentres = unstable_cache(
  async (): Promise<ClassroomCentre[]> => {
    try {
      const { data, error } = await createAdminClientISR(FACTS_REVALIDATE)
        .from('offline_centers')
        .select('*') // ~10 rows; '*' because optional columns (nearby_cities) are missing on staging
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return dropSharedProfiles(
        ((data ?? []) as CentreRow[]).map(toClassroomCentre).filter((c): c is ClassroomCentre => c !== null),
      );
    } catch {
      // Missing env at build time: render without classroom facts rather than fail.
      return [];
    }
  },
  ['marketing-classroom-centres-v5'],
  // 'centers' lets an Admin > Centres save show at once (lib/cache-tags.ts).
  { revalidate: FACTS_REVALIDATE, tags: ['geo-facts', 'centers'] },
);
