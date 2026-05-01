/**
 * PGETA 2026: Static content shared across the hub and spoke pages.
 *
 * PGETA = Post Graduate Entrance Test in Architecture (Council of Architecture).
 * Page also captures the misspelled-but-popular "PGEAT" search term via title
 * alias, body mention, and the /pgeat-2026 redirect.
 *
 * Punctuation rule: never use em-dashes; commas, colons, periods, parentheses only.
 *
 * Primary references:
 *  - https://www.coa.gov.in/
 *  - https://www.pgeta.in/
 *  - PGETA 2026 Information Brochure (COA)
 */

export const PGETA_QUICK_FACTS = [
  { label: 'Exam', value: 'PGETA 2026 (also searched as PGEAT)' },
  { label: 'Conducted by', value: 'Council of Architecture (COA)' },
  { label: 'Eligibility', value: 'B.Arch from COA-approved institute, 50% minimum' },
  { label: 'Duration', value: '2 hours (120 minutes)' },
  { label: 'Mode', value: 'Computer-Based Test (CBT) at designated centres' },
  { label: 'Questions', value: '100 across 4 modules' },
  { label: 'Attempts', value: 'Up to 3 per year, best score retained' },
  { label: 'Score validity', value: '1 academic year (2026-2027)' },
] as const;

export interface ExamScheduleRow {
  label: string;
  date: string;
  time: string;
  highlight?: boolean;
}

export const PGETA_SCHEDULE: ExamScheduleRow[] = [
  {
    label: 'Registration opens',
    date: 'Tuesday, April 21, 2026',
    time: 'Online at the PGETA portal',
  },
  {
    label: 'Test 1',
    date: 'Sunday, May 31, 2026',
    time: '10:00 AM to 12:00 PM',
    highlight: true,
  },
  {
    label: 'Test 2',
    date: 'Sunday, June 14, 2026',
    time: '10:00 AM to 12:00 PM',
    highlight: true,
  },
  {
    label: 'Test 3',
    date: 'Sunday, June 28, 2026',
    time: '10:00 AM to 12:00 PM',
    highlight: true,
  },
  {
    label: 'Final results',
    date: 'Tuesday, July 7, 2026',
    time: 'Best score across attempts is retained',
  },
];

export const PGETA_MODULES = [
  {
    title: 'Architecture and Design',
    questions: 64,
    summary:
      'Architectural theory, history of architecture, urban design, design principles, contextual design, and aesthetics. The largest section by weight.',
  },
  {
    title: 'Building Sciences and Applied Engineering',
    questions: 14,
    summary:
      'Structures, building services, climate-responsive design, materials, and construction technology. Bridges design intent with engineering reality.',
  },
  {
    title: 'Professional Electives',
    questions: 6,
    summary:
      'Specialisation electives covering urban design, sustainability, conservation, landscape, and other M.Arch streams.',
  },
  {
    title: 'Professional Ability and Skill Enhancement',
    questions: 16,
    summary:
      'Research aptitude, professional practice, ethics, and documentation. Tests readiness for graduate-level architectural work.',
  },
] as const;

export const PGETA_FEES = [
  { category: 'General / OBC (Non-Creamy Layer)', amount: 'Rs 1,750 per attempt' },
  { category: 'SC / ST / EWS / PwD', amount: 'Rs 1,250 per attempt' },
  { category: 'Transgender candidates', amount: 'Rs 1,000 per attempt' },
] as const;

export const PGETA_SCHOLARSHIP = {
  title: 'COA scholarship for top 100 PGETA scorers',
  amount: 'Rs 50,000 over 2 years (Rs 25,000 per year)',
  conditions: [
    'Must secure admission in a COA-approved M.Arch institution',
    'Must meet academic criteria during the M.Arch program',
    'Disbursed in two annual instalments',
  ],
};

export const PGETA_TEST_CITIES = [
  'Delhi',
  'Mumbai',
  'Bengaluru',
  'Chennai',
  'Hyderabad',
  'Ahmedabad',
  'Kolkata',
  'Pune',
  'Lucknow',
  'Jaipur',
  'Bhopal',
  'Chandigarh',
  'Kochi',
  'Coimbatore',
  '+ 60 more cities (selected during registration)',
] as const;

export const PGETA_NOTABLE_INSTITUTES = [
  'Chandigarh College of Architecture',
  'KRVIA Mumbai (Kamla Raheja Vidyanidhi Institute of Architecture)',
  'Manipal School of Architecture and Planning (MSAP)',
  'Rizvi College of Architecture, Mumbai',
  'Institute of Architecture and Planning, Nirma University',
  'CEPT University, Ahmedabad (verify current acceptance)',
  'BMS College of Architecture, Bengaluru',
  'Sir J. J. College of Architecture, Mumbai (verify current acceptance)',
];

