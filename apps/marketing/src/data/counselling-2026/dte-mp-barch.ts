import type { CounsellingHubConfig } from './schema';

const dteMP: CounsellingHubConfig = {
  slug: 'dte-mp-barch',
  title: 'DTE-MP B.Arch Counselling 2026 (Madhya Pradesh)',
  shortName: 'DTE-MP',
  authority: 'DTE Madhya Pradesh / MP Online',
  authorityShort: 'DTE-MP',
  primaryUrl: 'https://dte.mponline.gov.in',
  tier: 2,
  region: 'central',
  depth: 'stub',
  status: 'tbd',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Madhya Pradesh B.Arch counselling. 90% MP domicile, OBC reservation under court interim 87:13.',
  description:
    'DTE Madhya Pradesh runs centralised B.Arch counselling for state and private colleges. NATA or JEE Main Paper 2 is accepted. 90% of seats are reserved for MP-domiciled candidates. OBC reservation is in active Supreme Court litigation, currently operating under an interim 87:13 formula (14% effective OBC) until the verdict in Shivam Gautam v. State of MP, 2025. SPA Bhopal is JoSAA, not DTE-MP.',

  statusBanner: {
    label: '2026 schedule pending',
    detail: 'DTE-MP typically opens registration in June or July. OBC reservation may change pending court verdict.',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'OBC reservation in MP is operating under interim 87:13 (14% effective). The 27% notified figure is pending Shivam Gautam v. State of MP verdict.',

  atAGlance: [
    { label: 'MP domicile quota', value: '90%' },
    { label: 'All India quota', value: '10%' },
    { label: 'Entrance', value: 'NATA or JEE Paper 2' },
    { label: 'OBC reservation', value: '14% interim (27% pending verdict)' },
    { label: 'SPA Bhopal in DTE-MP?', value: 'No, JoSAA only' },
    { label: 'NIT Bhopal B.Arch?', value: 'JoSAA only' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% reserved).',
    },
    {
      label: 'Entrance accepted',
      detail: 'NATA score or JEE Main Paper 2 score. Both can be submitted.',
    },
    {
      label: 'MP domicile',
      detail: 'For 90% state quota, parental domicile or qualifying examination from MP-recognised institution.',
    },
  ],

  dates: [
    { label: 'NATA Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'DTE-MP registration', dateDisplay: 'June or July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 2 allotment', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
    { label: 'Spot round', dateDisplay: 'August or September 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'Is SPA Bhopal in DTE-MP counselling?',
      answer: 'No. SPA Bhopal (School of Planning and Architecture, Bhopal) is a CFTI and admits B.Arch via JoSAA only.',
    },
    {
      question: 'Is NIT Bhopal B.Arch in DTE-MP?',
      answer: 'No. MANIT Bhopal B.Arch is admitted through JoSAA only. DTE-MP covers state and private affiliated colleges.',
    },
    {
      question: 'What is the OBC reservation in DTE-MP?',
      answer: 'OBC reservation in MP is in active Supreme Court litigation. Currently the interim 87:13 formula gives 14% effective OBC reservation. The 27% notified figure is pending the Shivam Gautam v. State of MP verdict.',
    },
    {
      question: 'How is the MP domicile defined?',
      answer: 'MP domicile is established through parental Madhya Pradesh domicile certificate or by completing the qualifying examination from an MP-recognised institution.',
    },
    {
      question: 'When does DTE-MP B.Arch counselling start?',
      answer: 'Typically June or July after NATA Phase 1 results. Watch dte.mponline.gov.in for the 2026 schedule.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'DTE-MP B.Arch 2026 Madhya Pradesh: NATA, JEE P2, OBC 87:13',
  seoDescription:
    'DTE Madhya Pradesh B.Arch counselling 2026: 90% MP domicile, NATA or JEE Paper 2, OBC reservation under court interim 87:13. SPA Bhopal and MANIT Bhopal are JoSAA, not DTE-MP.',
  seoKeywords: 'DTE-MP B.Arch 2026, MP B.Arch admission, SPA Bhopal JoSAA, MANIT Bhopal B.Arch, dte.mponline, MP OBC reservation court',
};

export default dteMP;
