import ExamCentersTeaser from '@/components/tools/teasers/ExamCentersTeaser';
import type { ToolConfig } from '../types';

export const examCentersConfig: ToolConfig = {
  slug: 'exam-centers',
  title: 'NATA Exam Centers 2026',
  subtitle:
    'Find NATA 2026 exam centers near you with our free Exam Center Finder. NATA is conducted across 96 cities in 26 states through TCS iON infrastructure. Search centers by city, state, or PIN code, view approximate distances from your location, and check confidence ratings based on historical center data.',
  category: 'nata',
  appUrl: 'https://app.neramclasses.com/tools/nata/exam-centers',
  metaTitle: 'NATA Exam Centers 2026: Find Test Centers in 96 Cities',
  metaDescription:
    'Find NATA 2026 exam centers near you. Search 96 cities across 26 states with TCS iON verified centers, distance calculator, and confidence ratings.',
  keywords: [
    'NATA exam centers 2026',
    'NATA test center list',
    'NATA exam center near me',
    'TCS iON centers NATA',
    'NATA 2026 city list',
    'JEE Paper 2 exam centers',
  ],
  ogImageTitle: 'NATA Exam Centers 2026',
  ogImageSubtitle: 'Find centers in 96 cities',
  trustBadges: ['96 Cities', '26 States', 'TCS iON Verified'],
  steps: [
    {
      title: 'Search Your City',
      desc: 'Type your city name, state, or PIN code. The tool auto-suggests matching locations and shows all nearby NATA exam centers.',
    },
    {
      title: 'View Center Details',
      desc: 'Each center shows TCS iON verification status, estimated seating capacity, confidence rating (High/Medium/Low), and the address.',
    },
    {
      title: 'Check Distance',
      desc: 'See approximate distance from your location to each center. Plan travel time and identify the most convenient option.',
    },
    {
      title: 'Plan Exam Day',
      desc: 'View nearby hotels, transport options, and exam day tips. Save your preferred center for quick reference on exam day.',
    },
  ],
  features: [
    {
      title: '96 Cities Covered',
      desc: 'Complete coverage of all NATA 2026 exam cities across 26 states and union territories, including international centers in Dubai, Muscat, and Kathmandu.',
    },
    {
      title: 'TCS iON Verified',
      desc: 'Every listed center is verified against TCS iON infrastructure data. Centers marked as "Verified" have confirmed TCS iON presence from previous exam cycles.',
    },
    {
      title: 'Confidence Ratings',
      desc: 'Each center gets a confidence rating (High, Medium, Low) based on how consistently it has been used as a NATA center in previous years.',
    },
    {
      title: 'Distance Calculator',
      desc: 'Enter your location to see approximate distances to each center. Helps you choose the most convenient option when filling preferences in the NATA form.',
    },
    {
      title: 'State-wise Listing',
      desc: 'Browse centers organised by state. See the number of centers in each state, helping you understand regional availability and plan travel.',
    },
    {
      title: 'Exam Day Checklist',
      desc: 'Each center page includes an exam day checklist: documents to carry, reporting time, prohibited items, and tips for the drawing test setup.',
    },
  ],
  screenshots: {
    desktop: '/images/tools/exam-centers-desktop.webp',
    mobile: '/images/tools/exam-centers-mobile.webp',
    caption:
      'Exam Center Finder showing state-wise center listing, distance calculator, and TCS iON verification status.',
    alt: 'NATA Exam Center Finder showing center list with addresses, distance, and confidence ratings',
  },
  contextHeading: 'NATA 2026 Exam Centers: What You Need to Know',
  contextContent:
    '<p>The Council of Architecture (CoA) conducts NATA through TCS iON centres across India. For NATA 2026, the exam is expected in approximately 96 cities covering all major metros and many tier-2 cities. The exam is computer-based for the MCQ sections (Mathematics and General Aptitude) and uses digital drawing tablets for the Drawing section.</p><p>During the NATA application process, candidates select up to 4 preferred test cities. CoA allocates centers based on first-come availability. Students in smaller towns may need to travel to the nearest city with a TCS iON centre. States like Tamil Nadu, Karnataka, Maharashtra, and Uttar Pradesh have the highest number of centers (8 to 12 each), while northeastern states may have 1 to 2 centers each.</p><p>Your exact center address appears on the admit card, released 10 to 15 days before the exam. We recommend visiting the center a day before the exam to familiarise yourself with the location, parking, and entry points. Our tool helps you identify the closest center early so you can list it as your first preference during application and arrange travel and accommodation if needed.</p>',
  faqs: [
    {
      question: 'How many NATA exam centers are there in 2026?',
      answer:
        'NATA 2026 is expected to be conducted in approximately 96 cities across 26 states and union territories in India. The exam is also held in select international cities including Dubai, Muscat, and Kathmandu. The exact center list is published by CoA on the official NATA website after the application window closes.',
    },
    {
      question: 'How are NATA 2026 exam centers allocated?',
      answer:
        'When you fill the NATA 2026 application form, you select 4 preferred test cities. CoA allocates your exam center based on availability and proximity to your first preference. The exact center address (with room number) is printed on your admit card, typically released 10 to 15 days before the exam date.',
    },
    {
      question: 'Are all NATA exam centers managed by TCS iON?',
      answer:
        'Yes, NATA 2026 is conducted through TCS iON infrastructure. All test centers are TCS iON-approved venues with standardised computer terminals, CCTV monitoring, and biometric verification. This ensures a consistent exam experience across all cities.',
    },
    {
      question: 'Can I change my NATA exam center after registration?',
      answer:
        'Center change requests are allowed during a limited window after the application deadline. CoA announces the center change window on the official website. Changes are subject to seat availability at the new preferred city. You cannot change centers after the admit card is issued.',
    },
    {
      question: 'What facilities are available at NATA exam centers?',
      answer:
        'Each TCS iON center provides individual computer terminals with drawing tablets for the sketching section, rough sheets for calculations, and on-screen calculators. Centers have CCTV surveillance, biometric attendance, and secure locker facilities for personal belongings. Water is provided; food and electronic devices are not allowed inside.',
    },
    {
      question: 'How can I find the nearest NATA exam center to my city?',
      answer:
        'Use our Exam Center Finder tool to search by city name, state, or PIN code. The tool shows all nearby centers with approximate distance, confidence rating (based on historical data), and TCS iON verification status. You can also view centers on a map to plan your travel.',
    },
  ],
  relatedToolSlugs: ['eligibility-checker', 'exam-planner', 'cutoff-calculator'],
  teaserComponent: ExamCentersTeaser,
};
