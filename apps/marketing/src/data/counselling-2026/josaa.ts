import type { CounsellingHubConfig } from './schema';

const josaa: CounsellingHubConfig = {
  slug: 'josaa',
  title: 'JoSAA B.Arch Counselling 2026',
  shortName: 'JoSAA',
  authority: 'Joint Seat Allocation Authority (Ministry of Education)',
  authorityShort: 'JoSAA',
  primaryUrl: 'https://josaa.nic.in',
  tier: 1,
  region: 'national',
  depth: 'standard',
  status: 'tbd',
  examRoutes: ['JEE_P2', 'JEE_ADV_AAT'],

  tagline: 'National counselling for ~600 B.Arch seats across IITs, NITs, IIEST Shibpur, and SPAs.',
  description:
    'JoSAA is the central counselling for India\'s most prestigious B.Arch seats. Three IITs (Roorkee, Kharagpur, BHU) admit through JEE Advanced plus the Architecture Aptitude Test (AAT). Ten NITs, IIEST Shibpur, and three SPAs (Delhi, Bhopal, Vijayawada) admit through JEE Main Paper 2 score. JoSAA 2026 is being conducted by IIT Roorkee.',

  statusBanner: {
    label: '2026 brochure pending',
    detail:
      'JoSAA 2026 schedule is expected after JEE Advanced results. AAT 2026 is confirmed for June 4 with results on June 7.',
    expectedDate: 'Brochure: post June 7, 2026',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote:
    'Based on JoSAA 2025 Business Rules and IIT Roorkee 2026 announcements. Final 2026 schedule, fees, and seat matrix will be confirmed in the official brochure.',

  atAGlance: [
    { label: 'Seats', value: '~600 B.Arch nationally' },
    { label: 'Rounds', value: '6 expected' },
    { label: 'AAT 2026', value: 'June 4, 2026' },
    { label: 'Conducting body', value: 'IIT Roorkee' },
    { label: 'Seat acceptance fee', value: '₹35,000 (₹15,000 reserved)' },
    { label: 'Withdrawal deduction', value: '₹12,000 total' },
  ],

  eligibility: [
    {
      label: 'For NITs, IIEST, SPAs (JEE Main Paper 2 route)',
      detail:
        'Qualified JEE Main 2026 Paper 2A score with valid B.Arch rank. 10+2 with Physics and Mathematics compulsory plus one of Chemistry, CS, IP, Engineering Graphics, Biology, or Vocational. 50% PCM aggregate (45% for reserved categories).',
    },
    {
      label: 'For IITs (JEE Advanced plus AAT route)',
      detail:
        'Three stages. (1) Qualify JEE Main Paper 1 to attempt JEE Advanced. (2) Clear JEE Advanced subject and aggregate cutoffs (35% Open, 31.5% OBC/EWS, 17.5% SC/ST/PwD). (3) Register and appear for AAT, which is Pass or Fail. Final allotment is based on JEE Advanced All India Rank, not AAT score.',
    },
    {
      label: 'AAT registration is mandatory',
      detail:
        'Without AAT registration and a Pass result, IIT B.Arch eligibility is forfeited even with a top JEE Advanced rank. AAT happens at IIT Roorkee, Kharagpur, BHU, and Guwahati centres.',
    },
  ],

  dates: [
    { label: 'JEE Main 2026 Session 2 results', dateDisplay: 'April 2026', status: 'expected' },
    { label: 'JEE Advanced 2026', dateDisplay: 'May 17, 2026', dateIso: '2026-05-17', status: 'confirmed' },
    { label: 'AAT 2026', dateDisplay: 'June 4, 2026', dateIso: '2026-06-04', status: 'confirmed' },
    { label: 'AAT 2026 results', dateDisplay: 'June 7, 2026', dateIso: '2026-06-07', status: 'confirmed' },
    { label: 'JoSAA registration opens', dateDisplay: 'June 2026 (TBD)', status: 'expected' },
    { label: 'JoSAA Round 1 allotment', dateDisplay: 'June 2026 (TBD)', status: 'expected' },
    { label: 'JoSAA Round 6 (final)', dateDisplay: 'July 20, 2026 approx', status: 'expected' },
    { label: 'CSAB Special starts', dateDisplay: 'Late July 2026 (TBD)', status: 'tbd' },
  ],

  reservation: [
    { category: 'OPEN (Gender-Neutral)', percentage: 'Merit', note: 'No vertical reservation, ranks decide' },
    { category: 'OBC-NCL', percentage: '27%', note: 'Non-Creamy Layer certificate required' },
    { category: 'SC', percentage: '15%' },
    { category: 'ST', percentage: '7.5%' },
    { category: 'EWS', percentage: '10%', note: 'EWS certificate from current financial year' },
    { category: 'PwD (horizontal)', percentage: '5%', note: 'Across all categories' },
    { category: 'Female (Supernumerary, IITs only)', percentage: '20%', note: 'Female-only seats added beyond regular intake' },
    { category: 'Home State (NITs)', percentage: '50%', note: 'Reserved for state of HSC qualifying examination' },
  ],

  fees: [
    { label: 'JoSAA registration', amount: '₹0', note: 'No JoSAA-side registration fee in 2025; same expected for 2026' },
    {
      label: 'Seat acceptance fee, General/OBC/EWS',
      amount: '₹35,000',
      note: 'Includes ₹5,000 non-refundable JoSAA processing charge',
    },
    {
      label: 'Seat acceptance fee, SC/ST/PwD',
      amount: '₹15,000',
      note: 'Includes ₹5,000 non-refundable JoSAA processing charge',
    },
    {
      label: 'Withdrawal refund deduction',
      amount: '₹12,000',
      note: '₹5,000 processing plus ₹7,000 withdrawal charge are non-refundable',
    },
  ],

  topColleges: [
    {
      name: 'SPA Delhi (School of Planning and Architecture)',
      city: 'New Delhi',
      intake: 70,
      cutoffNote: 'Round 1 OPEN closing rank: CRL 118 to 207 (most competitive B.Arch in India)',
      url: 'https://spa.ac.in',
    },
    {
      name: 'NIT Calicut',
      city: 'Kozhikode, Kerala',
      intake: 80,
      cutoffNote: 'Round 1 OPEN closing: HS 208, OS 232',
      url: 'https://nitc.ac.in',
    },
    {
      name: 'NIT Trichy',
      city: 'Tiruchirappalli, Tamil Nadu',
      intake: 50,
      cutoffNote: 'Round 1 OPEN closing: HS 276, OS 151',
      url: 'https://nitt.edu',
    },
    {
      name: 'VNIT Nagpur',
      city: 'Nagpur, Maharashtra',
      intake: 60,
      cutoffNote: 'Round 1 OPEN closing: HS 398, OS 617',
      url: 'https://vnit.ac.in',
    },
    {
      name: 'IIEST Shibpur',
      city: 'Howrah, West Bengal',
      intake: 30,
      cutoffNote: 'Round 1 OPEN closing: HS 685, OS 646',
      url: 'https://iiests.ac.in',
    },
    {
      name: 'SPA Bhopal',
      city: 'Bhopal, Madhya Pradesh',
      cutoffNote: 'Round 1 OPEN closing range: 400 to 550',
      url: 'https://spabhopal.ac.in',
    },
    {
      name: 'SPA Vijayawada',
      city: 'Vijayawada, Andhra Pradesh',
      cutoffNote: 'Round 1 OPEN closing range: 550 to 750',
      url: 'https://spav.ac.in',
    },
    {
      name: 'IIT Roorkee B.Arch',
      city: 'Roorkee, Uttarakhand',
      cutoffNote: 'JEE Advanced AIR range: 1,500 to 2,800 (OPEN)',
      url: 'https://iitr.ac.in',
    },
    {
      name: 'IIT Kharagpur B.Arch',
      city: 'Kharagpur, West Bengal',
      cutoffNote: 'JEE Advanced AIR range: 2,000 to 3,500 (OPEN)',
      url: 'https://iitkgp.ac.in',
    },
  ],

  gotchas: [
    {
      title: 'AAT Pass is mandatory for any IIT B.Arch seat',
      detail:
        'A top JEE Advanced rank is not enough. You must register for AAT separately and pass it. Without AAT registration, IIT B.Arch is closed off even if your Advanced rank would have qualified.',
    },
    {
      title: 'Choosing CSAB after JoSAA cancels your JoSAA seat',
      detail:
        'If you accept a JoSAA seat and then register for CSAB Special, getting any seat in CSAB automatically cancels your JoSAA allotment. The cancellation cannot be reverted. Decide before CSAB registration whether you are willing to give up your JoSAA seat.',
    },
    {
      title: 'BIT Mesra is not in JoSAA',
      detail:
        'BIT Mesra is widely listed as a top B.Arch institute in NIT-tier rankings, but it admits B.Arch directly via JEE Main Paper 2, not through JoSAA. Apply separately to BIT Mesra.',
    },
    {
      title: 'IIIT and GFTI do not offer B.Arch',
      detail:
        'No IIIT or Government Funded Technical Institute offers B.Arch through JoSAA. The architecture pool is restricted to specific IITs, NITs, IIEST Shibpur, and SPAs.',
    },
    {
      title: 'Float, Slide, Freeze choices are locked from Round 6',
      detail:
        'In rounds 1 to 5 you can Float (try for any preferred institute), Slide (try for higher-preference branch in current institute), or Freeze (lock current seat). Round 6 only allows Freeze. Plan your strategy accordingly.',
    },
  ],

  faqs: [
    {
      question: 'Do I need JEE Advanced to get into IIT B.Arch?',
      answer:
        'Yes, all three IITs that offer B.Arch (Roorkee, Kharagpur, BHU) admit only through JEE Advanced plus AAT. JEE Main Paper 2 alone cannot get you into IIT B.Arch.',
    },
    {
      question: 'Is AAT a separate exam from JEE Advanced?',
      answer:
        'Yes. AAT (Architecture Aptitude Test) happens after JEE Advanced results. You register for AAT only if you cleared JEE Advanced subject and aggregate cutoffs and want B.Arch at an IIT. AAT is Pass or Fail, the actual seat allotment uses your JEE Advanced All India Rank.',
    },
    {
      question: 'Which NITs offer B.Arch through JoSAA?',
      answer:
        'Ten NITs and IIEST Shibpur participate. Major ones are NIT Calicut, NIT Trichy, NIT Hamirpur, NIT Patna, NIT Raipur, NIT Rourkela, MNIT Jaipur, MNNIT Allahabad, VNIT Nagpur, and NIT Bhopal. Confirm the 2026 list in the official brochure.',
    },
    {
      question: 'How many rounds does JoSAA run for B.Arch?',
      answer:
        'Six rounds typically run from late June through mid to late July. After JoSAA Round 6 closes, vacant NIT, SPA, IIEST, IIIT, and GFTI seats are filled through CSAB Special (3 rounds) in late July to August.',
    },
    {
      question: 'What is the seat acceptance fee for JoSAA B.Arch?',
      answer:
        'For 2025 it was ₹35,000 for General, OBC-NCL, and EWS candidates and ₹15,000 for SC, ST, and PwD candidates. The fee includes ₹5,000 non-refundable JoSAA processing. The same structure is expected for 2026.',
    },
    {
      question: 'Can I get a refund if I withdraw my JoSAA seat?',
      answer:
        'Partial refund only. ₹5,000 JoSAA processing plus ₹7,000 withdrawal charge are deducted, so a General candidate gets back ₹23,000 of the ₹35,000 paid. The full Institute Academic Fee is refunded but withdrawal must happen before the final reporting deadline.',
    },
    {
      question: 'Difference between Float, Slide, and Freeze?',
      answer:
        'Freeze locks your current allotment, you stop participating in further rounds. Slide tries for a higher-preference branch within the same institute in the next round. Float keeps you in the running for any higher-preference institute or branch from your choice list. Round 6 allows only Freeze.',
    },
    {
      question: 'Is BIT Mesra B.Arch part of JoSAA?',
      answer:
        'No. BIT Mesra is a private autonomous institute that admits B.Arch directly via JEE Main Paper 2 score, with its own application process and counselling. Apply separately on bitmesra.ac.in.',
    },
    {
      question: 'Can I apply to JoSAA without giving JEE Advanced?',
      answer:
        'Yes, if you only want NITs, IIEST Shibpur, or SPAs. JEE Main Paper 2 with a valid B.Arch rank is sufficient for all of those. JEE Advanced is required only for IIT B.Arch.',
    },
    {
      question: 'How does Home State (HS) versus Other State (OS) work at NITs?',
      answer:
        '50% of NIT B.Arch seats are reserved for candidates whose state of HSC qualifying examination matches the state where the NIT is located. The other 50% are Other State seats. HS quota usually has lower closing ranks than OS.',
    },
    {
      question: 'Is there female reservation in JoSAA B.Arch?',
      answer:
        'IITs offer 20% supernumerary female seats (added beyond regular intake) for B.Arch as part of the IIT-wide initiative to improve female enrolment. NITs do not have a separate B.Arch female quota beyond the standard horizontal categories.',
    },
    {
      question: 'What if I miss JoSAA Round 1 reporting?',
      answer:
        'You forfeit the allotment and cannot participate in subsequent JoSAA rounds. You can still register for CSAB Special if you meet eligibility, but JoSAA itself is closed for that cycle. Reporting deadlines are firm, plan travel and document handling well in advance.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'JoSAA B.Arch 2026: AAT Date, NIT/IIT/SPA Cutoffs, Seat Matrix',
  seoDescription:
    'JoSAA 2026 B.Arch counselling guide: AAT June 4, 2026. ~600 seats across 3 IITs, 10 NITs, IIEST Shibpur, and 3 SPAs. Eligibility, fees, cutoffs, Float vs Slide vs Freeze.',
  seoKeywords:
    'JoSAA 2026, JoSAA B.Arch, AAT 2026, IIT B.Arch, NIT B.Arch, SPA Delhi cutoff, JoSAA seat acceptance fee, freeze float slide, JoSAA vs CSAB',
};

export default josaa;
