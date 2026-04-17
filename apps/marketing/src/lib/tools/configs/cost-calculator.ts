import CostCalculatorTeaser from '@/components/tools/teasers/CostCalculatorTeaser';
import type { ToolConfig } from '../types';

export const costCalculatorConfig: ToolConfig = {
  slug: 'cost-calculator',
  title: 'B.Arch Cost Calculator',
  subtitle:
    'Estimate the total cost of your B.Arch education including tuition fees, hostel, study materials, and living expenses. Compare costs across government, private, deemed, and NIT/IIT architecture colleges to make a financially informed decision before you apply.',
  category: 'counseling',
  appUrl: 'https://app.neramclasses.com/tools/nata/cost-calculator',
  metaTitle: 'B.Arch Fees Calculator: Education Cost Estimator',
  metaDescription:
    'Free B.Arch cost calculator. Estimate total 5-year education fees for government, private, deemed, and NIT/IIT architecture colleges. Compare hostel, tuition, and living costs.',
  keywords: [
    'B.Arch fees calculator',
    'architecture college fees India',
    'NATA college fees comparison',
    'B.Arch education cost',
    'cheapest B.Arch colleges',
    'B.Arch total cost',
    'government architecture college fees',
    'private B.Arch college fees',
    'NIT architecture fees',
    'B.Arch hostel fees',
  ],
  ogImageTitle: 'B.Arch Cost Calculator',
  ogImageSubtitle: 'Estimate your 5-year education cost',
  trustBadges: ['Free', 'No Login Required', 'Updated for 2026'],
  steps: [
    {
      title: 'Select College Type',
      desc: 'Choose the type of architecture college you are targeting: Government, Private, Deemed University, or NIT/IIT. Fee structures vary significantly across these categories.',
    },
    {
      title: 'Add Living Expenses',
      desc: 'Input your expected monthly living costs: hostel or PG rent, food, commute, and miscellaneous expenses. The calculator adds these to your total education cost.',
    },
    {
      title: 'View 5-Year Cost Breakdown',
      desc: 'Get a year-by-year breakdown of tuition fees, hostel charges, and living expenses over the full 5-year B.Arch program duration.',
    },
    {
      title: 'Compare and Plan Finances',
      desc: 'Compare the total cost across college types side by side. See available loan options, scholarship amounts, and estimate your annual education loan EMI.',
    },
  ],
  features: [
    {
      title: 'Fee Range by College Type',
      desc: 'Shows average annual tuition fee ranges for all four college types: Government (₹20,000 to ₹1,50,000), Private (₹1,50,000 to ₹5,00,000), Deemed (₹2,00,000 to ₹6,00,000), and NIT/IIT (₹1,00,000 to ₹2,50,000).',
    },
    {
      title: '5-Year Total Cost Projection',
      desc: 'Projects the complete 5-year education cost including fee escalation. Most private colleges increase fees by 5 to 10 percent annually, which the calculator factors in.',
    },
    {
      title: 'Hostel and Living Cost Estimator',
      desc: 'Adds estimated hostel fees (₹60,000 to ₹1,50,000 per year) and living expenses based on the city tier of the college location.',
    },
    {
      title: 'Scholarship and Loan Guidance',
      desc: 'Lists major scholarships available for B.Arch students, including state government scholarships, central government schemes, and private trust scholarships with typical amounts.',
    },
    {
      title: 'Education Loan EMI Calculator',
      desc: 'Calculates approximate monthly EMI for education loans at prevailing interest rates for the total amount you plan to borrow for your B.Arch degree.',
    },
    {
      title: 'College-specific Fee Data',
      desc: 'For popular colleges, shows actual fee data rather than range estimates. Covers 200+ architecture colleges with detailed fee structures from official sources.',
    },
  ],
  screenshots: {
    desktop: '/images/tools/cost-calculator-desktop.webp',
    mobile: '/images/tools/cost-calculator-mobile.webp',
    caption:
      'B.Arch Cost Calculator showing college type selector, 5-year fee breakdown, hostel costs, and loan EMI estimate.',
    alt: 'B.Arch Cost Calculator showing fee range by college type, total 5-year cost, and scholarship options',
  },
  contextHeading: 'Understanding B.Arch Education Costs in India',
  contextContent:
    '<p>The total cost of a B.Arch degree in India varies enormously depending on the type of institution. Government architecture colleges, including those run by state governments and universities, charge the lowest fees, typically between ₹20,000 and ₹1,50,000 per year. These colleges are heavily subsidised and represent exceptional value, but seats are limited and admission is highly competitive.</p><p>NITs and IITs offer architecture programs at fees between ₹1,00,000 and ₹2,50,000 per year, with the added benefit of excellent placement support, research facilities, and a nationally recognised degree. Private architecture colleges have a wide fee range from ₹1,50,000 to ₹5,00,000 per year, with deemed universities at the higher end charging up to ₹6,00,000 annually. Over a 5-year B.Arch program with 5 to 10 percent annual fee increases, total tuition costs can reach ₹30 to ₹35 lakh at premium private institutions.</p><p>Hostel and living expenses add substantially to the total cost, especially in metro cities. A student studying in Mumbai, Delhi, or Bangalore can expect to spend ₹1,20,000 to ₹2,00,000 annually on accommodation and food alone. In smaller cities, the same expenses may be ₹60,000 to ₹1,00,000 per year.</p><p>Multiple financial aid options exist for B.Arch students. State government merit scholarships, the central government\'s scholarships for SC and ST students, and minority community scholarships can cover a significant portion of fees. Education loans up to ₹20 lakh are available without collateral from nationalised banks under the Vidya Lakshmi scheme, with repayment beginning one year after course completion or six months after employment, whichever is earlier.</p>',
  faqs: [
    {
      question: 'What is the total cost of a B.Arch degree in India?',
      answer:
        'The total 5-year cost varies widely: Government colleges cost ₹1 lakh to ₹7.5 lakh total, NITs and IITs cost ₹5 lakh to ₹12.5 lakh, Private colleges cost ₹7.5 lakh to ₹25 lakh, and Deemed Universities can reach ₹10 lakh to ₹30 lakh or more. Hostel and living expenses add another ₹3 lakh to ₹10 lakh over 5 years.',
    },
    {
      question: 'Which are the cheapest B.Arch colleges in India?',
      answer:
        'Government architecture colleges under state universities and the School of Planning and Architecture (SPA) Delhi offer the lowest fees, typically ₹20,000 to ₹50,000 per year for tuition. Tamil Nadu government architecture colleges, NIT Trichy, and NIT Calicut are among the most affordable quality options.',
    },
    {
      question: 'Is an education loan available for B.Arch?',
      answer:
        'Yes. B.Arch is a recognised professional degree eligible for education loans under the Vidya Lakshmi scheme. Loans up to ₹20 lakh are available without collateral from nationalised banks. Processing requires admission confirmation, fee receipt, and income documents.',
    },
    {
      question: 'Are there scholarships specifically for B.Arch students?',
      answer:
        'Yes. The central government offers scholarships for SC/ST students and minority community students. State governments have merit scholarships for government college students. Some private colleges and trusts offer merit-based fee waivers. The AICTE Pragati and Saksham scholarships also cover technical education including B.Arch.',
    },
    {
      question: 'Do fees increase every year in B.Arch colleges?',
      answer:
        'Government and NIT/IIT fees are relatively stable, changing only with government fee revisions. Private college fees typically increase 5 to 10 percent annually. The calculator factors in a 7 percent average annual escalation for private college projections.',
    },
    {
      question: 'How much does a hostel cost in architecture colleges?',
      answer:
        'Hostel fees range from ₹40,000 to ₹1,50,000 per year depending on the institution and city. Government and NIT hostels are subsidised. Private college hostels are more expensive. In metros like Mumbai and Bangalore, PG accommodation outside campus can cost ₹10,000 to ₹20,000 per month.',
    },
    {
      question: 'Can I compare fees across multiple colleges?',
      answer:
        'Yes. The full cost calculator in the Neram app lets you compare fees for specific colleges side by side. You can add any college from our database of 400+ architecture institutions and get a detailed cost comparison with hostel, living, and material costs included.',
    },
  ],
  relatedToolSlugs: ['college-predictor', 'coa-checker', 'rank-predictor'],
  teaserComponent: CostCalculatorTeaser,
};