export const PGETA_DEFAULT_FAQS = [
  {
    question: 'What is PGETA, and is it the same as PGEAT?',
    answer:
      'PGETA is the Post Graduate Entrance Test in Architecture, the unified national-level entrance test for M.Arch and other postgraduate architecture programs in India, conducted by the Council of Architecture (COA). PGEAT is a common misspelling of the same exam. All registrations and references should use PGETA.',
  },
  {
    question: 'Who is eligible for PGETA 2026?',
    answer:
      'You need a Bachelor of Architecture (B.Arch) degree from a COA-approved institution with at least 50% aggregate marks (or equivalent CGPA). Final-year B.Arch students can apply, with admission contingent on passing their B.Arch. There is no upper age limit.',
  },
  {
    question: 'When are the PGETA 2026 test dates?',
    answer:
      'Three test dates: Test 1 on May 31, 2026; Test 2 on June 14, 2026; Test 3 on June 28, 2026. All tests run from 10:00 AM to 12:00 PM. Final results are declared on July 7, 2026. Candidates may attempt all three; the best score is retained for admission.',
  },
  {
    question: 'What is the PGETA exam pattern?',
    answer:
      'PGETA 2026 is a Computer-Based Test (CBT) of 2 hours (120 minutes) with 100 questions across four modules: Architecture and Design (64 Q), Building Sciences and Applied Engineering (14 Q), Professional Electives (6 Q), and Professional Ability and Skill Enhancement (16 Q). The exam is conducted in English at designated centres in major Indian cities.',
  },
  {
    question: 'Can I take PGETA more than once?',
    answer:
      'Yes. You may attempt up to all three test dates in the same cycle. The best score among your attempts is automatically considered. Each attempt requires a separate fee payment.',
  },
  {
    question: 'What is the PGETA registration fee?',
    answer:
      'Per attempt: General and OBC (Non-Creamy Layer) candidates pay Rs 1,750. SC, ST, EWS, and PwD candidates pay Rs 1,250. Transgender candidates pay Rs 1,000. Payment is online via debit card, credit card, or net banking.',
  },
  {
    question: 'Where is PGETA conducted?',
    answer:
      'PGETA 2026 is held at designated CBT centres across major Indian cities including Delhi, Mumbai, Bengaluru, Chennai, Hyderabad, Ahmedabad, Kolkata, Pune, Lucknow, Jaipur, Bhopal, Chandigarh, Kochi, and 60+ additional cities. You select preferred cities during registration; the final centre is allocated by the conducting body. PGETA is not a from-home online test.',
  },
  {
    question: 'What is the PGETA syllabus?',
    answer:
      'Broad areas: architectural theory and history, urban design and planning, climate-responsive and sustainable design, building construction systems, building services and environmental technologies, professional practice and ethics, and research and documentation. The detailed syllabus is published in the official PGETA Information Brochure on the COA and PGETA portals.',
  },
  {
    question: 'Are there scholarships for top PGETA scorers?',
    answer:
      'Yes. The Council of Architecture awards a scholarship of Rs 50,000 over two years (Rs 25,000 per year) to the top 100 PGETA scorers, conditional on securing admission in a COA-approved institution and meeting academic criteria during the M.Arch program.',
  },
  {
    question: 'How many institutions accept PGETA scores?',
    answer:
      'COA lists approximately 132 approved Master of Architecture programs (as of 2022-23). Notable accepting institutions include Chandigarh College of Architecture, KRVIA Mumbai, Manipal School of Architecture and Planning, Rizvi College of Architecture, and Nirma University. Always verify current acceptance with your target program before relying on a score.',
  },
  {
    question: 'How long is a PGETA score valid?',
    answer:
      'A PGETA 2026 score is valid for the 2026-2027 admission cycle. Validity beyond one cycle is at the discretion of the participating institution.',
  },
  {
    question: 'How is PGETA different from NATA?',
    answer:
      'NATA is for Bachelor of Architecture (B.Arch) admissions, eligibility is class 12 pass with Mathematics, and it emphasises drawing and design aptitude. PGETA is for Master of Architecture (M.Arch) admissions, eligibility is a B.Arch with at least 50%, and it emphasises architectural theory, building science, and research aptitude. Both are conducted by the Council of Architecture but serve different admission stages.',
  },
];
