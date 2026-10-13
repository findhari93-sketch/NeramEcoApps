// College Hub: JSON-LD schema markup and the template FAQ builder.
//
// The detail page emits ONE script tag holding an @graph: WebPage,
// CollegeOrUniversity, EducationalOccupationalProgram, FAQPage and
// BreadcrumbList. The FAQPage is built from exactly the array the page renders,
// and the BreadcrumbList from exactly the visible breadcrumb.

import {
  SITE_URL,
  annualFee,
  canonicalCollegePath,
  displayName,
  examLabels,
  feeText,
  joinAnd,
  joinOr,
  systemLabels,
  type CrumbItem,
} from './detail-content';
import type { College, CollegeFaqItem, CollegeFaqRow, CollegeReview } from './types';

const BASE_URL = SITE_URL;

/** Never list our own pages as the college's sameAs. */
const isOwnUrl = (u: string) => /(^|\.|\/\/)neramclasses\.com/i.test(u);

function absoluteUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const t = u.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(t)) return `https://${t}`;
  return null;
}

/** instagram_handle may be "@name", "name" or a full URL. */
export function instagramUrl(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const t = handle.trim();
  if (!t) return null;
  if (/instagram\.com/i.test(t)) return absoluteUrl(t);
  const user = t.replace(/^@/, '').replace(/\/+$/, '');
  return /^[\w.]+$/.test(user) ? `https://www.instagram.com/${user}/` : null;
}

const validCoord = (v: number | null | undefined) =>
  typeof v === 'number' && Number.isFinite(v) && v !== 0 ? v : null;

const isoDate = (v: string | null | undefined) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

// ─── Template FAQs (fallback when college_faqs has no rows) ──────────────────

export type TemplateFaqInput = Pick<
  College,
  | 'name'
  | 'short_name'
  | 'city'
  | 'state'
  | 'address'
  | 'annual_fee_approx'
  | 'annual_fee_min'
  | 'total_barch_seats'
  | 'accepted_exams'
  | 'counseling_systems'
  | 'naac_grade'
  | 'coa_approved'
  | 'coa_validity_till'
  | 'established_year'
  | 'nirf_rank_architecture'
  | 'nirf_year'
  | 'has_management_quota'
  | 'has_nri_quota'
> & { hasFeeBreakdown?: boolean };

/** Facts-only questions. A question whose fact is missing is left out. */
export function buildTemplateCollegeFaqs(c: TemplateFaqInput): CollegeFaqItem[] {
  const n = displayName(c);
  const faqs: CollegeFaqItem[] = [];
  const systems = systemLabels(c.counseling_systems);
  const exams = examLabels(c.accepted_exams);

  const fee = annualFee(c);
  if (fee) {
    faqs.push({
      question: `What is the B.Arch fee at ${n}?`,
      answer:
        `${fee.from ? 'B.Arch tuition at' : 'The approximate B.Arch tuition fee at'} ${c.name} ${fee.from ? 'starts at about' : 'is'} ${feeText(fee.amount)} a year` +
        `${fee.from ? '' : `, about ${feeText(fee.amount * 5)} for the five-year course`}. ` +
        'Fees can differ by quota and category, so confirm the current figure with the college before you pay.' +
        (c.hasFeeBreakdown ? ' The fee section on this page has the year-wise breakdown.' : ''),
    });
  }

  if (c.total_barch_seats) {
    faqs.push({
      question: `How many B.Arch seats does ${n} have?`,
      answer:
        `${c.name} has ${c.total_barch_seats} B.Arch seats${c.coa_approved ? ' approved by the Council of Architecture' : ''}.` +
        (systems.length ? ` Seats are filled through ${joinAnd(systems)} counselling.` : ''),
    });
  }

  if (exams.length) {
    faqs.push({
      question: `Which entrance exam do I need for B.Arch at ${n}?`,
      answer:
        `${c.name} admits B.Arch students on ${joinOr(exams)} scores.` +
        (systems.length ? ` Seat allotment is through ${joinAnd(systems)} counselling.` : '') +
        ' Cutoffs change every year with the number of applicants and seats.',
    });
  } else if (systems.length) {
    faqs.push({
      question: `How are B.Arch seats allotted at ${n}?`,
      answer: `Seats at ${c.name} are allotted through ${joinAnd(systems)} counselling.`,
    });
  }

  if (c.coa_approved) {
    const valid = isoDate(c.coa_validity_till);
    faqs.push({
      question: `Is ${n} approved by the Council of Architecture?`,
      answer:
        `Yes. The B.Arch programme at ${c.name} is approved by the Council of Architecture (COA), India, which you need to register as an architect after graduation.` +
        (valid ? ` The approval is listed as valid till ${valid}.` : '') +
        (c.naac_grade ? ` The college also holds NAAC ${c.naac_grade} accreditation.` : ''),
    });
  } else if (c.naac_grade) {
    faqs.push({
      question: `What is the NAAC grade of ${n}?`,
      answer: `${c.name} holds NAAC ${c.naac_grade} accreditation.`,
    });
  }

  if (c.nirf_rank_architecture) {
    faqs.push({
      question: `What is the NIRF ranking of ${n}?`,
      answer: `${c.name} is ranked ${c.nirf_rank_architecture} in the NIRF Architecture ranking${c.nirf_year ? ` ${c.nirf_year}` : ''}.`,
    });
  }

  if (c.has_management_quota) {
    faqs.push({
      question: `Does ${n} have a management quota for B.Arch?`,
      answer: `Yes. ${c.name} fills some B.Arch seats under the management quota${c.has_nri_quota ? ' and the NRI quota' : ''}. Ask the college for the current fee and eligibility for these seats.`,
    });
  }

  const place = [c.city, c.state].filter(Boolean).join(', ');
  faqs.push({
    question: `Where is ${n} located?`,
    answer:
      `${c.name} is in ${place}, India.` +
      (c.address ? ` The address is ${c.address.replace(/\s+/g, ' ').trim().replace(/\.$/, '')}.` : '') +
      (c.established_year ? ` The college was established in ${c.established_year}.` : ''),
  });

  return faqs;
}

