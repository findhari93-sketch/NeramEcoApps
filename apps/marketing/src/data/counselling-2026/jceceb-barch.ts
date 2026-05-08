import type { CounsellingHubConfig } from './schema';

const jceceb: CounsellingHubConfig = {
  slug: 'jceceb-barch',
  title: 'JCECEB / BIT Mesra B.Arch 2026 (Jharkhand)',
  shortName: 'JCECEB',
  authority: 'Jharkhand Combined Entrance Competitive Examination Board',
  authorityShort: 'JCECEB',
  primaryUrl: 'https://jceceb.jharkhand.gov.in',
  tier: 3,
  region: 'east',
  depth: 'stub',
  status: 'tbd',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Jharkhand has no dedicated B.Arch counselling. BIT Mesra (~40 seats) admits directly via JEE Paper 2.',
  description:
    'Jharkhand does not have a dedicated state B.Arch counselling listed. The flagship is BIT Mesra (Birla Institute of Technology, autonomous) which admits ~40 B.Arch students directly via JEE Main Paper 2 score with its own application process. Awadh College of Architecture (Jamshedpur) and JUT Ranchi admit via NATA. NIT Jamshedpur and BIT Sindri do NOT offer B.Arch.',

  statusBanner: {
    label: 'No state B.Arch counselling',
    detail: 'Apply directly to BIT Mesra. JCECEB primarily covers B.Tech and pharmacy.',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote: 'BIT Mesra admission timelines should be verified on bitmesra.ac.in. JCECEB does not list a dedicated B.Arch counselling for 2026.',

  atAGlance: [
    { label: 'Flagship', value: 'BIT Mesra (autonomous)' },
    { label: 'BIT Mesra B.Arch seats', value: '~40' },
    { label: 'BIT Mesra entrance', value: 'JEE Main Paper 2' },
    { label: 'BIT Mesra in JoSAA?', value: 'No' },
    { label: 'NIT Jamshedpur B.Arch?', value: 'No' },
    { label: 'BIT Sindri B.Arch?', value: 'No' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail: '10+2 with Physics and Mathematics compulsory plus one more, 50% PCM aggregate (45% reserved).',
    },
    {
      label: 'BIT Mesra entrance',
      detail: 'JEE Main Paper 2 score required. BIT Mesra runs its own application process and counselling on bitmesra.ac.in. Note: BIT Mesra is NOT in JoSAA, despite being commonly listed alongside NITs.',
    },
    {
      label: 'NATA-based state colleges',
      detail: 'Awadh College of Architecture (Jamshedpur) and JUT Ranchi admit via NATA score.',
    },
  ],

  dates: [
    { label: 'BIT Mesra application opens', dateDisplay: 'February to March 2026', status: 'expected' },
    { label: 'BIT Mesra application deadline', dateDisplay: 'May or June 2026 (TBD)', status: 'tbd' },
    { label: 'BIT Mesra counselling', dateDisplay: 'June or July 2026 (TBD)', status: 'tbd' },
  ],

  faqs: [
    {
      question: 'Is BIT Mesra B.Arch in JoSAA?',
      answer: 'No. BIT Mesra is an autonomous private institute and admits B.Arch directly via JEE Main Paper 2 score, with its own application process on bitmesra.ac.in. Many candidates assume BIT Mesra is in JoSAA because it is often listed alongside NITs in rankings.',
    },
    {
      question: 'Does NIT Jamshedpur offer B.Arch?',
      answer: 'No. NIT Jamshedpur does not offer B.Arch. It is in JoSAA for B.Tech only.',
    },
    {
      question: 'Does BIT Sindri offer B.Arch?',
      answer: 'No. BIT Sindri (a separate state institute) does not offer B.Arch.',
    },
    {
      question: 'What other Jharkhand options are there for B.Arch?',
      answer: 'Awadh College of Architecture in Jamshedpur and Jharkhand University of Technology (JUT) Ranchi admit via NATA. These are smaller institutes, BIT Mesra is the flagship.',
    },
    {
      question: 'Is there a Jharkhand state B.Arch counselling for 2026?',
      answer: 'No dedicated state B.Arch counselling is listed under JCECEB. Apply directly to BIT Mesra and any NATA-based state college.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'JCECEB / BIT Mesra B.Arch 2026 Jharkhand: Direct Admission, JEE P2',
  seoDescription:
    'Jharkhand B.Arch 2026: BIT Mesra (autonomous, ~40 seats) admits directly via JEE Main Paper 2, NOT JoSAA. Awadh College Jamshedpur, JUT Ranchi via NATA. NIT Jamshedpur and BIT Sindri have no B.Arch.',
  seoKeywords: 'BIT Mesra B.Arch admission, JCECEB B.Arch, NIT Jamshedpur B.Arch, BIT Sindri B.Arch, Jharkhand B.Arch admission, bitmesra.ac.in',
};

export default jceceb;
