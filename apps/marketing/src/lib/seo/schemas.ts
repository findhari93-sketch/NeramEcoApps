import {
  ORG_NAME,
  ORG_ALTERNATE_NAME,
  BASE_URL,
  APP_URL,
  ORG_LOGO,
  ORG_PHONE,
  ORG_EMAIL,
  ORG_FOUNDED,
  ORG_DESCRIPTION,
  ORG_ADDRESS,
  SOCIAL_PROFILES,
  APP_NAME,
  APP_DESCRIPTION,
  APP_FEATURES,
  ORG_SLOGAN,
  ORG_BEST_KNOWN_FOR,
} from './constants';
import { getCourseSchemaOffers } from '../fees';
import type { ClassroomCentre } from './facts';

// ─── Organization Schema ────────────────────────────────────────────────────

/**
 * A data-driven AggregateRating (from published reviews, see lib/review-stats.ts).
 * Never hardcode one: pass it only where the page has read it from the data.
 */
export interface AggregateRatingJsonLd {
  '@type': 'AggregateRating';
  ratingValue: string;
  ratingCount: string;
  reviewCount: string;
  bestRating: '5';
  worstRating: '1';
}

export function generateOrganizationSchema(aggregateRating?: AggregateRatingJsonLd | null) {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${BASE_URL}/#organization`,
    name: ORG_NAME,
    alternateName: [ORG_ALTERNATE_NAME, 'Neram NATA Classes', 'Neram Architecture Coaching'],
    url: BASE_URL,
    logo: ORG_LOGO,
    image: ORG_LOGO,
    description: ORG_DESCRIPTION,
    slogan: ORG_SLOGAN,
    foundingDate: ORG_FOUNDED,
    foundingLocation: {
      '@type': 'Place',
      name: 'Chennai, Tamil Nadu, India',
    },
    address: {
      '@type': 'PostalAddress',
      ...ORG_ADDRESS,
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        telephone: ORG_PHONE,
        email: ORG_EMAIL,
        contactType: 'customer service',
        availableLanguage: ['English', 'Tamil', 'Hindi', 'Kannada', 'Malayalam'],
        areaServed: 'IN',
      },
      {
        '@type': 'ContactPoint',
        telephone: ORG_PHONE,
        contactType: 'sales',
        availableLanguage: ['English', 'Tamil'],
        areaServed: ['IN', 'AE', 'QA', 'OM', 'SA', 'KW', 'BH'],
      },
    ],
    sameAs: SOCIAL_PROFILES,
    knowsAbout: [
      'NATA Exam Preparation',
      'JEE Paper 2 B.Arch Coaching',
      'Architecture Entrance Exams',
      'Drawing and Composition for NATA',
      'Mathematics for Architecture Entrance',
      'General Aptitude for NATA',
      'B.Arch Admission Counselling',
      'Architecture College Selection',
    ],
    // Online coaching serves the whole country and the Gulf. Cities are not listed
    // here: only the real centre pages (/contact/{slug}) claim a local presence.
    areaServed: [
      { '@type': 'Country', name: 'India' },
      { '@type': 'Country', name: 'United Arab Emirates' },
      { '@type': 'Country', name: 'Qatar' },
      { '@type': 'Country', name: 'Oman' },
      { '@type': 'Country', name: 'Saudi Arabia' },
      { '@type': 'Country', name: 'Kuwait' },
      { '@type': 'Country', name: 'Bahrain' },
    ],
    ...(aggregateRating ? { aggregateRating } : {}),
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        name: 'Best Known For',
        value: ORG_BEST_KNOWN_FOR,
      },
      {
        '@type': 'PropertyValue',
        name: 'Teaching Mode',
        value: 'Live online classes across India and the Gulf; classroom batches in Tamil Nadu and Bangalore',
      },
    ],
    owns: {
      '@type': 'SoftwareApplication',
      name: APP_NAME,
      url: APP_URL,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web (PWA) - Android, iOS, Windows, macOS',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    },
    // Prices come from lib/fees.ts, the single fee source, so schema never drifts
    // from the fees shown on the page.
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'NATA & Architecture Entrance Coaching Programs',
      itemListElement: getCourseSchemaOffers(),
    },
  };
}

