import type { CounsellingHubConfig } from './schema';

const acpc: CounsellingHubConfig = {
  slug: 'acpc-barch',
  title: 'ACPC B.Arch Counselling 2026 (Gujarat)',
  shortName: 'ACPC',
  authority: 'Admission Committee for Professional Courses, Gujarat',
  authorityShort: 'ACPC',
  primaryUrl: 'https://gujacpc.admissions.nic.in',
  tier: 1,
  region: 'west',
  depth: 'standard',
  status: 'tbd',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Gujarat centralised B.Arch admission. 75% home-state plus 25% all-India quota.',
  description:
    'ACPC conducts the Gujarat state B.Arch counselling. 75% of seats are reserved for Gujarat candidates (defined by Gujarat plus Daman, Diu, Dadra and Nagar Haveli school qualification), with 25% open to all India. Both NATA and JEE Main Paper 2 scores are accepted. CEPT University participation in ACPC is uncertain in recent years, CEPT mostly admits independently.',

  statusBanner: {
    label: '2026 dates pending',
    detail: 'ACPC typically opens registration in June after NATA Phase 1 results.',
    expectedDate: 'June or July 2026',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on ACPC 2025 brochure. CEPT participation in ACPC for 2026 should be verified in the official notification.',

  atAGlance: [
    { label: 'Home state quota', value: '75% Gujarat + DD + DNH' },
    { label: 'All India quota', value: '25%' },
    { label: 'Entrance', value: 'NATA or JEE Paper 2' },
    { label: 'SC reservation', value: '7%' },
    { label: 'ST reservation', value: '15%' },
    { label: 'SEBC reservation', value: '27%' },
    { label: 'EWS reservation', value: '10%' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% for reserved categories from Gujarat).',
    },
    {
      label: 'Entrance accepted',
      detail: 'NATA score or JEE Main Paper 2 score. Best-of-both is typically used. Submit both for maximum coverage.',
    },
    {
      label: 'Home state qualification',
      detail: 'For 75% home quota, candidate or parent must hold Gujarat / Daman & Diu / Dadra & Nagar Haveli domicile, or candidate must have completed Class 11 and Class 12 from a recognised institution in Gujarat / DD / DNH.',
    },
  ],

  dates: [
    { label: 'NATA Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'ACPC registration opens', dateDisplay: 'June 2026 (TBD)', status: 'tbd' },
    { label: 'Provisional merit list', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 2 allotment', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
    { label: 'Vacancy/spot round', dateDisplay: 'August or September 2026 (TBD)', status: 'tbd' },
  ],

  reservation: [
    { category: 'SC', percentage: '7%', note: 'Gujarat domicile' },
    { category: 'ST', percentage: '15%' },
    { category: 'SEBC', percentage: '27%', note: 'Excludes Creamy Layer' },
    { category: 'EWS', percentage: '10%', note: 'Gujarat-domiciled General candidates' },
    { category: 'PwD (horizontal)', percentage: '5%' },
    { category: 'Female (horizontal)', percentage: 'Per institute' },
    { category: 'TFWS (Tuition Fee Waiver)', percentage: '5%', note: 'Family income < ₹6 lakh' },
  ],

  fees: [
    { label: 'ACPC application fee, General', amount: '~₹350 (verify 2026)' },
    { label: 'Government college tuition', amount: 'Subsidised' },
    { label: 'Self-financed college tuition', amount: 'Variable, set by institute' },
  ],

  topColleges: [
    {
      name: 'CEPT University Faculty of Architecture',
      city: 'Ahmedabad',
      intake: 160,
      cutoffNote: 'CEPT participation in ACPC is uncertain in recent years, mostly admits independently',
      url: 'https://cept.ac.in',
    },
    {
      name: 'School of Architecture, IPSA',
      city: 'Rajkot',
    },
    {
      name: 'L.J. School of Architecture',
      city: 'Ahmedabad',
    },
    {
      name: 'Anant National University, School of Architecture',
      city: 'Ahmedabad',
    },
    {
      name: 'Indus University, Faculty of Architecture',
      city: 'Ahmedabad',
    },
    {
      name: 'Apollo University, Faculty of Architecture',
      city: 'Tirupati area Gujarat',
    },
  ],

  gotchas: [
    {
      title: 'CEPT is largely outside ACPC',
      detail: 'Many candidates assume CEPT B.Arch is filled through ACPC. In recent years, CEPT runs its own admission process and 75% of CEPT seats are CEPT All India, only 25% via ACPC. Apply directly to CEPT for the 75% pool.',
    },
    {
      title: 'Home state needs Class 11 and Class 12, not just Class 12',
      detail: 'Some states allow Class 12 board alone for home quota. Gujarat ACPC home quota typically asks for both Class 11 and Class 12 from Gujarat / DD / DNH institutions.',
    },
    {
      title: 'NIT Surat is JoSAA, not ACPC',
      detail: 'SVNIT Surat does not offer B.Arch and is admitted via JoSAA for B.Tech only. ACPC does not allot SVNIT seats.',
    },
  ],

  faqs: [
    {
      question: 'Is CEPT University filled through ACPC?',
      answer: 'Only 25% of CEPT seats are filled via ACPC under the Gujarat home-state quota. The other 75% are filled by CEPT directly through its own admission process. To maximise chances, apply both to ACPC and to CEPT directly.',
    },
    {
      question: 'Does ACPC accept JEE Main Paper 2?',
      answer: 'Yes. Both NATA and JEE Main Paper 2 are accepted. Best-of-both is typically used in merit calculation.',
    },
    {
      question: 'How is the home state quota defined?',
      answer: 'Home state for ACPC is Gujarat plus Daman and Diu plus Dadra and Nagar Haveli. Eligibility requires either parental domicile or candidate\'s Class 11 and Class 12 from these areas.',
    },
    {
      question: 'What is the SEBC reservation in Gujarat?',
      answer: '27% SEBC reservation, applicable to Gujarat-domiciled SEBC-listed castes. Creamy layer is excluded based on the latest Gujarat government order on family income limits.',
    },
    {
      question: 'Are Anant National University and L.J. School in ACPC?',
      answer: 'They participate for some seats. Self-financed colleges in Gujarat usually surrender a share of seats to ACPC. Check the official 2026 list of participating institutes.',
    },
    {
      question: 'Is SVNIT Surat in ACPC?',
      answer: 'No. SVNIT Surat does not offer B.Arch. The Centrally Funded Technical Institutes are JoSAA-only and do not appear in ACPC.',
    },
    {
      question: 'When does ACPC B.Arch counselling start?',
      answer: 'Typically June or July after NATA Phase 1 results, with allotment rounds through July and August. Verify on gujacpc.admissions.nic.in.',
    },
    {
      question: 'What is the TFWS quota?',
      answer: 'TFWS (Tuition Fee Waiver Scheme) reserves 5% supernumerary seats for candidates with family income under ₹6 lakh. The candidate gets a tuition waiver.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'ACPC B.Arch 2026 Gujarat: CEPT Quota, NATA + JEE P2, SEBC 27%',
  seoDescription:
    'Gujarat ACPC B.Arch admission 2026: 75% home + 25% AI, NATA or JEE Paper 2, SEBC 27%, CEPT 25% via ACPC, complete fees, dates, eligibility for gujacpc.admissions.nic.in.',
  seoKeywords: 'ACPC B.Arch 2026, Gujarat B.Arch admission, CEPT ACPC quota, gujacpc, Gujarat SEBC reservation, B.Arch Ahmedabad',
};

export default acpc;
