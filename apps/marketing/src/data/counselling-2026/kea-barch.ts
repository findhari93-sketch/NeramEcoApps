import type { CounsellingHubConfig } from './schema';

const kea: CounsellingHubConfig = {
  slug: 'kea-barch',
  title: 'KEA Architecture Counselling 2026 (Karnataka)',
  shortName: 'KEA',
  authority: 'Karnataka Examinations Authority',
  authorityShort: 'KEA',
  primaryUrl: 'https://cetonline.karnataka.gov.in/kea',
  tier: 1,
  region: 'south',
  depth: 'standard',
  status: 'tbd',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Karnataka B.Arch admission via NATA or JEE Paper 2. KEA does NOT conduct any CET for B.Arch.',
  description:
    'The Karnataka Examinations Authority runs centralised B.Arch counselling for Karnataka government and aided institutes. KEA explicitly does not conduct any state CET for B.Arch. Admission is via NATA or JEE Main Paper 2 only, with best-of-both used when both are submitted. COMEDK is a separate counselling for private colleges and also does not run a B.Arch entrance, it uses NATA or JEE Paper 2.',

  statusBanner: {
    label: '2026 notification expected June',
    detail: 'KEA typically releases the B.Arch counselling notification in June after NATA Phase 1 results. Watch cetonline.karnataka.gov.in/kea.',
    expectedDate: 'June 2026',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on KEA 2025 cycle. Article 371(J) Kalyana Karnataka quota and SC/ST percentages depend on Government Order in force at the time of admission.',

  atAGlance: [
    { label: 'Entrance', value: 'NATA or JEE Paper 2 (best of both)' },
    { label: 'KEA-conducted CET for B.Arch?', value: 'No' },
    { label: 'COMEDK B.Arch entrance?', value: 'No, uses NATA or JEE P2' },
    { label: 'Article 371(J) Hyd-Karnataka quota', value: '70% local + 8% statewide outside region' },
    { label: 'Government quota fee', value: 'Subsidised' },
    { label: 'Management quota', value: 'Direct payment, separate process' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% for reserved categories from Karnataka).',
    },
    {
      label: 'Entrance accepted',
      detail: 'NATA score, JEE Main Paper 2 score, or both. Best-of-both is used in merit calculation.',
    },
    {
      label: 'Karnataka domicile and Class 12',
      detail: 'For state quota, you need Karnataka domicile or have completed Class 11 and Class 12 from a Karnataka institution. Verify nativity rules in the official 2026 brochure.',
    },
  ],

  dates: [
    { label: 'NATA Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'KEA B.Arch notification', dateDisplay: 'June 2026 (TBD)', status: 'tbd' },
    { label: 'Document verification', dateDisplay: 'June or July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 2 allotment', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
    { label: 'Round 3 / mop-up', dateDisplay: 'August or September 2026 (TBD)', status: 'tbd' },
  ],

  reservation: [
    { category: 'GM (General Merit)', percentage: 'Open' },
    { category: 'SC', percentage: '15%', note: 'Karnataka domicile, may be revised per pending GO' },
    { category: 'ST', percentage: '3%', note: 'Karnataka domicile, may be revised per pending GO' },
    { category: 'Cat I (Most backward)', percentage: '4%' },
    { category: '2A (Backward)', percentage: '15%' },
    { category: '2B (Backward minorities)', percentage: '4%' },
    { category: '3A (Other backward)', percentage: '4%' },
    { category: '3B (Other backward)', percentage: '5%' },
    { category: 'Article 371(J) Local (HK region)', percentage: '70%', note: 'Within Hyderabad-Karnataka colleges only' },
    { category: 'Article 371(J) Statewide outside HK', percentage: '8%', note: 'For HK candidates outside their home region' },
    { category: 'PwD (horizontal)', percentage: '5%' },
  ],

  fees: [
    { label: 'KEA application fee, General', amount: '₹650 to ₹800', note: 'Confirmed in annual brochure' },
    { label: 'Government college tuition', amount: 'Significantly subsidised' },
    { label: 'Private aided college tuition', amount: 'Variable, set by college' },
    { label: 'Management quota fees', amount: 'High, set by institute', note: 'Outside KEA centralised counselling' },
  ],

  topColleges: [
    {
      name: 'BMS College of Architecture',
      city: 'Bangalore',
      intake: 80,
      url: 'https://bmsca.ac.in',
    },
    {
      name: 'RV College of Architecture',
      city: 'Bangalore',
      intake: 80,
      url: 'https://rvce.edu.in',
    },
    {
      name: 'University Visvesvaraya College of Engineering, Department of Architecture',
      city: 'Bangalore',
      intake: 40,
    },
    {
      name: 'Manipal School of Architecture and Planning',
      city: 'Manipal',
      cutoffNote: 'Manipal admits via Manipal entrance, not always through KEA',
      url: 'https://manipal.edu',
    },
    {
      name: 'Dayananda Sagar Academy of Architecture',
      city: 'Bangalore',
    },
    {
      name: 'KLE Technological University, School of Architecture',
      city: 'Hubli',
    },
  ],

  gotchas: [
    {
      title: 'KEA does not conduct an entrance test for B.Arch',
      detail: 'Some students assume KCET covers B.Arch. It does not. Submit NATA or JEE Main Paper 2 score directly to KEA counselling.',
    },
    {
      title: 'COMEDK also has no B.Arch entrance',
      detail: 'COMEDK runs only counselling for private colleges using NATA or JEE Paper 2 scores, not its own entrance. Plan only the entrance you need (NATA or JEE P2), not a third state-level test.',
    },
    {
      title: 'Article 371(J) Kalyana Karnataka rule is unique',
      detail: 'Bidar, Kalaburagi, Yadgir, Raichur, Koppal, Ballari, and Vijayanagar candidates get 70% local seats within HK colleges and 8% statewide outside the region. Carry the appropriate certificate.',
    },
    {
      title: 'Management quota is outside KEA',
      detail: 'Management seats at private colleges are filled directly by the institute, not through KEA. Apply separately for those.',
    },
    {
      title: 'NIT Karnataka (Surathkal) is JoSAA',
      detail: 'NITK does not offer B.Arch and is in JoSAA only for B.Tech. There is no Karnataka NIT B.Arch route through KEA.',
    },
  ],

  faqs: [
    {
      question: 'Does Karnataka have a state CET for B.Arch?',
      answer: 'No. KEA explicitly does not conduct any CET for B.Arch. NATA or JEE Main Paper 2 is used directly.',
    },
    {
      question: 'Can I use KCET score for B.Arch in Karnataka?',
      answer: 'No. KCET is for engineering, agriculture, and other courses. B.Arch admissions in Karnataka use NATA or JEE Paper 2 only.',
    },
    {
      question: 'What is COMEDK\'s role for B.Arch?',
      answer: 'COMEDK runs counselling for private B.Arch colleges in Karnataka using NATA or JEE Paper 2 scores. There is no COMEDK B.Arch entrance test.',
    },
    {
      question: 'Is BMS or RV College of Architecture in KEA counselling?',
      answer: 'Government quota seats at BMS, RV, and other private aided colleges go through KEA. Management quota seats are filled directly by the college.',
    },
    {
      question: 'What is Article 371(J) reservation?',
      answer: 'Article 371(J) gives candidates from the Hyderabad-Karnataka region (Bidar, Kalaburagi, Yadgir, Raichur, Koppal, Ballari, Vijayanagar) 70% local quota in HK colleges and 8% statewide quota outside the region.',
    },
    {
      question: 'How is KEA B.Arch merit calculated?',
      answer: 'Best-of-both NATA and JEE Paper 2 score is used. Class 12 weightage is set per the operative KEA brochure for 2026, traditionally 50:50.',
    },
    {
      question: 'When does KEA B.Arch counselling start?',
      answer: 'Typically June after NATA Phase 1 results, with allotment rounds running through July and August. The 2026 schedule will appear on cetonline.karnataka.gov.in/kea.',
    },
    {
      question: 'Is NIT Karnataka B.Arch in KEA?',
      answer: 'NIT Karnataka (Surathkal) does not offer B.Arch. There is no NIT B.Arch route through KEA.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'KEA Architecture Counselling 2026 Karnataka: NATA, JEE P2, Article 371J',
  seoDescription:
    'Karnataka KEA B.Arch counselling 2026: no state CET for B.Arch, NATA or JEE Paper 2 best-of-both, BMS Bangalore, RV College, UVCE Bangalore. Article 371(J) Kalyana Karnataka quota explained.',
  seoKeywords: 'KEA B.Arch 2026, Karnataka B.Arch admission, BMS College Architecture, RV College Architecture, COMEDK B.Arch, Article 371J Kalyana Karnataka',
};

export default kea;