// ─── ItemList Schema (for ranking/comparison pages) ─────────────────────────

export function generateItemListSchema(items: Array<{
  name: string;
  url?: string;
  description?: string;
  image?: string;
}>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.url && { url: item.url }),
      ...(item.description && { description: item.description }),
      ...(item.image && { image: item.image }),
    })),
  };
}

// ─── WebSite Schema (with SearchAction for sitelinks) ───────────────────────

export function generateWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${BASE_URL}/#website`,
    name: ORG_NAME,
    url: BASE_URL,
    description: ORG_DESCRIPTION,
    publisher: {
      '@id': `${BASE_URL}/#organization`,
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${BASE_URL}/blog?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
    inLanguage: ['en', 'ta', 'hi', 'kn', 'ml'],
  };
}

// ─── Course Schema ──────────────────────────────────────────────────────────

export function generateCourseSchema(course: {
  name: string;
  description: string;
  url: string;
  subjects?: string[];
  duration?: string;
  modes?: string[];
  price?: number;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.name,
    description: course.description,
    url: course.url,
    provider: {
      '@type': 'EducationalOrganization',
      name: ORG_NAME,
      url: BASE_URL,
      sameAs: SOCIAL_PROFILES,
    },
    educationalLevel: '12th Pass',
    teaches: course.subjects || ['Architecture', 'Drawing', 'Mathematics', 'General Aptitude'],
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: course.modes || ['online', 'onsite'],
      courseWorkload: course.duration || 'P6M',
    },
    ...(course.price && {
      offers: {
        '@type': 'Offer',
        price: course.price,
        priceCurrency: 'INR',
        availability: 'https://schema.org/InStock',
      },
    }),
  };
}

// ─── FAQ Schema ─────────────────────────────────────────────────────────────

export function generateFAQSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

// ─── Centre schema (one per real classroom, on its city page) ───────────────

const DAY_NAMES: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

/** The JSON-LD @id of a centre: its city page plus a stable fragment. */
export const centreSchemaId = (pageUrl: string, centreSlug: string) => `${pageUrl}#centre-${centreSlug}`;

/**
 * A real Neram classroom. Emitted only on the centre's own city page and only
 * when the row has a street address and pincode. Never carries AggregateRating:
 * self-serving review markup for our own business is not allowed.
 */
export function generateCentreSchema(centre: ClassroomCentre, pageUrl: string, opts: { areaServed?: string[] } = {}) {
  const photos = centre.photos ?? [];
  const served = Array.from(new Set([centre.city, ...(centre.nearbyCities ?? []), ...(opts.areaServed ?? [])]));
  const hours = Object.entries(centre.hours ?? {})
    .filter(([day, h]) => DAY_NAMES[day.toLowerCase()] && h)
    .map(([day, h]) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: DAY_NAMES[day.toLowerCase()],
      opens: h!.open,
      closes: h!.close,
    }));
  return {
    '@context': 'https://schema.org',
    '@type': ['EducationalOrganization', 'LocalBusiness'],
    '@id': centreSchemaId(pageUrl, centre.slug),
    name: `${ORG_NAME} ${centre.areaLabel}`,
    url: pageUrl,
    // Real centre photos (Admin > Centres), hero first. Never stock images.
    image: photos.length ? photos.map((p) => p.url) : ORG_LOGO,
    ...(photos.length && {
      photo: photos.map((p) => ({ '@type': 'ImageObject', contentUrl: p.url, caption: p.alt, ...(p.width && p.height && { width: p.width, height: p.height }) })),
    }),
    ...(centre.establishedYear && { foundingDate: String(centre.establishedYear) }),
    ...(centre.landmark && { description: `${ORG_NAME} ${centre.areaLabel}, ${centre.landmark}.` }),
    telephone: centre.phone || ORG_PHONE,
    address: {
      '@type': 'PostalAddress',
      streetAddress: centre.address,
      addressLocality: centre.city,
      addressRegion: centre.state,
      postalCode: centre.pincode,
      addressCountry: 'IN',
    },
    geo: { '@type': 'GeoCoordinates', latitude: centre.lat, longitude: centre.lng },
    hasMap: centre.gbpUrl || centre.mapsUrl,
    ...(hours.length && { openingHoursSpecification: hours }),
    ...(centre.gbpUrl && { sameAs: [centre.gbpUrl] }),
    ...(served.length > 1 && { areaServed: served.map((name) => ({ '@type': 'City', name })) }),
    parentOrganization: { '@id': `${BASE_URL}/#organization` },
  };
}

