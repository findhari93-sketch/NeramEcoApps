import type { CounsellingHubConfig } from './schema';

const wbjee: CounsellingHubConfig = {
  slug: 'wbjee-barch',
  title: 'WBJEE B.Arch Counselling 2026 (West Bengal)',
  shortName: 'WBJEE',
  authority: 'West Bengal Joint Entrance Examinations Board',
  authorityShort: 'WBJEEB',
  primaryUrl: 'https://wbjeeb.nic.in',
  tier: 2,
  region: 'east',
  depth: 'stub',
  status: 'live',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'West Bengal B.Arch via JEE Main Paper 2 or NATA. WBJEE itself has no Architecture paper.',
  description:
    'WBJEEB coordinates B.Arch counselling for West Bengal using JEE Main Paper 2 or NATA score (WBJEE itself has no separate Architecture paper). Jadavpur University B.Arch (40 seats) is the flagship and notably the cheapest premier B.Arch in India at ₹26,050 total for 5 years. IIEST Shibpur does NOT offer B.Arch (B.Tech only). 2025 saw 2 main rounds plus mop-up (revised from 3).',

  statusBanner: {
    label: 'WBJEE 2026 confirmed for May 24',
    detail: 'WBJEE 2026 exam date is May 24, results expected late June. B.Arch counselling typically opens July.',
    expectedDate: 'July 2026 (post WBJEE results)',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on WBJEE 2025 cycle. Round structure was revised to 2 main + mop-up in 2025.',

  atAGlance: [
    { label: 'WBJEE 2026 exam', value: 'May 24, 2026' },
    { label: 'Entrance', value: 'JEE Main Paper 2 or NATA' },
    { label: 'WBJEE B.Arch paper?', value: 'No' },
    { label: 'Counselling rounds', value: '2 main + mop-up' },
    { label: 'Jadavpur University fees', value: '₹26,050 total (5 years)' },
    { label: 'IIEST Shibpur B.Arch?', value: 'No' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% reserved).',
    },
    {
      label: 'Entrance accepted',
      detail: 'JEE Main Paper 2 score or NATA score. WBJEE itself does NOT have an Architecture paper. Submitting either is sufficient.',
    },
  ],

  dates: [
    { label: 'WBJEE 2026', dateDisplay: 'May 24, 2026', dateIso: '2026-05-24', status: 'confirmed' },
    { label: 'WBJEE result', dateDisplay: 'June 2026 (TBD)', status: 'expected' },
    { label: 'B.Arch counselling registration', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 2 allotment', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
    { label: 'Mop-up round', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'Does WBJEE have an Architecture paper?',
      answer: 'No. WBJEE has no separate Architecture paper. B.Arch admissions use JEE Main Paper 2 or NATA scores, coordinated through WBJEEB counselling.',
    },
    {
      question: 'Is IIEST Shibpur B.Arch in WBJEE counselling?',
      answer: 'IIEST Shibpur does NOT offer B.Arch at all. It runs B.Tech only and admits via JoSAA. Many candidates assume IIEST has B.Arch and waste a preference, it does not.',
    },
    {
      question: 'What is the cheapest B.Arch college in WBJEE?',
      answer: 'Jadavpur University B.Arch is approximately ₹26,050 total for 5 years (around ₹5,200/year) which is among the cheapest premier B.Arch options in India. NIRF Architecture rank 16.',
    },
    {
      question: 'How many counselling rounds does WBJEE B.Arch have?',
      answer: 'In 2025, the round structure was revised to 2 main rounds plus a mop-up round (down from 3 in earlier years). Verify in 2026 brochure.',
    },
    {
      question: 'Is West Bengal domicile required?',
      answer: 'A portion of seats are state quota requiring West Bengal domicile or qualifying examination from a WB board. Outside-state candidates compete in the all-India quota share.',
    },
    {
      question: 'Are JEE Advanced or AAT used?',
      answer: 'No. WBJEE B.Arch counselling does not use JEE Advanced or AAT. JEE Main Paper 2 or NATA is sufficient.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'WBJEE B.Arch 2026 West Bengal: Jadavpur Cutoff, JEE P2 + NATA',
  seoDescription:
    'WBJEE B.Arch 2026 West Bengal: WBJEE itself has no Architecture paper, uses JEE Main Paper 2 or NATA. Jadavpur University ₹26,050 total fees (5 years). IIEST does NOT offer B.Arch.',
  seoKeywords: 'WBJEE B.Arch 2026, Jadavpur B.Arch fees, IIEST Shibpur B.Arch, West Bengal B.Arch, wbjeeb counselling, WBJEE NATA',
};

export default wbjee;
