/**
 * Every string and link on /aiarchitek, in one place.
 *
 * Product claims must match what ships. A tool here must be one of the 12 live,
 * public tools in apps/app (TOOL_CATALOG / LIVE_TOOL_IDS), and its free vs
 * sign-in lines come from apps/app/src/lib/tools/tool-seo.ts. An AI feature's
 * `status` is the label a visitor sees, so change it here the day a feature
 * ships or is switched off. content.test.ts guards links and wording.
 */
import { APP_URL } from '@/lib/seo/constants';

export type AiStatus = 'free' | 'classroom' | 'beta' | 'coming-soon';

export const AI_STATUS_LABEL: Record<AiStatus, string> = {
  free: 'Free for everyone',
  classroom: 'In the Neram classroom',
  beta: 'Beta',
  'coming-soon': 'Coming soon',
};

export interface LiveTool {
  name: string;
  /** Marketing landing page: neramclasses.com/tools/<slug>. */
  slug: string;
  /** Path of the working tool on the app. */
  appPath: string;
  track: 'nata' | 'counseling';
  definition: string;
  whoFor: string;
  input: string;
  output: string;
  /** What works without signing in. */
  free: string;
  /** What signing in (free) adds. */
  signedIn: string;
}

export const LIVE_TOOLS: LiveTool[] = [
  {
    name: 'NATA Eligibility Checker',
    slug: 'eligibility-checker',
    appPath: '/tools/nata/eligibility-checker',
    track: 'nata',
    definition: 'Checks whether your subjects and marks meet the NATA and B.Arch admission rules.',
    whoFor: 'Class 11 and 12 students and 10+3 diploma holders',
    input: 'Qualification, board, subjects and marks',
    output: 'Eligible or not, with the reason',
    free: 'Eligibility result with the reason',
    signedIn: 'Your state counselling rule, a saved report and a document checklist',
  },
  {
    name: 'NATA Cutoff Calculator',
    slug: 'cutoff-calculator',
    appPath: '/tools/nata/cutoff-calculator',
    track: 'nata',
    definition: 'Turns your 12th marks and NATA score into the B.Arch cutoff out of 400 used in counselling.',
    whoFor: 'Students who have board marks and a NATA score, or want to set a target',
    input: 'Board, marks secured and your NATA score',
    output: 'Your cutoff out of 400 and the 45% eligibility check',
    free: 'Cutoff from one NATA score and the eligibility check',
    signedIn: 'Best of several attempts, Part A and B breakdown and matching colleges',
  },
  {
    name: 'NATA Exam Planner',
    slug: 'exam-planner',
    appPath: '/tools/nata/exam-planner',
    track: 'nata',
    definition: 'Lays out the NATA sessions so you can pick your attempts and keep every date in one plan.',
    whoFor: 'Anyone deciding which NATA sessions to write',
    input: 'The sessions you plan to attempt',
    output: 'A calendar of exam and registration dates',
    free: 'Browse the session calendar',
    signedIn: 'Save your plan and get reminders before each date',
  },
  {
    name: 'NATA Exam Centre Finder',
    slug: 'exam-centers',
    appPath: '/tools/nata/exam-centers',
    track: 'nata',
    definition: 'Finds NATA test cities in your state and the nearest ones to your city.',
    whoFor: 'Students choosing a test city before booking',
    input: 'Your state or city',
    output: 'Test cities, with the three nearest and their distance in km',
    free: 'Test cities in any state and the three nearest to a city',
    signedIn: 'Nearest centres from your exact location, venue details and directions',
  },
  {
    name: 'NATA Photo and Signature Crop',
    slug: 'image-resizer',
    appPath: '/tools/nata/image-crop',
    track: 'nata',
    definition: 'Crops and resizes your photo and signature to the size the NATA form accepts.',
    whoFor: 'Students filling the NATA application form',
    input: 'A photo or signature image from your phone',
    output: 'A correctly sized JPG ready to upload',
    free: 'Crop and preview',
    signedIn: 'Download the final JPG',
  },
  {
    name: 'NATA Cost Calculator',
    slug: 'cost-calculator',
    appPath: '/tools/nata/cost-calculator',
    track: 'nata',
    definition: 'Adds up NATA exam fees, travel and stay before you book a session.',
    whoFor: 'Students and parents planning the exam budget',
    input: 'Your category, state and number of attempts',
    output: 'Fee for your category and the nearest test cities',
    free: 'Fee for your category and nearest test cities',
    signedIn: 'A full travel, stay and materials plan for several attempts',
  },
  {
    name: 'NATA Question Bank',
    slug: 'question-bank',
    appPath: '/tools/nata/question-bank',
    track: 'nata',
    definition: 'Real NATA questions recalled by students, with answers and discussion.',
    whoFor: 'Anyone practising NATA maths, aptitude and drawing questions',
    input: 'A topic or paper to practise',
    output: 'Questions with answers you can work through',
    free: 'Topics and sample questions',
    signedIn: 'Every question with answers, plus discussion',
  },
  {
    name: 'B.Arch College Predictor',
    slug: 'college-predictor',
    appPath: '/tools/counseling/college-predictor',
    track: 'counseling',
    definition: 'Shortlists the architecture colleges you can realistically get with your cutoff or rank.',
    whoFor: 'Students heading into B.Arch counselling',
    input: 'Your cutoff score or rank and the counselling you are in',
    output: 'Colleges ranked by your chances, from past closing marks',
    free: 'The top 3 colleges for your score in one counselling',
    signedIn: 'Every matching college, your category and round, and a saved shortlist',
  },
  {
    name: 'JoSAA B.Arch Predictor',
    slug: 'josaa-barch-predictor',
    appPath: '/tools/counseling/josaa-predictor',
    track: 'counseling',
    definition: 'Shows your chances at IITs, NITs, SPAs and GFTIs from real JoSAA closing ranks.',
    whoFor: 'JEE Main Paper 2 students applying through JoSAA',
    input: 'Your JEE Paper 2 rank',
    output: 'Institutes where your rank has closed before',
    free: 'The top 3 institutes for your rank in the open category',
    signedIn: 'Your category, quota and gender, every round and the full list',
  },
  {
    name: 'Counselling Rank Predictor',
    slug: 'rank-predictor',
    appPath: '/tools/counseling/rank-predictor',
    track: 'counseling',
    definition: 'Estimates your state B.Arch counselling rank from your composite score.',
    whoFor: 'Students waiting for their state counselling rank list',
    input: 'Your composite score',
    output: 'An expected rank range',
    free: 'A rank range for your score',
    signedIn: 'A closer estimate, category rank and the year by year trend',
  },
  {
    name: 'Counselling Insights',
    slug: 'counseling-insights',
    appPath: '/tools/counseling/insights',
    track: 'counseling',
    definition: 'Shows how many students applied, how many got seats and which colleges fill first.',
    whoFor: 'Students and parents deciding how to fill choices',
    input: 'The counselling you want to study',
    output: 'Headline numbers and round by round trends',
    free: 'Headline numbers for one counselling',
    signedIn: 'Round by round, per-college and per-category views',
  },
  {
    name: 'COA Approval Checker',
    slug: 'coa-checker',
    appPath: '/tools/counseling/coa-checker',
    track: 'counseling',
    definition: 'Confirms that a college is approved by the Council of Architecture before you apply.',
    whoFor: 'Anyone shortlisting B.Arch colleges',
    input: 'A college name, state or city',
    output: 'Whether the college is COA approved',
    free: 'Search with the first 5 results and college counts by state',
    signedIn: 'The full list with filters, approval year and saved colleges',
  },
];

