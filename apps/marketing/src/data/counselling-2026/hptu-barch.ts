import type { CounsellingHubConfig } from './schema';

const hptu: CounsellingHubConfig = {
  slug: 'hptu-barch',
  title: 'HPTU B.Arch Counselling 2026 (Himachal Pradesh)',
  shortName: 'HPTU',
  authority: 'HP Technical University',
  authorityShort: 'HPTU',
  primaryUrl: 'https://himtu.ac.in',
  tier: 3,
  region: 'north',
  depth: 'stub',
  status: 'live',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Himachal Pradesh B.Arch counselling. HPCET 2026 on May 9-10. ~4 B.Arch colleges in the state.',
  description:
    'HPTU runs B.Arch counselling for state and affiliated colleges in Himachal Pradesh. HPCET 2026 is confirmed for May 9-10. NATA or JEE Main Paper 2 also accepted. Approximately 4 B.Arch colleges in the state. NIT Hamirpur and IIT Mandi do NOT offer B.Arch.',

  statusBanner: {
    label: 'HPCET 2026 confirmed for May 9-10',
    detail: 'HPCET is on May 9-10, 2026. B.Arch counselling timing depends on HPTU notification thereafter.',
    expectedDate: 'June 2026',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on HPTU 2025 cycle plus confirmed HPCET 2026 dates.',

  atAGlance: [
    { label: 'HPCET 2026', value: 'May 9-10, 2026' },
    { label: 'Entrance accepted', value: 'NATA, JEE Paper 2, HPCET' },
    { label: 'B.Arch colleges in HP', value: '~4' },
    { label: 'NIT Hamirpur B.Arch?', value: 'No' },
    { label: 'IIT Mandi B.Arch?', value: 'No' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% reserved).',
    },
    {
      label: 'Entrance accepted',
      detail: 'NATA, JEE Main Paper 2, or HPCET per HPTU notification.',
    },
  ],

  dates: [
    { label: 'HPCET 2026', dateDisplay: 'May 9-10, 2026', dateIso: '2026-05-09', status: 'confirmed' },
    { label: 'HPCET result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'B.Arch counselling registration', dateDisplay: 'June 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'When is HPCET 2026?',
      answer: 'HPCET 2026 is confirmed for May 9 and May 10, 2026.',
    },
    {
      question: 'Does NIT Hamirpur offer B.Arch?',
      answer: 'No. NIT Hamirpur is in JoSAA for B.Tech only. There is no NIT B.Arch in Himachal Pradesh.',
    },
    {
      question: 'Does IIT Mandi offer B.Arch?',
      answer: 'No. IIT Mandi does not offer B.Arch.',
    },
    {
      question: 'How many B.Arch colleges are in Himachal Pradesh?',
      answer: 'Approximately 4 B.Arch colleges in the state, including state and private institutes affiliated to HPTU.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'HPTU B.Arch 2026 Himachal: HPCET May 9-10, NIT Hamirpur No B.Arch',
  seoDescription:
    'HPTU B.Arch counselling 2026 Himachal Pradesh: HPCET confirmed May 9-10, NATA and JEE Paper 2 also accepted. ~4 B.Arch colleges. NIT Hamirpur and IIT Mandi have no B.Arch.',
  seoKeywords: 'HPTU B.Arch 2026, HPCET 2026, NIT Hamirpur B.Arch, IIT Mandi B.Arch, Himachal Pradesh architecture admission',
};

export default hptu;
