// College Hub — SEO metadata generators
// Uses existing buildAlternates() and buildOgImage() from @/lib/seo/metadata

import type { Metadata } from 'next';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import type { College, CollegeListItem } from './types';
import { COUNSELING_LABELS, COLLEGE_TYPE_SLUGS, ACCREDITATION_FILTERS } from './constants';

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

export function generateStateListingMetadata(
  locale: string,
  stateSlug: string,
  stateName: string,
  collegeCount: number
): Metadata {
  const title = `Best B.Arch Colleges in ${stateName} 2026 — Fees, Cutoffs, NATA`;
  const description = `${collegeCount} B.Arch colleges in ${stateName}. Compare fees, TNEA/JoSAA cutoffs, NAAC grades, placements and infrastructure. Shortlist the right college.`;

  return {
    title,
    description,
    keywords: `B.Arch colleges ${stateName}, architecture colleges ${stateName}, NATA coaching ${stateName}, B.Arch admissions ${stateName}`,
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

export function generateCollegeDetailMetadata(
  locale: string,
  college: Pick<College, 'name' | 'slug' | 'state_slug' | 'city' | 'state' | 'type' | 'naac_grade' | 'annual_fee_approx' | 'annual_fee_min' | 'about' | 'logo_url' | 'hero_image_url' | 'total_barch_seats' | 'accepted_exams'>
): Metadata {
  const feeStr = college.annual_fee_approx
    ? `~₹${(college.annual_fee_approx / 100000).toFixed(1)}L/yr`
    : 'fee details available';
  const naacStr = college.naac_grade ? `, NAAC ${college.naac_grade}` : '';
  const seatsStr = college.total_barch_seats ? `, ${college.total_barch_seats} B.Arch seats` : '';

  const title = `${college.name} — B.Arch Admission, Fees, Cutoffs 2026`;
  const description =
    college.about ??
    `${college.name} in ${college.city}, ${college.state}${naacStr}. ${feeStr}${seatsStr}. Check NATA cutoffs, fee structure, placements, faculty, and infrastructure.`;

  const canonicalPath = `/colleges/${college.state_slug ?? 'india'}/${college.slug}`;
  const ogImage = college.hero_image_url ?? buildOgImage(college.name, `${college.city}, ${college.state}`, 'tool');

  return {
    title,
    description,
    keywords: `${college.name}, ${college.name} B.Arch, ${college.name} fees, ${college.name} cutoff, ${college.city} architecture college`,
    alternates: buildAlternates(locale, canonicalPath),
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BASE_URL}${canonicalPath}`,
      images: [ogImage],
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// ─── TNEA hub page ───────────────────────────────────────────────────────────

export function generateTNEAMetadata(locale: string, collegeCount: number): Metadata {
  const title = `TNEA B.Arch Colleges 2026 — Cutoffs, Fees, Rankings`;
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
  const title = `JoSAA B.Arch Colleges 2026 — NITs, IITs, Cutoffs, Fees`;
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
  const title = `Architecture Colleges in ${cityName} 2026 — Fees, Rankings | Neram`;
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
