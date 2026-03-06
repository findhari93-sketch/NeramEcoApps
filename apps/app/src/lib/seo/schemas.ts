import {
  APP_NAME,
  APP_URL,
  APP_DESCRIPTION,
  APP_FEATURES,
  ORG_NAME,
  MARKETING_URL,
  ORG_LOGO,
  SOCIAL_PROFILES,
} from './constants';

export function generateSoftwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: APP_NAME,
    alternateName: ['aiArchitek', 'Neram NATA App', 'Neram Classes App'],
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
      name: ORG_NAME,
      url: MARKETING_URL,
      sameAs: SOCIAL_PROFILES,
    },
    audience: {
      '@type': 'EducationalAudience',
      educationalRole: 'student',
      audienceType: 'NATA & JEE Paper 2 aspirants',
    },
  };
}

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

export function generateBreadcrumbSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: APP_URL,
      },
    ],
  };
}
