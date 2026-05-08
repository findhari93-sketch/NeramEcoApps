import type { CounsellingHubConfig } from './schema';

const tg: CounsellingHubConfig = {
  slug: 'tg-barch',
  title: 'TG B.Arch Counselling 2026 (Telangana)',
  shortName: 'TG B.Arch',
  authority: 'Telangana State Council of Higher Education (TGCHE, formerly TSCHE)',
  authorityShort: 'TGCHE',
  primaryUrl: 'https://barchadm.tgche.ac.in',
  tier: 1,
  region: 'south',
  depth: 'standard',
  status: 'tbd',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Telangana B.Arch admission via NATA or JEE Paper 2. Single OU local area, ST raised to 10%.',
  description:
    'TGCHE (formerly TSCHE) conducts the centralised B.Arch admission for Telangana via barchadm.tgche.ac.in. Telangana follows Article 371D Presidential Order with a single OU local area covering all 33 districts. ST reservation was raised from 6% to 10% in October 2022. The state EAPCET (formerly EAMCET) does NOT cover B.Arch.',

  statusBanner: {
    label: '2026 schedule expected July',
    detail: 'TGCHE typically opens registration in July through September after NATA results. JNAFAU SPA Hyderabad is the flagship.',
    expectedDate: 'July through September 2026',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'Based on 2025 cycle. Naming change: TS EAMCET became TG EAPCET from 2024, TSCHE became TGCHE.',

  atAGlance: [
    { label: 'Local quota (Article 371D)', value: '85%' },
    { label: 'Unreserved quota', value: '15%' },
    { label: 'Local area', value: 'OU (single area, all 33 districts)' },
    { label: 'Entrance', value: 'NATA or JEE Paper 2' },
    { label: 'EAPCET used for B.Arch?', value: 'No' },
    { label: 'ST reservation', value: '10% (raised from 6% in Oct 2022)' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% for reserved categories from Telangana).',
    },
    {
      label: 'Entrance accepted',
      detail: 'NATA or JEE Main Paper 2. The state EAPCET (engineering entrance) is NOT used for B.Arch.',
    },
    {
      label: 'OU local area determination',
      detail: 'Telangana has a single OU local area (Osmania University region) covering all 33 districts. Local status requires 4 consecutive years of Class 9 to Class 12 in Telangana.',
    },
  ],

  dates: [
    { label: 'NATA Phase 1 result', dateDisplay: 'May 2026', status: 'expected' },
    { label: 'TGCHE B.Arch registration', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'State Architecture Rank', dateDisplay: 'July or August 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 web options', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
    { label: 'Round 1 allotment', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
    { label: 'Final phase / spot', dateDisplay: 'September 2026 (TBD)', status: 'tbd' },
  ],

  reservation: [
    { category: 'OC', percentage: 'Merit' },
    { category: 'SC', percentage: '15%' },
    { category: 'ST', percentage: '10%', note: 'Raised from 6% in October 2022, distinct from AP 6%' },
    { category: 'BC-A', percentage: '7%' },
    { category: 'BC-B', percentage: '10%' },
    { category: 'BC-C', percentage: '1%' },
    { category: 'BC-D', percentage: '7%' },
    { category: 'BC-E', percentage: '4%', note: 'Subject to legal review' },
    { category: 'EWS', percentage: '10%' },
    { category: 'PwD (horizontal)', percentage: '5%' },
    { category: 'Article 371D Local (OU)', percentage: '85%' },
    { category: 'Unreserved', percentage: '15%', note: 'Open to all India' },
  ],

  fees: [
    { label: 'Application fee, OC', amount: '~₹1,200 (verify 2026)' },
    { label: 'Application fee, SC/ST', amount: '~₹600 (verify 2026)' },
    { label: 'Government college tuition', amount: 'Subsidised' },
    { label: 'Private college tuition', amount: 'Variable per college' },
  ],

  topColleges: [
    {
      name: 'JNAFAU School of Planning and Architecture',
      city: 'Hyderabad',
      cutoffNote: '2025 OC closing State Architecture Rank ~21, NATA ~105 normalised',
      url: 'https://jnafau.ac.in',
    },
    {
      name: 'JNAFAU University College',
      city: 'Hyderabad',
    },
    {
      name: 'GITAM University Hyderabad School of Architecture',
      city: 'Hyderabad',
    },
    {
      name: 'Aurora\'s Design and Technology Centre',
      city: 'Hyderabad',
    },
    {
      name: 'Vasavi Academy of Education School of Architecture',
      city: 'Hyderabad',
    },
  ],

  gotchas: [
    {
      title: 'TS EAMCET became TG EAPCET',
      detail: 'TS EAMCET was renamed TG EAPCET from 2024. Many search queries still use the old name. The exam itself does not cover B.Arch in either form.',
    },
    {
      title: 'B.Arch portal moved to barchadm.tgche.ac.in',
      detail: 'Telangana now hosts B.Arch admissions on a separate subdomain. Bookmark the new URL, the legacy TSCHE B.Arch link redirects but may go stale.',
    },
    {
      title: 'NIT Warangal and IIIT Hyderabad do NOT offer B.Arch',
      detail: 'NIT Warangal and IIIT Hyderabad are JoSAA institutes for B.Tech only. There is no NIT B.Arch route in Telangana through TGCHE.',
    },
    {
      title: 'Telangana ST is 10%, AP is 6%',
      detail: 'After the October 2022 hike, Telangana reservation framework differs from Andhra Pradesh\'s. Apply with the correct quota understanding for the state you are targeting.',
    },
  ],

  faqs: [
    {
      question: 'Does TGCHE accept EAPCET for B.Arch?',
      answer: 'No. EAPCET (formerly EAMCET) is for engineering and pharmacy. B.Arch admission in Telangana uses NATA or JEE Main Paper 2 only.',
    },
    {
      question: 'What changed when TSCHE became TGCHE?',
      answer: 'The naming change in 2024 reflected the state name shift. The B.Arch admission portal also moved to barchadm.tgche.ac.in. The process and quotas are otherwise similar.',
    },
    {
      question: 'Is JNAFAU SPA Hyderabad in TGCHE?',
      answer: 'Yes. JNAFAU School of Planning and Architecture in Hyderabad is part of TGCHE counselling. Its OC closing State Architecture Rank in 2025 was around 21.',
    },
    {
      question: 'Can an AP candidate apply to Telangana B.Arch?',
      answer: 'Yes, under the 15% Unreserved quota. The 85% Local quota is restricted to OU local-area candidates of Telangana per Article 371D.',
    },
    {
      question: 'Is NIT Warangal B.Arch in TGCHE?',
      answer: 'No. NIT Warangal does not offer B.Arch. There is no NIT B.Arch route in Telangana through TGCHE.',
    },
    {
      question: 'What is the OU local area?',
      answer: 'OU (Osmania University) is the single local area for Telangana, covering all 33 districts. Local status requires 4 consecutive years of Class 9 to Class 12 in Telangana.',
    },
    {
      question: 'What is the Telangana ST quota for B.Arch?',
      answer: 'ST is 10% in Telangana, raised from 6% in October 2022 by state government order. AP retains 6% ST.',
    },
    {
      question: 'When does Telangana B.Arch counselling start?',
      answer: 'Typically July through September after NATA results. The 2026 dates will be on barchadm.tgche.ac.in.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'TG B.Arch Counselling 2026 Telangana: TGCHE, JNAFAU SPA, NATA + JEE P2',
  seoDescription:
    'Telangana B.Arch admission 2026: TGCHE (formerly TSCHE), barchadm.tgche.ac.in, JNAFAU SPA Hyderabad, ST 10%, OU local area, NATA or JEE Paper 2 (no EAPCET). Article 371D quotas.',
  seoKeywords: 'TG B.Arch 2026, Telangana B.Arch, TGCHE, JNAFAU SPA Hyderabad, OU local area, TS EAMCET B.Arch, barchadm tgche',
};

export default tg;
