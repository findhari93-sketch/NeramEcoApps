import { ToolConfig } from '../types';
import CollegePredictorTeaser from '@/components/tools/teasers/CollegePredictorTeaser';

export const collegePredictorConfig: ToolConfig = {
  slug: 'college-predictor',
  title: 'NATA College Predictor 2026',
  subtitle:
    'The NATA College Predictor helps you find the best architecture colleges that match your NATA 2026 score. Enter your score, select your preferred state and category, and instantly see a personalised list of B.Arch colleges ranked by admission probability. Our database covers 500+ colleges across 28 states and 8 union territories, including government institutions, private colleges, deemed universities, and NITs. Each college listing shows previous year cutoffs, annual fees, seat count, accreditation status, and the counselling body that manages admissions. Whether you scored 80 or 170, the predictor shows realistic options so you can plan your architecture career with confidence.',
  category: 'counseling',
  appUrl: 'https://app.neramclasses.com/tools/counseling/college-predictor',
  metaTitle: 'NATA College Predictor 2026: Find Colleges for Your Score',
  metaDescription:
    'Free NATA college predictor. Enter your score to find matching B.Arch colleges from 500+ institutions. Filter by state, fees, and admission probability.',
  keywords: [
    'NATA college predictor 2026',
    'JEE B.Arch college list',
    'architecture colleges by NATA score',
    'B.Arch college predictor',
    'NATA score wise college list',
    'NATA counselling predictor',
    'best architecture colleges for my score',
  ],
  ogImageTitle: 'NATA College Predictor',
  ogImageSubtitle: 'Find colleges for your score',
  trustBadges: ['500+ Colleges', '28 States', 'Free to Use', 'Updated 2026'],
  steps: [
    {
      title: 'Enter Your NATA Score',
      desc: 'Input your NATA 2026 total score (out of 200). You can also enter individual section scores for a more detailed analysis.',
    },
    {
      title: 'Set Your Preferences',
      desc: 'Choose your preferred state, category (General, OBC, SC, ST), college type (government or private), and fee budget.',
    },
    {
      title: 'Get Matched Colleges',
      desc: 'The tool analyses historical cutoffs and seat data to show colleges ranked by admission probability: High, Medium, or Low chance.',
    },
    {
      title: 'Save and Compare',
      desc: 'Shortlist colleges, compare fees and placement records side-by-side, and export your list for counselling preparation.',
    },
  ],
  features: [
    {
      title: '500+ Colleges Database',
      desc: 'Comprehensive coverage of B.Arch colleges across India, including IITs, NITs, government colleges, deemed universities, and private institutions.',
    },
    {
      title: 'State-wise Filtering',
      desc: 'Filter colleges by any of the 28 states and 8 union territories. Find options close to home or explore opportunities across India.',
    },
    {
      title: 'Category-based Predictions',
      desc: 'Get accurate cutoff predictions for your specific category (General, OBC, SC, ST, EWS) based on actual previous year data.',
    },
    {
      title: 'Fee and Placement Data',
      desc: 'View annual tuition fees, hostel charges, and placement statistics for each college to make informed financial decisions.',
    },
    {
      title: 'Admission Probability Score',
      desc: 'Each college gets a probability rating (High, Medium, Low) based on how your score compares to historical cutoffs.',
    },
    {
      title: 'Counselling Guide',
      desc: 'See which counselling body manages each college, important counselling dates, and step-by-step registration guidance.',
    },
  ],
  screenshots: {
    desktop: '/placeholder-desktop.png',
    mobile: '/placeholder-mobile.png',
    caption: 'NATA College Predictor showing matched colleges with cutoffs and fees',
    alt: 'NATA College Predictor tool interface',
  },
  contextHeading: 'NATA 2026 Score and College Admissions',
  contextContent: `<p>The National Aptitude Test in Architecture (NATA) 2026 is conducted by the Council of Architecture (CoA) for admission to B.Arch programmes across India. NATA is held in two sessions, and the better score of the two attempts is considered for admissions. The exam is scored out of 200 marks, with sections covering Mathematics (20 MCQs, 40 marks), General Aptitude (40 MCQs, 80 marks), and Drawing (2 questions, 80 marks).</p><p>After the NATA results are declared, the real challenge begins: choosing the right college. With over 500 architecture colleges across India, each with different cutoffs, fee structures, and counselling processes, the decision can be overwhelming. Government colleges like IIT Kharagpur, IIT Roorkee, NIT Trichy, and SPA Delhi have cutoffs above 140, while many quality private colleges admit students scoring between 80 and 120.</p><p>Our College Predictor simplifies this process by mapping your score to realistic college options. Instead of manually checking hundreds of college websites, you get a curated, ranked list in seconds. The tool is updated after every counselling round with the latest cutoff data, ensuring predictions remain accurate throughout the admission cycle.</p>`,
  faqs: [
    {
      question: 'How does the NATA College Predictor work?',
      answer:
        'The NATA College Predictor uses historical cutoff data, seat availability, and counselling trends from 500+ architecture colleges across India. Enter your NATA score, preferred state, and category. The tool matches you with colleges where your score meets or exceeds previous year cutoffs, ranked by admission probability.',
    },
    {
      question: 'How many colleges are in the NATA College Predictor database?',
      answer:
        'Our database includes 500+ architecture colleges across India offering B.Arch programmes. This covers government colleges, deemed universities, private institutions, and NITs. We update cutoff data after every counselling round to keep predictions accurate.',
    },
    {
      question: 'Can I filter colleges by state, fees, or college type?',
      answer:
        'Yes. The college predictor lets you filter results by state or union territory, fee range (low to high), college type (government, private, deemed university), and accreditation status (NAAC, NBA). You can also sort results by cutoff rank, annual fees, or placement record.',
    },
    {
      question: 'Is the NATA College Predictor free to use?',
      answer:
        'Yes, the NATA College Predictor is completely free. You can check unlimited colleges, apply multiple filters, and save your shortlist, all without any registration or payment. Premium features like detailed placement data and seat matrix are available in the Neram Classes app.',
    },
    {
      question: 'What is the counselling process for NATA 2026 admissions?',
      answer:
        'NATA scores are accepted by state-level counselling bodies and individual colleges. After results are declared, you register for counselling (state or college-level), fill preferences, and seats are allotted based on merit rank and availability. Our predictor shows which counselling body manages each college.',
    },
    {
      question: 'Does the predictor work for JEE Paper 2 scores as well?',
      answer:
        'Currently, the predictor is optimised for NATA scores. Many colleges accept both NATA and JEE Paper 2. We display which exam each college accepts, so you can plan accordingly. A dedicated JEE Paper 2 predictor is coming soon.',
    },
  ],
  relatedToolSlugs: ['cutoff-calculator', 'rank-predictor', 'cost-calculator'],
  teaserComponent: CollegePredictorTeaser,
};
