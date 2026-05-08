import type { CounsellingHubConfig } from './schema';

const cept: CounsellingHubConfig = {
  slug: 'cept-university',
  title: 'CEPT University B.Arch Admission 2026',
  shortName: 'CEPT',
  authority: 'CEPT University Ahmedabad',
  authorityShort: 'CEPT',
  primaryUrl: 'https://cept.ac.in',
  tier: 1,
  region: 'west',
  depth: 'standard',
  status: 'live',
  examRoutes: ['NATA'],

  tagline: 'Premium private deemed university. NATA mandatory, JEE Paper 2 not accepted. NIRF 6.',
  description:
    'CEPT University Ahmedabad is one of India\'s most prestigious architecture institutes. It does not participate in JoSAA, CSAB, or any state counselling. NATA is mandatory and JEE Main Paper 2 is not accepted. Seat split: 25% via Gujarat ACPC, 75% via CEPT All India. Merit is 50% NATA score plus 50% Class 12 aggregate.',

  statusBanner: {
    label: '2026-27 admissions page live',
    detail: 'CEPT typically opens applications in March-April. NATA score from current cycle and Class 12 marks are required.',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Verify the 2026-27 brochure on cept.ac.in for final dates and any fee revision.',

  atAGlance: [
    { label: 'Intake', value: '~160 seats' },
    { label: 'NIRF Architecture rank', value: '6' },
    { label: 'Total fees (5 years)', value: '~₹22.75 lakh' },
    { label: 'Annual fees (rising YoY)', value: '~₹4.55 lakh' },
    { label: 'Gujarat ACPC quota', value: '25%' },
    { label: 'CEPT All India quota', value: '75%' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate. Single board issuance.',
    },
    {
      label: 'NATA mandatory',
      detail: 'Valid NATA score from the current cycle. JEE Main Paper 2 alone is NOT accepted at CEPT, even if your score is high.',
    },
    {
      label: 'Merit formula',
      detail: '50% NATA score plus 50% Class 12 aggregate. Both halves carry equal weight in the final merit.',
    },
  ],

  dates: [
    { label: 'CEPT 2026-27 application opens', dateDisplay: 'March or April 2026', status: 'expected' },
    { label: 'NATA Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'CEPT application deadline', dateDisplay: 'June 2026 (TBD)', status: 'tbd' },
    { label: 'Provisional merit list', dateDisplay: 'June 2026 (TBD)', status: 'tbd' },
    { label: 'CEPT counselling rounds', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Academic year begins', dateDisplay: 'August 2026', status: 'expected' },
  ],

  reservation: [
    { category: 'Open Merit (CEPT All India)', percentage: '75%' },
    { category: 'Gujarat ACPC quota', percentage: '25%', note: 'Through ACPC counselling, not directly via CEPT' },
    { category: 'EWS', percentage: 'As per Gujarat ACPC norms in the ACPC quota' },
    { category: 'PwD (horizontal)', percentage: '5%' },
  ],

  fees: [
    { label: 'Annual tuition fee', amount: '~₹4.55 lakh', note: 'Rises ~14% year on year historically' },
    { label: 'Total programme fee', amount: '~₹22.75 lakh', note: 'For 5 years, before any annual revision' },
    { label: 'CEPT application fee', amount: 'TBD', note: 'Refer to 2026-27 admissions brochure' },
  ],

  topColleges: [
    {
      name: 'CEPT University, Faculty of Architecture',
      city: 'Ahmedabad',
      intake: 160,
      feesPerYear: '₹4.55 lakh',
      cutoffNote: '2024 NATA closing rank for CEPT B.Arch was around 21,002',
      url: 'https://cept.ac.in',
    },
  ],

  gotchas: [
    {
      title: 'JEE Main Paper 2 is not accepted',
      detail: 'Many candidates assume CEPT accepts JEE Paper 2 like other premium institutes. It does not. NATA is the only entrance score CEPT considers.',
    },
    {
      title: 'CEPT does not participate in JoSAA, CSAB, or state counsellings',
      detail: 'CEPT runs its own admission process and is not part of any centralised counselling. You apply directly on cept.ac.in. The 25% Gujarat quota is filled via ACPC but the 75% All India share is CEPT-direct.',
    },
    {
      title: 'Fees rise ~14% YoY historically',
      detail: 'Total programme fees of ~₹22.75 lakh are based on current rates. Year-on-year revisions push the actual outlay higher. Plan finances with a buffer.',
    },
    {
      title: 'Class 12 marks count for half',
      detail: 'CEPT merit weighs Class 12 aggregate as much as NATA. Strong NATA alone is not enough, low Class 12 marks will hurt your final rank.',
    },
  ],

  faqs: [
    {
      question: 'Does CEPT University accept JEE Main Paper 2?',
      answer: 'No. CEPT accepts NATA only. JEE Main Paper 2 score, however high, will not get you into CEPT B.Arch.',
    },
    {
      question: 'Is CEPT in JoSAA or any state counselling?',
      answer: 'No. CEPT is a private deemed university with its own admission process. The 25% Gujarat ACPC quota is filled through ACPC counselling, but the remaining 75% All India quota is filled directly through CEPT applications.',
    },
    {
      question: 'How is CEPT B.Arch merit calculated?',
      answer: '50% NATA score plus 50% Class 12 aggregate, both normalised. A balanced strong performance in both is needed, NATA alone or Class 12 alone will not secure a top rank.',
    },
    {
      question: 'What are CEPT B.Arch fees for 2026-27?',
      answer: 'Approximately ₹4.55 lakh per year, totalling ~₹22.75 lakh over 5 years at current rates. Fees have historically risen ~14% year on year.',
    },
    {
      question: 'How many seats does CEPT B.Arch have?',
      answer: 'Approximately 160 seats per year. The exact number varies between 120 and 170 across sources, the official 2026 prospectus will confirm.',
    },
    {
      question: 'What was the last NATA closing rank for CEPT?',
      answer: 'In 2024, the NATA closing rank for CEPT B.Arch was around 21,002. Class 12 marks are weighted equally, so Class 12 toppers had relaxed NATA requirements.',
    },
    {
      question: 'Can a student from Tamil Nadu apply to CEPT?',
      answer: 'Yes. Non-Gujarat candidates compete in the 75% CEPT All India quota. The 25% Gujarat ACPC quota is reserved for Gujarat-domiciled candidates.',
    },
    {
      question: 'Does CEPT have a Gujarat-only quota?',
      answer: 'Yes, 25% of seats are filled via Gujarat ACPC counselling, restricted to Gujarat-domiciled candidates. The remaining 75% is open to all India.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'CEPT University B.Arch 2026: NATA Cutoff, Fees, Admission Process',
  seoDescription:
    'CEPT Ahmedabad B.Arch admission 2026: NATA mandatory (no JEE P2), 50:50 NATA + Class 12 merit, ~₹22.75L total fees, NIRF 6, 25% Gujarat ACPC + 75% All India quota.',
  seoKeywords: 'CEPT University B.Arch, CEPT NATA cutoff, CEPT Ahmedabad admission, CEPT fees, CEPT Gujarat ACPC, CEPT All India quota',
};

export default cept;
