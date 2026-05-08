import type { CounsellingHubConfig } from './schema';

const ikgptu: CounsellingHubConfig = {
  slug: 'ikgptu-barch',
  title: 'IKGPTU B.Arch Counselling 2026 (Punjab)',
  shortName: 'IKGPTU',
  authority: 'I.K. Gujral Punjab Technical University',
  authorityShort: 'IKGPTU',
  primaryUrl: 'https://ptu.ac.in',
  tier: 2,
  region: 'north',
  depth: 'stub',
  status: 'tbd',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Punjab state B.Arch counselling. 85% Punjab + 15% other state. PEC, CCA, GNDU admit outside IKGPTU.',
  description:
    'IKGPTU runs centralised B.Arch counselling for affiliated state and private colleges. NATA or JEE Main Paper 2 is accepted. 85% Punjab quota plus 15% other state. Counselling fee ₹2,000 per course. PEC, CCA Chandigarh, GNDU, LPU, Chandigarh University, and Chitkara University all admit B.Arch outside IKGPTU. SC reservation is 25% with sub-classification under the post-2024 Davinder Singh Constitution Bench framework.',

  statusBanner: {
    label: '2026 schedule pending',
    detail: 'IKGPTU typically opens registration in July after NATA results.',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'SC reservation sub-classification follows the post-2024 Davinder Singh Constitution Bench framework, exact internal split per Punjab GO.',

  atAGlance: [
    { label: 'Punjab quota', value: '85%' },
    { label: 'Other state quota', value: '15%' },
    { label: 'Counselling fee per course', value: '₹2,000' },
    { label: 'SC reservation', value: '25% (with sub-classification)' },
    { label: 'Major non-IKGPTU institutes', value: 'PEC, CCA, GNDU, LPU, Chandigarh University, Chitkara' },
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
  ],

  dates: [
    { label: 'NATA Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'IKGPTU registration', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July or August 2026 (TBD)', status: 'tbd' },
    { label: 'Round 2 allotment', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
    { label: 'Spot round', dateDisplay: 'September 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'Are PEC and Chandigarh College of Architecture in IKGPTU?',
      answer: 'No. PEC Chandigarh, Chandigarh College of Architecture (Sector 12), and GNDU all admit B.Arch outside IKGPTU. CCA is in JAC Chandigarh.',
    },
    {
      question: 'Is LPU or Chitkara in IKGPTU?',
      answer: 'No. LPU, Chitkara University, and Chandigarh University admit B.Arch through their own admission processes, not IKGPTU.',
    },
    {
      question: 'How much is the IKGPTU counselling fee?',
      answer: 'Approximately ₹2,000 per course. Verify on the live IKGPTU notification.',
    },
    {
      question: 'What is the SC reservation in Punjab?',
      answer: '25% SC reservation with internal sub-classification under the post-2024 Davinder Singh Constitution Bench framework. The exact internal split is per the Punjab government order in force.',
    },
    {
      question: 'When does IKGPTU B.Arch counselling start?',
      answer: 'Typically July after NATA Phase 1 results. Watch ptu.ac.in for the 2026 schedule.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'IKGPTU B.Arch 2026 Punjab: NATA + JEE P2, ₹2,000 Counselling Fee',
  seoDescription:
    'IKGPTU B.Arch 2026 Punjab counselling: 85% state + 15% other, NATA or JEE Paper 2, ₹2,000 per course fee. PEC, CCA, GNDU, LPU admit outside IKGPTU. SC 25% with sub-classification.',
  seoKeywords: 'IKGPTU B.Arch 2026, Punjab Technical University B.Arch, PEC Chandigarh B.Arch, ptu.ac.in admission, Punjab SC reservation Davinder Singh',
};

export default ikgptu;
