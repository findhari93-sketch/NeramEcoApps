import type { CounsellingHubConfig } from './schema';

const dteAssam: CounsellingHubConfig = {
  slug: 'dte-assam-barch',
  title: 'DTE Assam B.Arch Counselling 2026',
  shortName: 'DTE Assam',
  authority: 'DTE Assam / ASTU',
  authorityShort: 'DTE Assam',
  primaryUrl: 'https://dte.assam.gov.in',
  tier: 3,
  region: 'east',
  depth: 'stub',
  status: 'live',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Assam B.Arch counselling. Assam CEE 2026 confirmed for June 14. NIT Silchar is JoSAA only.',
  description:
    'DTE Assam runs the centralised B.Arch counselling for state and ASTU-affiliated colleges. Assam CEE 2026 is confirmed for June 14, 2026. NATA or JEE Main Paper 2 score is also accepted. Outside Assam, most Northeast states have zero or one B.Arch institute. NIT Silchar B.Arch routes via JoSAA only. CSAB-NEUT is the cross-state route for AICTE seats for NE candidates.',

  statusBanner: {
    label: 'Assam CEE 2026 confirmed for June 14',
    detail: 'Assam CEE is on June 14, 2026. B.Arch counselling timing depends on state notification thereafter.',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on DTE Assam 2025 cycle plus confirmed Assam CEE 2026 date.',

  atAGlance: [
    { label: 'Assam CEE 2026', value: 'June 14, 2026' },
    { label: 'Entrance accepted', value: 'NATA, JEE Paper 2, Assam CEE' },
    { label: 'NIT Silchar B.Arch?', value: 'JoSAA only' },
    { label: 'CSAB-NEUT', value: 'Cross-state route for NE candidates' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% reserved).',
    },
    {
      label: 'Entrance accepted',
      detail: 'NATA, JEE Main Paper 2, or Assam CEE per the operative DTE notification.',
    },
  ],

  dates: [
    { label: 'Assam CEE 2026', dateDisplay: 'June 14, 2026', dateIso: '2026-06-14', status: 'confirmed' },
    { label: 'NATA Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'B.Arch counselling registration', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'When is Assam CEE 2026?',
      answer: 'Assam CEE 2026 is confirmed for June 14, 2026.',
    },
    {
      question: 'Is NIT Silchar B.Arch in DTE Assam counselling?',
      answer: 'No. NIT Silchar B.Arch is admitted through JoSAA only.',
    },
    {
      question: 'Can I get a Northeast B.Arch seat from outside Assam?',
      answer: 'Outside Assam, most Northeast states have zero or one B.Arch institute. CSAB-NEUT is the cross-state route for AICTE seats for candidates from 8 NE states (and 5 UTs) to access seats in other states.',
    },
    {
      question: 'Is Assam CEE required for B.Arch?',
      answer: 'Per the operative DTE notification, NATA, JEE Main Paper 2, or Assam CEE may be used. Verify the 2026 brochure for the exact entrance acceptance for B.Arch.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'DTE Assam B.Arch 2026: Assam CEE June 14, NIT Silchar JoSAA',
  seoDescription:
    'DTE Assam B.Arch counselling 2026: Assam CEE confirmed June 14, NATA and JEE Paper 2 also accepted. NIT Silchar is JoSAA only. CSAB-NEUT for cross-state NE seats.',
  seoKeywords: 'DTE Assam B.Arch 2026, Assam CEE 2026, NIT Silchar B.Arch JoSAA, ASTU architecture, CSAB-NEUT NE',
};

export default dteAssam;
