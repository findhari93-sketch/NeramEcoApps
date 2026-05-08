import type { CounsellingHubConfig } from './schema';

const ojee: CounsellingHubConfig = {
  slug: 'ojee-barch',
  title: 'OJEE B.Arch Counselling 2026 (Odisha)',
  shortName: 'OJEE',
  authority: 'Odisha Joint Entrance Examination Committee',
  authorityShort: 'OJEEC',
  primaryUrl: 'https://ojee.nic.in',
  tier: 2,
  region: 'east',
  depth: 'stub',
  status: 'live',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Odisha B.Arch via NATA or JEE Paper 2. CET Bhubaneswar (OUTR) is the top government option.',
  description:
    'OJEE itself does not test B.Arch. Odisha B.Arch admissions use NATA or JEE Main Paper 2 scores through OJEEC-coordinated counselling. CET Bhubaneswar (OUTR) is the top government option with ~20 seats and total fees around ₹2.84 lakh. NIT Rourkela B.Arch is via JoSAA, not OJEE. A December 2025 Odisha policy proposal would raise SC to 16.25%, ST to 22.5%, and add 11.25% SEBC, implementation pending.',

  statusBanner: {
    label: 'OJEE 2026 confirmed for May 4 to 9',
    detail: 'OJEE 2026 examination is May 4 through May 9. B.Arch counselling timing depends on state notification.',
    expectedDate: 'June or July 2026',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Reservation framework is in flux: a December 2025 Odisha PPB recommendation proposes SC 16.25%, ST 22.5%, SEBC 11.25%. Implementation pending state notification.',

  atAGlance: [
    { label: 'OJEE 2026 exam', value: 'May 4 to 9, 2026' },
    { label: 'Entrance', value: 'NATA or JEE Paper 2' },
    { label: 'OJEE B.Arch paper?', value: 'No' },
    { label: 'CET Bhubaneswar (OUTR)', value: '~20 seats, ₹2.84L total' },
    { label: 'NIT Rourkela B.Arch?', value: 'Yes, via JoSAA only' },
    { label: 'Reservation revision?', value: 'Pending Dec 2025 proposal' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% reserved).',
    },
    {
      label: 'Entrance accepted',
      detail: 'JEE Main Paper 2 score or NATA score. OJEE itself does NOT include an Architecture paper.',
    },
  ],

  dates: [
    { label: 'OJEE 2026', dateDisplay: 'May 4 to 9, 2026', dateIso: '2026-05-04', status: 'confirmed' },
    { label: 'OJEE result', dateDisplay: 'June 2026 (TBD)', status: 'expected' },
    { label: 'B.Arch counselling registration', dateDisplay: 'June or July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 2 allotment', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
    { label: 'Spot round', dateDisplay: 'August or September 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'Does OJEE include B.Arch?',
      answer: 'No. OJEE itself does not test for B.Arch. Odisha B.Arch admissions use JEE Main Paper 2 or NATA scores, with counselling coordinated by OJEEC.',
    },
    {
      question: 'Is NIT Rourkela B.Arch in OJEE?',
      answer: 'No. NIT Rourkela is a CFTI and admits B.Arch through JoSAA only.',
    },
    {
      question: 'What is the top government B.Arch college in Odisha?',
      answer: 'CET Bhubaneswar (OUTR) is the top government option with ~20 seats and total fees around ₹2.84 lakh for 5 years.',
    },
    {
      question: 'Is the Odisha reservation framework changing for 2026?',
      answer: 'A December 2025 Odisha Policy Planning Body recommendation proposes raising SC to 16.25%, ST to 22.5%, and introducing 11.25% SEBC. Implementation requires a state notification, current reservation may apply for 2026 unless the order is gazetted in time.',
    },
    {
      question: 'Are the JEE Advanced or AAT used in OJEE B.Arch?',
      answer: 'No. JEE Main Paper 2 or NATA is sufficient. JEE Advanced and AAT are not part of OJEE B.Arch counselling.',
    },
    {
      question: 'When is the OJEE 2026 exam?',
      answer: 'OJEE 2026 is scheduled for May 4 to May 9, 2026. Note OJEE itself does not have a B.Arch paper, so attending OJEE is not required for B.Arch admission in Odisha.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'OJEE B.Arch 2026 Odisha: CET Bhubaneswar, JEE P2 + NATA, OJEEC',
  seoDescription:
    'OJEE B.Arch 2026 Odisha: OJEE itself has no Architecture paper. Uses JEE Main Paper 2 or NATA. CET Bhubaneswar (OUTR) ₹2.84L total. NIT Rourkela is JoSAA. Reservation revision pending.',
  seoKeywords: 'OJEE B.Arch 2026, CET Bhubaneswar architecture, OUTR B.Arch, Odisha B.Arch admission, ojee.nic.in counselling, NIT Rourkela B.Arch',
};

export default ojee;
