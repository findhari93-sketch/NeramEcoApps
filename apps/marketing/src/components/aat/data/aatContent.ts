/**
 * AAT 2026: Static content shared across the hub and spoke pages.
 *
 * Sources cited in JSDoc per fact so future edits know what to verify.
 * Punctuation rule: never use em-dashes; commas, colons, periods, parentheses only.
 *
 * Primary references:
 *  - https://jeeadv.ac.in (official JEE Advanced portal)
 *  - https://jeeadv.ac.in/documents/aat-syllabus.pdf
 *  - https://jeeadv.ac.in/aat_centre_list.html
 *  - JEE (Advanced) 2026 Information Brochure (provided by user)
 */

export const AAT_QUICK_FACTS = [
  { label: 'Exam', value: 'AAT 2026 (Architecture Aptitude Test)' },
  { label: 'Conducted by', value: 'JEE (Advanced) 2026 Board' },
  { label: 'Eligibility', value: 'JEE (Advanced) 2026 qualified' },
  { label: 'Duration', value: '3 hours' },
  { label: 'Mode', value: 'Offline, pen and paper' },
  { label: 'Language', value: 'English only' },
  { label: 'Result', value: 'Pass or Fail (no rank, no marks)' },
  { label: 'Fee', value: 'No separate fee' },
] as const;

export interface ExamScheduleRow {
  label: string;
  date: string;
  time: string;
  highlight?: boolean;
}

export const AAT_SCHEDULE: ExamScheduleRow[] = [
  {
    label: 'Online registration opens',
    date: 'Monday, June 1, 2026',
    time: '10:00 IST',
  },
  {
    label: 'Online registration closes',
    date: 'Tuesday, June 2, 2026',
    time: '17:00 IST',
  },
  {
    label: 'AAT 2026 examination',
    date: 'Thursday, June 4, 2026',
    time: '09:00 to 12:00 IST (reach centre by 08:00 IST)',
    highlight: true,
  },
  {
    label: 'Declaration of AAT 2026 results',
    date: 'Sunday, June 7, 2026',
    time: '17:00 IST',
  },
];

export const AAT_SYLLABUS = [
  {
    title: 'Freehand Drawing',
    summary:
      'Sketch everyday objects (furniture, household items, tools) from memory with correct proportion and texture. No instruments allowed.',
    skills: ['Proportion', 'Texture rendering', 'Quick observation', 'Realistic representation'],
  },
  {
    title: 'Geometrical Drawing',
    summary:
      'Geometric shapes, plans and elevations of 3D forms, spatial representations of cylinders, cones, prisms, cubes, splayed surfaces, drawn with technical precision using a geometry box.',
    skills: ['Plans and elevations', 'Orthographic projection', 'Compass and scale work', 'Technical line quality'],
  },
  {
    title: 'Three-Dimensional Perception',
    summary:
      'Visualisation of 3D objects and spatial forms. Volume, orientation, structure, and depth conveyed through sketched 3D forms and building elements.',
    skills: ['Mental rotation', 'Isometric projection', 'Spatial reasoning', 'Depth and volume'],
  },
  {
    title: 'Imagination and Aesthetic Sensitivity',
    summary:
      'Creative composition and visualisation. Context mapping, form arrangement, colour application, aesthetic judgment, and sketching from imaginary scenarios.',
    skills: ['Composition', 'Colour use', 'Creative visualisation', 'Design judgment'],
  },
  {
    title: 'Architectural Awareness',
    summary:
      'Knowledge of famous architectural works (national and international), notable architects and designers, historical and contemporary landmarks, and architectural styles and movements.',
    skills: ['Famous buildings', 'Architects and designers', 'Architectural styles', 'Movements and history'],
  },
] as const;

export const AAT_PARTICIPATING_IITS = [
  {
    name: 'IIT Roorkee',
    program: 'B.Arch (5 years)',
    note: 'Department of Architecture and Planning. Top-ranked IIT for architecture (NIRF Architecture #1, 2024).',
    seats: 'Approximately 30 seats',
  },
  {
    name: 'IIT Kharagpur',
    program: 'B.Arch (5 years)',
    note: 'Department of Architecture and Regional Planning. One of the oldest architecture programs in India.',
    seats: 'See JoSAA seat matrix',
  },
  {
    name: 'IIT (BHU) Varanasi',
    program: 'B.Arch (5 years)',
    note: 'Department of Architecture, Planning and Design. Newer IIT B.Arch offering.',
    seats: 'See JoSAA seat matrix',
  },
] as const;

export const AAT_CENTRES = [
  'IIT Bombay',
  'IIT Delhi',
  'IIT Guwahati',
  'IIT Kanpur',
  'IIT Kharagpur',
  'IIT Madras',
  'IIT Roorkee',
] as const;