// ─── Location Course Schema (city and state coaching pages) ─────────────────

/**
 * A city or state coaching page is a Course offered to that place. Only a
 * centre's own city page also carries the centre (generateCentreSchema). A
 * blended instance points at the centre when one is near enough to attend.
 */
export function generateLocationCourseSchema(input: {
  name: string;
  description: string;
  url: string;
  area: { type: 'City' | 'State' | 'Country' | 'Place'; name: string; containedIn?: { type: 'State' | 'Country'; name: string } };
  /** The classroom students can attend; `id` is its centre schema @id when it has one. */
  classroom?: { name: string; url: string; id?: string | null } | null;
  exam: 'NATA' | 'JEE Paper 2';
}) {
  const fees = getCourseSchemaOffers()
    .map((c) => Number(c.offers.price))
    .filter((n) => Number.isFinite(n));
  const areaServed = {
    '@type': input.area.type,
    name: input.area.name,
    ...(input.area.containedIn && {
      containedInPlace: { '@type': input.area.containedIn.type, name: input.area.containedIn.name },
    }),
  };
  const instances: Array<Record<string, unknown>> = [
    { '@type': 'CourseInstance', courseMode: 'online', courseWorkload: 'P12M' },
  ];
  if (input.classroom) {
    instances.push({
      '@type': 'CourseInstance',
      courseMode: 'blended',
      courseWorkload: 'P12M',
      location: input.classroom.id
        ? { '@id': input.classroom.id }
        : { '@type': 'Place', name: input.classroom.name, url: input.classroom.url },
    });
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    '@id': `${input.url}#course`,
    name: input.name,
    description: input.description,
    url: input.url,
    inLanguage: 'en',
    educationalLevel: '12th Pass',
    teaches:
      input.exam === 'NATA'
        ? ['Drawing and Composition', 'Mathematics', 'General Aptitude', 'Architecture Awareness']
        : ['Mathematics', 'Aptitude', 'Drawing'],
    provider: { '@id': `${BASE_URL}/#organization`, '@type': 'EducationalOrganization', name: ORG_NAME, url: BASE_URL },
    areaServed,
    hasCourseInstance: instances,
    ...(fees.length && {
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'INR',
        lowPrice: String(Math.min(...fees)),
        highPrice: String(Math.max(...fees)),
        offerCount: String(fees.length),
        availability: 'https://schema.org/InStock',
        url: `${BASE_URL}/fees`,
        category: 'Paid',
      },
    }),
  };
}

// ─── Center LocalBusiness Schema (for /contact/[slug] pages) ────────────────

