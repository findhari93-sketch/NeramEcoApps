import type { CounsellingHubConfig } from './schema';

const hstes: CounsellingHubConfig = {
  slug: 'hstes-barch',
  title: 'HSTES B.Arch Counselling 2026 (Haryana)',
  shortName: 'HSTES',
  authority: 'Haryana State Technical Education Society',
  authorityShort: 'HSTES',
  primaryUrl: 'https://techadmissionshry.gov.in',
  tier: 2,
  region: 'north',
  depth: 'stub',
  status: 'tbd',
  examRoutes: ['NATA'],

  tagline: 'Haryana centralised B.Arch counselling. NATA mandatory, 50:50 merit with Class 12.',
  description:
    'HSTES conducts the Haryana state counselling for B.Arch admission. NATA is mandatory (JEE Main Paper 2 alone is not accepted for state quota). Merit is calculated as 50% NATA score plus 50% Class 12 aggregate. Haryana candidates must hold a valid Parivar Pehchan Patra (PPP ID, the Haryana family ID) for state quota seats. NIT Kurukshetra B.Arch is admitted through JoSAA, not HSTES.',

  statusBanner: {
    label: '2026 schedule pending',
    detail:
      'HSTES typically releases the B.Arch counselling brochure in June or July after NATA Phase 1 results. Watch techadmissionshry.gov.in for updates.',
    expectedDate: 'June or July 2026',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote:
    'Based on HSTES 2025 counselling. PPP ID requirement and reservation framework are subject to Haryana government policy at the time of 2026 admissions.',

  atAGlance: [
    { label: 'Entrance', value: 'NATA mandatory' },
    { label: 'Merit', value: '50% NATA + 50% Class 12' },
    { label: 'PPP ID', value: 'Required for Haryana candidates' },
    { label: 'State quota', value: '85%' },
    { label: 'All India quota', value: '15%' },
    { label: 'Female horizontal', value: '25%' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail:
        '10+2 with Physics and Mathematics compulsory plus one of Chemistry, Biology, CS, IP, Engineering Graphics, or Vocational. 50% PCM aggregate (45% for reserved categories). Single board issuance.',
    },
    {
      label: 'Entrance accepted',
      detail:
        'NATA score is mandatory. JEE Main Paper 2 alone is not sufficient for HSTES B.Arch state quota. NATA score must be valid for the current admission year (NATA 2026 or NATA 2025 depending on validity rules in the official brochure).',
    },
    {
      label: 'Domicile and PPP ID',
      detail:
        'Haryana candidates must hold a valid Parivar Pehchan Patra (PPP) ID. State quota (85%) is reserved for Haryana-domiciled candidates with PPP. Without PPP, you can only compete for the All India 15% quota.',
    },
  ],

  dates: [
    { label: 'NATA 2026 Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'HSTES B.Arch registration', dateDisplay: 'June or July 2026 (TBD)', status: 'tbd' },
    { label: 'Merit list publication', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'July or August 2026 (TBD)', status: 'tbd' },
    { label: 'Round 2 allotment', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
    { label: 'Spot counselling for vacant seats', dateDisplay: 'August or September 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'Is JEE Main Paper 2 enough for HSTES B.Arch?',
      answer:
        'No. NATA is mandatory for HSTES state quota B.Arch admission. Submitting JEE Main Paper 2 alone will not get you into HSTES. You can hold both scores, but NATA must be present.',
    },
    {
      question: 'What is the PPP ID and why does HSTES need it?',
      answer:
        'PPP (Parivar Pehchan Patra) is the Haryana family ID introduced for streamlined service delivery. HSTES requires a valid PPP for any Haryana state quota seat. Without PPP, your application is treated under the All India 15% pool.',
    },
    {
      question: 'How is HSTES B.Arch merit calculated?',
      answer:
        '50% of your NATA score (normalised to 100) plus 50% of your Class 12 aggregate (normalised to 100) gives the merit score. Tie-breakers use NATA score, then Class 12 marks, then date of birth.',
    },
    {
      question: 'Is NIT Kurukshetra B.Arch part of HSTES?',
      answer:
        'No. NIT Kurukshetra is a Centrally Funded Technical Institute and admits B.Arch through JoSAA only, using JEE Main Paper 2 score. HSTES does not allot seats at NIT Kurukshetra.',
    },
    {
      question: 'How much is the female horizontal reservation?',
      answer:
        'Haryana provides 25% horizontal reservation for female candidates across all categories in HSTES counselling for B.Arch.',
    },
    {
      question: 'Can a non-Haryana candidate apply to HSTES B.Arch?',
      answer:
        'Yes, under the All India 15% quota. The remaining 85% state quota requires Haryana domicile and a valid PPP ID. Non-Haryana candidates compete only for the 15% pool.',
    },
    {
      question: 'Which colleges participate in HSTES B.Arch?',
      answer:
        'A small number of state universities and self-financing colleges. The participating institute list is published in the HSTES information brochure for each year. NIT Kurukshetra and SPA institutes are NOT in HSTES.',
    },
    {
      question: 'Are there counselling rounds, or is it single-shot?',
      answer:
        'Two main online rounds plus a spot counselling round for vacant seats are typical. Choice filling, locking, and reporting deadlines are firm, missing them forfeits the allotment.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'HSTES B.Arch 2026 Haryana: NATA Counselling, PPP ID, Merit Formula',
  seoDescription:
    'HSTES B.Arch 2026 Haryana counselling guide: NATA mandatory, 50:50 NATA plus Class 12 merit, PPP ID requirement, 85% state plus 15% AI quota. NIT Kurukshetra is NOT in HSTES.',
  seoKeywords:
    'HSTES 2026, HSTES B.Arch, Haryana NATA counselling, Haryana B.Arch admission, PPP ID Haryana, NIT Kurukshetra B.Arch, techadmissionshry',
};

export default hstes;
