/**
 * Counselling Hub Registry: lightweight summary metadata for all 28 B.Arch counsellings.
 *
 * Full configs live in ./{slug}.ts files and are imported only by their respective
 * route files (avoids pulling 28 configs into the master page bundle).
 *
 * To enable a new hub:
 *   1. Append a HubSummary entry to RAW_HUBS below
 *   2. Add the slug to ROUTED_SLUGS once the route file exists
 *   3. Create ./{slug}.ts with the full CounsellingHubConfig
 *   4. Create app/[locale]/counseling/{slug}/page.tsx
 */

import type { ExamRoute, Region, Tier, Depth, Status, CounsellingHubConfig } from './schema';

export type { CounsellingHubConfig } from './schema';

export interface HubSummary {
  slug: string;
  title: string;
  shortName: string;
  authority: string;
  tier: Tier;
  region: Region;
  examRoutes: ExamRoute[];
  depth: Depth;
  status: Status;
  /** Single sentence used on the master grid card. */
  blurb: string;
  /** Whether the route exists yet. False = listed in master grid as 'Coming Soon', no link. */
  available: boolean;
  /** External hub already exists outside this generic system (TNEA, KEAM use bespoke pages). */
  external?: boolean;
}

type RawHub = Omit<HubSummary, 'available'>;

/**
 * Slugs that have a working route at /counseling/{slug}/page.tsx.
 * Add a slug here only after the route file actually exists.
 */
const ROUTED_SLUGS = new Set<string>([
  'tnea-barch',
  'keam-arch',
  'josaa',
  'mht-cet-barch',
  'hstes-barch',
  // Batch 2A
  'csab-special',
  'csab-neut',
  'cept-university',
  'kea-barch',
  'acpc-barch',
  'ap-barch',
  'tg-barch',
  'uptac-barch',
  // Batch 2B
  'jac-delhi-barch',
  'jac-chandigarh-barch',
  'wbjee-barch',
  'ojee-barch',
  'reap-barch',
  // Batch 2C
  'dte-mp-barch',
  'ikgptu-barch',
  'bceceb-ugeac',
  'jceceb-barch',
  'dte-cg-barch',
  'dte-assam-barch',
  'jkbopee-barch',
  'hptu-barch',
  'vmsb-utu-barch',
  'dte-goa-barch',
]);

