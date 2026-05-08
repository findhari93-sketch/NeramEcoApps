import type { CounsellingHubConfig } from './schema';

const mhtCet: CounsellingHubConfig = {
  slug: 'mht-cet-barch',
  title: 'MHT-CET CAP B.Arch 2026 (Maharashtra)',
  shortName: 'MHT-CET',
  authority: 'CET Cell, Directorate of Technical Education Maharashtra',
  authorityShort: 'DTE Maharashtra',
  primaryUrl: 'https://cetcell.mahacet.org',
  tier: 1,
  region: 'west',
  depth: 'standard',
  status: 'tbd',
  examRoutes: ['NATA', 'JEE_P2'],

  tagline: 'Maharashtra centralised admission for B.Arch with separate merit lists for NATA and JEE Paper 2 candidates.',
  description:
    'The MHT-CET CAP (Centralised Admission Process) admits B.Arch candidates to Maharashtra colleges through two parallel merit lists: one based on NATA, the other on JEE Main Paper 2. Eligibility uses Maharashtra\'s Type A to E candidate categorisation by domicile. Sir JJ College of Architecture, BKPS Pune, BNCA Pune, and KRVIA Mumbai are among the most sought-after institutes.',

  statusBanner: {
    label: '2026 brochure pending',
    detail:
      'MHT-CET CAP B.Arch 2026 schedule will be released on arch2026.mahacet.org.in after AICTE approval. Registration typically opens in June.',
    expectedDate: 'June 2026',
  },

  lastVerified: '2026-05-08',
  cycleSourceNote:
    'Based on CAP 2025 brochure. Final 2026 schedule, fees, and seat matrix will be confirmed when DTE Maharashtra releases the official 2026 information brochure.',

  atAGlance: [
    { label: 'State quota', value: '85% Type A to E' },
    { label: 'All India quota', value: '15%' },
    { label: 'Merit lists', value: 'Separate for NATA and JEE P2' },
    { label: 'Application fee', value: '₹800 Open / ₹600 reserved' },
    { label: 'NRI/OCI/PIO/FN fee', value: '₹5,000' },
    { label: 'SEBC (Maratha)', value: 'Subject to court ruling' },
  ],

  eligibility: [
    {
      label: 'Academic qualification',
      detail:
        '10+2 with Physics and Mathematics compulsory plus one of Chemistry, Biology, Computer Science, IP, Engineering Graphics, or Vocational. 50% PCM aggregate (45% for reserved categories from Maharashtra). Single board issuance.',
    },
    {
      label: 'Entrance accepted',
      detail:
        'NATA score (current cycle or one previous) OR JEE Main Paper 2A score. Both can be submitted, the better score is used in the appropriate merit list. Maharashtra runs separate inter-se merit lists, NATA and JEE P2 candidates do not compete against each other directly.',
    },
    {
      label: 'Type A candidate',
      detail:
        'Maharashtra-domiciled candidate who completed both SSC (Class 10) and HSC (Class 12) from a Maharashtra board institution.',
    },
    {
      label: 'Type B candidate',
      detail:
        'Candidate whose parent has Maharashtra domicile, even if the candidate studied outside Maharashtra.',
    },
    {
      label: 'Type C candidate',
      detail:
        'Candidate whose parent is a Government of India employee posted in Maharashtra at the time of qualifying examination.',
    },
    {
      label: 'Type D candidate',
      detail:
        'Candidate whose parent is a Maharashtra State Government employee.',
    },
    {
      label: 'Type E candidate',
      detail:
        'Candidate from the Maharashtra-Karnataka border area as defined in the GR. Eligible for Maharashtra state quota seats.',
    },
  ],

  dates: [
    { label: 'NATA 2026 Phase 2', dateDisplay: 'May to July 2026', status: 'expected' },
    { label: 'JEE Main 2026 Session 2 result', dateDisplay: 'April 2026', status: 'expected' },
    { label: 'CAP B.Arch registration opens', dateDisplay: 'June 2026 (TBD)', status: 'tbd' },
    { label: 'Provisional merit list', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'CAP Round 1 allotment', dateDisplay: 'July 2026 (TBD)', status: 'tbd' },
    { label: 'CAP Round 2 allotment', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
    { label: 'CAP Round 3 / Institute level', dateDisplay: 'August 2026 (TBD)', status: 'tbd' },
  ],

  reservation: [
    { category: 'SC', percentage: '13%', note: 'Maharashtra-domiciled' },
    { category: 'ST', percentage: '7%' },
    { category: 'VJ-A (Vimukta Jati)', percentage: '3%' },
    { category: 'NT-B', percentage: '2.5%' },
    { category: 'NT-C', percentage: '3.5%' },
    { category: 'NT-D', percentage: '2%' },
    { category: 'OBC', percentage: '19%', note: 'Excludes Creamy Layer' },
    { category: 'SBC', percentage: '2%' },
    { category: 'EWS', percentage: '10%', note: 'Maharashtra-domiciled General candidates only' },
    { category: 'SEBC (Maratha)', percentage: 'TBD', note: 'Subject to ongoing Supreme Court litigation' },
    { category: 'PwD (horizontal)', percentage: '5%', note: 'Across all categories' },
    { category: 'Female (horizontal)', percentage: '30%', note: 'Across all categories' },
    { category: 'Defence (horizontal)', percentage: '5%' },
    { category: 'Linguistic minority (Type A)', percentage: 'Up to 51%', note: 'In specific minority colleges (Pillai for Malayali, Rizvi/Allana for Muslim)' },
  ],

  fees: [
    { label: 'Application fee, Open category', amount: '₹800' },
    { label: 'Application fee, reserved category', amount: '₹600' },
    { label: 'Application fee, NRI/OCI/PIO/FN', amount: '₹5,000' },
    {
      label: 'CAP processing fee at institute',
      amount: 'Varies',
      note: 'Government college tuition is significantly subsidised, private autonomous colleges charge full fees',
    },
  ],

  topColleges: [
    {
      name: 'Sir JJ College of Architecture',
      city: 'Mumbai',
      intake: 60,
      cutoffNote: 'Round 1 OPEN closing approx: NATA 138-145 (Type A), 150+ (OMS), JEE P2 percentile 94-96',
      url: 'https://sirjjarchitecture.org',
    },
    {
      name: 'BKPS College of Architecture',
      city: 'Pune',
      intake: 80,
      url: 'https://bkpscoa.in',
    },
    {
      name: 'Bharati Vidyapeeth College of Architecture (BNCA)',
      city: 'Pune',
      intake: 80,
      url: 'https://bvuniversity.edu.in',
    },
    {
      name: 'Kamla Raheja Vidyanidhi Institute (KRVIA)',
      city: 'Mumbai',
      intake: 80,
      url: 'https://krvia.ac.in',
    },
    {
      name: 'Rachana Sansad Academy of Architecture',
      city: 'Mumbai',
      intake: 80,
      url: 'https://rachanasansad.edu.in',
    },
    {
      name: 'Pillai College of Architecture',
      city: 'New Panvel',
      cutoffNote: 'Linguistic minority (Malayali) college with up to 51% community quota',
      url: 'https://mahecmt.ac.in',
    },
    {
      name: 'Rizvi College of Architecture',
      city: 'Mumbai',
      cutoffNote: 'Linguistic minority (Muslim) college',
    },
    {
      name: 'Anjuman-I-Islam Kalsekar Technical Campus, School of Architecture',
      city: 'Panvel',
    },
  ],

  gotchas: [
    {
      title: 'NATA and JEE P2 candidates compete in separate lists',
      detail:
        'Maharashtra is unique: a NATA-only candidate is never compared against a JEE P2 candidate for the same seat. Each merit list has its own seat share. Choose the entrance route that gives you the better relative rank, not just the higher absolute score.',
    },
    {
      title: 'Type A is the strongest claim',
      detail:
        'Type A candidates (SSC + HSC from Maharashtra) have first claim on state quota seats. Type B to E candidates compete only after Type A seats are exhausted. If you have any Maharashtra connection, verify which Type you qualify for and gather the right proof documents early.',
    },
    {
      title: 'SEBC (Maratha) reservation is in legal flux',
      detail:
        'The Maratha quota framework has been challenged repeatedly in the Supreme Court. Current eligibility may change before 2026 admissions. Watch the official brochure for the operative quota.',
    },
    {
      title: 'Linguistic minority quota requires community certificate',
      detail:
        'Pillai (Malayali), Rizvi and Allana (Muslim) carry up to 51% linguistic-minority quota. The community certificate must be issued by a competent authority before CAP registration. Without it, you compete only for the open share.',
    },
    {
      title: 'NRI/OCI/PIO/FN application fee is much higher',
      detail:
        'The ₹5,000 fee is only for NRI/OCI/PIO/Foreign National applicants. Indian candidates studying abroad but with Indian nationality use the regular Open or reserved fee.',
    },
  ],

  faqs: [
    {
      question: 'Can I apply with both NATA and JEE Paper 2 scores?',
      answer:
        'Yes. You can submit both. Your candidature appears on both merit lists, NATA and JEE P2, separately. You can be allotted from whichever list reaches your preference first.',
    },
    {
      question: 'Does the Maharashtra state CET (MHT-CET) include B.Arch?',
      answer:
        'No, MHT-CET PCM/PCB exam itself does not include B.Arch. The CAP B.Arch admission process uses NATA or JEE Main Paper 2 only, the MHT-CET CAP infrastructure is reused for counselling.',
    },
    {
      question: 'What is the difference between Type A and Type B candidates?',
      answer:
        'Type A is Maharashtra-domiciled candidates who completed Class 10 and Class 12 from Maharashtra boards. Type B is candidates whose parent has Maharashtra domicile but the candidate studied outside Maharashtra. Type A has first claim on state seats.',
    },
    {
      question: 'Is SPA Bhopal or NIT Nagpur in MHT-CET CAP?',
      answer:
        'No. SPA Bhopal and VNIT Nagpur are centrally funded institutes, they admit through JoSAA, not MHT-CET CAP. MHT-CET CAP covers only Maharashtra state colleges and private autonomous institutes participating in CAP.',
    },
    {
      question: 'What was the Sir JJ B.Arch cutoff in 2025?',
      answer:
        'For OPEN Type A through NATA, Round 1 closed around NATA score 138-145. OMS (Other Maharashtra State) was around 150 plus. JEE Paper 2 percentile closed around 94-96. These vary by year and round.',
    },
    {
      question: 'Are private deemed universities like MIT-WPU in MHT-CET CAP?',
      answer:
        'Some private autonomous and unaided minority colleges participate in CAP for a portion of seats. Deemed universities have their own admissions outside CAP. Check the official 2026 list of participating institutes.',
    },
    {
      question: 'How many CAP rounds are there for B.Arch?',
      answer:
        'Two main CAP rounds plus an Institute Level Round (ILR) for vacant seats. Some years also include a special spot round if seats remain vacant. Plan to hold a current allotment and float towards your preferred institute across rounds.',
    },
    {
      question: 'Is the Maratha (SEBC) quota available for B.Arch in 2026?',
      answer:
        'The SEBC quota framework has been challenged in court multiple times. Whether it is operative for the 2026 cycle depends on the government order in force at the time of admissions. Always verify against the live CAP brochure.',
    },
    {
      question: 'What is the application fee for NRI candidates?',
      answer:
        'NRI, OCI, PIO, and Foreign National candidates pay ₹5,000 application fee. Indian candidates pay ₹800 (Open) or ₹600 (reserved Maharashtra-domiciled).',
    },
    {
      question: 'Do I need a Maharashtra domicile certificate?',
      answer:
        'Only Type A candidates need to produce SSC and HSC certificates from Maharashtra boards. Other Type categories need parent\'s domicile or service proof. Carefully read the document checklist for your Type before CAP registration.',
    },
  ],

  revalidateSeconds: 86400,

  seoTitle: 'MHT-CET CAP B.Arch 2026: Type A to E, Sir JJ Cutoff, NATA + JEE P2',
  seoDescription:
    'MHT-CET B.Arch 2026 Maharashtra CAP guide: separate merit lists for NATA and JEE Paper 2, Type A to E categorisation, Sir JJ cutoff 138-145, BKPS Pune, KRVIA, BNCA admission process.',
  seoKeywords:
    'MHT-CET B.Arch 2026, Maharashtra CAP, Sir JJ College Architecture, BKPS Pune, KRVIA Mumbai, BNCA Pune, Type A B C D E Maharashtra, NATA JEE Paper 2 Maharashtra',
};

export default mhtCet;
