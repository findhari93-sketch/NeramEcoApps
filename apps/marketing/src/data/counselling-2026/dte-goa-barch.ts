import type { CounsellingHubConfig } from './schema';

const dteGoa: CounsellingHubConfig = {
  slug: 'dte-goa-barch',
  title: 'DTE Goa B.Arch Counselling 2026',
  shortName: 'DTE Goa',
  authority: 'DTE Goa',
  authorityShort: 'DTE Goa',
  primaryUrl: 'https://dte.goa.gov.in',
  tier: 3,
  region: 'west',
  depth: 'stub',
  status: 'tbd',
  examRoutes: ['NATA'],

  tagline: 'Goa has a single CoA-recognised B.Arch college: GCA Panaji. NATA only. 40 + 4 supernumerary seats.',
  description:
    'DTE Goa runs B.Arch admission for the single CoA-recognised college in the state, Goa College of Architecture (GCA), Panaji. NATA score is required. Total intake is 40 plus 4 supernumerary seats. Total programme fees are around ₹3.04 lakh for 5 years, making it among the most affordable B.Arch options in India.',

  statusBanner: {
    label: '2026 schedule pending',
    detail: 'DTE Goa typically opens registration in June or July after NATA Phase 1 results.',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on DTE Goa 2025 cycle.',

  atAGlance: [
    { label: 'Sole CoA-recognised college', value: 'GCA Panaji' },
    { label: 'Intake', value: '40 + 4 supernumerary' },
    { label: 'Total programme fees', value: '₹3.04 lakh (5 years)' },
    { label: 'Entrance', value: 'NATA only' },
    { label: 'JEE Paper 2 accepted?', value: 'Verify in 2026 brochure' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% reserved).',
    },
    {
      label: 'Entrance accepted',
      detail: 'NATA score is required. Verify the 2026 brochure for any expansion to JEE Paper 2 acceptance.',
    },
  ],

  dates: [
    { label: 'NATA Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'DTE Goa registration', dateDisplay: 'June or July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'How many B.Arch colleges are in Goa?',
      answer: 'Only one CoA-recognised B.Arch college: Goa College of Architecture (GCA) in Panaji. Total intake is 40 plus 4 supernumerary seats.',
    },
    {
      question: 'How much does GCA Panaji cost?',
      answer: 'Approximately ₹3.04 lakh for the full 5-year B.Arch programme. Among the most affordable options.',
    },
    {
      question: 'Does DTE Goa accept JEE Main Paper 2?',
      answer: 'NATA is the primary entrance. Verify the 2026 brochure for any acceptance of JEE Paper 2.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'DTE Goa B.Arch 2026: GCA Panaji, NATA, ₹3.04L Total Fees',
  seoDescription:
    'DTE Goa B.Arch 2026: Goa College of Architecture (GCA) Panaji, NATA only, 40 plus 4 supernumerary seats, ₹3.04 lakh total programme fees for 5 years.',
  seoKeywords: 'DTE Goa B.Arch 2026, GCA Panaji, Goa College of Architecture, Goa NATA admission, dte.goa.gov.in',
};

export default dteGoa;
