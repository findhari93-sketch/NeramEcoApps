import {
  ORG_NAME,
  ORG_ALTERNATE_NAME,
  BASE_URL,
  ORG_LOGO,
  ORG_PHONE,
  ORG_EMAIL,
  ORG_FOUNDED,
  ORG_DESCRIPTION,
  ORG_ADDRESS,
  SOCIAL_PROFILES,
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
