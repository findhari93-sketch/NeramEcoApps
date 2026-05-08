import type { CounsellingHubConfig } from './schema';

const jacDelhi: CounsellingHubConfig = {
  slug: 'jac-delhi-barch',
  title: 'JAC Delhi B.Arch Counselling 2026',
  shortName: 'JAC Delhi',
  authority: 'Joint Admission Counselling Delhi (DTU + NSUT + IIITD + IGDTUW)',
  authorityShort: 'JAC Delhi',
  primaryUrl: 'https://jacdelhi.admissions.nic.in',
  tier: 1,
  region: 'north',
  depth: 'standard',
  status: 'tbd',
  examRoutes: ['JEE_P2'],

  tagline: 'Delhi state B.Arch counselling. Essentially IGDTUW (women-only) for B.Arch.',
  description:
    'JAC Delhi runs joint counselling for DTU, NSUT, IIITD, and IGDTUW. For B.Arch specifically, the offering is essentially IGDTUW (women-only). NSUT B.Arch via JAC was discontinued in recent years. SPA Delhi is via JoSAA, not JAC. JEE Main Paper 2 only is accepted, NATA is not used. Region split: 85% Delhi + 15% Outside Delhi.',

  statusBanner: {
    label: '2026 brochure pending',
    detail: 'JAC Delhi typically opens registration in June after JEE Main Session 2 results. Registration fee is flat ₹1,500 for all categories.',
    expectedDate: 'June 2026',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on JAC Delhi 2025 cycle. The widely reported "₹500 SC/ST" registration fee is incorrect, JAC Delhi 2025 charged a flat ₹1,500.',

  atAGlance: [
    { label: 'B.Arch institutes', value: 'IGDTUW (women-only)' },
    { label: 'Entrance', value: 'JEE Main Paper 2 only' },
    { label: 'NATA accepted?', value: 'No' },
    { label: 'Delhi region quota', value: '85%' },
    { label: 'Outside Delhi quota', value: '15%' },
    { label: 'Registration fee', value: '₹1,500 flat (all categories)' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate.',
    },
    {
      label: 'Entrance accepted',
      detail: 'JEE Main Paper 2A (B.Arch) score is mandatory. NATA is NOT accepted by JAC Delhi for any institute.',
    },
    {
      label: 'IGDTUW women-only',
      detail: 'Indira Gandhi Delhi Technical University for Women (IGDTUW) is a women-only institute. Male candidates cannot apply for B.Arch through JAC Delhi as IGDTUW is essentially the only B.Arch option in JAC Delhi 2025.',
    },
    {
      label: 'Delhi region eligibility',
      detail: 'For 85% Delhi region quota, candidate must have completed Class 10 and Class 12 from a Delhi-recognised institution. Outside Delhi candidates compete in the 15% pool.',
    },
  ],

  dates: [
    { label: 'JEE Main Session 2 result', dateDisplay: 'April 2026', status: 'expected' },
    { label: 'JAC Delhi registration', dateDisplay: 'June 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 2 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 3 / spot', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
  ],

  reservation: [
    { category: 'OPEN', percentage: 'Merit' },
    { category: 'SC', percentage: '15%' },
    { category: 'ST', percentage: '7.5%' },
    { category: 'OBC-NCL', percentage: '27%' },
    { category: 'EWS', percentage: '10%' },
    { category: 'Delhi Region', percentage: '85%' },
    { category: 'Outside Delhi Region', percentage: '15%' },
    { category: 'PwD (horizontal)', percentage: '5%' },
    { category: 'Defence (horizontal)', percentage: '5%' },
  ],

  fees: [
    { label: 'JAC Delhi registration', amount: '₹1,500', note: 'Flat for all categories in 2025, expected to continue' },
    { label: 'Seat acceptance fee', amount: '~₹40,000 (verify 2026)' },
    { label: 'IGDTUW annual fees', amount: 'Approx ₹1.45 lakh per year' },
  ],

  topColleges: [
    {
      name: 'Indira Gandhi Delhi Technical University for Women (IGDTUW), Department of Architecture',
      city: 'New Delhi',
      intake: 35,
      cutoffNote: '2025 Round 1 General closing: CRL ~1,954 (JEE Main Paper 2A) for Delhi region. Women-only institute.',
      url: 'https://igdtuw.ac.in',
    },
    {
      name: 'NSUT B.Arch (discontinued/limited via JAC)',
      city: 'New Delhi',
      cutoffNote: 'NSUT B.Arch admission via JAC has been discontinued or limited in recent years. Verify in 2026 brochure.',
    },
  ],

  gotchas: [
    {
      title: 'JAC Delhi B.Arch is essentially IGDTUW only',
      detail: 'NSUT B.Arch via JAC has been discontinued or limited. SPA Delhi is via JoSAA, not JAC. DTU does not offer B.Arch. So the only viable B.Arch option through JAC Delhi 2025 was IGDTUW, which is women-only.',
    },
    {
      title: 'NATA is NOT accepted',
      detail: 'JAC Delhi accepts JEE Main Paper 2 only for B.Arch. Even if you have a top NATA score, you cannot use it for JAC Delhi.',
    },
    {
      title: 'SPA Delhi is in JoSAA, not JAC Delhi',
      detail: 'School of Planning and Architecture, Delhi (most competitive B.Arch in India) is a CFTI and admits via JoSAA, never through JAC Delhi.',
    },
    {
      title: 'Registration fee is flat ₹1,500',
      detail: 'JAC Delhi 2025 charged ₹1,500 for ALL categories including SC/ST. The widely cited ₹500 reduction for SC/ST does not apply.',
    },
    {
      title: 'Male candidates cannot get B.Arch through JAC Delhi',
      detail: 'IGDTUW is women-only. Without other functioning B.Arch options through JAC Delhi 2025, male candidates targeting Delhi B.Arch should look at JoSAA (SPA Delhi) or apply to private colleges directly.',
    },
  ],

  faqs: [
    {
      question: 'Does JAC Delhi accept NATA?',
      answer: 'No. JAC Delhi accepts JEE Main Paper 2 only for B.Arch. NATA is not used at any JAC Delhi institute.',
    },
    {
      question: 'Is SPA Delhi part of JAC Delhi?',
      answer: 'No. SPA Delhi is a Centrally Funded Technical Institute and admits via JoSAA. To target SPA Delhi, you need JEE Main Paper 2 and apply through JoSAA, not JAC Delhi.',
    },
    {
      question: 'Why is JAC Delhi B.Arch limited to IGDTUW?',
      answer: 'NSUT B.Arch admission via JAC was discontinued or restricted. DTU does not offer B.Arch. IIITD does not offer B.Arch. That leaves IGDTUW (women-only) as the practical B.Arch option through JAC Delhi.',
    },
    {
      question: 'Can male candidates apply to JAC Delhi B.Arch?',
      answer: 'In 2025, the only functional B.Arch option in JAC Delhi was IGDTUW, which is women-only. Male candidates should target SPA Delhi (via JoSAA) or other Delhi private colleges directly.',
    },
    {
      question: 'What was the IGDTUW B.Arch closing rank?',
      answer: '2025 Round 1 General closing rank for the Delhi region was approximately CRL 1,954 (JEE Main Paper 2A). Outside Delhi closing was higher (more competitive).',
    },
    {
      question: 'Is the JAC Delhi registration fee ₹500 for SC/ST?',
      answer: 'No. JAC Delhi 2025 charged a flat ₹1,500 for all categories. The reduced SC/ST fee that some aggregators report is incorrect.',
    },
    {
      question: 'When does JAC Delhi B.Arch counselling start?',
      answer: 'Typically June after JEE Main Session 2 results. The 2026 dates will be on jacdelhi.admissions.nic.in.',
    },
    {
      question: 'How is the 85:15 Delhi region split applied?',
      answer: '85% of B.Arch seats are reserved for candidates who completed Class 10 and Class 12 from Delhi-recognised institutions. The remaining 15% is open to candidates from outside Delhi.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'JAC Delhi B.Arch 2026: IGDTUW Cutoff, JEE Paper 2, Women-Only',
  seoDescription:
    'JAC Delhi B.Arch counselling 2026: IGDTUW (women-only), JEE Main Paper 2 only (no NATA), 85% Delhi + 15% outside, ₹1,500 flat registration. SPA Delhi is JoSAA, not JAC.',
  seoKeywords: 'JAC Delhi B.Arch 2026, IGDTUW B.Arch cutoff, women only architecture college Delhi, JAC Delhi registration fee, SPA Delhi JoSAA',
};

export default jacDelhi;
