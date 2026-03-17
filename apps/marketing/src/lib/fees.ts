/**
 * Centralized fee constants for all Neram Classes courses.
 * Update fees HERE only — all pages import from this file.
 */

export interface CourseFee {
  name: string;
  slug: string;
  duration: string;
  durationMonths: number;
  /** Price when paid in installments (or single price if no installment option) */
  price: number;
  priceDisplay: string;
  /** Discounted price when paid in a single installment (null if no discount) */
  singlePaymentPrice: number | null;
  singlePaymentDisplay: string | null;
  mode: string;
  highlights: string[];
}

export const COURSE_FEES: CourseFee[] = [
  {
    name: 'Crash Course',
    slug: 'crash-course',
    duration: '3 Months',
    durationMonths: 3,
    price: 15000,
    priceDisplay: '15,000',
    singlePaymentPrice: null,
    singlePaymentDisplay: null,
    mode: 'Online / Offline',
    highlights: [
      'Intensive NATA revision',
      '50+ mock tests',
      'Daily drawing practice',
      'Doubt clearing sessions',
    ],
  },
  {
    name: '1-Year Program',
    slug: '1-year-program',
    duration: '12 Months',
    durationMonths: 12,
    price: 30000,
    priceDisplay: '30,000',
    singlePaymentPrice: 25000,
    singlePaymentDisplay: '25,000',
    mode: 'Online / Offline',
    highlights: [
      'Complete NATA syllabus coverage',
      'Daily drawing practice',
      '100+ mock tests',
      'Personal mentor assigned',
      'Recorded lectures for revision',
      'WhatsApp doubt support',
    ],
  },
  {
    name: '2-Year Program',
    slug: '2-year-program',
    duration: '24 Months',
    durationMonths: 24,
    price: 35000,
    priceDisplay: '35,000',
    singlePaymentPrice: 30000,
    singlePaymentDisplay: '30,000',
    mode: 'Online / Offline',
    highlights: [
      'Foundation + Advanced preparation',
      'Complete NATA & JEE Paper 2 coverage',
      'Daily drawing practice',
      '200+ mock tests',
      '1-on-1 personal mentoring',
      'All study materials included',
    ],
  },
];

/** Lowest fee across all courses */
export const FEE_MIN = Math.min(...COURSE_FEES.map((c) => c.singlePaymentPrice ?? c.price));

/** Highest fee (installment price) across all courses */
export const FEE_MAX = Math.max(...COURSE_FEES.map((c) => c.price));

/** Human-readable fee range string for FAQs */
export const FEE_RANGE_TEXT = `₹${COURSE_FEES[0].priceDisplay} for a ${COURSE_FEES[0].duration.toLowerCase()} crash course to ₹${COURSE_FEES[COURSE_FEES.length - 1].priceDisplay} for a ${COURSE_FEES[COURSE_FEES.length - 1].duration.toLowerCase()} program`;

/** Schema.org Course offers for structured data */
export function getCourseSchemaOffers() {
  return COURSE_FEES.map((course) => ({
    '@type': 'Course' as const,
    name: `NATA ${course.name} (${course.duration})`,
    description: course.highlights.slice(0, 2).join(', '),
    provider: { '@type': 'EducationalOrganization' as const, name: 'Neram Classes' },
    educationalLevel: '12th Pass',
    timeRequired: `P${course.durationMonths}M`,
    teaches: ['Mathematics', 'General Aptitude', 'Drawing', 'Architecture Awareness'],
    hasCourseInstance: { '@type': 'CourseInstance' as const, courseMode: ['online', 'onsite'] },
    offers: {
      '@type': 'Offer' as const,
      price: String(course.singlePaymentPrice ?? course.price),
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
    },
  }));
}
