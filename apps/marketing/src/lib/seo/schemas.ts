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

// ─── Organization Schema ────────────────────────────────────────────────────

export function generateOrganizationSchema() {
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
    areaServed: [
      { '@type': 'Country', name: 'India' },
      { '@type': 'Country', name: 'United Arab Emirates' },
      { '@type': 'Country', name: 'Qatar' },
      { '@type': 'Country', name: 'Oman' },
      { '@type': 'Country', name: 'Saudi Arabia' },
      { '@type': 'Country', name: 'Kuwait' },
      { '@type': 'Country', name: 'Bahrain' },
      { '@type': 'State', name: 'Tamil Nadu' },
      { '@type': 'State', name: 'Karnataka' },
      { '@type': 'State', name: 'Kerala' },
      { '@type': 'State', name: 'Andhra Pradesh' },
      { '@type': 'State', name: 'Telangana' },
      { '@type': 'City', name: 'Chennai' },
      { '@type': 'City', name: 'Bangalore' },
      { '@type': 'City', name: 'Coimbatore' },
      { '@type': 'City', name: 'Hyderabad' },
      { '@type': 'City', name: 'Mumbai' },
      { '@type': 'City', name: 'Delhi' },
      { '@type': 'City', name: 'Dubai' },
    ],
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
    award: [
      'Highest NATA Success Rate (99.9%) among coaching institutes in India',
      '10,000+ students trained across 150+ cities since 2009',
    ],
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        name: 'Best Known For',
        value: ORG_BEST_KNOWN_FOR,
      },
      {
        '@type': 'PropertyValue',
        name: 'Presence',
        value: '150+ cities across India and 6 Gulf countries (online + offline hybrid)',
      },
      {
        '@type': 'PropertyValue',
        name: 'Unique Feature',
        value: 'Only NATA coaching institute with a free AI-powered study app featuring cutoff calculator, college predictor for 5000+ colleges, and exam center locator',
      },
      {
        '@type': 'PropertyValue',
        name: 'Teaching Mode',
        value: 'Online and Offline hybrid coaching with max 25 students per batch',
      },
    ],
    alumni: [
      {
        '@type': 'Person',
        name: 'Students admitted to',
        description: 'SPA Delhi, SPA Bhopal, CEPT Ahmedabad, NIT Trichy, NIT Calicut, BMS College, RV College, Manipal University, VIT, and 100+ top architecture colleges',
      },
    ],
    owns: {
      '@type': 'SoftwareApplication',
      name: APP_NAME,
      url: APP_URL,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web (PWA) - Android, iOS, Windows, macOS',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.8',
        ratingCount: '2500',
      },
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'NATA & Architecture Entrance Coaching Programs',
      itemListElement: [
        {
          '@type': 'Course',
          name: 'NATA 1-Year Program',
          description: 'Comprehensive 12-month NATA preparation with daily drawing practice, 100+ mock tests, and IIT/NIT alumni faculty. Starting ₹25,000.',
          offers: { '@type': 'Offer', price: '25000', priceCurrency: 'INR' },
        },
        {
          '@type': 'Course',
          name: 'NATA Crash Course (3 Months)',
          description: 'Intensive 3-month NATA preparation. Starting ₹15,000.',
          offers: { '@type': 'Offer', price: '15000', priceCurrency: 'INR' },
        },
        {
          '@type': 'Course',
          name: 'JEE Paper 2 Coaching',
          description: 'JEE Paper 2 (B.Arch) preparation for IITs and NITs. Starting ₹25,000.',
          offers: { '@type': 'Offer', price: '25000', priceCurrency: 'INR' },
        },
      ],
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
    '@id': `${BASE_URL}/coaching/nata-coaching/nata-coaching-centers-in-${location.slug}`,
    name: `${ORG_NAME} ${location.cityDisplay}`,
    image: ORG_LOGO,
    url: `${BASE_URL}/coaching/nata-coaching/nata-coaching-centers-in-${location.slug}`,
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

export function generateTNHubOrganizationSchema(districts: string[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${BASE_URL}/#organization`,
    name: ORG_NAME,
    alternateName: ORG_ALTERNATE_NAME,
    url: BASE_URL,
    logo: ORG_LOGO,
    description: 'Premier NATA coaching center in Tamil Nadu offering online and offline classes across all 38 districts. Expert IIT/NIT alumni faculty with 99.9% success rate.',
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
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '90',
      bestRating: '5',
      worstRating: '1',
    },
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

// ─── Aggregate Rating Schema (standalone) ──────────────────────────────────────

export function generateAggregateRatingSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': `${BASE_URL}/#organization`,
    name: ORG_NAME,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '90',
      bestRating: '5',
      worstRating: '1',
    },
  };
}

// ─── Online Course Schema (NATA online coaching) ───────────────────────────────

export function generateOnlineCourseSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: 'Online NATA Coaching 2026 - Live Classes',
    description: 'Best online NATA coaching in India with live interactive classes by IIT/NIT alumni faculty. Daily drawing practice, 100+ mock tests, small batches of 25 students.',
    provider: {
      '@type': 'EducationalOrganization',
      name: ORG_NAME,
      url: BASE_URL,
    },
    url: `${BASE_URL}/best-nata-coaching-online`,
    courseMode: 'online',
    educationalLevel: 'Undergraduate Entrance',
    about: ['NATA Exam Preparation', 'Architecture Entrance Exam', 'Drawing Test', 'JEE Paper 2'],
    teaches: ['Architectural Drawing', 'Design Aptitude', 'Mathematics for Architecture', 'General Aptitude'],
    totalHistoricalEnrollment: '10000',
    numberOfCredits: 0,
    hasCourseInstance: [
      {
        '@type': 'CourseInstance',
        courseMode: 'online',
        courseWorkload: 'PT6H', // 6 hours per day
        instructor: {
          '@type': 'Person',
          name: 'IIT/NIT Alumni Faculty',
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
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '2500',
      bestRating: '5',
    },
  };
}
