import type { CounsellingHubConfig } from './schema';

const jkbopee: CounsellingHubConfig = {
  slug: 'jkbopee-barch',
  title: 'JKBOPEE B.Arch Counselling 2026 (J&K)',
  shortName: 'JKBOPEE',
  authority: 'J&K Board of Professional Entrance Examinations',
  authorityShort: 'JKBOPEE',
  primaryUrl: 'https://jkbopee.gov.in',
  tier: 3,
  region: 'north',
  depth: 'stub',
  status: 'live',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'J&K B.Arch counselling. JKCET 2026 confirmed for April 19. SMVDU Katra is the only centrally-funded B.Arch.',
  description:
    'JKBOPEE conducts B.Arch counselling for state institutes in Jammu and Kashmir. JKCET 2026 is confirmed for April 19, 2026. NATA or JEE Main Paper 2 is also accepted. Only SMVDU Katra (Shri Mata Vaishno Devi University) is centrally-funded B.Arch in J&K. NIT Srinagar and IIT Jammu do NOT offer B.Arch.',

  statusBanner: {
    label: 'JKCET 2026 confirmed for April 19',
    detail: 'JKCET is on April 19, 2026. B.Arch counselling timing depends on JKBOPEE notification thereafter.',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on JKBOPEE 2025 cycle plus confirmed JKCET 2026 date.',

  atAGlance: [
    { label: 'JKCET 2026', value: 'April 19, 2026' },
    { label: 'Entrance accepted', value: 'NATA, JEE Paper 2, JKCET' },
    { label: 'SMVDU Katra B.Arch', value: 'Centrally-funded' },
    { label: 'NIT Srinagar B.Arch?', value: 'No' },
    { label: 'IIT Jammu B.Arch?', value: 'No' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% reserved).',
    },
    {
      label: 'Entrance accepted',
      detail: 'NATA, JEE Main Paper 2, or JKCET per operative JKBOPEE notification.',
    },
  ],

  dates: [
    { label: 'JKCET 2026', dateDisplay: 'April 19, 2026', dateIso: '2026-04-19', status: 'confirmed' },
    { label: 'JKCET result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'B.Arch counselling registration', dateDisplay: 'June or July 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'When is JKCET 2026?',
      answer: 'JKCET 2026 is confirmed for April 19, 2026.',
    },
    {
      question: 'Does NIT Srinagar offer B.Arch?',
      answer: 'No. NIT Srinagar is in JoSAA for B.Tech only. There is no NIT B.Arch in J&K.',
    },
    {
      question: 'Does IIT Jammu offer B.Arch?',
      answer: 'No. IIT Jammu does not offer B.Arch.',
    },
    {
      question: 'What is the top B.Arch in J&K?',
      answer: 'SMVDU Katra (Shri Mata Vaishno Devi University) is the only centrally-funded B.Arch institute in J&K.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'JKBOPEE B.Arch 2026 J&K: JKCET April 19, SMVDU Katra',
  seoDescription:
    'JKBOPEE B.Arch counselling 2026 J&K: JKCET confirmed April 19, NATA and JEE Paper 2 also accepted. SMVDU Katra is the only centrally-funded B.Arch. NIT Srinagar and IIT Jammu have no B.Arch.',
  seoKeywords: 'JKBOPEE B.Arch 2026, JKCET 2026, SMVDU Katra B.Arch, J&K B.Arch admission, NIT Srinagar B.Arch, IIT Jammu B.Arch',
};

export default jkbopee;
