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
} from './constants';

// ─── Organization Schema ────────────────────────────────────────────────────

export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${BASE_URL}/#organization`,
    name: ORG_NAME,
    alternateName: ORG_ALTERNATE_NAME,
    url: BASE_URL,
    logo: ORG_LOGO,
    description: ORG_DESCRIPTION,
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
      availableLanguage: ['English', 'Tamil', 'Hindi', 'Kannada', 'Malayalam'],
    },
    sameAs: SOCIAL_PROFILES,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '2500',
      bestRating: '5',
      worstRating: '1',
    },
    numberOfEmployees: {
      '@type': 'QuantitativeValue',
      value: 50,
    },
    owns: {
      '@type': 'SoftwareApplication',
      name: APP_NAME,
      url: APP_URL,
      applicationCategory: 'EducationalApplication',
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Architecture Entrance Exam Coaching',
      itemListElement: [
        {
          '@type': 'Course',
          name: 'NATA Coaching',
          description: 'Comprehensive NATA preparation course with expert faculty',
        },
        {
          '@type': 'Course',
          name: 'JEE Paper 2 Coaching',
          description: 'JEE Paper 2 (B.Arch) preparation course',
        },
      ],
    },
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
        urlTemplate: `${BASE_URL}/en/blog?q={search_term_string}`,
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

// ─── LocalBusiness Schema (for city pages) ──────────────────────────────────

export function generateLocalBusinessSchema(location: {
  city: string;
  cityDisplay: string;
  state: string;
  stateDisplay: string;
  slug: string;
  phone?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${BASE_URL}/en/coaching/nata-coaching/nata-coaching-centers-in-${location.slug}`,
    name: `${ORG_NAME} ${location.cityDisplay}`,
    image: ORG_LOGO,
    url: `${BASE_URL}/en/coaching/nata-coaching/nata-coaching-centers-in-${location.slug}`,
    telephone: location.phone || ORG_PHONE,
    address: {
      '@type': 'PostalAddress',
      addressLocality: location.cityDisplay,
      addressRegion: location.stateDisplay,
      addressCountry: 'IN',
    },
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      opens: '09:00',
      closes: '18:00',
    },
    priceRange: '₹₹',
    parentOrganization: {
      '@id': `${BASE_URL}/#organization`,
    },
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
          name: `NATA Regular Course in ${center.city}`,
          description: `Comprehensive 6-month NATA coaching in ${center.city} with complete syllabus coverage`,
          provider: { '@type': 'EducationalOrganization', name: ORG_NAME },
        },
        {
          '@type': 'Course',
          name: `NATA Premium Course in ${center.city}`,
          description: `12-month premium NATA coaching in ${center.city} with 1-on-1 mentoring`,
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

  // Aggregate rating
  if (center.rating && center.review_count && center.review_count > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(center.rating),
      reviewCount: String(center.review_count),
      bestRating: '5',
      worstRating: '1',
    };
  }

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
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '2500',
      bestRating: '5',
      worstRating: '1',
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

// ─── Testimonials Page Schema (aggregate rating) ────────────────────────────

export function generateTestimonialsPageSchema(stats: {
  total: number;
  avgRating: number;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${BASE_URL}/#organization`,
    name: ORG_NAME,
    url: BASE_URL,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: String(stats.avgRating),
      reviewCount: String(stats.total),
      bestRating: '5',
      worstRating: '1',
    },
  };
}