export function generateCenterLocalBusinessSchema(center: {
  name: string;
  url: string;
  phone?: string;
  email?: string;
  address?: string;
  city: string;
  state: string;
  pincode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  rating?: number | null;
  review_count?: number;
  nearby_cities?: string[];
  operating_hours?: Record<string, { open: string; close: string } | null>;
}) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': center.url,
    name: center.name,
    image: ORG_LOGO,
    url: center.url,
    telephone: center.phone || ORG_PHONE,
    email: center.email || ORG_EMAIL,
    address: {
      '@type': 'PostalAddress',
      streetAddress: center.address || '',
      addressLocality: center.city,
      addressRegion: center.state,
      postalCode: center.pincode || '',
      addressCountry: center.country || 'IN',
    },
    priceRange: '₹₹',
    parentOrganization: {
      '@id': `${BASE_URL}/#organization`,
    },
    sameAs: SOCIAL_PROFILES,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `NATA & JEE Paper 2 Coaching in ${center.city}`,
      itemListElement: [
        {
          '@type': 'Course',
          name: `NATA Crash Course in ${center.city}`,
          description: `Intensive 3-month NATA preparation crash course in ${center.city}`,
          provider: { '@type': 'EducationalOrganization', name: ORG_NAME },
        },
        {
          '@type': 'Course',
          name: `NATA 1-Year Program in ${center.city}`,
          description: `Comprehensive 12-month NATA coaching in ${center.city} with complete syllabus coverage`,
          provider: { '@type': 'EducationalOrganization', name: ORG_NAME },
        },
        {
          '@type': 'Course',
          name: `NATA 2-Year Program in ${center.city}`,
          description: `24-month NATA coaching in ${center.city} with foundation + advanced preparation and 1-on-1 mentoring`,
          provider: { '@type': 'EducationalOrganization', name: ORG_NAME },
        },
      ],
    },
  };

  // Geo coordinates
  if (center.latitude && center.longitude) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: center.latitude,
      longitude: center.longitude,
    };
  }

  // No aggregateRating: self-serving review markup for our own centres is not allowed.

  // Area served (nearby cities)
  if (center.nearby_cities && center.nearby_cities.length > 0) {
    schema.areaServed = [
      { '@type': 'City', name: center.city },
      ...center.nearby_cities.map((city) => ({ '@type': 'City', name: city })),
    ];
  }

  // Opening hours from operating_hours
  if (center.operating_hours) {
    const dayMap: Record<string, string> = {
      monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
      thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
    };
    const specs: Array<Record<string, unknown>> = [];
    for (const [day, hours] of Object.entries(center.operating_hours)) {
      if (hours && dayMap[day]) {
        specs.push({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: dayMap[day],
          opens: hours.open,
          closes: hours.close,
        });
      }
    }
    if (specs.length > 0) {
      schema.openingHoursSpecification = specs;
    }
  }

  return schema;
}

// ─── BreadcrumbList Schema ──────────────────────────────────────────────────

export function generateBreadcrumbSchema(
  items: Array<{ name: string; url?: string }>
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.url && { item: item.url }),
    })),
  };
}

// ─── Article Schema (for blog posts) ────────────────────────────────────────

export function generateArticleSchema(article: {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  publishedAt: string;
  modifiedAt?: string;
  author: string;
  category?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    url: article.url,
    ...(article.imageUrl && { image: article.imageUrl }),
    datePublished: article.publishedAt,
    dateModified: article.modifiedAt || article.publishedAt,
    author: {
      '@type': 'Person',
      name: article.author,
    },
    publisher: {
      '@type': 'Organization',
      name: ORG_NAME,
      logo: {
        '@type': 'ImageObject',
        url: ORG_LOGO,
      },
    },
    ...(article.category && {
      articleSection: article.category,
    }),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': article.url,
    },
  };
}

// ─── WebApplication Schema (for tools) ──────────────────────────────────────

export function generateWebApplicationSchema(tool: {
  name: string;
  description: string;
  url: string;
  applicationCategory?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: tool.name,
    description: tool.description,
    url: tool.url,
    applicationCategory: tool.applicationCategory || 'EducationalApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'INR',
    },
    provider: {
      '@type': 'EducationalOrganization',
      name: ORG_NAME,
      url: BASE_URL,
    },
  };
}

// ─── aiArchitek (the tools app as its own product entity) ───────────────────

/**
 * The aiArchitek app as a WebApplication published by the Organization. Only
 * what the /aiarchitek page shows: no ratings, no user counts, no superlatives.
 */
export function generateAiArchitekAppSchema(featureList: string[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${BASE_URL}/aiarchitek#app`,
    name: 'aiArchitek',
    alternateName: 'aiArchitek by Neram Classes',
    description:
      'Free NATA and B.Arch preparation tools from Neram Classes: cutoff calculator, college predictor, exam centre finder, question bank, eligibility checker and more, with AI-assisted learning.',
    url: `${APP_URL}/tools`,
    applicationCategory: 'EducationalApplication',
    applicationSubCategory: 'Exam Preparation',
    operatingSystem: 'Any (web browser, installable on Android and iOS)',
    browserRequirements: 'Requires JavaScript',
    isAccessibleForFree: true,
    inLanguage: 'en',
    featureList,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'INR',
    },
    publisher: { '@id': `${BASE_URL}/#organization` },
    audience: {
      '@type': 'EducationalAudience',
      educationalRole: 'student',
      audienceType: 'NATA and JEE Paper 2 (B.Arch) aspirants',
    },
    mainEntityOfPage: `${BASE_URL}/aiarchitek`,
  };
}

