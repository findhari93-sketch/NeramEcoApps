import Fuse from 'fuse.js';
import { GENERATED_COLLEGE_INDEX } from './generated-search-index';

// ─── Types ──────────────────────────────────────────────────────

export type SearchCategory =
  | 'page'
  | 'course'
  | 'tool'
  | 'nata'
  | 'blog'
  | 'legal'
  | 'college'
  | 'coaching'
  | 'counseling';

export interface SearchEntry {
  path: string;
  title: string;
  description: string;
  keywords: string[];
  category: SearchCategory;
}

// ─── Category Configuration ─────────────────────────────────────

export const CATEGORY_CONFIG: Record<
  SearchCategory,
  { label: string; color: string; maxResults: number }
> = {
  college: { label: 'Colleges', color: '#2e7d32', maxResults: 3 },
  page: { label: 'Pages', color: '#1976d2', maxResults: 4 },
  course: { label: 'Courses', color: '#7b1fa2', maxResults: 3 },
  tool: { label: 'Free Tools', color: '#ed6c02', maxResults: 3 },
  nata: { label: 'NATA 2026', color: '#9c27b0', maxResults: 3 },
  coaching: { label: 'Coaching', color: '#0288d1', maxResults: 3 },
  counseling: { label: 'Counseling', color: '#00796b', maxResults: 3 },
  blog: { label: 'Blog', color: '#0288d1', maxResults: 2 },
  legal: { label: 'Legal', color: '#757575', maxResults: 2 },
};

// Display order for grouped results
export const CATEGORY_ORDER: SearchCategory[] = [
  'college',
  'page',
  'course',
  'tool',
  'nata',
  'coaching',
  'counseling',
  'blog',
  'legal',
];

export function getCategoryLabel(category: SearchCategory): string {
  return CATEGORY_CONFIG[category].label;
}

export function getCategoryColor(category: SearchCategory): string {
  return CATEGORY_CONFIG[category].color;
}

// ─── Static Search Index ────────────────────────────────────────