export const AAT_DRAWING_KIT = {
  bring: [
    'HB and 2B pencils, plus 2H for fine lines',
    'Sharpener (metal or wooden)',
    'Soft erasers, kneaded eraser preferred for light sketching',
    'Geometry box: compass, scales, set squares, protractor',
    'Ruler, 12 to 15 inch',
    'Colouring aids: colour pencils or crayons',
    'Original JEE (Advanced) 2026 admit card (printed)',
    'Government photo ID: Aadhaar, Passport, DL or Voter ID',
  ],
  avoid: [
    'Wet paints and watercolours (smudging risk)',
    'Mobile phones and smart watches',
    'Calculators and electronic devices',
    'Loose paper or unauthorised material',
  ],
};

export const AAT_DEFAULT_FAQS = [
  {
    question: 'Who is eligible for AAT 2026?',
    answer:
      'Only candidates who have qualified JEE (Advanced) 2026 are eligible to appear in AAT 2026. There is no separate eligibility check beyond the JEE Advanced qualifying status. You must register through the JEE (Advanced) 2026 portal during the short registration window.',
  },
  {
    question: 'When is AAT 2026 and when does registration open?',
    answer:
      'AAT 2026 is on Thursday, June 4, 2026 from 09:00 to 12:00 IST. Online registration is open from Monday, June 1, 2026 (10:00 IST) to Tuesday, June 2, 2026 (17:00 IST) at jeeadv.ac.in. Results are declared on Sunday, June 7, 2026 at 17:00 IST.',
  },
  {
    question: 'Is AAT 2026 online or offline?',
    answer:
      'AAT 2026 is a single offline pen-and-paper test of 3 hours, conducted in English, at zonal IIT centres in Bombay, Delhi, Guwahati, Kanpur, Kharagpur, Madras, and Roorkee.',
  },
  {
    question: 'Is there a separate AAT rank or marksheet?',
    answer:
      'No. AAT is a qualifying test only. Candidates are declared either Pass or Fail. No marks, percentile, or AAT rank is published. B.Arch seats at IIT Roorkee, IIT Kharagpur, and IIT (BHU) Varanasi are allotted strictly on JEE (Advanced) 2026 All India Rank, with AAT Pass status as a prerequisite.',
  },
  {
    question: 'Do I need a separate admit card for AAT?',
    answer:
      'No separate admit card is issued. Carry the printed JEE (Advanced) 2026 admit card and an original government photo ID (Aadhaar, Passport, Driving License, or Voter ID). Without these, you will not be permitted to sit for AAT.',
  },
  {
    question: 'What is the AAT 2026 fee?',
    answer:
      'There is no separate registration fee for AAT 2026. The JEE (Advanced) 2026 fee that you already paid covers AAT.',
  },
  {
    question: 'What drawing materials should I bring?',
    answer:
      'Pencils (HB to 2B), sharpener, soft erasers, geometry box (compass, scales, set squares, protractor), a 12 to 15 inch ruler, and colour pencils or crayons. Avoid wet paints or watercolours that could smudge the answer sheet. Mobile phones, calculators, and electronic devices are not allowed.',
  },
  {
    question: 'What is the AAT 2026 syllabus?',
    answer:
      'Five areas: Freehand Drawing, Geometrical Drawing, Three-Dimensional Perception, Imagination and Aesthetic Sensitivity, and Architectural Awareness. The official syllabus PDF is published at jeeadv.ac.in/documents/aat-syllabus.pdf.',
  },
  {
    question: 'Are PwD candidates given extra time in AAT?',
    answer:
      'Yes. PwD candidates with at least 40% impairment under the RPwD Act 2016 are eligible for one hour of compensatory time, making AAT a 4-hour test. Candidates with less than 40% disability who have difficulty writing under Section 2(s) of the same Act are also eligible. Scribe (amanuensis) services are available, but must be requested during JEE Advanced registration via the prescribed certificate format.',
  },
  {
    question: 'What is the difference between AAT and NATA?',
    answer:
      'AAT is for B.Arch at three IITs only (Roorkee, Kharagpur, BHU) and requires JEE Advanced qualification. NATA is for B.Arch at most other architecture colleges in India (state and private), conducted by the Council of Architecture, with no JEE prerequisite. AAT is offline pen-and-paper for 3 hours with Pass/Fail result. NATA combines an offline drawing test with an online MCQ/NCQ paper, with marks and percentile. Many architecture aspirants take both.',
  },
  {
    question: 'How should I prepare for AAT in just two days after JEE Advanced results?',
    answer:
      'AAT registration is only 48 hours. The realistic preparation horizon is the weeks before JEE Advanced. Practice freehand sketching of common objects, geometrical projections (plans, elevations), 3D visualisation puzzles, and read about famous buildings and architects. Work fast: 16 questions in 3 hours means roughly 11 minutes per question. Sketching speed and clarity matter more than artistic perfection.',
  },
  {
    question: 'If I clear JEE Advanced but fail AAT, can I still get B.Arch at an IIT?',
    answer:
      'No. AAT Pass status is non-negotiable for B.Arch allotment at IIT Roorkee, IIT Kharagpur, and IIT (BHU) Varanasi. A high JEE Advanced rank without AAT Pass cannot secure a B.Arch seat at these IITs. You can still consider B.Arch via NATA at other COA-approved colleges, or B.Arch via JEE Main Paper 2 at NITs, SPAs, and IIITs.',
  },
];