// ─── SoftwareApplication Schema (for NATA study app) ────────────────────────

export function generateSoftwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: APP_NAME,
    alternateName: ['Neram NATA App', 'Neram Classes App', 'Neram Study App'],
    applicationCategory: 'EducationalApplication',
    applicationSubCategory: 'Exam Preparation',
    operatingSystem: 'Web (PWA) - Android, iOS, Windows, macOS',
    url: APP_URL,
    installUrl: APP_URL,
    description: APP_DESCRIPTION,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
    },
    featureList: APP_FEATURES,
    softwareVersion: '2.0',
    datePublished: '2024-01-01',
    inLanguage: ['en'],
    isAccessibleForFree: true,
    provider: {
      '@type': 'EducationalOrganization',
      '@id': `${BASE_URL}/#organization`,
      name: ORG_NAME,
      url: BASE_URL,
    },
    author: {
      '@type': 'EducationalOrganization',
      name: ORG_NAME,
      url: BASE_URL,
    },
    educationalUse: 'Exam Preparation',
    audience: {
      '@type': 'EducationalAudience',
      educationalRole: 'student',
      audienceType: 'NATA & JEE Paper 2 aspirants',
    },
  };
}

// ─── HowTo Schema (for step-by-step guides) ────────────────────────────────

export function generateHowToSchema(howTo: {
  name: string;
  description: string;
  steps: Array<{ name: string; text: string; image?: string }>;
  totalTime?: string; // ISO 8601 duration, e.g. "PT30M"
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: howTo.name,
    description: howTo.description,
    ...(howTo.totalTime && { totalTime: howTo.totalTime }),
    step: howTo.steps.map((step, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: step.name,
      text: step.text,
      ...(step.image && { image: step.image }),
    })),
  };
}

// ─── Review Schema (for individual testimonials) ────────────────────────────

export function generateReviewSchema(testimonial: {
  studentName: string;
  content: string;
  rating: number;
  year: number;
  courseName: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Review',
    author: { '@type': 'Person', name: testimonial.studentName },
    reviewBody: testimonial.content,
    reviewRating: {
      '@type': 'Rating',
      ratingValue: String(testimonial.rating),
      bestRating: '5',
      worstRating: '1',
    },
    datePublished: `${testimonial.year}-01-01`,
    itemReviewed: {
      '@type': 'Course',
      name: testimonial.courseName,
      provider: {
        '@type': 'EducationalOrganization',
        name: ORG_NAME,
        url: BASE_URL,
      },
    },
  };
}

// ─── TN Hub Page Schema (EducationalOrganization with areaServed) ───────────

export function generateTNHubOrganizationSchema(districts: string[], aggregateRating?: AggregateRatingJsonLd | null) {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${BASE_URL}/#organization`,
    name: ORG_NAME,
    alternateName: ORG_ALTERNATE_NAME,
    url: BASE_URL,
    logo: ORG_LOGO,
    description: 'NATA coaching in Tamil Nadu since 2009: classroom batches in Chennai, Tambaram, Kanchipuram, Coimbatore, Tiruppur, Trichy, Madurai and Pudukkottai, and live online classes for every district.',
    foundingDate: ORG_FOUNDED,
    address: {
      '@type': 'PostalAddress',
      ...ORG_ADDRESS,
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: ORG_PHONE,
      email: ORG_EMAIL,
      contactType: 'customer service',
      availableLanguage: ['English', 'Tamil'],
    },
    sameAs: SOCIAL_PROFILES,
    ...(aggregateRating ? { aggregateRating } : {}),
    areaServed: districts.map((d) => ({
      '@type': 'City',
      name: d,
      containedInPlace: {
        '@type': 'State',
        name: 'Tamil Nadu',
      },
    })),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'NATA Coaching Courses in Tamil Nadu',
      itemListElement: [
        {
          '@type': 'Course',
          name: 'NATA Crash Course (3 Months)',
          description: 'Intensive 3-month NATA preparation covering Mathematics, General Aptitude, and Drawing',
          provider: { '@type': 'EducationalOrganization', name: ORG_NAME },
          offers: { '@type': 'Offer', price: '15000', priceCurrency: 'INR' },
        },
        {
          '@type': 'Course',
          name: 'NATA 1-Year Program (12 Months)',
          description: 'Comprehensive 12-month NATA coaching with daily drawing practice and 100+ mock tests',
          provider: { '@type': 'EducationalOrganization', name: ORG_NAME },
          offers: { '@type': 'Offer', price: '25000', priceCurrency: 'INR' },
        },
        {
          '@type': 'Course',
          name: 'NATA 2-Year Program (24 Months)',
          description: '24-month NATA coaching with foundation + advanced preparation, 1-on-1 mentoring, and complete NATA & JEE Paper 2 coverage',
          provider: { '@type': 'EducationalOrganization', name: ORG_NAME },
          offers: { '@type': 'Offer', price: '30000', priceCurrency: 'INR' },
        },
      ],
    },
  };
}