const STATIC_INDEX: SearchEntry[] = [
  // ── Main Pages ──────────────────────────────────────────────
  {
    path: '/',
    title: 'Home',
    description: 'Best NATA & JEE Paper 2 coaching in India. Online and offline classes with expert IIT/NIT alumni faculty.',
    keywords: ['home', 'neram classes', 'nata coaching', 'jee paper 2'],
    category: 'page',
  },
  {
    path: '/about',
    title: 'About Neram Classes',
    description: 'Learn about our mission, faculty, and 99.9% success rate in NATA coaching.',
    keywords: ['about', 'mission', 'faculty', 'team', 'history'],
    category: 'page',
  },
  {
    path: '/courses',
    title: 'Courses',
    description: 'Browse all courses: NATA coaching, JEE Paper 2, Revit, AutoCAD, SketchUp training.',
    keywords: ['courses', 'programs', 'coaching', 'training', 'classes'],
    category: 'course',
  },
  {
    path: '/fees',
    title: 'Fee Structure',
    description: 'Course fees, payment options, installment plans. Crash Course ₹15,000, 1-Year ₹25,000, 2-Year ₹30,000.',
    keywords: ['fees', 'price', 'cost', 'payment', 'installment', 'pricing'],
    category: 'page',
  },
  {
    path: '/apply',
    title: 'Apply Now',
    description: 'Start your application to join Neram Classes. Simple online application form.',
    keywords: ['apply', 'admission', 'registration', 'join', 'enroll', 'application'],
    category: 'page',
  },
  {
    path: '/contact',
    title: 'Contact Us',
    description: 'Get in touch: phone, email, office hours, and center locations.',
    keywords: ['contact', 'phone', 'email', 'address', 'location', 'support', 'help'],
    category: 'page',
  },
  {
    path: '/centers',
    title: 'Our Centers',
    description: 'Find offline coaching centers in Coimbatore, Chennai, Bangalore, Madurai, Trichy, and more.',
    keywords: ['centers', 'offline', 'location', 'address', 'visit', 'branch'],
    category: 'page',
  },
  {
    path: '/demo-class',
    title: 'Book a Free Demo Class',
    description: 'Attend a free demo class on Sundays. Experience our teaching methodology before enrolling.',
    keywords: ['demo', 'free class', 'trial', 'sample', 'try'],
    category: 'page',
  },
  {
    path: '/testimonials',
    title: 'Student Testimonials',
    description: 'Hear from our students: success stories, reviews, and experiences at Neram Classes.',
    keywords: ['testimonials', 'reviews', 'success stories', 'students', 'feedback'],
    category: 'page',
  },
  {
    path: '/achievements',
    title: 'Achievements',
    description: 'Our students\' achievements: top ranks, college placements, and NATA scores.',
    keywords: ['achievements', 'results', 'toppers', 'ranks', 'placements'],
    category: 'page',
  },
  {
    path: '/alumni',
    title: 'Alumni Network',
    description: 'Connect with our alumni network of architecture professionals across India.',
    keywords: ['alumni', 'network', 'graduates', 'community'],
    category: 'page',
  },
  {
    path: '/scholarship',
    title: 'Scholarship',
    description: 'Apply for scholarships based on academic performance and financial background.',
    keywords: ['scholarship', 'financial aid', 'discount', 'merit'],
    category: 'page',
  },
  {
    path: '/careers',
    title: 'Careers at Neram Classes',
    description: 'Join our team: open positions for teachers, content creators, and more.',
    keywords: ['careers', 'jobs', 'hiring', 'work', 'positions'],
    category: 'page',
  },
  {
    path: '/youtube-reward',
    title: 'YouTube Subscription Reward',
    description: 'Subscribe to our YouTube channel and get Rs. 50 off on your course fee.',
    keywords: ['youtube', 'reward', 'discount', 'subscribe', 'offer'],
    category: 'page',
  },
  {
    path: '/free-resources',
    title: 'Free Resources',
    description: 'Free NATA study materials, practice papers, and learning resources.',
    keywords: ['free', 'resources', 'study material', 'practice', 'download'],
    category: 'page',
  },
  {
    path: '/blog',
    title: 'Blog',
    description: 'Articles about NATA preparation, architecture careers, and coaching tips.',
    keywords: ['blog', 'articles', 'news', 'tips', 'guides'],
    category: 'blog',
  },
  {
    path: '/enroll',
    title: 'Enroll Now',
    description: 'Complete your enrollment and start your coaching journey with Neram Classes.',
    keywords: ['enroll', 'enrollment', 'register', 'join', 'start'],
    category: 'page',
  },
  {
    path: '/my-enrollment',
    title: 'My Enrollment',
    description: 'View your enrollment details, batch schedule, and payment history.',
    keywords: ['my enrollment', 'dashboard', 'batch', 'schedule'],
    category: 'page',
  },
  {
    path: '/premium',
    title: 'Premium Programs',
    description: 'Premium coaching with 1-on-1 mentoring and personalized study plans.',
    keywords: ['premium', 'personal mentoring', '1-on-1', 'exclusive'],
    category: 'course',
  },
  {
    path: '/pay',
    title: 'Make a Payment',
    description: 'Pay your course fees online via Razorpay. UPI, cards, net banking accepted.',
    keywords: ['pay', 'payment', 'razorpay', 'upi', 'fees'],
    category: 'page',
  },

  // ── Coaching Pages ──────────────────────────────────────────
  {
    path: '/coaching',
    title: 'Coaching Programs',
    description: 'Explore our coaching programs for NATA and JEE Paper 2 entrance exams.',
    keywords: ['coaching', 'programs', 'nata', 'jee'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching',
    title: 'NATA Coaching',
    description: 'Comprehensive NATA 2026 coaching with expert faculty, mock tests, and daily drawing practice.',
    keywords: ['nata coaching', 'nata preparation', 'nata classes', 'nata course'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching-center-in-tamil-nadu',
    title: 'NATA Coaching Centers in Tamil Nadu',
    description: 'Find NATA coaching centers across all 38 districts of Tamil Nadu.',
    keywords: ['tamil nadu', 'nata center', 'offline coaching', 'chennai', 'coimbatore'],
    category: 'coaching',
  },
  {
    path: '/coaching/best-nata-coaching-india',
    title: 'Best NATA Coaching in India',
    description: 'Why Neram Classes is rated the best NATA coaching institute in India.',
    keywords: ['best nata coaching', 'top coaching', 'india', 'ranking'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching-chennai',
    title: 'NATA Coaching in Chennai',
    description: 'NATA coaching centers in Chennai: Anna Nagar, Adyar, Tambaram, T. Nagar, Velachery.',
    keywords: ['chennai', 'nata coaching chennai', 'anna nagar', 'adyar', 'tambaram'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching-chennai/anna-nagar',
    title: 'NATA Coaching: Anna Nagar, Chennai',
    description: 'Neram Classes Anna Nagar branch. Offline NATA coaching in central Chennai.',
    keywords: ['anna nagar', 'chennai', 'offline', 'branch'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching-chennai/adyar',
    title: 'NATA Coaching: Adyar, Chennai',
    description: 'Neram Classes Adyar branch. Offline NATA coaching in south Chennai.',
    keywords: ['adyar', 'chennai', 'offline', 'branch', 'south chennai'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching-chennai/tambaram',
    title: 'NATA Coaching: Tambaram, Chennai',
    description: 'Neram Classes Tambaram branch. Offline NATA coaching near Tambaram station.',
    keywords: ['tambaram', 'chennai', 'offline', 'branch'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching-chennai/velachery',
    title: 'NATA Coaching: Velachery, Chennai',
    description: 'Neram Classes Velachery branch. Offline NATA coaching in south-east Chennai.',
    keywords: ['velachery', 'chennai', 'offline', 'branch'],
    category: 'coaching',
  },
  {
    path: '/coaching/nata-coaching-chennai/t-nagar',
    title: 'NATA Coaching: T. Nagar, Chennai',
    description: 'Neram Classes T. Nagar branch. Offline NATA coaching in central Chennai.',
    keywords: ['t nagar', 'chennai', 'offline', 'branch', 'central chennai'],
    category: 'coaching',
  },
  {
    path: '/best-nata-coaching-online',
    title: 'Best NATA Coaching Online',
    description: 'Why Neram Classes is the best online NATA coaching with 99.9% success rate.',
    keywords: ['online coaching', 'best nata', 'online classes'],
    category: 'coaching',
  },
  {
    path: '/jee-paper-2-preparation',
    title: 'JEE Paper 2 Preparation',
    description: 'Complete JEE Paper 2 (B.Arch/B.Planning) preparation guide and coaching.',
    keywords: ['jee paper 2', 'b.arch', 'b.planning', 'jee main'],
    category: 'course',
  },

  // ── NATA 2026 Hub ───────────────────────────────────────────
  {
    path: '/nata-2026',
    title: 'NATA 2026: Complete Guide',
    description: 'Everything about NATA 2026: dates, pattern, eligibility, fees, and preparation tips.',
    keywords: ['nata 2026', 'nata exam', 'nata guide'],
    category: 'nata',
  },
  {
    path: '/nata-2026/exam-pattern',
    title: 'NATA 2026 Exam Pattern',
    description: 'NATA 2026 exam pattern: Part A (Drawing 80 marks) + Part B (MCQ 120 marks), 3 hours.',
    keywords: ['exam pattern', 'paper pattern', 'marks', 'sections', 'questions'],
    category: 'nata',
  },
  {
    path: '/nata-2026/syllabus',
    title: 'NATA 2026 Syllabus',
    description: 'Complete NATA 2026 syllabus: Mathematics, General Aptitude, and Drawing.',
    keywords: ['syllabus', 'topics', 'subjects', 'curriculum'],
    category: 'nata',
  },
  {
    path: '/nata-2026/eligibility',
    title: 'NATA 2026 Eligibility',
    description: 'NATA eligibility criteria: qualifications, age limit, and subject requirements.',
    keywords: ['eligibility', 'qualifications', 'criteria', 'age limit', 'who can apply'],
    category: 'nata',
  },
  {
    path: '/nata-2026/important-dates',
    title: 'NATA 2026 Important Dates',
    description: 'NATA 2026 key dates: registration, exam dates, results, counseling schedule.',
    keywords: ['dates', 'schedule', 'when', 'registration', 'exam date', 'result date'],
    category: 'nata',
  },
  {
    path: '/nata-2026/fee-structure',
    title: 'NATA 2026 Exam Fee',
    description: 'NATA 2026 exam fee: General ₹1,750, SC/ST ₹1,250, Transgender ₹1,000.',
    keywords: ['nata fee', 'exam fee', 'registration fee', 'application fee'],
    category: 'nata',
  },
  {
    path: '/nata-2026/how-to-apply',
    title: 'How to Apply for NATA 2026',
    description: 'Step-by-step guide to apply for NATA 2026 at nata.in.',
    keywords: ['how to apply', 'registration', 'application process', 'nata.in'],
    category: 'nata',
  },
  {
    path: '/nata-2026/admit-card',
    title: 'NATA 2026 Admit Card',
    description: 'Download NATA 2026 admit card: hall ticket, exam day instructions.',
    keywords: ['admit card', 'hall ticket', 'download', 'exam day'],
    category: 'nata',
  },
  {
    path: '/nata-2026/exam-centers',
    title: 'NATA 2026 Exam Centers',
    description: 'Find NATA exam centers across India and Dubai: 80+ cities.',
    keywords: ['exam centers', 'test centers', 'cities', 'venue'],
    category: 'nata',
  },
  {
    path: '/nata-2026/drawing-test',
    title: 'NATA Drawing Test',
    description: 'NATA drawing test guide: composition, sketching, 3D composition tips.',
    keywords: ['drawing', 'sketching', 'art', 'composition', '3d'],
    category: 'nata',
  },
  {
    path: '/nata-2026/scoring-and-results',
    title: 'NATA 2026 Scoring & Results',
    description: 'NATA scoring system, percentile calculation, and result dates.',
    keywords: ['scoring', 'results', 'percentile', 'marks', 'cutoff'],
    category: 'nata',
  },
  {
    path: '/nata-2026/preparation-tips',
    title: 'NATA Preparation Tips',
    description: 'Expert tips to crack NATA 2026: study plan, drawing practice, time management.',
    keywords: ['tips', 'preparation', 'study plan', 'strategy', 'how to crack'],
    category: 'nata',
  },
  {
    path: '/nata-2026/best-books',
    title: 'Best Books for NATA 2026',
    description: 'Recommended books for NATA preparation: Mathematics, Aptitude, and Drawing.',
    keywords: ['books', 'recommended', 'study material', 'reference'],
    category: 'nata',
  },
  {
    path: '/nata-2026/previous-year-papers',
    title: 'NATA Previous Year Papers',
    description: 'Download NATA previous year question papers with solutions.',
    keywords: ['previous year', 'question papers', 'past papers', 'solutions'],
    category: 'nata',
  },
  {
    path: '/nata-2026/cutoff-calculator',
    title: 'NATA Cutoff Calculator',
    description: 'Calculate college cutoffs based on your NATA score.',
    keywords: ['cutoff', 'calculator', 'score', 'prediction'],
    category: 'nata',
  },
  {
    path: '/nata-2026/dos-and-donts',
    title: 'NATA Exam Day Do\'s & Don\'ts',
    description: 'What to bring, what to avoid, and exam day tips for NATA 2026.',
    keywords: ['dos and donts', 'exam day', 'what to bring', 'tips'],
    category: 'nata',
  },
  {
    path: '/nata-2026/photo-signature-requirements',
    title: 'NATA Photo & Signature Requirements',
    description: 'Photo and signature specifications for NATA 2026 application.',
    keywords: ['photo', 'signature', 'requirements', 'specifications', 'upload'],
    category: 'nata',
  },

  // ── Study Resources ─────────────────────────────────────────
  {
    path: '/nata-syllabus',
    title: 'NATA Syllabus Guide',
    description: 'Detailed NATA syllabus breakdown with topic-wise weightage.',
    keywords: ['syllabus', 'topics', 'weightage'],
    category: 'nata',
  },
  {
    path: '/nata-preparation-guide',
    title: 'NATA Preparation Guide',
    description: 'Complete step-by-step NATA preparation guide for beginners.',
    keywords: ['preparation guide', 'study plan', 'beginner', 'how to start'],
    category: 'nata',
  },
  {
    path: '/nata-important-questions',
    title: 'NATA Important Questions',
    description: 'Most frequently asked NATA questions with answers and solutions.',
    keywords: ['important questions', 'frequently asked', 'practice'],
    category: 'nata',
  },
  {
    path: '/how-to-score-150-in-nata',
    title: 'How to Score 150+ in NATA',
    description: 'Strategy guide to score 150+ marks in NATA: study plan, tips, and practice.',
    keywords: ['score 150', 'high score', 'strategy', 'marks'],
    category: 'nata',
  },
  {
    path: '/previous-year-papers',
    title: 'Previous Year Papers',
    description: 'Download NATA and JEE Paper 2 previous year question papers.',
    keywords: ['previous year', 'papers', 'download', 'questions'],
    category: 'nata',
  },
  {
    path: '/best-books-nata-jee',
    title: 'Best Books for NATA & JEE',
    description: 'Top recommended books for NATA and JEE Paper 2 preparation.',
    keywords: ['books', 'nata books', 'jee books', 'recommended'],
    category: 'nata',
  },

  // ── Free Tools ──────────────────────────────────────────────
  {
    path: '/tools/question-bank',
    title: 'Free Question Bank',
    description: 'Practice 1000+ NATA questions: MCQ, aptitude, and drawing practice.',
    keywords: ['question bank', 'practice', 'mcq', 'questions', 'free'],
    category: 'tool',
  },
  {
    path: '/tools/cutoff-calculator',
    title: 'Cutoff Calculator',
    description: 'Calculate NATA cutoff scores for architecture colleges across India.',
    keywords: ['cutoff', 'calculator', 'college', 'score'],
    category: 'tool',
  },
  {
    path: '/tools/college-predictor',
    title: 'College Predictor',
    description: 'Predict which architecture colleges you can get based on your NATA score.',
    keywords: ['college predictor', 'predict', 'chances', 'admission'],
    category: 'tool',
  },
  {
    path: '/tools/exam-centers',
    title: 'Exam Centers Finder',
    description: 'Find NATA exam centers near you across 80+ cities in India.',
    keywords: ['exam centers', 'find', 'near me', 'location'],
    category: 'tool',
  },
  {
    path: '/tools',
    title: 'Free NATA & B.Arch Tools',
    description: '10+ free tools for NATA and B.Arch aspirants. Calculate cutoffs, predict colleges, estimate rank, and more.',
    keywords: ['tools', 'free tools', 'nata tools', 'calculator'],
    category: 'tool',
  },
  {
    path: '/tools/rank-predictor',
    title: 'Rank Predictor',
    description: 'Estimate your NATA All India Rank based on your score.',
    keywords: ['rank predictor', 'rank', 'estimate', 'AIR'],
    category: 'tool',
  },
  {
    path: '/tools/eligibility-checker',
    title: 'Eligibility Checker',
    description: 'Check if you meet the NATA 2026 eligibility criteria.',
    keywords: ['eligibility', 'checker', 'criteria', 'eligible'],
    category: 'tool',
  },
  {
    path: '/tools/exam-planner',
    title: 'Exam Planner',
    description: 'NATA 2026 exam countdown and study planning tool.',
    keywords: ['exam planner', 'countdown', 'study plan', 'dates'],
    category: 'tool',
  },
  {
    path: '/tools/coa-checker',
    title: 'COA Checker',
    description: 'Check if an architecture college is COA approved.',
    keywords: ['coa', 'approved', 'council of architecture', 'check'],
    category: 'tool',
  },
  {
    path: '/tools/cost-calculator',
    title: 'Cost Calculator',
    description: 'Calculate the total cost of a B.Arch education by college type.',
    keywords: ['cost', 'calculator', 'fees', 'education cost'],
    category: 'tool',
  },
  {
    path: '/tools/counseling-insights',
    title: 'Counseling Insights',
    description: 'State-wise NATA counseling data and admission insights.',
    keywords: ['counseling', 'insights', 'state', 'admission'],
    category: 'tool',
  },
  {
    path: '/nata-app',
    title: 'Neram App',
    description: 'Download the Neram app: AI-powered NATA preparation on your phone.',
    keywords: ['app', 'download', 'mobile', 'android', 'ios'],
    category: 'tool',
  },

  // ── Counseling ──────────────────────────────────────────────
  {
    path: '/counseling',
    title: 'Counseling Services',
    description: 'Expert guidance for architecture college admissions and NATA preparation strategy.',
    keywords: ['counseling', 'guidance', 'admission', 'career'],
    category: 'counseling',
  },
  {
    path: '/counseling/tnea-barch',
    title: 'TNEA B.Arch Counseling',
    description: 'Complete guide to TNEA B.Arch counseling process, cutoffs, and college selection.',
    keywords: ['tnea', 'b.arch', 'counseling', 'tamil nadu', 'anna university'],
    category: 'counseling',
  },

  // ── College Category Pages ──────────────────────────────────
  {
    path: '/colleges',
    title: 'Browse All Architecture Colleges',
    description: 'Explore 500+ architecture colleges across India. Filter by state, fees, ranking.',
    keywords: ['colleges', 'architecture colleges', 'browse', 'all colleges', 'india'],
    category: 'college',
  },
  {
    path: '/colleges/compare',
    title: 'Compare Architecture Colleges',
    description: 'Compare colleges side-by-side: fees, rankings, placements, facilities.',
    keywords: ['compare', 'comparison', 'vs', 'side by side'],
    category: 'college',
  },
  {
    path: '/colleges/rankings/nirf',
    title: 'NIRF Architecture Rankings',
    description: 'NIRF ranking of architecture colleges in India. Government and private.',
    keywords: ['nirf', 'ranking', 'top colleges', 'best colleges'],
    category: 'college',
  },
  {
    path: '/colleges/rankings/archindex',
    title: 'ArchIndex College Rankings',
    description: 'ArchIndex score-based ranking of architecture colleges. Data-driven comparison.',
    keywords: ['archindex', 'ranking', 'score', 'architecture'],
    category: 'college',
  },
  {
    path: '/colleges/tnea',
    title: 'TNEA Architecture Colleges',
    description: 'Architecture colleges accepting TNEA counseling for B.Arch admissions in Tamil Nadu.',
    keywords: ['tnea', 'tamil nadu', 'b.arch', 'counseling', 'anna university'],
    category: 'college',
  },
  {
    path: '/colleges/josaa',
    title: 'JoSAA Architecture Colleges',
    description: 'Architecture colleges accepting JoSAA counseling for B.Arch admissions (IITs, NITs, SPAs).',
    keywords: ['josaa', 'iit', 'nit', 'spa', 'central counseling'],
    category: 'college',
  },
  {
    path: '/nata-hub',
    title: 'NATA Hub: Colleges Accepting NATA',
    description: 'All architecture colleges accepting NATA scores for B.Arch admissions.',
    keywords: ['nata hub', 'nata colleges', 'nata accepting', 'b.arch'],
    category: 'college',
  },
  {
    path: '/jee-barch-hub',
    title: 'JEE B.Arch Hub',
    description: 'Architecture colleges accepting JEE Paper 2 scores for B.Arch admissions.',
    keywords: ['jee barch', 'jee paper 2', 'jee colleges', 'b.arch'],
    category: 'college',
  },
  {
    path: '/colleges/fees/below-1-lakh',
    title: 'Colleges Below ₹1 Lakh/Year',
    description: 'Affordable architecture colleges with annual fees under ₹1 lakh.',
    keywords: ['cheap', 'affordable', 'below 1 lakh', 'low fees', 'budget'],
    category: 'college',
  },
  {
    path: '/colleges/fees/below-2-lakhs',
    title: 'Colleges Below ₹2 Lakhs/Year',
    description: 'Architecture colleges with annual fees under ₹2 lakhs.',
    keywords: ['below 2 lakhs', 'moderate fees'],
    category: 'college',
  },
  {
    path: '/colleges/fees/below-5-lakhs',
    title: 'Colleges Below ₹5 Lakhs/Year',
    description: 'Architecture colleges with annual fees under ₹5 lakhs.',
    keywords: ['below 5 lakhs', 'mid range fees'],
    category: 'college',
  },

  // ── Legal ───────────────────────────────────────────────────
  {
    path: '/terms',
    title: 'Terms & Conditions',
    description: 'Terms and conditions for using Neram Classes services.',
    keywords: ['terms', 'conditions', 'legal', 'agreement'],
    category: 'legal',
  },
  {
    path: '/privacy',
    title: 'Privacy Policy',
    description: 'How we collect, use, and protect your personal information.',
    keywords: ['privacy', 'data', 'policy', 'personal information'],
    category: 'legal',
  },
  {
    path: '/refund-policy',
    title: 'Refund Policy',
    description: 'Refund policy: 24-hour window, 30% processing fee. Full details.',
    keywords: ['refund', 'cancellation', 'money back', 'return'],
    category: 'legal',
  },
];

// ─── Merged Index ───────────────────────────────────────────────

export const SEARCH_INDEX: SearchEntry[] = [
  ...STATIC_INDEX,
  ...GENERATED_COLLEGE_INDEX,
];

// ─── Fuse.js Search ─────────────────────────────────────────────

const fuse = new Fuse(SEARCH_INDEX, {
  keys: [
    { name: 'title', weight: 0.4 },
    { name: 'keywords', weight: 0.35 },
    { name: 'description', weight: 0.25 },
  ],
  threshold: 0.3,
  distance: 100,
  minMatchCharLength: 2,
  includeScore: true,
  shouldSort: true,
});

export interface GroupedResults {
  category: SearchCategory;
  results: SearchEntry[];
  totalCount: number;
}

export function searchPages(query: string): GroupedResults[] {
  if (!query.trim()) return [];

  const fuseResults = fuse.search(query.trim(), { limit: 50 });

  // Group results by category
  const grouped = new Map<SearchCategory, SearchEntry[]>();
  for (const result of fuseResults) {
    const cat = result.item.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(result.item);
  }

  // Build ordered result groups
  const output: GroupedResults[] = [];
  for (const cat of CATEGORY_ORDER) {
    const items = grouped.get(cat);
    if (!items || items.length === 0) continue;
    output.push({
      category: cat,
      results: items.slice(0, CATEGORY_CONFIG[cat].maxResults),
      totalCount: items.length,
    });
  }

  return output;
}

// ─── Quick Links (shown on empty query) ─────────────────────────

export const QUICK_LINKS: SearchEntry[] = [
  STATIC_INDEX.find((e) => e.path === '/apply')!,
  STATIC_INDEX.find((e) => e.path === '/courses')!,
  STATIC_INDEX.find((e) => e.path === '/colleges')!,
  STATIC_INDEX.find((e) => e.path === '/tools/cutoff-calculator')!,
].filter(Boolean);
