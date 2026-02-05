/**
 * SEO Schema Generator
 *
 * Generates JSON-LD structured data for Neram Classes pages.
 * Run with: pnpm seo:schema
 */

interface SchemaConfig {
  type: 'Organization' | 'Course' | 'FAQPage' | 'LocalBusiness' | 'WebApplication';
  data: Record<string, unknown>;
}

// Organization schema for Neram Classes
export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: 'Neram Classes',
    alternateName: 'Neram NATA Coaching',
    url: 'https://neramclasses.com',
    logo: 'https://neramclasses.com/logo.png',
    description:
      'Premier NATA and JEE Paper 2 coaching institute in Tamil Nadu with expert faculty and comprehensive study materials.',
    foundingDate: '2020',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Pudukkottai',
      addressRegion: 'Tamil Nadu',
      addressCountry: 'IN',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+91-XXXXXXXXXX',
      contactType: 'customer service',
      availableLanguage: ['English', 'Tamil'],
    },
    sameAs: [
      'https://www.facebook.com/neramclasses',
      'https://www.instagram.com/neramclasses',
      'https://www.youtube.com/@neramclasses',
    ],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Architecture Entrance Exam Coaching',
      itemListElement: [
        {
          '@type': 'Course',
          name: 'NATA Coaching',
          description: 'Comprehensive NATA preparation course',
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

// Course schema
export function generateCourseSchema(course: {
  name: string;
  description: string;
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
    provider: {
      '@type': 'EducationalOrganization',
      name: 'Neram Classes',
      url: 'https://neramclasses.com',
    },
    educationalLevel: '12th Pass',
    teaches: course.subjects || ['Architecture', 'Drawing', 'Mathematics', 'General Aptitude'],
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: course.modes || ['onsite', 'online'],
      courseWorkload: course.duration || 'PT6M', // 6 months
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

// FAQ Page schema
export function generateFAQSchema(
  faqs: Array<{ question: string; answer: string }>
) {
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

// Local Business schema for city pages
export function generateLocalBusinessSchema(location: {
  city: string;
  slug: string;
  address?: string;
  pincode?: string;
  lat?: number;
  lng?: number;
  phone?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `https://neramclasses.com/coaching/nata-coaching/nata-coaching-centers-in-${location.slug}`,
    name: `Neram Classes ${location.city}`,
    image: 'https://neramclasses.com/logo.png',
    url: `https://neramclasses.com/en/coaching/nata-coaching/nata-coaching-centers-in-${location.slug}`,
    telephone: location.phone || '+91-XXXXXXXXXX',
    address: {
      '@type': 'PostalAddress',
      streetAddress: location.address || '',
      addressLocality: location.city,
      addressRegion: 'Tamil Nadu',
      postalCode: location.pincode || '',
      addressCountry: 'IN',
    },
    ...(location.lat &&
      location.lng && {
        geo: {
          '@type': 'GeoCoordinates',
          latitude: location.lat,
          longitude: location.lng,
        },
      }),
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      opens: '09:00',
      closes: '18:00',
    },
    priceRange: '₹₹',
  };
}

// Web Application schema for tools
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
      name: 'Neram Classes',
      url: 'https://neramclasses.com',
    },
  };
}

// Main execution
async function main() {
  console.log('🔧 Generating JSON-LD Schemas...\n');

  // Organization schema
  const orgSchema = generateOrganizationSchema();
  console.log('✅ Organization Schema:');
  console.log(JSON.stringify(orgSchema, null, 2));
  console.log('\n');

  // Course schemas
  const courses = [
    {
      name: 'NATA Year-Long Coaching',
      description:
        'Comprehensive 12-month NATA preparation with expert faculty, study materials, and mock tests.',
      subjects: ['Mathematics', 'General Aptitude', 'Drawing', 'Architecture Awareness'],
      duration: 'PT12M',
      modes: ['online', 'offline'],
    },
    {
      name: 'NATA Crash Course',
      description:
        'Intensive 3-month NATA preparation for quick revision and last-minute preparation.',
      subjects: ['Mathematics', 'General Aptitude', 'Drawing'],
      duration: 'PT3M',
      modes: ['online'],
    },
  ];

  console.log('✅ Course Schemas:');
  courses.forEach((course) => {
    console.log(`\n--- ${course.name} ---`);
    console.log(JSON.stringify(generateCourseSchema(course), null, 2));
  });
  console.log('\n');

  // Tool schemas
  const tools = [
    {
      name: 'NATA Cutoff Calculator',
      description: 'Calculate your NATA cutoff and get personalized college admission chances.',
      url: 'https://app.neramclasses.com/tools/cutoff-calculator',
    },
    {
      name: 'College Predictor',
      description: 'Find architecture colleges matching your NATA score with AI-powered predictions.',
      url: 'https://app.neramclasses.com/tools/college-predictor',
    },
    {
      name: 'Exam Center Locator',
      description: 'Find NATA exam centers near you with address and directions.',
      url: 'https://app.neramclasses.com/tools/exam-centers',
    },
  ];

  console.log('✅ WebApplication Schemas (Tools):');
  tools.forEach((tool) => {
    console.log(`\n--- ${tool.name} ---`);
    console.log(JSON.stringify(generateWebApplicationSchema(tool), null, 2));
  });

  console.log('\n✨ Schema generation complete!');
  console.log(
    '\nTo use these schemas, add them to your pages using <script type="application/ld+json">'
  );
}

main().catch(console.error);