// ─── Testimonials Page Schema (aggregate rating) ────────────────────────────

/** Null when there is no data-driven rating, so the caller emits nothing. */
export function generateTestimonialsPageSchema(aggregateRating: AggregateRatingJsonLd | null) {
  if (!aggregateRating) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${BASE_URL}/#organization`,
    name: ORG_NAME,
    url: BASE_URL,
    aggregateRating,
  };
}

// ─── State Hub Schema (generic for any state) ─────────────────────────────────

export function generateStateHubSchema(state: { display: string; cities: string[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${BASE_URL}/#organization`,
    name: ORG_NAME,
    url: BASE_URL,
    logo: ORG_LOGO,
    foundingDate: ORG_FOUNDED,
    address: {
      '@type': 'PostalAddress',
      ...ORG_ADDRESS,
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: ORG_PHONE,
      email: ORG_EMAIL,
      contactType: 'customer service',
    },
    sameAs: SOCIAL_PROFILES,
    areaServed: {
      '@type': 'State',
      name: state.display,
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `NATA Coaching in ${state.display}`,
      itemListElement: state.cities.map((city, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: city,
        item: {
          '@type': 'City',
          name: city,
          containedInPlace: {
            '@type': 'State',
            name: state.display,
          },
        },
      })),
    },
  };
}

// ─── Event Schema (for dated milestones like exam dates, counselling rounds) ────

export function generateEventSchema(event: {
  name: string;
  description?: string;
  startDate: string; // ISO date
  endDate?: string;
  url?: string;
  status?: 'EventScheduled' | 'EventPostponed' | 'EventRescheduled' | 'EventCancelled';
  attendanceMode?: 'OnlineEventAttendanceMode' | 'OfflineEventAttendanceMode' | 'MixedEventAttendanceMode';
  location?: { name: string; url?: string };
  organizer?: { name: string; url?: string };
  defaultPortal?: { name: string; url: string };
}) {
  const portal = event.defaultPortal ?? {
    name: 'TNEA Online Portal',
    url: 'https://www.tneaonline.org',
  };
  const organizer = event.organizer ?? {
    name: 'Directorate of Technical Education, Tamil Nadu',
    url: 'https://www.dte.tn.gov.in',
  };
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.name,
    ...(event.description && { description: event.description }),
    startDate: event.startDate,
    ...(event.endDate && { endDate: event.endDate }),
    ...(event.url && { url: event.url }),
    eventStatus: `https://schema.org/${event.status || 'EventScheduled'}`,
    eventAttendanceMode: `https://schema.org/${event.attendanceMode || 'OnlineEventAttendanceMode'}`,
    location: event.location
      ? {
          '@type': event.attendanceMode === 'OfflineEventAttendanceMode' ? 'Place' : 'VirtualLocation',
          name: event.location.name,
          ...(event.location.url && { url: event.location.url }),
        }
      : {
          '@type': 'VirtualLocation',
          name: portal.name,
          url: portal.url,
        },
    organizer: {
      '@type': 'Organization',
      name: organizer.name,
      ...(organizer.url && { url: organizer.url }),
    },
  };
}

// ─── Generic LocalBusiness Schema (for third-party places like TFCs) ────────────

