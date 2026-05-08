import type { CounsellingHubConfig } from './schema';

const jacChd: CounsellingHubConfig = {
  slug: 'jac-chandigarh-barch',
  title: 'JAC Chandigarh B.Arch Counselling 2026',
  shortName: 'JAC Chandigarh',
  authority: 'Chandigarh Administration + Panjab University',
  authorityShort: 'JAC Chandigarh',
  primaryUrl: 'https://jacchd.admissions.nic.in',
  tier: 1,
  region: 'north',
  depth: 'standard',
  status: 'tbd',
  examRoutes: ['JEE_P2'],

  tagline: 'Sole institute is Chandigarh College of Architecture (CCA), Sector 12. 40 seats, ₹30,000/year tuition.',
  description:
    'JAC Chandigarh runs the centralised counselling for Chandigarh institutes. For B.Arch, the sole participating institute is Chandigarh College of Architecture (CCA), Sector 12, with 40 seats. PEC Chandigarh does NOT offer B.Arch. CCA is among the most affordable top B.Arch institutes in India: ₹30,000/year tuition, ₹1.5 lakh total for 5 years. JEE Main Paper 2 only is accepted.',

  statusBanner: {
    label: '2026 brochure pending',
    detail: 'JAC Chandigarh typically opens registration in June after JEE Main Session 2 results.',
    expectedDate: 'June 2026',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on JAC Chandigarh 2025 cycle. Quota structure and registration fees expected to continue in 2026.',

  atAGlance: [
    { label: 'Sole B.Arch institute', value: 'CCA Sector 12' },
    { label: 'Total seats', value: '40' },
    { label: 'Annual tuition', value: '₹30,000' },
    { label: 'Total programme fees', value: '₹1.5 lakh (5 years)' },
    { label: 'NIRF Architecture rank', value: '30' },
    { label: 'Entrance', value: 'JEE Main Paper 2 only' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% for reserved).',
    },
    {
      label: 'Entrance accepted',
      detail: 'JEE Main Paper 2A score is mandatory. NATA is NOT accepted by JAC Chandigarh.',
    },
    {
      label: 'Chandigarh region quota',
      detail: '32 of 40 seats reserved for Chandigarh local candidates. 6 seats open to Outside Chandigarh. 1 seat for Kashmiri Pandit. 1 seat for Kargil Martyr ward.',
    },
  ],

  dates: [
    { label: 'JEE Main Session 2 result', dateDisplay: 'April 2026', status: 'expected' },
    { label: 'JAC Chandigarh registration', dateDisplay: 'June 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 2 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 3 / spot', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
  ],

  reservation: [
    { category: 'Chandigarh region', percentage: '32 of 40 seats' },
    { category: 'Outside Chandigarh', percentage: '6 of 40 seats' },
    { category: 'Kashmiri Pandit', percentage: '1 supernumerary' },
    { category: 'Kargil Martyr ward', percentage: '1 supernumerary' },
    { category: 'SC', percentage: 'Per Chandigarh Admin GO' },
    { category: 'OBC', percentage: 'Per Chandigarh Admin GO' },
    { category: 'EWS', percentage: '10%' },
    { category: 'PwD (horizontal)', percentage: '5%' },
  ],

  fees: [
    { label: 'JAC Chandigarh registration, General/EWS', amount: '₹2,800' },
    { label: 'JAC Chandigarh registration, SC/ST/PwD', amount: '₹1,400' },
    { label: 'Seat acceptance fee', amount: '₹40,000' },
    { label: 'CCA annual tuition', amount: '₹30,000' },
    { label: 'CCA total programme fees (5 years)', amount: '₹1.5 lakh', note: 'Among the most affordable top B.Arch institutes in India' },
  ],

  topColleges: [
    {
      name: 'Chandigarh College of Architecture (CCA), Sector 12',
      city: 'Chandigarh',
      intake: 40,
      feesPerYear: '₹30,000',
      cutoffNote: '2025 Round 1 General Outside Chandigarh closing rank: CRL 164 (JEE Main Paper 2). NIRF Architecture rank 30.',
      url: 'https://cca.edu.in',
    },
  ],

  gotchas: [
    {
      title: 'PEC Chandigarh does NOT offer B.Arch',
      detail: 'Punjab Engineering College (PEC), now a deemed university in Chandigarh, does not offer B.Arch. The only B.Arch in JAC Chandigarh is CCA Sector 12.',
    },
    {
      title: 'NATA is NOT accepted',
      detail: 'JAC Chandigarh requires JEE Main Paper 2A score. Even a top NATA score cannot get you into CCA through JAC.',
    },
    {
      title: 'Only 6 of 40 seats are open to Outside Chandigarh',
      detail: 'CCA reserves 32 seats for Chandigarh local candidates. Just 6 are open to Outside Chandigarh applicants. Closing ranks for Outside are very competitive (around 164 General in 2025).',
    },
    {
      title: 'Total programme cost is exceptionally low',
      detail: 'At ₹30,000/year tuition and ₹1.5 lakh total for 5 years, CCA is among the cheapest premier B.Arch institutes in India. This is a meaningful financial planning factor for many families.',
    },
  ],

  faqs: [
    {
      question: 'Is PEC Chandigarh in JAC Chandigarh B.Arch?',
      answer: 'No. PEC does not offer B.Arch. The only B.Arch institute in JAC Chandigarh is Chandigarh College of Architecture (CCA), Sector 12.',
    },
    {
      question: 'Does JAC Chandigarh accept NATA?',
      answer: 'No. JEE Main Paper 2A score is the only entrance accepted. NATA cannot be used.',
    },
    {
      question: 'How many seats does CCA Chandigarh have?',
      answer: '40 seats per year. The split is approximately 32 Chandigarh local + 6 Outside Chandigarh + 1 Kashmiri Pandit + 1 Kargil Martyr ward. The exact category split can vary slightly.',
    },
    {
      question: 'What is the closing rank for CCA Outside Chandigarh?',
      answer: '2025 Round 1 General Outside Chandigarh closing rank was approximately CRL 164 (JEE Main Paper 2). The 32 Chandigarh local seats had higher (less competitive) closing ranks.',
    },
    {
      question: 'How much does CCA cost?',
      answer: 'CCA tuition is approximately ₹30,000 per year, totalling around ₹1.5 lakh for the full 5-year B.Arch programme. This makes it one of the most affordable top B.Arch institutes in India.',
    },
    {
      question: 'What is the registration fee for JAC Chandigarh?',
      answer: '₹2,800 for General and EWS candidates, ₹1,400 for SC, ST, and PwD candidates. The seat acceptance fee after allotment is ₹40,000.',
    },
    {
      question: 'When does JAC Chandigarh counselling start?',
      answer: 'Typically June after JEE Main Session 2 results. The 2026 dates will be on jacchd.admissions.nic.in.',
    },
    {
      question: 'Is there any other B.Arch option in Chandigarh?',
      answer: 'Outside JAC, Chitkara University, Chandigarh University, and a few private colleges admit B.Arch directly using NATA or JEE Paper 2. They are not part of JAC Chandigarh.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'JAC Chandigarh B.Arch 2026: CCA Sector 12 Cutoff, ₹30,000/year',
  seoDescription:
    'JAC Chandigarh B.Arch 2026: CCA Sector 12 (40 seats), JEE Main Paper 2 only, ₹30,000/year tuition (₹1.5L total), CRL 164 Outside cutoff. PEC Chandigarh does NOT offer B.Arch.',
  seoKeywords: 'JAC Chandigarh B.Arch 2026, CCA Chandigarh, Chandigarh College of Architecture, CCA cutoff, jacchd.admissions.nic.in, PEC B.Arch',
};

export default jacChd;