export const SOON_TOOLS: { name: string; definition: string }[] = [
  { name: 'B.Arch Seat Matrix', definition: 'Seats by college and category for NATA and JoSAA counselling.' },
  { name: 'College Reviews', definition: 'What current students say about their architecture college.' },
  { name: 'JEE Paper 2 Rank Predictor', definition: 'Turns your Paper 2 percentile into an expected rank.' },
];

export function appToolUrl(tool: LiveTool): string {
  return `${APP_URL}${tool.appPath}`;
}

export interface AiFeature {
  name: string;
  status: AiStatus;
  summary: string;
  points: string[];
  /** Optional link to where the feature can be tried or learned about. */
  href?: string;
  hrefLabel?: string;
}

export const AI_FEATURES: AiFeature[] = [
  {
    name: 'Aintra, the AI assistant',
    status: 'free',
    summary: 'Ask about NATA, B.Arch colleges, cutoffs and counselling in plain language, any time of day.',
    points: [
      'Open the chat on any page of neramclasses.com',
      'Looks up colleges, fees and cutoffs while it answers',
      'No sign-in needed',
    ],
  },
  {
    name: 'AI Maths Teacher',
    status: 'classroom',
    summary: 'A patient maths tutor for the NATA and JEE Paper 2 syllabus, built into the Neram classroom.',
    points: [
      'Explains a concept from the basics, at your level',
      'Generates practice problems on the same idea',
      'Spots the step where you went wrong',
      'Gives a hint before it reveals the answer',
      'Keeps going until you can solve it yourself',
    ],
  },
  {
    name: 'Question paper analysis',
    status: 'classroom',
    summary: 'Shows which chapters carry the most marks across past NATA papers, so you study what is asked.',
    points: [
      'Chapter weightage across previous year papers',
      'How each chapter has trended year by year',
      'A study order based on what actually appears',
    ],
  },
  {
    name: 'AI image generation for drawing practice',
    status: 'classroom',
    summary: 'Creates visual references for NATA drawing and composition practice.',
    points: [
      'Reference images for drawing themes and scenes',
      'Fresh prompts so practice never runs dry',
      'Used alongside teacher review of your sheets',
    ],
  },
  {
    name: 'AI answer explanations',
    status: 'classroom',
    summary: 'After a test, ask for a step by step explanation of any question you got wrong.',
    points: [
      'Explains why the right option is right',
      'Shows the method, not only the answer',
      'Available on tests taken in the Neram classroom',
    ],
  },
  {
    name: 'AI class recaps and chapter tests',
    status: 'classroom',
    summary: 'Every class can be followed by AI-drafted recap questions and a short summary, checked by teachers.',
    points: [
      'Recap questions from what was taught that day',
      'Class wrap-up summaries for revision',
      'Chapter tests built from study material and recordings',
      'Checkpoints inside class videos',
    ],
  },
  {
    name: 'Exam recall from a photo',
    status: 'beta',
    summary: 'Snap the questions you remember after an exam and AI reads and matches them to the question bank.',
    points: ['Reads questions from a photo', 'Matches them to questions already in the bank'],
  },
  {
    name: 'Personalized practice',
    status: 'coming-soon',
    summary: 'Practice that adapts to you.',
    points: ['Detects weak topics', 'Recommends targeted questions', 'Adjusts difficulty', 'Tracks improvement'],
  },
  {
    name: 'AI Study Planner',
    status: 'coming-soon',
    summary: 'A plan that knows your exam date.',
    points: ['Exam-date aware schedule', 'Daily and weekly targets', 'Weak areas first', 'Revision reminders'],
  },
  {
    name: 'AI drawing feedback',
    status: 'coming-soon',
    summary: 'A first-pass review of your drawing sheets, before your teacher adds theirs.',
    points: ['Criterion by criterion notes', 'Compared against teacher-graded examples'],
  },
];