export function generateGenericLocalBusinessSchema(business: {
  name: string;
  url?: string;
  telephone?: string;
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
  opens?: string;
  closes?: string;
  identifier?: string;
}) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'GovernmentOffice',
    name: business.name,
    ...(business.url && { url: business.url }),
    ...(business.telephone && { telephone: business.telephone }),
    ...(business.identifier && { identifier: business.identifier }),
    address: {
      '@type': 'PostalAddress',
      ...(business.streetAddress && { streetAddress: business.streetAddress }),
      ...(business.addressLocality && { addressLocality: business.addressLocality }),
      ...(business.addressRegion && { addressRegion: business.addressRegion || 'Tamil Nadu' }),
      ...(business.postalCode && { postalCode: business.postalCode }),
      addressCountry: business.addressCountry || 'IN',
    },
  };
  if (business.opens && business.closes) {
    schema.openingHoursSpecification = {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      opens: business.opens,
      closes: business.closes,
    };
  }
  return schema;
}

// ─── Online Course Schema (NATA online coaching) ───────────────────────────────

export function generateOnlineCourseSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: 'Online NATA Coaching 2026 - Live Classes',
    description: 'Live online NATA coaching from Neram Classes, running since 2009. Live interactive classes, drawing feedback on every sketch, and mock tests in the exam format.',
    provider: {
      '@type': 'EducationalOrganization',
      name: ORG_NAME,
      url: BASE_URL,
    },
    url: `${BASE_URL}/nata-online-coaching`,
    courseMode: 'online',
    educationalLevel: 'Undergraduate Entrance',
    about: ['NATA Exam Preparation', 'Architecture Entrance Exam', 'Drawing Test', 'JEE Paper 2'],
    teaches: ['Architectural Drawing', 'Design Aptitude', 'Mathematics for Architecture', 'General Aptitude'],
    numberOfCredits: 0,
    hasCourseInstance: [
      {
        '@type': 'CourseInstance',
        courseMode: 'online',
        courseWorkload: 'PT6H', // 6 hours per day
        instructor: {
          '@type': 'Person',
          name: 'Pushparaj Manoharan',
        },
      },
    ],
    offers: {
      '@type': 'Offer',
      price: '15000',
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      url: `${BASE_URL}/apply`,
      validFrom: '2026-01-01',
    },
  };
}

// ─── VideoObject Schema (for embedded YouTube intro / explainer videos) ───

export function generateVideoObjectSchema(video: {
  name: string;
  description: string;
  thumbnailUrl: string;
  uploadDate: string; // ISO date e.g. '2026-05-21'
  contentUrl?: string;
  embedUrl?: string;
  duration?: string; // ISO 8601 e.g. 'PT1M30S'
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.name,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    uploadDate: video.uploadDate,
    ...(video.contentUrl && { contentUrl: video.contentUrl }),
    ...(video.embedUrl && { embedUrl: video.embedUrl }),
    ...(video.duration && { duration: video.duration }),
    publisher: {
      '@type': 'EducationalOrganization',
      name: ORG_NAME,
      url: BASE_URL,
      logo: {
        '@type': 'ImageObject',
        url: ORG_LOGO,
      },
    },
  };
}

// ─── Founder Person Schema (E-E-A-T anchor) ────────────────────────────────

export function generateFounderPersonSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${BASE_URL}/#founder`,
    name: 'Pushparaj Manoharan',
    jobTitle: 'Founder, Neram Classes',
    description:
      'B.Arch alumnus of NIT Trichy (2006), founder of Neram Classes. Architecture educator mentoring NATA and JEE Paper 2 aspirants since 2009. Mentored AIR 1 in JEE B.Arch 2024.',
    alumniOf: {
      '@type': 'CollegeOrUniversity',
      name: 'National Institute of Technology, Tiruchirappalli',
      sameAs: 'https://en.wikipedia.org/wiki/National_Institute_of_Technology,_Tiruchirappalli',
    },
    homeLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Brisbane',
        addressRegion: 'Queensland',
        addressCountry: 'AU',
      },
    },
    knowsAbout: [
      'NATA Drawing and Composition',
      'JEE Paper 2 Architecture',
      'Architecture Pedagogy',
      'B.Arch Admission Counselling',
      'Architecture Education',
    ],
    knowsLanguage: ['English', 'Tamil'],
    worksFor: {
      '@id': `${BASE_URL}/#organization`,
    },
    award: [
      'Mentored AIR 1 in JEE B.Arch 2024',
      'Founded Neram Classes (2009)',
    ],
  };
}
