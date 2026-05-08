import type { CounsellingHubConfig } from './schema';

const uptac: CounsellingHubConfig = {
  slug: 'uptac-barch',
  title: 'UPTAC B.Arch Counselling 2026 (UP, AKTU)',
  shortName: 'UPTAC',
  authority: 'Dr. A.P.J. Abdul Kalam Technical University (AKTU)',
  authorityShort: 'AKTU',
  primaryUrl: 'https://uptac.admissions.nic.in',
  tier: 1,
  region: 'north',
  depth: 'standard',
  status: 'tbd',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Uttar Pradesh centralised B.Arch admission via uptac.admissions.nic.in. NATA priority, JEE Paper 2 secondary.',
  description:
    'UPTAC, conducted by AKTU (Dr. A.P.J. Abdul Kalam Technical University), runs the centralised B.Arch counselling for Uttar Pradesh. NATA score is given priority over JEE Paper 2 in merit calculation. UPCET (NTA) does NOT cover B.Arch. There is no tuition fee waiver under UPTAC for B.Arch (only for B.Tech, B.Pharm, MCA, MBA).',

  statusBanner: {
    label: '2026 schedule pending',
    detail: 'UPTAC typically opens registration in June after NATA Phase 1. Four main rounds plus sliding plus special plus spot.',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on UPTAC 2025 cycle. NATA-priority merit weighting and round structure expected to continue in 2026.',

  atAGlance: [
    { label: 'Entrance priority', value: 'NATA preferred, JEE P2 used if no NATA' },
    { label: 'UPCET used for B.Arch?', value: 'No' },
    { label: 'Rounds', value: '4 main + sliding + special + spot' },
    { label: 'Domicile rule', value: 'Parent UP domicile OR qualifying exam from UP' },
    { label: 'Tuition fee waiver', value: 'NOT for B.Arch' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% for reserved categories from UP).',
    },
    {
      label: 'Entrance accepted',
      detail: 'NATA score is the primary entrance. JEE Main Paper 2 is accepted as secondary. Submit both for maximum coverage.',
    },
    {
      label: 'Domicile or UP qualifying exam',
      detail: 'Either parent has UP domicile OR candidate has Class 12 qualifying examination from a UP-recognised institution.',
    },
  ],

  dates: [
    { label: 'NATA Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'UPTAC registration opens', dateDisplay: 'June 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 2 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 3 allotment', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
    { label: 'Round 4 / sliding', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
    { label: 'Special and spot rounds', dateDisplay: 'August or September 2026 (TBD)', status: 'tbd' },
  ],

  reservation: [
    { category: 'OPEN', percentage: 'Merit' },
    { category: 'SC', percentage: '21%' },
    { category: 'ST', percentage: '2%' },
    { category: 'OBC', percentage: '27%' },
    { category: 'EWS', percentage: '10%' },
    { category: 'PwD (horizontal)', percentage: '5%' },
    { category: 'Female (horizontal)', percentage: '20%' },
    { category: 'Defence (horizontal)', percentage: '5%' },
    { category: 'Freedom Fighter (horizontal)', percentage: '2%' },
  ],

  fees: [
    { label: 'UPTAC counselling fee, General', amount: '₹1,000 (verify 2026)' },
    { label: 'UPTAC counselling fee, SC/ST', amount: '₹500 (verify 2026)' },
    { label: 'Seat acceptance fee', amount: 'Approx ₹20,000', note: 'Adjusted against tuition at the institute' },
  ],

  topColleges: [
    {
      name: 'IET Lucknow Department of Architecture',
      city: 'Lucknow',
    },
    {
      name: 'Government College of Architecture',
      city: 'Lucknow',
    },
    {
      name: 'Bundelkhand Institute of Engineering and Technology',
      city: 'Jhansi',
    },
    {
      name: 'BBD University School of Architecture',
      city: 'Lucknow',
    },
    {
      name: 'Integral University Faculty of Architecture',
      city: 'Lucknow',
    },
    {
      name: 'Faculty of Architecture and Ekistics, Jamia Millia (NOT in UPTAC, central university)',
      city: 'New Delhi',
      cutoffNote: 'Jamia Millia admits B.Arch through its own admission test, not UPTAC',
    },
  ],

  gotchas: [
    {
      title: 'NATA is given priority over JEE Paper 2',
      detail: 'In UPTAC merit, NATA score is preferred. If both scores are submitted, NATA is used in merit calculation. Plan to take NATA seriously even if you have a strong JEE Paper 2.',
    },
    {
      title: 'No tuition fee waiver for B.Arch',
      detail: 'UPTAC offers tuition fee waiver only for B.Tech, B.Pharm, MCA, and MBA, NOT B.Arch. Many candidates assume it covers B.Arch and miss out on planning.',
    },
    {
      title: 'UPCET does not cover B.Arch',
      detail: 'UPCET, conducted by NTA, is for B.Tech and other engineering/pharmacy programs. For B.Arch use NATA or JEE Paper 2 directly.',
    },
    {
      title: 'IIT BHU and IIIT Allahabad do not offer B.Arch',
      detail: 'IIT BHU is in JoSAA for B.Tech only. IIIT Allahabad does not offer B.Arch. There is no IIT or IIIT B.Arch route in UP through UPTAC.',
    },
    {
      title: 'NIT Allahabad B.Arch is JoSAA',
      detail: 'MNNIT Allahabad B.Arch is via JoSAA, not UPTAC. UPTAC covers state and private colleges affiliated with AKTU.',
    },
  ],

  faqs: [
    {
      question: 'Does UPTAC accept JEE Main Paper 2?',
      answer: 'Yes, but NATA is given priority. If you have both, NATA is used in merit. JEE Paper 2 alone is accepted if NATA is not available.',
    },
    {
      question: 'Does UPCET cover B.Arch?',
      answer: 'No. UPCET (NTA) is for engineering, pharmacy, and other programs but not B.Arch. UPTAC B.Arch uses NATA or JEE Main Paper 2 directly.',
    },
    {
      question: 'Is there tuition fee waiver in UPTAC for B.Arch?',
      answer: 'No. The tuition fee waiver is for B.Tech, B.Pharm, MCA, and MBA only, not B.Arch.',
    },
    {
      question: 'Is MNNIT Allahabad B.Arch in UPTAC?',
      answer: 'No. MNNIT Allahabad is a CFTI and admits B.Arch through JoSAA. UPTAC does not allot MNNIT seats.',
    },
    {
      question: 'How is the domicile rule defined?',
      answer: 'Either parent has UP domicile OR the candidate has Class 12 qualifying examination from a UP-recognised institution. Either condition makes you eligible for state quota seats.',
    },
    {
      question: 'How many counselling rounds does UPTAC have?',
      answer: 'Four main rounds plus a sliding round plus a special round plus a spot round. Choice filling and reporting deadlines apply at each stage.',
    },
    {
      question: 'When does UPTAC B.Arch counselling start?',
      answer: 'Typically June after NATA Phase 1 results. The 2026 dates will be on uptac.admissions.nic.in.',
    },
    {
      question: 'Is Jamia Millia Faculty of Architecture in UPTAC?',
      answer: 'No. Jamia Millia is a central university in Delhi and admits B.Arch through its own admission process, not UPTAC.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'UPTAC B.Arch 2026: AKTU UP Counselling, NATA Priority',
  seoDescription:
    'UPTAC B.Arch counselling 2026 (Uttar Pradesh): AKTU, uptac.admissions.nic.in, NATA priority over JEE Paper 2, 4 main rounds, no tuition fee waiver for B.Arch. UPCET does not cover B.Arch.',
  seoKeywords: 'UPTAC 2026, AKTU B.Arch, UPTAC counselling, UP B.Arch admission, uptac.admissions.nic.in, IET Lucknow Architecture',
};

export default uptac;