/** Staff or cron rows win; otherwise the template list. Never empty. */
export function resolveCollegeFaqs(rows: Pick<CollegeFaqRow, 'question' | 'answer' | 'position'>[] | null | undefined, c: TemplateFaqInput): CollegeFaqItem[] {
  const usable = (rows ?? [])
    .filter((r) => r.question?.trim() && r.answer?.trim())
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ question: r.question.trim(), answer: r.answer.trim() }));
  return usable.length ? usable : buildTemplateCollegeFaqs(c);
}

// ─── Aggregate rating ────────────────────────────────────────────────────────

export const MIN_REVIEWS_FOR_RATING = 3;

export function aggregateRatingFor(reviews: Pick<CollegeReview, 'rating_overall' | 'status'>[]) {
  const rated = reviews.filter((r) => r.status !== 'rejected' && r.status !== 'pending' && r.status !== 'flagged' && typeof r.rating_overall === 'number' && r.rating_overall > 0);
  if (rated.length < MIN_REVIEWS_FOR_RATING) return null;
  const avg = rated.reduce((s, r) => s + (r.rating_overall as number), 0) / rated.length;
  return {
    '@type': 'AggregateRating',
    ratingValue: Number(avg.toFixed(1)),
    reviewCount: rated.length,
    bestRating: 5,
    worstRating: 1,
  };
}

// ─── The @graph ──────────────────────────────────────────────────────────────

export type GraphCollege = Pick<
  College,
  | 'name'
  | 'short_name'
  | 'slug'
  | 'city'
  | 'state'
  | 'state_slug'
  | 'address'
  | 'pincode'
  | 'website'
  | 'phone'
  | 'email'
  | 'admissions_phone'
  | 'admissions_email'
  | 'established_year'
  | 'logo_url'
  | 'hero_image_url'
  | 'about'
  | 'naac_grade'
  | 'naac_valid_till'
  | 'coa_approved'
  | 'coa_validity_till'
  | 'affiliated_university'
  | 'total_barch_seats'
  | 'annual_fee_approx'
  | 'annual_fee_min'
  | 'accepted_exams'
  | 'instagram_handle'
  | 'facebook_url'
  | 'linkedin_url'
  | 'youtube_channel_url'
  | 'aliases'
  | 'wikidata_id'
  | 'latitude'
  | 'longitude'
  | 'hero_image_credit'
>;

export interface CollegeGraphInput {
  college: GraphCollege;
  faqs: CollegeFaqItem[];
  breadcrumbs: CrumbItem[];
  reviews?: Pick<CollegeReview, 'rating_overall' | 'status'>[];
  pageTitle: string;
  description?: string;
  dateModified?: string | null;
}

