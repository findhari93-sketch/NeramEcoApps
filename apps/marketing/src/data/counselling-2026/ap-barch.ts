import type { CounsellingHubConfig } from './schema';

const ap: CounsellingHubConfig = {
  slug: 'ap-barch',
  title: 'AP B.Arch Counselling 2026 (Andhra Pradesh)',
  shortName: 'AP B.Arch',
  authority: 'Andhra Pradesh State Council of Higher Education (APSCHE)',
  authorityShort: 'APSCHE',
  primaryUrl: 'https://apsche.ap.gov.in/arch',
  tier: 1,
  region: 'south',
  depth: 'standard',
  status: 'tbd',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Andhra Pradesh B.Arch admission via NATA or JEE Paper 2. Article 371D 85% Local + 15% Unreserved.',
  description:
    'APSCHE conducts the centralised B.Arch admission for Andhra Pradesh. The state follows Article 371D Presidential Order: 85% Local plus 15% Unreserved. AP has two local areas, AU (8 coastal districts) and SVU (5 Rayalaseema districts). NATA or JEE Main Paper 2 is required, the EAPCET state exam is NOT used for B.Arch.',

  statusBanner: {
    label: '2026 schedule expected August',
    detail: 'AP B.Arch counselling typically opens August through October. Watch apsche.ap.gov.in/arch for the 2026 brochure.',
    expectedDate: 'August or October 2026',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on AP 2025 cycle. Reservation percentages for BC categories are subject to current government orders.',

  atAGlance: [
    { label: 'Local quota (Article 371D)', value: '85%' },
    { label: 'Unreserved quota', value: '15%' },
    { label: 'Local areas', value: 'AU (coastal 8) + SVU (Rayalaseema 5)' },
    { label: 'Entrance', value: 'NATA or JEE Paper 2' },
    { label: 'EAPCET used for B.Arch?', value: 'No' },
    { label: 'SC reservation', value: '15%' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% for reserved categories from AP).',
    },
    {
      label: 'Entrance accepted',
      detail: 'NATA score or JEE Main Paper 2 score. The EAPCET (state engineering entrance) is NOT used for B.Arch.',
    },
    {
      label: 'Local area determination',
      detail: 'Local area is determined by where you completed Class 9 to Class 12 (4 consecutive years). AU local area covers 8 coastal districts. SVU local area covers 5 Rayalaseema districts.',
    },
  ],

  dates: [
    { label: 'NATA Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'AP B.Arch registration', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
    { label: 'State Architecture Rank publication', dateDisplay: 'August or September 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 web option entry', dateDisplay: 'September 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'September 2026 (TBD)', status: 'tbd' },
    { label: 'Final phase / spot', dateDisplay: 'October 2026 (TBD)', status: 'tbd' },
  ],

  reservation: [
    { category: 'OC (Open Competition)', percentage: 'Merit' },
    { category: 'SC', percentage: '15%' },
    { category: 'ST', percentage: '6%', note: 'AP retained 6%, distinct from Telangana 10%' },
    { category: 'BC-A', percentage: '7%' },
    { category: 'BC-B', percentage: '10%' },
    { category: 'BC-C', percentage: '1%' },
    { category: 'BC-D', percentage: '7%' },
    { category: 'BC-E', percentage: '4%', note: 'Subject to legal review' },
    { category: 'EWS', percentage: '10%' },
    { category: 'PwD (horizontal)', percentage: '5%' },
    { category: 'Article 371D Local', percentage: '85%', note: 'AU or SVU local area' },
    { category: 'Unreserved', percentage: '15%', note: 'Open to all India' },
  ],

  fees: [
    { label: 'Application fee, OC', amount: '~₹600 (verify 2026)' },
    { label: 'Application fee, SC/ST/PwD', amount: '~₹350 (verify 2026)' },
    { label: 'Government college tuition', amount: 'Subsidised' },
    { label: 'Private college tuition', amount: 'Variable per college' },
  ],

  topColleges: [
    {
      name: 'JNAFAU School of Planning and Architecture (in Telangana)',
      city: 'Hyderabad',
      cutoffNote: 'NOT in AP, this is TGCHE (Telangana). AP candidates apply separately to TGCHE.',
    },
    {
      name: 'Andhra University School of Architecture',
      city: 'Visakhapatnam',
    },
    {
      name: 'Acharya Nagarjuna University Department of Architecture',
      city: 'Guntur',
    },
    {
      name: 'GITAM Visakhapatnam School of Architecture',
      city: 'Visakhapatnam',
    },
    {
      name: 'KLU Vijayawada Department of Architecture',
      city: 'Vijayawada',
    },
  ],

  gotchas: [
    {
      title: 'SPA Vijayawada is NOT in APSCHE',
      detail: 'School of Planning and Architecture Vijayawada is a Centrally Funded Technical Institute. It admits via JoSAA, not APSCHE. Many candidates miss this and lose a chance at SPA Vijayawada by not registering for JoSAA.',
    },
    {
      title: 'JNAFAU Hyderabad SPA is in TGCHE (Telangana), not AP',
      detail: 'JNAFAU School of Planning and Architecture is in Hyderabad, which is now in Telangana. AP candidates targeting JNAFAU SPA need to apply through TGCHE separately.',
    },
    {
      title: 'AP and Telangana ST quotas differ',
      detail: 'AP retained ST reservation at 6%. Telangana raised ST to 10% in October 2022. Apply with the correct quota understanding for each state.',
    },
    {
      title: 'AP local area requires 4 consecutive years',
      detail: 'AU or SVU local area status is determined by 4 consecutive years of Class 9 to Class 12 in the area. Studying in another local area for any year disqualifies you from that local quota.',
    },
  ],

  faqs: [
    {
      question: 'Does APSCHE accept EAPCET for B.Arch?',
      answer: 'No. EAPCET (formerly EAMCET) is for engineering, agriculture, pharmacy. B.Arch admission in AP uses NATA or JEE Main Paper 2 only.',
    },
    {
      question: 'What is the difference between AU and SVU local areas?',
      answer: 'AU local area covers 8 coastal districts of Andhra Pradesh (Srikakulam, Vizianagaram, Visakhapatnam, East Godavari, West Godavari, Krishna, Guntur, Prakasam). SVU local area covers 5 Rayalaseema districts (Kurnool, Anantapur, Chittoor, YSR Kadapa, Nellore).',
    },
    {
      question: 'Is SPA Vijayawada part of APSCHE counselling?',
      answer: 'No. SPA Vijayawada is a CFTI and admits via JoSAA only. It does not appear in APSCHE.',
    },
    {
      question: 'Can a Telangana student apply to AP B.Arch?',
      answer: 'Yes, under the 15% Unreserved quota. The 85% Local quota is restricted to AU or SVU local-area candidates per Article 371D.',
    },
    {
      question: 'When does AP B.Arch counselling start?',
      answer: 'Typically August through October, after JoSAA closes. The 2026 dates will be on apsche.ap.gov.in/arch.',
    },
    {
      question: 'How is the State Architecture Rank computed?',
      answer: 'AP uses NATA or JEE Paper 2 score plus Class 12 marks per the operative formula in the 2026 brochure. The State Architecture Rank (SAR) is published before web options.',
    },
    {
      question: 'What about JNAFAU SPA Hyderabad cutoff?',
      answer: 'JNAFAU SPA is in Telangana (TGCHE), not AP. The 2025 OC closing was around State Architecture Rank 21 (NATA score around 105 normalised) for Telangana applicants.',
    },
    {
      question: 'Is BC-E reservation available in AP?',
      answer: 'BC-E (4%) was introduced for socially and educationally backward Muslims. The reservation is subject to legal review and may change. Verify in the live 2026 brochure.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'AP B.Arch 2026 Andhra Pradesh: APSCHE, AU/SVU, NATA + JEE P2',
  seoDescription:
    'Andhra Pradesh B.Arch counselling 2026: APSCHE, Article 371D 85% Local + 15% Unreserved, AU and SVU local areas, NATA or JEE Paper 2 (no EAPCET), SPA Vijayawada via JoSAA.',
  seoKeywords: 'AP B.Arch 2026, APSCHE Architecture, Andhra Pradesh B.Arch, Article 371D, AU SVU local area, SPA Vijayawada JoSAA, JNAFAU Telangana',
};

export default ap;