export const JOURNEY: { step: string; text: string; slug: string }[] = [
  { step: 'Check you are eligible', text: 'Confirm your subjects and marks meet the B.Arch rules.', slug: 'eligibility-checker' },
  { step: 'Plan your exam', text: 'Pick your NATA sessions and the nearest test city.', slug: 'exam-planner' },
  { step: 'Practise real questions', text: 'Work through recalled NATA questions by topic.', slug: 'question-bank' },
  { step: 'Know your cutoff', text: 'Combine board marks and your NATA score into a score out of 400.', slug: 'cutoff-calculator' },
  { step: 'Shortlist colleges', text: 'See where your score has been enough before, and check COA approval.', slug: 'college-predictor' },
];

export const AUDIENCE: { who: string; why: string }[] = [
  { who: 'Class 11 and 12 students', why: 'Planning for B.Arch and wanting to start NATA preparation early.' },
  { who: '10+3 diploma holders', why: 'Checking eligibility and planning a route into architecture.' },
  { who: 'NATA repeaters', why: 'Improving a score and choosing colleges with a better cutoff.' },
  { who: 'JEE Main Paper 2 aspirants', why: 'Comparing JoSAA chances alongside state counselling.' },
  { who: 'Parents', why: 'Understanding eligibility, costs and which colleges are realistic.' },
];

export const RESOURCE_LINKS: { label: string; href: string; hint: string }[] = [
  { label: 'NATA 2026 guide', href: '/nata-2026', hint: 'Dates, pattern and registration' },
  { label: 'NATA syllabus', href: '/nata-syllabus', hint: 'Maths, aptitude and drawing topics' },
  { label: 'Previous year papers', href: '/previous-year-papers', hint: 'Past NATA and JEE Paper 2 papers' },
  { label: 'Important questions', href: '/nata-important-questions', hint: 'Topics that come up often' },
  { label: 'NATA cutoff trends', href: '/nata-cutoff-trends-2015-2025', hint: 'Ten years of cutoff data' },
  { label: 'JEE Paper 2 for B.Arch', href: '/jee-barch-hub', hint: 'Paper 2A, JoSAA and IIT B.Arch' },
  { label: 'NATA online coaching', href: '/nata-online-coaching', hint: 'Live classes in the AI classroom' },
  { label: 'NATA coaching near you', href: '/coaching/nata-coaching', hint: 'By state and city' },
  { label: 'Free resources', href: '/free-resources', hint: 'Notes, guides and downloads' },
  { label: 'All free tools', href: '/tools', hint: 'Every tool with a full guide' },
];

