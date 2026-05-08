import type { CounsellingHubConfig } from './schema';

const reap: CounsellingHubConfig = {
  slug: 'reap-barch',
  title: 'REAP B.Arch Counselling 2026 (Rajasthan)',
  shortName: 'REAP',
  authority: 'Rajasthan Technical University Kota / DTE Rajasthan',
  authorityShort: 'RTU/DTE Raj',
  primaryUrl: 'https://reap2026.in',
  tier: 2,
  region: 'north',
  depth: 'stub',
  status: 'tbd',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Rajasthan B.Arch via NATA or JEE Paper 2. MNIT Jaipur is JoSAA, not REAP.',
  description:
    'REAP (Rajasthan Engineering Admission Process) handles B.Arch counselling for state government and private affiliated colleges in Rajasthan. NATA score or JEE Main Paper 2 is required. MNIT Jaipur B.Arch is admitted through JoSAA, not REAP. Application fee ₹590. Women horizontal reservation reported as 25% or 30% depending on year.',

  statusBanner: {
    label: '2026 schedule pending',
    detail: 'REAP typically opens registration in June after NATA results. Domain has historically rotated yearly (reap2025.com, reap2026.in).',
    expectedDate: 'June or July 2026',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on REAP 2025 cycle. Women reservation percentage and SC/ST quotas may shift per current GoR notification.',

  atAGlance: [
    { label: 'Entrance', value: 'NATA or JEE Paper 2' },
    { label: 'Application fee', value: '₹590' },
    { label: 'MNIT Jaipur B.Arch?', value: 'JoSAA only, not REAP' },
    { label: 'Women horizontal', value: '25% or 30% (verify)' },
    { label: 'Domain', value: 'Rotates yearly (reap2026.in)' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% reserved).',
    },
    {
      label: 'Entrance accepted',
      detail: 'NATA or JEE Main Paper 2. Both can be submitted.',
    },
    {
      label: 'Rajasthan domicile',
      detail: 'For state quota, parental Rajasthan domicile or qualifying examination from a Rajasthan board institution is required.',
    },
  ],

  dates: [
    { label: 'NATA Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'REAP registration opens', dateDisplay: 'June or July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 2 allotment', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
    { label: 'Spot round', dateDisplay: 'August or September 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'Is MNIT Jaipur B.Arch part of REAP?',
      answer: 'No. MNIT Jaipur is a CFTI and admits B.Arch via JoSAA only. REAP covers Rajasthan state colleges and private institutes.',
    },
    {
      question: 'Does REAP have its own B.Arch entrance?',
      answer: 'No. REAP uses NATA or JEE Main Paper 2 scores for B.Arch merit. There is no REAP-conducted Architecture paper.',
    },
    {
      question: 'How much is the REAP application fee?',
      answer: 'Approximately ₹590 for B.Arch counselling. Verify on the live REAP 2026 portal.',
    },
    {
      question: 'What is the women reservation in REAP?',
      answer: 'Rajasthan provides a horizontal reservation for women, reported as 25% or 30% depending on year. Verify in the live brochure.',
    },
    {
      question: 'Why does the REAP domain change every year?',
      answer: 'Rajasthan rotates the REAP domain yearly (reap2025.com, reap2026.in, etc.) to keep cycle-specific information separate. Always start from the official RTU Kota or DTE Rajasthan announcement.',
    },
    {
      question: 'When does REAP B.Arch counselling start?',
      answer: 'Typically June or July after NATA Phase 1 results. The 2026 dates will be on reap2026.in.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'REAP B.Arch 2026 Rajasthan: NATA + JEE P2, MNIT Jaipur (JoSAA)',
  seoDescription:
    'REAP B.Arch 2026 Rajasthan counselling: NATA or JEE Paper 2, ₹590 application fee, women horizontal 25-30%. MNIT Jaipur is JoSAA, not REAP. Domain reap2026.in.',
  seoKeywords: 'REAP B.Arch 2026, Rajasthan B.Arch admission, MNIT Jaipur B.Arch JoSAA, reap2026.in, RTU Kota B.Arch, Rajasthan NATA counselling',
};

export default reap;