export function buildCollegeDetailGraph(input: CollegeGraphInput): Record<string, unknown> {
  const { college: c, faqs, breadcrumbs, reviews = [], pageTitle, description, dateModified } = input;
  const url = `${BASE_URL}${canonicalCollegePath(c)}`;
  const collegeId = `${url}#college`;
  const website = absoluteUrl(c.website);
  const image = c.hero_image_url ?? c.logo_url ?? null;

  // ── WebPage
  const webPage: Record<string, unknown> = {
    '@type': 'WebPage',
    '@id': url,
    url,
    name: pageTitle,
    ...(description && { description }),
    inLanguage: 'en-IN',
    about: { '@id': collegeId },
    breadcrumb: { '@id': `${url}#breadcrumb` },
    publisher: { '@id': `${BASE_URL}/#organization` },
    ...(dateModified && { dateModified }),
    ...(c.hero_image_url && {
      primaryImageOfPage: {
        '@type': 'ImageObject',
        url: c.hero_image_url,
        ...(c.hero_image_credit && { creditText: c.hero_image_credit }),
      },
    }),
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['#college-summary', '#college-faqs'],
    },
  };

  // ── CollegeOrUniversity
  const alternateName = Array.from(
    new Set([c.short_name, ...(c.aliases ?? [])].map((a) => a?.trim()).filter((a): a is string => !!a && a !== c.name)),
  );
  const sameAs = Array.from(
    new Set(
      [
        website,
        c.wikidata_id ? `https://www.wikidata.org/wiki/${c.wikidata_id.trim()}` : null,
        instagramUrl(c.instagram_handle),
        absoluteUrl(c.facebook_url),
        absoluteUrl(c.linkedin_url),
        absoluteUrl(c.youtube_channel_url),
      ].filter((u): u is string => !!u && !isOwnUrl(u)),
    ),
  );
  const lat = validCoord(c.latitude);
  const lng = validCoord(c.longitude);
  const credentials: Record<string, unknown>[] = [];
  if (c.coa_approved) {
    const v = isoDate(c.coa_validity_till);
    credentials.push({
      '@type': 'EducationalOccupationalCredential',
      name: 'Council of Architecture approval for B.Arch',
      credentialCategory: 'approval',
      recognizedBy: { '@type': 'Organization', name: 'Council of Architecture, India', url: 'https://www.coa.gov.in' },
      ...(v && { validUntil: v }),
    });
  }
  if (c.naac_grade) {
    const v = isoDate(c.naac_valid_till);
    credentials.push({
      '@type': 'EducationalOccupationalCredential',
      name: `NAAC Grade ${c.naac_grade}`,
      credentialCategory: 'accreditation',
      recognizedBy: { '@type': 'Organization', name: 'National Assessment and Accreditation Council (NAAC)', url: 'https://www.naac.gov.in' },
      ...(v && { validUntil: v }),
    });
  }
  const rating = aggregateRatingFor(reviews);
  const telephone = c.admissions_phone ?? c.phone;
  const email = c.admissions_email ?? c.email;

  const org: Record<string, unknown> = {
    '@type': 'CollegeOrUniversity',
    '@id': collegeId,
    name: c.name,
    ...(alternateName.length && { alternateName }),
    ...(website && { url: website }),
    ...(sameAs.length && { sameAs }),
    ...(c.logo_url && { logo: c.logo_url }),
    ...(image && { image }),
    ...(c.about && { description: c.about }),
    address: {
      '@type': 'PostalAddress',
      ...(c.address && { streetAddress: c.address.replace(/\s+/g, ' ').trim() }),
      addressLocality: c.city,
      addressRegion: c.state,
      ...(c.pincode && { postalCode: c.pincode }),
      addressCountry: 'IN',
    },
    ...(lat !== null && lng !== null && { geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng } }),
    ...(telephone && { telephone }),
    ...(email && { email }),
    ...(c.established_year && { foundingDate: String(c.established_year) }),
    ...(c.affiliated_university && {
      parentOrganization: { '@type': 'CollegeOrUniversity', name: c.affiliated_university },
    }),
    ...(credentials.length && { hasCredential: credentials }),
    ...(rating && { aggregateRating: rating }),
  };

  // ── Programme
  const exams = examLabels(c.accepted_exams);
  const fee = annualFee(c);
  const program: Record<string, unknown> = {
    '@type': 'EducationalOccupationalProgram',
    '@id': `${url}#barch`,
    name: 'Bachelor of Architecture (B.Arch)',
    url,
    timeToComplete: 'P5Y',
    educationalCredentialAwarded: 'B.Arch',
    ...(c.total_barch_seats && { maximumEnrollment: c.total_barch_seats }),
    ...(exams.length && { programPrerequisites: `A valid ${joinOr(exams)} score` }),
    ...(fee &&
      !fee.from && {
        offers: {
          '@type': 'Offer',
          price: fee.amount,
          priceCurrency: 'INR',
          category: 'Tuition (per year)',
        },
      }),
    provider: { '@id': collegeId },
  };

  // ── FAQ
  const faqPage = {
    '@type': 'FAQPage',
    '@id': `${url}#faqs`,
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  // ── Breadcrumb
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: breadcrumbs.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.name,
      item: b.path === '/' ? BASE_URL : `${BASE_URL}${b.path}`,
    })),
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [webPage, org, program, ...(faqs.length ? [faqPage] : []), breadcrumb],
  };
}

// ─── Listing breadcrumbs (state, city, type pages) ───────────────────────────

export function generateListingBreadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${BASE_URL}${item.path}`,
    })),
  };
}
