import type { CounsellingHubConfig } from './schema';

const csabSpecial: CounsellingHubConfig = {
  slug: 'csab-special',
  title: 'CSAB Special Round B.Arch 2026',
  shortName: 'CSAB Special',
  authority: 'Central Seat Allocation Board',
  authorityShort: 'CSAB',
  primaryUrl: 'https://csab.nic.in',
  tier: 1,
  region: 'national',
  depth: 'standard',
  status: 'tbd',
  examRoutes: ['JEE_P2'],

  tagline: 'Fills NIT, IIEST, IIIT, SPA and GFTI vacant seats after JoSAA Round 6.',
  description:
    'CSAB Special runs after JoSAA closes. It fills vacant B.Arch seats at NITs, IIEST Shibpur, IIITs, SPAs (Delhi, Bhopal, Vijayawada), and Government Funded Technical Institutes. IITs do NOT participate in CSAB Special. Three rounds with their own choice filling.',

  statusBanner: {
    label: '2026 schedule expected late July',
    detail: 'CSAB Special begins after JoSAA Round 6 closes. The 2026 brochure is typically released a week before registration opens.',
    expectedDate: 'Late July 2026',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote:
    'Based on CSAB 2025 Business Rules. CSAB 2026 is expected to be conducted by NIT Rourkela (announcement pending).',

  atAGlance: [
    { label: 'Rounds', value: '3' },
    { label: 'Special Round Enrolment Fee', value: '₹40,000 (₹19,000 reserved)' },
    { label: 'IAF-II after allotment', value: '₹35,000 (₹16,000 reserved)' },
    { label: 'IITs participate?', value: 'No' },
    { label: 'Eligible institutes', value: 'NITs, IIEST, IIITs, SPAs, GFTIs' },
    { label: 'Cancels JoSAA seat?', value: 'Yes, if you accept' },
  ],

  eligibility: [
    {
      label: 'JEE Main Paper 2 score required',
      detail: 'A valid JEE Main 2026 Paper 2 B.Arch rank is mandatory. JEE Advanced and AAT are not used in CSAB Special.',
    },
    {
      label: 'Holding a JoSAA seat is fine, registering means risk',
      detail: 'You can register for CSAB Special even if you accepted a JoSAA seat. Once you accept any CSAB Special allotment, your JoSAA seat is automatically cancelled. Decide before registration.',
    },
    {
      label: 'Academic eligibility is the same as JoSAA',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% for reserved). Single board issuance.',
    },
  ],

  dates: [
    { label: 'JoSAA Round 6 closes', dateDisplay: 'Late July 2026 (TBD)', status: 'expected' },
    { label: 'CSAB Special registration', dateDisplay: 'Late July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'Early August 2026 (TBD)', status: 'tbd' },
    { label: 'Round 2 allotment', dateDisplay: 'Mid August 2026 (TBD)', status: 'tbd' },
    { label: 'Round 3 allotment (final)', dateDisplay: 'Late August 2026 (TBD)', status: 'tbd' },
  ],

  reservation: [
    { category: 'OPEN', percentage: 'Merit' },
    { category: 'OBC-NCL', percentage: '27%' },
    { category: 'SC', percentage: '15%' },
    { category: 'ST', percentage: '7.5%' },
    { category: 'EWS', percentage: '10%' },
    { category: 'PwD (horizontal)', percentage: '5%' },
    { category: 'Female (horizontal)', percentage: 'Per institute' },
  ],

  fees: [
    {
      label: 'Special Round Enrolment Fee, General/OBC/EWS',
      amount: '₹40,000',
      note: 'Paid at CSAB registration, separate from JoSAA fee',
    },
    {
      label: 'Special Round Enrolment Fee, SC/ST/PwD',
      amount: '₹19,000',
    },
    {
      label: 'Institute Academic Fee (IAF-II), General/OBC/EWS',
      amount: '₹35,000',
      note: 'Paid after CSAB seat allotment, on top of Enrolment Fee',
    },
    {
      label: 'IAF-II, SC/ST/PwD',
      amount: '₹16,000',
    },
  ],

  gotchas: [
    {
      title: 'CSAB acceptance cancels your JoSAA seat',
      detail: 'If you currently hold a JoSAA seat and accept any CSAB Special allotment, the JoSAA seat is automatically cancelled and the cancellation cannot be reversed. If your JoSAA seat is already acceptable, do not register for CSAB Special.',
    },
    {
      title: 'IITs are not in CSAB Special',
      detail: 'CSAB Special covers NITs, IIEST Shibpur, IIITs, SPAs, and GFTIs only. If you are aiming for IIT B.Arch, your only route is JoSAA via JEE Advanced plus AAT.',
    },
    {
      title: 'Total fees are higher than JoSAA',
      detail: 'CSAB Special charges Enrolment Fee plus IAF-II, totalling ₹75,000 for General candidates. JoSAA Round 1-6 acceptance fee is ₹35,000. Plan finances accordingly.',
    },
  ],

  faqs: [
    {
      question: 'Is CSAB Special the same as JoSAA?',
      answer: 'No. CSAB Special is a separate counselling that runs after JoSAA Round 6 closes, to fill vacant B.Arch and B.Tech seats at NITs, IIITs, SPAs, IIEST, and GFTIs. IITs do not participate.',
    },
    {
      question: 'Can I register for CSAB Special if I accepted a JoSAA seat?',
      answer: 'Yes, you can register. But the moment you accept any CSAB Special allotment, your JoSAA seat is cancelled automatically. The cancellation cannot be undone.',
    },
    {
      question: 'How many rounds does CSAB Special have?',
      answer: 'Three rounds. Choice filling, allotment, and reporting follow the same pattern as JoSAA but on a compressed timeline.',
    },
    {
      question: 'Do I need JEE Advanced for CSAB Special B.Arch?',
      answer: 'No. CSAB Special uses JEE Main Paper 2 B.Arch rank only. JEE Advanced and AAT are not used.',
    },
    {
      question: 'What is the difference between Enrolment Fee and IAF-II?',
      answer: 'Enrolment Fee (₹40,000 General, ₹19,000 reserved) is paid at CSAB registration. IAF-II (₹35,000 General, ₹16,000 reserved) is paid after seat allotment, before institute reporting. Both are deducted from refunds if you withdraw.',
    },
    {
      question: 'What is CSAB-NEUT? Is it the same as CSAB Special?',
      answer: 'No. CSAB Special fills NIT-system vacancies after JoSAA. CSAB-NEUT (Northeast and UTs) is a separate process for cross-state seats for candidates from 8 NE states and 5 UTs. CSAB-Supernumerary covers UTs lacking their own NIT.',
    },
    {
      question: 'Can I get an IIT through CSAB Special?',
      answer: 'No. IITs do not participate in CSAB Special. The only path to IIT B.Arch is JoSAA via JEE Advanced plus AAT.',
    },
    {
      question: 'When does CSAB Special start in 2026?',
      answer: 'It begins after JoSAA Round 6 closes, expected in late July 2026. The exact dates depend on the JoSAA timeline and will be announced on csab.nic.in.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'CSAB Special 2026 B.Arch: Eligibility, Fees, vs JoSAA',
  seoDescription:
    'CSAB Special Round 2026 B.Arch counselling: 3 rounds, ₹40,000 enrolment fee, fills NIT/IIEST/IIIT/SPA/GFTI vacancies after JoSAA. Cancels JoSAA seat if you accept.',
  seoKeywords: 'CSAB Special 2026, CSAB B.Arch, CSAB vs JoSAA, NIT vacancy, JoSAA seat cancellation, CSAB enrolment fee',
};

export default csabSpecial;
