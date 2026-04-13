// College Hub — JSON-LD Schema Markup
// Generates CollegeOrUniversity, BreadcrumbList, FAQPage schemas

const BASE_URL = 'https://neramclasses.com';

// ─── CollegeOrUniversity schema ──────────────────────────────────────────────

interface CollegeSchemaInputs {
  name: string;
  slug: string;
  city: string;
  state: string;
  state_slug: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  established_year: number | null;
  logo_url: string | null;
  address: string | null;
  pincode: string | null;
  naac_grade: string | null;
  coa_approved: boolean;
  total_barch_seats: number | null;
  annual_fee_approx: number | null;
  annual_fee_min: number | null;
  annual_fee_max: number | null;
  accepted_exams: string[] | null;
  about: string | null;
}

export function generateCollegeOrUniversitySchema(college: CollegeSchemaInputs) {
  const url = `${BASE_URL}/colleges/${college.state_slug ?? 'india'}/${college.slug}`;

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollegeOrUniversity',
    '@id': `${url}#college`,
    name: college.name,
    url: college.website ?? url,
    sameAs: [url, ...(college.website ? [college.website] : [])],
    address: {
      '@type': 'PostalAddress',
      addressLocality: college.city,
      addressRegion: college.state,
      addressCountry: 'IN',
      ...(college.address && { streetAddress: college.address }),
      ...(college.pincode && { postalCode: college.pincode }),
    },
    ...(college.logo_url && { logo: college.logo_url }),
    ...(college.phone && { telephone: college.phone }),
    ...(college.email && { email: college.email }),
    ...(college.established_year && { foundingDate: String(college.established_year) }),
    ...(college.about && { description: college.about }),
  };

  // Accreditation
  const accreditations = [];
  if (college.coa_approved) {
    accreditations.push({
      '@type': 'EducationalOccupationalCredential',
      name: 'COA Approved',
      recognizedBy: { '@type': 'Organization', name: 'Council of Architecture, India' },
    });
  }
  if (college.naac_grade) {
    accreditations.push({
      '@type': 'EducationalOccupationalCredential',
      name: `NAAC Grade ${college.naac_grade}`,
      recognizedBy: { '@type': 'Organization', name: 'NAAC' },
    });
  }
  if (accreditations.length > 0) {
    schema.hasCredential = accreditations;
  }

  // Offers (degree programme)
  const feeMin = college.annual_fee_min ?? college.annual_fee_approx;
  const feeMax = college.annual_fee_max ?? college.annual_fee_approx;
  if (feeMin || college.total_barch_seats) {
    schema.offers = {
      '@type': 'Offer',
      name: 'Bachelor of Architecture (B.Arch)',
      ...(feeMin && {
        priceSpecification: {
          '@type': 'PriceSpecification',
          price: feeMin,
          maxPrice: feeMax ?? feeMin,
          priceCurrency: 'INR',
          description: 'Annual tuition fee',
        },
      }),
      ...(college.total_barch_seats && { availability: `${college.total_barch_seats} seats` }),
    };
  }

  return schema;
}

// ─── BreadcrumbList schema ───────────────────────────────────────────────────

export function generateCollegeBreadcrumbSchema(
  college: { name: string; slug: string; state_slug: string | null; state: string }
) {
  const stateUrl = `${BASE_URL}/colleges/${college.state_slug ?? 'india'}`;
  const collegeUrl = `${stateUrl}/${college.slug}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Colleges', item: `${BASE_URL}/colleges` },
      { '@type': 'ListItem', position: 3, name: `B.Arch Colleges in ${college.state}`, item: stateUrl },
      { '@type': 'ListItem', position: 4, name: college.name, item: collegeUrl },
    ],
  };
}

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

// ─── FAQPage schema ──────────────────────────────────────────────────────────

interface FAQItem {
  question: string;
  answer: string;
}

export function generateCollegeFAQSchema(college: {
  name: string;
  city: string;
  state: string;
  annual_fee_approx: number | null;
  annual_fee_min: number | null;
  total_barch_seats: number | null;
  accepted_exams: string[] | null;
  counseling_systems: string[] | null;
  naac_grade: string | null;
  coa_approved: boolean;
  established_year: number | null;
}): object {
  const faqs: FAQItem[] = [];

  // Fee FAQ
  const feeVal = college.annual_fee_approx ?? college.annual_fee_min;
  if (feeVal) {
    faqs.push({
      question: `What is the fee structure of ${college.name}?`,
      answer: `The approximate annual fee at ${college.name} for the B.Arch program is ₹${(feeVal / 100000).toFixed(1)} lakh per year. Total 5-year cost is approximately ₹${((feeVal * 5) / 100000).toFixed(1)} lakh. Actual fees may vary by category (General, OBC, SC/ST). Check the fee section above for detailed year-wise breakdowns.`,
    });
  }

  // Seats FAQ
  if (college.total_barch_seats) {
    faqs.push({
      question: `How many B.Arch seats does ${college.name} have?`,
      answer: `${college.name} has ${college.total_barch_seats} B.Arch seats approved by the Council of Architecture. Seats are allocated through ${(college.counseling_systems ?? ['TNEA']).join(' and ')} counseling.`,
    });
  }

  // Exam FAQ
  if (college.accepted_exams && college.accepted_exams.length > 0) {
    faqs.push({
      question: `What entrance exam is required for admission to ${college.name}?`,
      answer: `Admission to ${college.name} requires a valid ${college.accepted_exams.join(' or ')} score. ${college.counseling_systems?.includes('TNEA') ? 'Seat allotment is done through TNEA (Tamil Nadu Engineering Admissions) counseling.' : ''} The minimum NATA score and cutoff rank varies each year based on the number of applicants.`,
    });
  }

  // COA/Accreditation FAQ
  faqs.push({
    question: `Is ${college.name} recognized by the Council of Architecture?`,
    answer: college.coa_approved
      ? `Yes, ${college.name} is approved by the Council of Architecture (COA), India. COA approval is mandatory to practice architecture after graduation. ${college.naac_grade ? `The college also has NAAC ${college.naac_grade} accreditation.` : ''}`
      : `${college.name}'s COA approval status should be verified with the Council of Architecture directly before admission.`,
  });

  // Location FAQ
  faqs.push({
    question: `Where is ${college.name} located?`,
    answer: `${college.name} is located in ${college.city}, ${college.state}, India. ${college.established_year ? `The college was established in ${college.established_year}.` : ''}`,
  });

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
