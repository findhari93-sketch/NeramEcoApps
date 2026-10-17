// College Hub: SEO metadata generators
// Uses existing buildAlternates() and buildOgImage() from @/lib/seo/metadata

import type { Metadata } from 'next';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import type { College, CollegeListItem } from './types';
import { COUNSELING_LABELS, COLLEGE_TYPE_SLUGS, ACCREDITATION_FILTERS, admissionYear } from './constants';
import { annualFee, canonicalCollegePath, displayName, examLabels, feeText, joinAnd, joinOr, systemLabels } from './detail-content';

const BASE_URL = 'https://neramclasses.com';

// ─── All-India listing page ──────────────────────────────────────────────────

export function generateCollegesListingMetadata(locale: string): Metadata {
  const title = 'B.Arch Colleges in India 2026: Compare Fees, Rankings, Cutoffs | Neram College Hub';
  const description =
    "India's first architecture college discovery platform. Compare fees, NATA cutoffs, NIRF rankings, ArchIndex scores, placements, and infrastructure for B.Arch colleges. Free and open.";

  return {
    title,
    description,
    keywords:
      'B.Arch colleges India, architecture colleges India, NATA colleges, best architecture colleges, B.Arch admissions 2026, college comparison, TNEA colleges, JoSAA architecture',
    alternates: buildAlternates(locale, '/colleges'),
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BASE_URL}/colleges`,
      images: [buildOgImage(title, 'Compare B.Arch Colleges', 'tool')],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// ─── State listing page ──────────────────────────────────────────────────────

/** SEO Health flags a rendered title over 65 characters, suffix included. */
export const STATE_TITLE_MAX = 65 - ' | Neram Classes'.length;

/** Leads with the phrase people search ("best architecture colleges in X"), shortest fallback last. */
export function buildStateListingTitle(stateName: string, year: number = admissionYear()): string {
  const ladder = [
    `Best Architecture Colleges in ${stateName} ${year}`,
    `B.Arch Colleges in ${stateName} ${year}`,
    `B.Arch Colleges in ${stateName}`,
  ];
  return ladder.find((t) => t.length <= STATE_TITLE_MAX) ?? ladder[ladder.length - 1];
}

export function generateStateListingMetadata(
  locale: string,
  stateSlug: string,
  stateName: string,
  collegeCount: number
): Metadata {
  const year = admissionYear();
  const title = buildStateListingTitle(stateName, year);
  const description = `${collegeCount} architecture (B.Arch) colleges in ${stateName} for ${year} admission. Compare fees, cutoffs, NAAC grades and placements side by side, then shortlist yours.`;

  return {
    title,
    description,
    keywords: `best architecture colleges in ${stateName}, B.Arch colleges in ${stateName}, architecture colleges ${stateName}, NATA coaching ${stateName}, B.Arch admissions ${stateName}`,
    alternates: buildAlternates(locale, `/colleges/${stateSlug}`),
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BASE_URL}/colleges/${stateSlug}`,
      images: [buildOgImage(title, `${collegeCount} colleges`, 'tool')],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// ─── College detail page ─────────────────────────────────────────────────────

/** Characters the layout template adds after every title: "%s | Neram Classes". */
export const TITLE_SUFFIX = ' | Neram Classes';
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

const OG_LOCALES: Record<string, string> = { ta: 'ta_IN', hi: 'hi_IN', kn: 'kn_IN', ml: 'ml_IN' };
const ogLocale = (locale: string) => OG_LOCALES[locale] ?? 'en_IN';

/** Cut to `max` characters at a word boundary, dropping trailing punctuation. */
export function truncateAtWord(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : t.slice(0, max)).replace(/[\s,;:(]+$/, '');
  return base;
}

type TitleInput = Pick<College, 'name' | 'short_name' | 'meta_title'>;

/**
 * Longest variant that fits in 60 characters before the layout suffix:
 *   "{n} B.Arch {Y}: Fees, Cutoff, Placements"
 *   "{n} B.Arch Fees, Cutoff {Y}"
 *   "{n} B.Arch {Y}"
 * n is the short name when there is one. A staff meta_title always wins.
 */
export function buildCollegeTitle(c: TitleInput, year: number = admissionYear()): string {
  if (c.meta_title?.trim()) return c.meta_title.trim();
  const n = displayName(c);
  const ladder = [
    `${n} B.Arch ${year}: Fees, Cutoff, Placements`,
    `${n} B.Arch Fees, Cutoff ${year}`,
    `${n} B.Arch ${year}`,
  ];
  const fit = ladder.find((t) => t.length <= TITLE_MAX);
  if (fit) return fit;
  const tail = ` B.Arch ${year}`;
  return `${truncateAtWord(n, TITLE_MAX - tail.length)}${tail}`;
}

type DescriptionInput = Pick<
  College,
  | 'name'
  | 'short_name'
  | 'city'
  | 'state'
  | 'naac_grade'
  | 'annual_fee_approx'
  | 'annual_fee_min'
  | 'total_barch_seats'
  | 'accepted_exams'
  | 'counseling_systems'
  | 'coa_approved'
  | 'type'
  | 'meta_description'
>;

/**
 * Answer-first, built from facts, at most 155 characters. Names the college's
 * own counselling systems (first two), never a default exam. Whole sentences
 * are added while they fit; only a too-long first sentence is cut.
 */
export function buildCollegeDescription(c: DescriptionInput): string {
  if (c.meta_description?.trim()) return c.meta_description.trim();
  const name = c.name.length > 60 ? displayName(c) : c.name;
  const place = [c.city, c.state].filter(Boolean).join(', ');
  const fee = annualFee(c);
  const facts: string[] = [];
  if (c.total_barch_seats) facts.push(`${c.total_barch_seats} seats`);
  if (fee) facts.push(`${fee.from ? 'from ' : ''}${feeText(fee.amount)} a year`);
  if (c.naac_grade) facts.push(`NAAC ${c.naac_grade}`);

  const first = `${name}${place ? `, ${place}` : ''}: B.Arch${facts.length ? ` with ${joinAnd(facts)}` : ''}.`;
  const systems = systemLabels(c.counseling_systems).slice(0, 2);
  const exams = examLabels(c.accepted_exams).slice(0, 2);
  const sentences = [first];
  if (systems.length) sentences.push(`Admission through ${joinAnd(systems)} counselling.`);
  else if (exams.length) sentences.push(`Admission on ${joinOr(exams)} scores.`);
  if (c.coa_approved) sentences.push('COA approved.');
  sentences.push(systems.length ? 'See cutoffs, fees and FAQs.' : 'See fees, admission and FAQs.');

  let out = '';
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > DESCRIPTION_MAX) {
      if (!out) out = truncateAtWord(s, DESCRIPTION_MAX);
      break;
    }
    out = next;
  }
  return out;
}