const RAW_HUBS: RawHub[] = [
  // ─── Existing hand-written hubs (gold-standard, bespoke pages) ────────────
  {
    slug: 'tnea-barch',
    title: 'TNEA B.Arch Counselling',
    shortName: 'TNEA',
    authority: 'DoTE Tamil Nadu',
    tier: 1,
    region: 'south',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'deep',
    status: 'tbd',
    blurb: 'Tamil Nadu B.Arch admission via barch.tneaonline.org. HSC marks scaled to 200 plus NATA or JEE Paper 2 (200) gives a merit out of 400.',
    external: true,
  },
  {
    slug: 'keam-arch',
    title: 'KEAM B.Arch Counselling',
    shortName: 'KEAM',
    authority: 'CEE Kerala',
    tier: 1,
    region: 'south',
    examRoutes: ['NATA'],
    depth: 'deep',
    status: 'live',
    blurb: 'Kerala centralised allotment for B.Arch via NATA only (KEAM exam itself excludes B.Arch). Merit uses NATA score plus 12th marks.',
    external: true,
  },

  // ─── Tier 1: National + flagship state hubs ───────────────────────────────
  {
    slug: 'josaa',
    title: 'JoSAA B.Arch Counselling',
    shortName: 'JoSAA',
    authority: 'Joint Seat Allocation Authority (MoE)',
    tier: 1,
    region: 'national',
    examRoutes: ['JEE_P2', 'JEE_ADV_AAT'],
    depth: 'standard',
    status: 'tbd',
    blurb: 'National counselling for ~600 B.Arch seats across 3 IITs, 10 NITs plus IIEST Shibpur, and 3 SPAs. JEE Main Paper 2 for NITs/SPAs, JEE Advanced plus AAT for IITs.',
  },
  {
    slug: 'csab-special',
    title: 'CSAB Special Round B.Arch',
    shortName: 'CSAB Special',
    authority: 'Central Seat Allocation Board',
    tier: 1,
    region: 'national',
    examRoutes: ['JEE_P2'],
    depth: 'standard',
    status: 'tbd',
    blurb: 'Fills NIT, IIEST, IIIT, SPA and GFTI vacancies after JoSAA Round 6. Three rounds. Does not include IITs.',
  },
  {
    slug: 'csab-neut',
    title: 'CSAB-NEUT B.Arch (NE & UTs)',
    shortName: 'CSAB-NEUT',
    authority: 'Central Seat Allocation Board',
    tier: 2,
    region: 'national',
    examRoutes: ['JEE_P2'],
    depth: 'stub',
    status: 'tbd',
    blurb: 'Cross-state seats for candidates from 8 Northeast states and 5 Union Territories (lacking AICTE programs in their home state).',
  },
  {
    slug: 'cept-university',
    title: 'CEPT University B.Arch Admission',
    shortName: 'CEPT',
    authority: 'CEPT University Ahmedabad',
    tier: 1,
    region: 'west',
    examRoutes: ['NATA'],
    depth: 'standard',
    status: 'live',
    blurb: 'Premium private deemed university. NATA mandatory (JEE Paper 2 not accepted). 25% Gujarat ACPC, 75% CEPT All India. Merit: 50% NATA plus 50% Class 12.',
  },
  {
    slug: 'mht-cet-barch',
    title: 'MHT-CET CAP B.Arch (Maharashtra)',
    shortName: 'MHT-CET',
    authority: 'CET Cell, DTE Maharashtra',
    tier: 1,
    region: 'west',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'standard',
    status: 'tbd',
    blurb: 'Maharashtra CAP with separate inter-se merit lists for NATA and JEE Paper 2 candidates. Type A to E candidate categorisation by domicile.',
  },
  {
    slug: 'kea-barch',
    title: 'KEA Architecture Counselling (Karnataka)',
    shortName: 'KEA',
    authority: 'Karnataka Examinations Authority',
    tier: 1,
    region: 'south',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'standard',
    status: 'tbd',
    blurb: 'Karnataka KEA does not conduct any CET for B.Arch. Admission via NATA or JEE Paper 2 only, with best-of-both used when both are submitted.',
  },
  {
    slug: 'acpc-barch',
    title: 'ACPC B.Arch Counselling (Gujarat)',
    shortName: 'ACPC',
    authority: 'Admission Committee for Professional Courses',
    tier: 1,
    region: 'west',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'standard',
    status: 'tbd',
    blurb: 'Gujarat 75% home-state plus 25% all-India quota. Reservation: SC 7%, ST 15%, SEBC 27%, EWS 10%.',
  },
  {
    slug: 'ap-barch',
    title: 'AP B.Arch Counselling (Andhra Pradesh)',
    shortName: 'AP B.Arch',
    authority: 'APSCHE',
    tier: 1,
    region: 'south',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'standard',
    status: 'tbd',
    blurb: 'Andhra Pradesh follows Article 371D: 85% Local plus 15% Unreserved. Two local areas (AU coastal, SVU Rayalaseema). NATA or JEE Paper 2.',
  },
  {
    slug: 'tg-barch',
    title: 'TG B.Arch Counselling (Telangana)',
    shortName: 'TG B.Arch',
    authority: 'TGCHE (formerly TSCHE)',
    tier: 1,
    region: 'south',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'standard',
    status: 'tbd',
    blurb: 'Telangana via barchadm.tgche.ac.in. Single OU local area. ST raised to 10% (from 6%) since October 2022.',
  },
  {
    slug: 'uptac-barch',
    title: 'UPTAC B.Arch (Uttar Pradesh, AKTU)',
    shortName: 'UPTAC',
    authority: 'AKTU',
    tier: 1,
    region: 'north',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'standard',
    status: 'tbd',
    blurb: 'UP centralised counselling at uptac.admissions.nic.in. NATA priority, JEE Paper 2 secondary. UPCET (NTA) does not cover B.Arch.',
  },
  {
    slug: 'jac-delhi-barch',
    title: 'JAC Delhi B.Arch (IGDTUW)',
    shortName: 'JAC Delhi',
    authority: 'DTU, NSUT, IIITD, IGDTUW',
    tier: 1,
    region: 'north',
    examRoutes: ['JEE_P2'],
    depth: 'standard',
    status: 'tbd',
    blurb: 'Delhi JAC B.Arch is essentially IGDTUW only (women-only). NSUT B.Arch via JAC discontinued. SPA Delhi is via JoSAA, not JAC.',
  },
  {
    slug: 'jac-chandigarh-barch',
    title: 'JAC Chandigarh B.Arch (CCA)',
    shortName: 'JAC Chandigarh',
    authority: 'Chandigarh Administration + Panjab University',
    tier: 1,
    region: 'north',
    examRoutes: ['JEE_P2'],
    depth: 'standard',
    status: 'tbd',
    blurb: 'Sole institute is Chandigarh College of Architecture (CCA), Sector 12. 40 seats. ₹30,000 per year tuition. NIRF Architecture rank 30.',
  },

  // ─── Tier 2: Other states with reasonable B.Arch pools ────────────────────
  {
    slug: 'wbjee-barch',
    title: 'WBJEE B.Arch Counselling (West Bengal)',
    shortName: 'WBJEE',
    authority: 'West Bengal JEE Board',
    tier: 2,
    region: 'east',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'stub',
    status: 'live',
    blurb: 'WBJEE has no separate Architecture paper. B.Arch via JEE Paper 2 or NATA through WBJEEB-coordinated counselling. Jadavpur University is the flagship.',
  },
  {
    slug: 'ojee-barch',
    title: 'OJEE B.Arch Counselling (Odisha)',
    shortName: 'OJEE',
    authority: 'Odisha JEE Committee',
    tier: 2,
    region: 'east',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'stub',
    status: 'live',
    blurb: 'OJEE itself does not test B.Arch. CET Bhubaneswar (OUTR) is the top government option at ~₹2.84L total fees.',
  },
  {
    slug: 'reap-barch',
    title: 'REAP B.Arch Counselling (Rajasthan)',
    shortName: 'REAP',
    authority: 'RTU Kota / DTE Rajasthan',
    tier: 2,
    region: 'north',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'stub',
    status: 'tbd',
    blurb: 'Rajasthan B.Arch via NATA or JEE Paper 2. MNIT Jaipur is JoSAA, not REAP. Application fee ₹590.',
  },
  {
    slug: 'dte-mp-barch',
    title: 'DTE-MP B.Arch (Madhya Pradesh)',
    shortName: 'DTE-MP',
    authority: 'DTE MP / MP Online',
    tier: 2,
    region: 'central',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'stub',
    status: 'tbd',
    blurb: 'Madhya Pradesh 90% domicile quota. OBC reservation in active Supreme Court litigation, operating under interim 87:13 formula (14% effective).',
  },
  {
    slug: 'hstes-barch',
    title: 'HSTES B.Arch (Haryana)',
    shortName: 'HSTES',
    authority: 'Haryana State Tech Edu Society',
    tier: 2,
    region: 'north',
    examRoutes: ['NATA'],
    depth: 'stub',
    status: 'tbd',
    blurb: 'NATA mandatory for Haryana B.Arch (50:50 NATA plus 12th merit). Parivar Pehchan Patra (PPP ID) required for Haryana candidates. NIT Kurukshetra B.Arch is JoSAA.',
  },
  {
    slug: 'ikgptu-barch',
    title: 'IKGPTU B.Arch (Punjab)',
    shortName: 'IKGPTU',
    authority: 'I.K. Gujral Punjab Technical University',
    tier: 2,
    region: 'north',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'stub',
    status: 'tbd',
    blurb: 'Punjab counselling fee ₹2,000. 85% Punjab plus 15% other state. PEC, CCA, GNDU, LPU, Chandigarh University admit outside IKGPTU.',
  },

  // ─── Tier 3: Thin B.Arch pools, JoSAA is the better route for most aspirants ──
  {
    slug: 'bceceb-ugeac',
    title: 'BCECEB UGEAC B.Arch (Bihar)',
    shortName: 'BCECEB',
    authority: 'Bihar Combined Entrance Exam Board',
    tier: 3,
    region: 'east',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'stub',
    status: 'tbd',
    blurb: 'Only Gaya College of Engineering offers B.Arch through Bihar state counselling. NIT Patna is JoSAA. Counselling is offline (distinct from B.Tech UGEAC online).',
  },
  {
    slug: 'jceceb-barch',
    title: 'JCECEB / BIT Mesra B.Arch (Jharkhand)',
    shortName: 'JCECEB',
    authority: 'Jharkhand Combined Entrance',
    tier: 3,
    region: 'east',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'stub',
    status: 'tbd',
    blurb: 'No dedicated B.Arch counselling. BIT Mesra (autonomous, ~40 seats) admits directly via JEE Paper 2. NIT Jamshedpur and BIT Sindri do not offer B.Arch.',
  },
  {
    slug: 'dte-cg-barch',
    title: 'DTE Chhattisgarh B.Arch',
    shortName: 'DTE-CG',
    authority: 'DTE CG / CG Vyapam',
    tier: 3,
    region: 'central',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'stub',
    status: 'tbd',
    blurb: 'CG-PET has no B.Arch component. Most state pool is private (Amity Raipur and small colleges). NIT Raipur B.Arch is JoSAA. IIT Bhilai does not offer B.Arch.',
  },
  {
    slug: 'dte-assam-barch',
    title: 'DTE Assam B.Arch',
    shortName: 'DTE Assam',
    authority: 'DTE Assam / ASTU',
    tier: 3,
    region: 'east',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'stub',
    status: 'live',
    blurb: 'Assam CEE confirmed for June 14, 2026. Outside Assam, most Northeast states have zero or one B.Arch institute. NIT Silchar is JoSAA only.',
  },
  {
    slug: 'jkbopee-barch',
    title: 'JKBOPEE B.Arch (J&K)',
    shortName: 'JKBOPEE',
    authority: 'JK Board of Professional Entrance',
    tier: 3,
    region: 'north',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'stub',
    status: 'live',
    blurb: 'JKCET 2026 confirmed for April 19. Only SMVDU Katra is centrally-funded B.Arch in J&K. NIT Srinagar and IIT Jammu do not offer B.Arch.',
  },
  {
    slug: 'hptu-barch',
    title: 'HPTU B.Arch (Himachal Pradesh)',
    shortName: 'HPTU',
    authority: 'HP Technical University',
    tier: 3,
    region: 'north',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'stub',
    status: 'live',
    blurb: 'HPCET 2026 on May 9-10. ~4 B.Arch colleges in the state. NIT Hamirpur and IIT Mandi do not offer B.Arch.',
  },
  {
    slug: 'vmsb-utu-barch',
    title: 'VMSB-UTU B.Arch (Uttarakhand)',
    shortName: 'VMSB-UTU',
    authority: 'Uttarakhand Technical University',
    tier: 3,
    region: 'north',
    examRoutes: ['NATA', 'JEE_P2'],
    depth: 'stub',
    status: 'tbd',
    blurb: 'UKSEE was discontinued in 2023. Admissions now via NATA or JEE Paper 2 plus counselling. IIT Roorkee B.Arch is JoSAA, not UTU.',
  },
  {
    slug: 'dte-goa-barch',
    title: 'DTE Goa B.Arch (GCA Panaji)',
    shortName: 'DTE Goa',
    authority: 'DTE Goa',
    tier: 3,
    region: 'west',
    examRoutes: ['NATA'],
    depth: 'stub',
    status: 'tbd',
    blurb: 'Single CoA-recognised college: Goa College of Architecture (GCA), Panaji. 40 seats plus 4 supernumerary. Total course fee ₹3.04 lakh.',
  },
];

