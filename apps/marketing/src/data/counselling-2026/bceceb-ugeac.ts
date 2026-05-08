import type { CounsellingHubConfig } from './schema';

const bceceb: CounsellingHubConfig = {
  slug: 'bceceb-ugeac',
  title: 'BCECEB UGEAC B.Arch Counselling 2026 (Bihar)',
  shortName: 'BCECEB',
  authority: 'Bihar Combined Entrance Competitive Examination Board',
  authorityShort: 'BCECEB',
  primaryUrl: 'https://bceceboard.bihar.gov.in',
  tier: 3,
  region: 'east',
  depth: 'stub',
  status: 'tbd',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Bihar UGEAC B.Arch counselling. Only Gaya College of Engineering offers B.Arch. NIT Patna is JoSAA. Counselling is OFFLINE for B.Arch.',
  description:
    'BCECEB UGEAC handles state-side B.Arch admission in Bihar. Only Gaya College of Engineering offers B.Arch through state counselling. NIT Patna B.Arch routes via JoSAA, not BCECEB. The B.Arch counselling is conducted offline (distinct from the online B.Tech UGEAC). Per Patna High Court ruling in June 2024, Bihar reverted to the 50% plus 10% reservation framework.',

  statusBanner: {
    label: '2026 schedule pending',
    detail: 'BCECEB B.Arch counselling typically opens after NATA results in July or August.',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Bihar reservation reverted to 50%+10% (50% communal + 10% EWS) per Patna HC ruling in June 2024.',

  atAGlance: [
    { label: 'Sole state institute', value: 'Gaya College of Engineering' },
    { label: 'NIT Patna B.Arch?', value: 'JoSAA only' },
    { label: 'Counselling mode', value: 'Offline (B.Arch only)' },
    { label: 'B.Tech UGEAC', value: 'Online (separate)' },
    { label: 'Reservation framework', value: '50% communal + 10% EWS' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% reserved).',
    },
    {
      label: 'Entrance accepted',
      detail: 'NATA score or JEE Main Paper 2 score.',
    },
  ],

  dates: [
    { label: 'NATA Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'UGEAC B.Arch notification', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Offline counselling rounds', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'Which Bihar college offers B.Arch through BCECEB?',
      answer: 'Only Gaya College of Engineering offers B.Arch through Bihar state counselling. NIT Patna is the prestigious option but it is admitted via JoSAA, not BCECEB.',
    },
    {
      question: 'Is the B.Arch counselling online or offline?',
      answer: 'B.Arch counselling under BCECEB UGEAC is offline. This is distinct from the B.Tech UGEAC which is online. Plan to attend the counselling venue physically.',
    },
    {
      question: 'What is the Bihar reservation framework?',
      answer: 'Bihar reverted to 50% communal reservation plus 10% EWS after the Patna High Court ruling in June 2024.',
    },
    {
      question: 'Should I rely only on BCECEB for Bihar B.Arch?',
      answer: 'No. Given that only one state college offers B.Arch through BCECEB, candidates aiming for a high-quality B.Arch should target NIT Patna via JoSAA and other national counsellings as primary.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'BCECEB UGEAC B.Arch 2026 Bihar: Gaya College, NIT Patna JoSAA',
  seoDescription:
    'Bihar BCECEB UGEAC B.Arch 2026: only Gaya College of Engineering, NIT Patna is JoSAA. Offline counselling for B.Arch. 50% communal + 10% EWS reservation.',
  seoKeywords: 'BCECEB B.Arch 2026, Bihar B.Arch, UGEAC B.Arch, Gaya College of Engineering, NIT Patna B.Arch JoSAA, bceceboard',
};

export default bceceb;