export type DetailMetadataInput = TitleInput &
  DescriptionInput &
  Pick<College, 'slug' | 'state_slug' | 'hero_image_url'>;

export function generateCollegeDetailMetadata(locale: string, college: DetailMetadataInput): Metadata {
  const title = buildCollegeTitle(college);
  const description = buildCollegeDescription(college);
  const n = displayName(college);

  const canonicalPath = canonicalCollegePath(college);
  const image = college.hero_image_url
    ? { url: college.hero_image_url, alt: `${college.name} campus` }
    : {
        url: buildOgImage(`${n} B.Arch`, [college.city, college.state].filter(Boolean).join(', '), 'tool'),
        width: 1200,
        height: 630,
        alt: `${college.name}: B.Arch fees, cutoff and admission`,
      };
  // The layout's suffix is not applied to og:title, so add it here.
  const socialTitle = `${title}${TITLE_SUFFIX}`;

  return {
    title,
    description,
    keywords: `${n}, ${n} B.Arch, ${n} fees, ${n} cutoff, ${college.city} architecture college`,
    alternates: buildAlternates(locale, canonicalPath),
    // Next replaces (not merges) openGraph and twitter objects, so the layout's
    // siteName, locale, site and creator are repeated here.
    openGraph: {
      title: socialTitle,
      description,
      type: 'website',
      url: `${BASE_URL}${canonicalPath}`,
      siteName: 'Neram Classes',
      locale: ogLocale(locale),
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@neramclasses',
      creator: '@neramclasses',
      title: socialTitle,
      description,
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}

/** Metadata for a slug with no active college. */
export function collegeNotFoundMetadata(): Metadata {
  return { title: 'College not found', robots: { index: false, follow: true } };
}

// ─── TNEA hub page ───────────────────────────────────────────────────────────

export function generateTNEAMetadata(locale: string, collegeCount: number): Metadata {
  const title = `TNEA B.Arch Colleges 2026: Cutoffs, Fees, Rankings`;
  const description = `${collegeCount} B.Arch colleges accepting TNEA counseling. Compare TNEA cutoff ranks, fees, and placements. Updated for TNEA 2026.`;

  return {
    title,
    description,
    keywords: 'TNEA architecture colleges, TNEA B.Arch cutoff 2026, TNEA counseling architecture, Tamil Nadu B.Arch colleges',
    alternates: buildAlternates(locale, '/colleges/tnea'),
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BASE_URL}/colleges/tnea`,
      images: [buildOgImage(title, `${collegeCount} colleges`, 'tool')],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// ─── JoSAA hub page ─────────────────────────────────────────────────────────

export function generateJoSAAMetadata(locale: string, collegeCount: number): Metadata {
  const title = `JoSAA B.Arch Colleges 2026: NITs, IITs, Cutoffs, Fees`;
  const description = `${collegeCount} NIT and IIT B.Arch programs accepting JoSAA counseling. Compare JoSAA cutoff ranks, opening/closing ranks, and fees. Updated for JoSAA 2026.`;

  return {
    title,
    description,
    keywords: 'JoSAA architecture colleges, NIT B.Arch, IIT B.Arch, JoSAA cutoff 2026, JEE Paper 2 architecture',
    alternates: buildAlternates(locale, '/colleges/josaa'),
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BASE_URL}/colleges/josaa`,
      images: [buildOgImage(title, `${collegeCount} NITs and IITs`, 'tool')],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// ─── Counseling system page ─────────────────────────────────────────────────

export function generateCounselingMetadata(locale: string, systemKey: string, collegeCount: number): Metadata {
  const label = COUNSELING_LABELS[systemKey] ?? systemKey;
  const title = `B.Arch Colleges under ${label} Counseling 2026 | Neram College Hub`;
  const description = `${collegeCount} architecture colleges accepting ${label} counseling. Compare fees, cutoffs, rankings, and placements. Updated for 2026 admissions.`;
  const path = `/colleges/counseling/${systemKey.toLowerCase().replace(/_/g, '-')}`;
  return {
    title,
    description,
    keywords: `${label} architecture colleges, ${systemKey} B.Arch colleges, ${label} counseling architecture`,
    alternates: buildAlternates(locale, path),
    openGraph: {
      title,
      description,
      type: 'website',
      images: [buildOgImage(title, `${collegeCount} colleges`, 'tool')],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// ─── City listing page ──────────────────────────────────────────────────────

export function generateCityMetadata(locale: string, cityName: string, collegeCount: number): Metadata {
  const title = `Architecture Colleges in ${cityName} 2026: Fees, Rankings | Neram`;
  const description = `${collegeCount} B.Arch colleges in ${cityName}. Compare fees, NATA cutoffs, placements, and rankings. Find the best architecture college in ${cityName}.`;
  const citySlug = cityName.toLowerCase().replace(/\s+/g, '-');
  const path = `/colleges/city/${citySlug}`;
  return {
    title,
    description,
    alternates: buildAlternates(locale, path),
    openGraph: {
      title,
      description,
      type: 'website',
      images: [buildOgImage(title, `${collegeCount} colleges`, 'tool')],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// ─── College type page ──────────────────────────────────────────────────────

export function generateTypeMetadata(locale: string, typeSlug: string, collegeCount: number): Metadata {
  const typeName = COLLEGE_TYPE_SLUGS[typeSlug] ?? typeSlug;
  const title = `${typeName} Architecture Colleges in India 2026 | Neram College Hub`;
  const description = `${collegeCount} ${typeName.toLowerCase()} B.Arch colleges in India. Compare fees, rankings, cutoffs, and placements across ${typeName.toLowerCase()} architecture colleges.`;
  const path = `/colleges/type/${typeSlug}`;
  return {
    title,
    description,
    alternates: buildAlternates(locale, path),
    openGraph: {
      title,
      description,
      type: 'website',
      images: [buildOgImage(title, `${collegeCount} colleges`, 'tool')],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// ─── Accreditation filter page ──────────────────────────────────────────────

export function generateAccreditationMetadata(locale: string, filterKey: string, collegeCount: number): Metadata {
  const filter = ACCREDITATION_FILTERS[filterKey];
  const label = filter?.label ?? filterKey;
  const title = `${label} Architecture Colleges in India 2026 | Neram`;
  const description = `${collegeCount} ${label.toLowerCase()} B.Arch colleges. ${filter?.description ?? ''} Compare fees, rankings, and placements.`;
  const path = `/colleges/accreditation/${filterKey}`;
  return {
    title,
    description,
    alternates: buildAlternates(locale, path),
    openGraph: {
      title,
      description,
      type: 'website',
      images: [buildOgImage(title, `${collegeCount} colleges`, 'tool')],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}
