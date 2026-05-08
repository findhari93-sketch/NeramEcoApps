import type { CounsellingHubConfig } from './schema';

const vmsb: CounsellingHubConfig = {
  slug: 'vmsb-utu-barch',
  title: 'VMSB-UTU B.Arch Counselling 2026 (Uttarakhand)',
  shortName: 'VMSB-UTU',
  authority: 'Uttarakhand Technical University (Veer Madho Singh Bhandari)',
  authorityShort: 'UTU',
  primaryUrl: 'https://uktech.ac.in',
  tier: 3,
  region: 'north',
  depth: 'stub',
  status: 'tbd',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Uttarakhand B.Arch via NATA or JEE Paper 2. UKSEE was discontinued in 2023. IIT Roorkee is JoSAA.',
  description:
    'VMSB-UTU runs B.Arch counselling for state and affiliated colleges in Uttarakhand. UKSEE (Uttarakhand state engineering entrance) was discontinued in 2023. Admissions now use NATA or JEE Main Paper 2 plus counselling. IIT Roorkee B.Arch routes via JoSAA (using JEE Advanced plus AAT), not UTU.',

  statusBanner: {
    label: '2026 schedule pending',
    detail: 'VMSB-UTU typically opens registration in June or July after NATA Phase 1 results.',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on VMSB-UTU 2025 cycle. UKSEE has been discontinued, NATA and JEE Paper 2 are now the only routes.',

  atAGlance: [
    { label: 'UKSEE B.Arch?', value: 'Discontinued in 2023' },
    { label: 'Entrance', value: 'NATA or JEE Paper 2' },
    { label: 'IIT Roorkee B.Arch?', value: 'JoSAA only (JEE Adv + AAT)' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% reserved).',
    },
    {
      label: 'Entrance accepted',
      detail: 'NATA score or JEE Main Paper 2. UKSEE is no longer available.',
    },
  ],

  dates: [
    { label: 'NATA Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'UTU registration', dateDisplay: 'June or July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July or August 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'Is UKSEE still conducted for B.Arch?',
      answer: 'No. UKSEE was discontinued in 2023. Admissions now use NATA or JEE Main Paper 2.',
    },
    {
      question: 'Is IIT Roorkee B.Arch in VMSB-UTU?',
      answer: 'No. IIT Roorkee admits B.Arch through JoSAA only, using JEE Advanced plus AAT. UTU does not allot IIT Roorkee seats.',
    },
    {
      question: 'When does VMSB-UTU B.Arch counselling start?',
      answer: 'Typically June or July after NATA Phase 1 results.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'VMSB-UTU B.Arch 2026 Uttarakhand: NATA + JEE P2, IIT Roorkee JoSAA',
  seoDescription:
    'VMSB-UTU B.Arch 2026 Uttarakhand: UKSEE discontinued in 2023, NATA or JEE Paper 2 only. IIT Roorkee is JoSAA via JEE Advanced plus AAT.',
  seoKeywords: 'VMSB UTU B.Arch 2026, Uttarakhand B.Arch, UKSEE discontinued, IIT Roorkee B.Arch JoSAA, uktech.ac.in',
};

export default vmsb;
