// Static data for the aiArchitek landing page

export interface Tool {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: string;
  color: string;
  featured?: boolean;
  badge?: string;
}

export const TOOLS: Tool[] = [
  {
    id: 'cutoff-calculator',
    title: 'Cutoff Calculator',
    description: 'Calculate your NATA cutoff scores and predict your chances based on previous year trends and category-wise analysis.',
    href: '/tools/nata/cutoff-calculator',
    icon: 'Calculator',
    color: '#e8a020',
    featured: true,
  },
  {
    id: 'college-predictor',
    title: 'College Predictor',
    description: 'Find the best architecture colleges based on your NATA score. Browse 5,000+ B.Arch colleges across India with fee details.',
    href: '/tools/nata/college-predictor',
    icon: 'School',
    color: '#1a8fff',
    featured: true,
    badge: '5000+ Colleges',
  },
  {
    id: 'exam-centers',
    title: 'Exam Centers',
    description: 'Locate NATA exam centers near you with detailed information, distance calculation, and directions.',
    href: '/tools/nata/exam-centers',
    icon: 'LocationOn',
    color: '#22c55e',
  },
  {
    id: 'question-bank',
    title: 'Question Bank',
    description: 'Access community-shared past NATA exam questions with answers, confidence ratings, and discussion.',
    href: '/tools/nata/question-bank',
    icon: 'Quiz',
    color: '#a855f7',
  },
  {
    id: 'image-crop',
    title: 'Image Crop Tool',
    description: 'Crop and resize passport photos for NATA applications with the correct dimensions.',
    href: '/tools/nata/image-crop',
    icon: 'Crop',
    color: '#06b6d4',
  },
];

export const COMING_SOON_TOOLS = [
  'Seat Matrix',
  'College Reviews',
  'Eligibility Checker',
  'Cost Calculator',
] as const;

export const STEPS = [
  {
    number: 1,
    title: 'Sign Up Free',
    description: 'Create your account instantly with Google or Phone OTP. No credit card required.',
    icon: 'PersonAdd',
  },
  {
    number: 2,
    title: 'Choose Your Tools',
    description: 'Access our suite of NATA preparation tools — cutoff calculator, college predictor, and more.',
    icon: 'Dashboard',
  },
  {
    number: 3,
    title: 'Get Results Instantly',
    description: 'AI-powered insights help you make informed decisions about your architecture career.',
    icon: 'Bolt',
  },
] as const;

export const STATS = [
  { value: '5,000+', label: 'Students Using Our Tools' },
  { value: '5,000+', label: 'Colleges in Database' },
  { value: '4.8/5', label: 'Average Rating' },
  { value: 'IIT/NIT', label: 'Alumni Faculty' },
] as const;

export const FAQS = [
  {
    question: 'What is aiArchitek?',
    answer: 'aiArchitek is a free NATA exam preparation app built by Neram Classes. It provides AI-powered tools like cutoff calculators, college predictors for 5,000+ colleges, exam center finders, and a community question bank to help architecture aspirants prepare for NATA 2026.',
  },
  {
    question: 'Is aiArchitek free to use?',
    answer: 'Yes, aiArchitek is completely free. All our NATA preparation tools including the cutoff calculator, college predictor, exam center locator, and question bank are available at no cost. You can install it as a PWA on your phone for offline access.',
  },
  {
    question: 'How accurate is the NATA cutoff calculator?',
    answer: 'Our NATA cutoff calculator is based on real data from previous years including section-wise scores and category-based cutoffs. While past cutoffs provide strong indicators, actual cutoffs may vary each year based on difficulty level and number of applicants.',
  },
  {
    question: 'How many colleges are in the college predictor?',
    answer: 'Our college predictor database includes over 5,000 B.Arch colleges across India. You can filter by state, city, fee range, and NATA score to find the best architecture colleges matching your profile and preferences.',
  },
  {
    question: 'Can I use aiArchitek offline?',
    answer: 'Yes! aiArchitek is a Progressive Web App (PWA) that you can install on your phone or computer. Once installed, core features work offline. Simply visit app.neramclasses.com and tap "Install" when prompted by your browser.',
  },
  {
    question: 'Who built aiArchitek?',
    answer: 'aiArchitek is built by Neram Classes, a premier NATA and JEE Paper 2 coaching institute founded by IIT/NIT alumni. Our team combines deep expertise in architecture entrance exams with modern technology to create the best preparation tools.',
  },
  {
    question: 'What is the NATA exam?',
    answer: 'NATA (National Aptitude Test in Architecture) is an entrance exam conducted by the Council of Architecture (CoA) for admission to B.Arch programs across India. It tests aptitude in drawing, observation, mathematics, and general knowledge related to architecture.',
  },
  {
    question: 'When is NATA 2026?',
    answer: 'NATA 2026 is expected to be conducted in multiple sessions starting from April 2026. The Council of Architecture typically announces exact dates 2-3 months before the exam. Stay updated by using our app for the latest exam schedule and notifications.',
  },
  {
    question: 'How to prepare for NATA effectively?',
    answer: 'To prepare for NATA effectively: 1) Use the cutoff calculator to set target scores, 2) Practice with our question bank of past papers, 3) Research colleges with the predictor to stay motivated, 4) Find your nearest exam center early, and 5) Join Neram Classes for expert coaching from IIT/NIT alumni.',
  },
  {
    question: 'Does aiArchitek support JEE Paper 2?',
    answer: 'JEE Paper 2 (B.Arch) tools including seat matrix, eligibility checker, and rank predictor are currently under development and will be available soon. Sign up now to get notified when JEE Paper 2 tools launch.',
  },
] as const;

export const NAV_LINKS = [
  { label: 'Tools', href: '#tools' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'FAQ', href: '#faq' },
] as const;
