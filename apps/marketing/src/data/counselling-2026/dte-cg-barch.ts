import type { CounsellingHubConfig } from './schema';

const dteCG: CounsellingHubConfig = {
  slug: 'dte-cg-barch',
  title: 'DTE Chhattisgarh B.Arch Counselling 2026',
  shortName: 'DTE-CG',
  authority: 'DTE Chhattisgarh / CG Vyapam',
  authorityShort: 'DTE-CG',
  primaryUrl: 'https://cgdte.admissions.nic.in',
  tier: 3,
  region: 'central',
  depth: 'stub',
  status: 'tbd',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Chhattisgarh B.Arch via NATA or JEE Paper 2. Most state pool is Amity Raipur and small private colleges.',
  description:
    'DTE Chhattisgarh runs B.Arch counselling for state and affiliated private colleges. CG-PET (the state engineering entrance) does NOT include B.Arch. NATA or JEE Main Paper 2 score is required. Most of the state pool is Amity Raipur and small private institutes. NIT Raipur B.Arch routes via JoSAA, not DTE-CG. IIT Bhilai does NOT offer B.Arch.',

  statusBanner: {
    label: '2026 schedule pending',
    detail: 'DTE-CG typically opens registration in July after NATA Phase 1 results.',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on DTE-CG 2025 cycle.',

  atAGlance: [
    { label: 'CG-PET B.Arch?', value: 'No' },
    { label: 'Entrance', value: 'NATA or JEE Paper 2' },
    { label: 'NIT Raipur B.Arch?', value: 'JoSAA only' },
    { label: 'IIT Bhilai B.Arch?', value: 'No' },
    { label: 'Major institutes', value: 'Amity Raipur + small private colleges' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% reserved).',
    },
    {
      label: 'Entrance accepted',
      detail: 'NATA score or JEE Main Paper 2. CG-PET does NOT include B.Arch.',
    },
  ],

  dates: [
    { label: 'NATA Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'DTE-CG registration', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July or August 2026 (TBD)', status: 'tbd' },
    { label: 'Round 2 allotment', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'Does CG-PET cover B.Arch?',
      answer: 'No. CG-PET is for engineering and other programs. B.Arch in Chhattisgarh uses NATA or JEE Main Paper 2 only.',
    },
    {
      question: 'Is NIT Raipur B.Arch in DTE-CG?',
      answer: 'No. NIT Raipur is a CFTI and admits B.Arch through JoSAA only.',
    },
    {
      question: 'Does IIT Bhilai offer B.Arch?',
      answer: 'No. IIT Bhilai does not offer B.Arch.',
    },
    {
      question: 'What is the main B.Arch college in Chhattisgarh state pool?',
      answer: 'Amity University Raipur is among the larger participating colleges. Most of the state pool is small private institutes. The high-quality option (NIT Raipur) is via JoSAA.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'DTE Chhattisgarh B.Arch 2026: NATA + JEE P2, Amity Raipur',
  seoDescription:
    'DTE-CG B.Arch counselling 2026: NATA or JEE Paper 2 (CG-PET does not cover B.Arch). NIT Raipur is JoSAA. IIT Bhilai has no B.Arch. Amity Raipur and small private colleges in state pool.',
  seoKeywords: 'DTE Chhattisgarh B.Arch 2026, CG B.Arch admission, NIT Raipur B.Arch JoSAA, Amity Raipur Architecture, CG-PET B.Arch',
};

export default dteCG;