export const HUB_REGISTRY: HubSummary[] = RAW_HUBS.map((h) => ({
  ...h,
  available: ROUTED_SLUGS.has(h.slug),
}));

export const TOTAL_HUBS = HUB_REGISTRY.length;

/** Slugs whose routes exist (used by sitemap.ts and master page card-link rendering). */
export const ROUTED_HUB_SLUGS = Array.from(ROUTED_SLUGS);

// ─── Query helpers ───────────────────────────────────────────────────────────

export function getBySlug(slug: string): HubSummary | undefined {
  return HUB_REGISTRY.find((h) => h.slug === slug);
}

export function getByExamRoute(route: ExamRoute): HubSummary[] {
  return HUB_REGISTRY.filter((h) => h.examRoutes.includes(route));
}

export function getByRegion(region: Region): HubSummary[] {
  return HUB_REGISTRY.filter((h) => h.region === region);
}

export function getByTier(tier: Tier): HubSummary[] {
  return HUB_REGISTRY.filter((h) => h.tier === tier);
}

export function getJEEOnlyHubs(): HubSummary[] {
  return HUB_REGISTRY.filter(
    (h) => h.examRoutes.length === 1 && (h.examRoutes[0] === 'JEE_P2' || h.examRoutes[0] === 'JEE_ADV_AAT'),
  );
}

export function getNataOnlyHubs(): HubSummary[] {
  return HUB_REGISTRY.filter((h) => h.examRoutes.length === 1 && h.examRoutes[0] === 'NATA');
}

export function getBothAcceptedHubs(): HubSummary[] {
  return HUB_REGISTRY.filter((h) => h.examRoutes.includes('NATA') && h.examRoutes.includes('JEE_P2'));
}