export const CITY_LINKS: { label: string; href: string; hint: string }[] = [
  { label: 'Chennai', href: '/coaching/nata-coaching/nata-coaching-centers-in-chennai', hint: 'Classroom and online' },
  { label: 'Anna Nagar, Chennai', href: '/coaching/nata-coaching-chennai/anna-nagar', hint: 'Area guide' },
  { label: 'Coimbatore', href: '/coaching/nata-coaching/nata-coaching-centers-in-coimbatore', hint: 'Coaching and test centres' },
  { label: 'Madurai', href: '/coaching/nata-coaching/nata-coaching-centers-in-madurai', hint: 'Coaching and test centres' },
  { label: 'Trichy', href: '/coaching/nata-coaching/nata-coaching-centers-in-trichy', hint: 'Coaching and test centres' },
  { label: 'Bangalore', href: '/coaching/nata-coaching/nata-coaching-centers-in-bangalore', hint: 'Classroom and online' },
  { label: 'Tamil Nadu', href: '/coaching/nata-coaching-in-tamil-nadu', hint: 'Every city in the state' },
];

export const FAQS: { question: string; answer: string }[] = [
  {
    question: 'What is aiArchitek?',
    answer:
      'aiArchitek is the AI-powered architecture entrance platform from Neram Classes. It brings together free NATA and B.Arch tools (cutoff calculator, college predictor, exam centre finder, question bank and more) with AI-assisted learning in the Neram classroom.',
  },
  {
    question: 'Is aiArchitek free?',
    answer:
      'Yes. Every tool gives a free answer without signing in, and signing in with Google is also free and unlocks the full result. The AI classroom features are part of Neram Classes coaching for enrolled students.',
  },
  {
    question: 'What can I use aiArchitek for?',
    answer:
      'Checking eligibility, planning NATA sessions, finding test cities, practising questions, calculating your cutoff out of 400 and shortlisting B.Arch colleges. You can also ask the Aintra AI assistant any NATA or counselling question.',
  },
  {
    question: 'Does aiArchitek help with NATA preparation?',
    answer:
      'Yes. It covers the full NATA journey, from eligibility and exam planning to question practice and college choice. Enrolled students also get the AI Maths Teacher, question paper analysis and AI answer explanations in the Neram classroom.',
  },
  {
    question: 'Does aiArchitek have a NATA cutoff calculator?',
    answer:
      'Yes. The NATA Cutoff Calculator adds your 12th marks scaled to 200 and your best NATA score out of 200 to give the cutoff out of 400 used in B.Arch counselling, along with the 45% eligibility check.',
  },
  {
    question: 'Can aiArchitek help me find architecture colleges?',
    answer:
      'Yes. The College Predictor compares your score with past closing marks, the JoSAA B.Arch Predictor covers IITs, NITs and SPAs, and the COA Approval Checker confirms a college is approved by the Council of Architecture.',
  },
  {
    question: 'Does aiArchitek provide NATA practice questions?',
    answer:
      'Yes. The NATA Question Bank has real questions recalled by students, with answers and discussion. Topics and sample questions are open to everyone, and signing in shows every question.',
  },
  {
    question: 'Does aiArchitek provide AI-assisted learning?',
    answer:
      'Yes. Anyone can use the Aintra AI assistant on neramclasses.com. Inside the Neram classroom, students learn with an AI Maths Teacher, question paper analysis, AI answer explanations and AI class recaps. Personalized practice and an AI study planner are coming soon.',
  },
  {
    question: 'Who built aiArchitek?',
    answer:
      'aiArchitek is built by Neram Classes, which has coached students for NATA and JEE Paper 2 since 2009. The tools and the AI classroom are designed and run in-house by the same team that teaches the classes.',
  },
  {
    question: 'Is aiArchitek available across India?',
    answer:
      'Yes. The tools work on any phone or computer anywhere in India, and Neram runs live online classes nationwide, with classroom batches in Tamil Nadu and Bangalore.',
  },
  {
    question: 'What is the difference between aiArchitek and Nexus?',
    answer:
      'aiArchitek is the free toolkit anyone can use at app.neramclasses.com. Nexus is the Neram classroom for enrolled students, where live classes, tests, drawing reviews and the AI learning features run.',
  },
];
