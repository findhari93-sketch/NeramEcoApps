import type { CounsellingHubConfig } from './schema';

const csabNeut: CounsellingHubConfig = {
  slug: 'csab-neut',
  title: 'CSAB-NEUT 2026 (Northeast States and UTs)',
  shortName: 'CSAB-NEUT',
  authority: 'Central Seat Allocation Board',
  authorityShort: 'CSAB',
  primaryUrl: 'https://csab.nic.in/csab-neut',
  tier: 2,
  region: 'national',
  depth: 'stub',
  status: 'tbd',
  examRoutes: ['JEE_P2'],

  tagline: 'Cross-state AICTE seats for candidates from 8 Northeast states and 5 Union Territories.',
  description:
    'CSAB-NEUT (North East and Union Territories) is a special counselling that allocates AICTE-approved seats in institutions outside the home state, for candidates from states or UTs that have limited or no engineering and architecture programs locally. About 3,000 seats are filled annually across courses (B.Arch is a small share).',

  statusBanner: {
    label: '2026 NEUT page expected June',
    detail: 'Eligible candidates from 8 NE states and 5 UTs can apply for cross-state AICTE seats. Verify your domicile eligibility before registration.',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on CSAB-NEUT 2025 framework. The 2026 brochure will appear on csab.nic.in/csab-neut.',

  atAGlance: [
    { label: 'Total CSAB-NEUT seats', value: '~3,000 across courses' },
    { label: 'Eligible NE states', value: '8 (Arunachal, Assam, Manipur, Meghalaya, Mizoram, Nagaland, Sikkim, Tripura)' },
    { label: 'Eligible UTs', value: '5 (A&N, DNH&DD, Lakshadweep, Ladakh)' },
    { label: 'Entrance', value: 'JEE Main Paper 2' },
    { label: 'Course type', value: 'AICTE-approved B.Arch + B.Tech' },
  ],

  eligibility: [
    {
      label: 'Domicile and Class 12 board',
      detail: 'You must hold a domicile certificate from one of the 8 eligible NE states or 5 UTs AND have appeared for Class 12 from a board institution in that state or UT.',
    },
    {
      label: 'JEE Main Paper 2 score',
      detail: 'A valid JEE Main 2026 Paper 2 B.Arch rank is required. NATA alone is not used in CSAB-NEUT.',
    },
    {
      label: 'Cross-state seat',
      detail: 'CSAB-NEUT seats are at AICTE-approved institutions OUTSIDE your home state. The intent is to give NE and UT candidates access to programs not available locally.',
    },
  ],

  dates: [
    { label: 'CSAB Special closes', dateDisplay: 'Late August 2026 (TBD)', status: 'tbd' },
    { label: 'CSAB-NEUT registration', dateDisplay: 'August or September 2026 (TBD)', status: 'tbd' },
    { label: 'NEUT allotment rounds', dateDisplay: 'September 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'Who is eligible for CSAB-NEUT?',
      answer: 'Candidates with domicile in any of the 8 Northeast states (Arunachal, Assam, Manipur, Meghalaya, Mizoram, Nagaland, Sikkim, Tripura) or 5 Union Territories (A&N, DNH&DD, Lakshadweep, Ladakh) who have completed Class 12 from a board institution in that state or UT.',
    },
    {
      question: 'Can I get any college through CSAB-NEUT?',
      answer: 'CSAB-NEUT allocates seats at AICTE-approved institutions outside your home state. The seat list varies each year based on availability.',
    },
    {
      question: 'Is CSAB-NEUT separate from CSAB Special?',
      answer: 'Yes. CSAB Special fills NIT-system vacancies for all India candidates. CSAB-NEUT is a domicile-restricted process for NE and UT candidates only. They run separately.',
    },
    {
      question: 'Do I need JEE Advanced for CSAB-NEUT?',
      answer: 'No. JEE Main Paper 2 score is sufficient. NEUT does not allocate IIT seats.',
    },
    {
      question: 'How many B.Arch seats are in CSAB-NEUT?',
      answer: 'B.Arch is a small share of the ~3,000 NEUT seats overall. The exact B.Arch count varies year to year and is published in the official 2026 brochure.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'CSAB-NEUT 2026: B.Arch Cross-State Seats for NE & UTs',
  seoDescription:
    'CSAB-NEUT 2026 B.Arch counselling for 8 Northeast states and 5 UTs. JEE Main Paper 2, cross-state AICTE seats, separate from CSAB Special. Domicile and Class 12 board both required.',
  seoKeywords: 'CSAB-NEUT 2026, NEUT B.Arch, Northeast counselling, UT B.Arch, AICTE NE quota, csab.nic.in',
};

export default csabNeut;
