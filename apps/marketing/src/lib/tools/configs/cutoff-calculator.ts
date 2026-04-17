import CutoffTeaser from '@/components/tools/teasers/CutoffTeaser';
import type { ToolConfig } from '../types';

export const cutoffCalculatorConfig: ToolConfig = {
  slug: 'cutoff-calculator',
  title: 'NATA Cutoff Calculator 2026',
  subtitle:
    'Estimate your NATA cutoff score, check your percentile, and discover which architecture colleges match your marks. Our calculator uses board marks conversion, multi-attempt logic, and historical cutoff data to give you a realistic picture of your admission chances.',
  category: 'nata',
  appUrl: 'https://app.neramclasses.com/tools/nata/cutoff-calculator',
  metaTitle: 'NATA Cutoff Calculator 2026: Score and College Chances',
  metaDescription:
    'Free NATA cutoff calculator. Enter your scores to calculate total marks, percentile, and check admission chances at top architecture colleges across India.',
  keywords: [
    'NATA cutoff calculator 2026',
    'JEE Paper 2 cutoff calculator',
    'B.Arch cutoff 2026',
    'NATA score calculator',
    'NATA percentile calculator',
    'architecture college cutoff',
    'NATA cutoff marks',
    'NATA college cutoff',
    'NATA expected cutoff',
    'B.Arch admission cutoff',
  ],
  ogImageTitle: 'NATA Cutoff Calculator 2026',
  ogImageSubtitle: 'Check your score and college chances',
  trustBadges: ['Free', 'No Login Required', 'Updated for 2026'],
  steps: [
    {
      title: 'Enter Board Marks',
      desc: 'Input your 12th board exam details: board type (CBSE, ICSE, or State Board), maximum marks, and marks secured in PCM subjects.',
    },
    {
      title: 'Add NATA Scores',
      desc: 'Enter your NATA Part A (Drawing, 80 marks) and Part B (MCQ, 120 marks) scores. If you took both sessions, enter scores for each attempt.',
    },
    {
      title: 'Get Your Cutoff Score',
      desc: 'The calculator converts your board marks to /200, picks your best NATA score, and combines them into a final cutoff score out of 400.',
    },
    {
      title: 'Check College Eligibility',
      desc: 'See which tier of architecture colleges your cutoff score qualifies for, from IITs and SPAs to state and private colleges.',
    },
  ],
  features: [
    {
      title: 'Board Marks Conversion',
      desc: 'Automatically converts your 12th board marks from any board (CBSE, ICSE, State) to the standardised /200 scale used by colleges for cutoff calculation.',
    },
    {
      title: 'Multi-Attempt Support',
      desc: 'Enter scores from both NATA sessions. The calculator applies the best-score logic used by counselling bodies to determine your strongest attempt.',
    },
    {
      title: 'Category-wise Cutoffs',
      desc: 'View cutoff thresholds for General, OBC, SC, ST, and EWS categories based on actual previous year admission data from 500+ colleges.',
    },
    {
      title: 'Historical Cutoff Data',
      desc: 'Compare your score against cutoff trends from 2020 to 2025. See how cutoffs have changed year over year for different college tiers.',
    },
    {
      title: 'College Tier Matching',
      desc: 'Get matched to realistic college tiers: IITs and SPAs (150+), NITs (130-150), top state colleges (110-130), and private colleges (below 110).',
    },
    {
      title: 'Eligibility Verification',
      desc: 'Checks minimum percentage requirements (50% for General, 45% for SC/ST) and flags any eligibility concerns before you apply.',
    },
  ],
  screenshots: {
    desktop: '/images/tools/cutoff-calculator-desktop.webp',
    mobile: '/images/tools/cutoff-calculator-mobile.webp',
    caption:
      'Full cutoff calculator with board marks conversion, NATA scores, eligibility check, and college tier matching.',
    alt: 'NATA Cutoff Calculator showing score input, percentile calculation, and college eligibility results',
  },
  contextHeading: 'Understanding NATA Cutoff Scores',
  contextContent:
    '<p>The NATA cutoff score determines which architecture colleges you can apply to. Most colleges calculate cutoffs using a combination of your 12th board marks (converted to /200) and your NATA score (out of 200), giving a total out of 400. Different colleges and counselling bodies may weight these differently, but the 50:50 split is most common.</p><p>For NATA 2026, the exam is scored out of 200 marks across three sections: Mathematics (20 MCQs worth 40 marks), General Aptitude (40 MCQs worth 80 marks), and Drawing (2 questions worth 80 marks). Students can take NATA in two sessions, and the better score is considered for admissions.</p><p>Top government colleges like IIT Kharagpur, IIT Roorkee, and SPA Delhi typically require a combined cutoff above 300/400, which translates to NATA scores above 150. NITs like NIT Trichy and NIT Calicut have cutoffs in the 260-300 range. Good state architecture colleges admit students with cutoffs between 220-260, while private colleges start from 180-220.</p><p>Our cutoff calculator does the math for you. Enter your board marks and NATA scores, and it shows your combined cutoff, percentile position, and which college tier you qualify for. The calculator handles board marks conversion automatically, so you get accurate results regardless of whether you studied under CBSE, ICSE, or a state board.</p>',
  faqs: [
    {
      question: 'How is the NATA cutoff score calculated?',
      answer:
        'The cutoff score is typically calculated as: (12th board marks converted to /200) + (NATA score out of /200) = Total out of 400. Different counselling bodies may use slightly different formulas, but this 50:50 weightage is the most widely used. Our calculator handles the board marks conversion automatically.',
    },
    {
      question: 'What is a good NATA score for top architecture colleges?',
      answer:
        'For IITs and SPAs, you need a NATA score above 150 (out of 200). For NITs, aim for 130-150. State government colleges typically require 100-130, while private colleges admit students scoring 70-100. These ranges are approximate and vary by year and category.',
    },
    {
      question: 'Does the calculator work for JEE Paper 2 B.Arch as well?',
      answer:
        'The cutoff logic applies to both NATA and JEE Paper 2 B.Arch scores, as many colleges accept both exams. The calculator currently focuses on NATA scoring. A dedicated JEE Paper 2 calculator is coming soon.',
    },
    {
      question: 'How are 12th board marks converted for cutoff calculation?',
      answer:
        'Board marks are converted proportionally: (Marks Secured / Maximum Marks) x 200. For example, if you scored 450 out of 500 in PCM subjects, your converted score is (450/500) x 200 = 180. This ensures fair comparison across different boards.',
    },
    {
      question: 'Can I use scores from both NATA sessions?',
      answer:
        'Yes. If you attempt both NATA sessions (Session 1 and Session 2), the calculator considers the better score of the two. This is the same logic used by counselling bodies for admissions.',
    },
    {
      question: 'What is the minimum percentage required for NATA eligibility?',
      answer:
        'For General category, you need a minimum of 50% aggregate marks in Physics, Chemistry, and Mathematics in your 12th board exam. For SC and ST categories, the minimum is 45%. Some state counselling bodies may have additional requirements.',
    },
    {
      question: 'Is this calculator free to use?',
      answer:
        'Yes, the quick score check on this page is completely free with no login required. For the full calculator with board marks conversion, multi-attempt support, and detailed college matching, use our free tool in the Neram Classes app.',
    },
    {
      question: 'How accurate are the cutoff predictions?',
      answer:
        'Our predictions are based on historical cutoff data from 2020 to 2025 across 500+ colleges. Actual cutoffs vary each year based on difficulty level, number of applicants, and seat availability. Use our predictions as a strong reference point, not an exact guarantee.',
    },
  ],
  relatedToolSlugs: ['college-predictor', 'rank-predictor', 'eligibility-checker'],
  teaserComponent: CutoffTeaser,
};
