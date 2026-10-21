import CutoffTeaser from '@/components/tools/teasers/CutoffTeaser';
import CutoffDataSections from '@/components/tools/sections/CutoffDataSections';
import type { ToolConfig } from '../types';

export const cutoffCalculatorConfig: ToolConfig = {
  slug: 'cutoff-calculator',
  title: 'NATA Score and Cutoff Calculator',
  subtitle:
    'Your B.Arch cutoff is your 12th marks converted to 200 plus your NATA score out of 200, a total out of 400. Enter your board marks and NATA scores to get it instantly, with your board’s real maximum marks and the better of two NATA attempts. Then see the colleges that matched that score last year, from real TNEA, KEAM and JoSAA allotments.',
  category: 'nata',
  appUrl: 'https://app.neramclasses.com/tools/nata/cutoff-calculator',
  metaTitle: 'NATA Cutoff Calculator: Your Score out of 400, Free',
  metaDescription:
    'Free NATA cutoff calculator for every board (CBSE, Tamil Nadu, Kerala, Karnataka and more). 12th marks out of 200 plus NATA out of 200, best of two attempts, and real college closing marks.',
  keywords: [
    'NATA cutoff calculator',
    'NATA cutoff calculator 2026',
    'NATA cutoff calculator 2027',
    'how is NATA cutoff calculated',
    'NATA cutoff for TNEA B.Arch',
    'B.Arch cutoff calculator',
    '12th marks out of 200 for B.Arch',
    'NATA college predictor',
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
  trustBadges: ['Free', 'No Login Required', 'All 13 boards', 'Real closing marks'],
  steps: [
    {
      title: 'Enter Board Marks',
      desc: 'Pick your board. Its usual maximum fills in (CBSE 500, Tamil Nadu 600, Maharashtra 650 and so on); change it if your board counted different subjects. Then type the marks you scored.',
    },
    {
      title: 'Add NATA Scores',
      desc: 'Enter your NATA Part A (drawing, out of 80) and Part B (MCQ, out of 120). Took NATA twice? Add the second attempt and the better one counts.',
    },
    {
      title: 'Get Your Cutoff Score',
      desc: 'Your marks are converted to a score out of 200 and added to your best NATA score out of 200, giving your cutoff out of 400. It also checks the 45% rule for 12th.',
    },
    {
      title: 'See matching colleges',
      desc: 'Tap "See colleges" to ask Aintra, with your score filled in. It lists colleges whose closing mark or rank you beat in TNEA, KEAM or JoSAA, with the year and round as the source.',
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
      desc: 'Checks the 45% minimum in 12th used for B.Arch admission and flags it before you apply.',
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
      question: 'How do I convert Tamil Nadu State Board marks for the NATA cutoff?',
      answer:
        'Divide your marks by 600 and multiply by 200. For example, 540 out of 600 is (540/600) x 200 = 180 out of 200. Add your NATA score out of 200 to get your TNEA B.Arch cutoff out of 400.',
    },
    {
      question: 'What cutoff do I need for TNEA B.Arch?',
      answer:
        'It depends on the college and your community. The table on this page shows last year’s General (OC) closing marks for the top TNEA B.Arch colleges, from the official allotment list. Ask Aintra with your score to see every college you would have got, for your community.',
    },
    {
      question: 'Can ChatGPT or Gemini calculate my NATA cutoff?',
      answer:
        'They can repeat the formula, but they often use the wrong maximum marks for your board and guess college cutoffs. This calculator uses each board’s real maximum, and Aintra answers college questions from the official TNEA, KEAM and JoSAA allotment lists, with the source shown.',
    },
    {
      question: 'Can I use scores from both NATA sessions?',
      answer:
        'Yes. If you attempt both NATA sessions (Session 1 and Session 2), the calculator considers the better score of the two. This is the same logic used by counselling bodies for admissions.',
    },
    {
      question: 'What is the minimum percentage required for NATA eligibility?',
      answer:
        'The calculator checks for at least 45% in your 12th board exam, the minimum used for B.Arch admission. Some state counselling bodies add their own conditions, so read your state brochure as well.',
    },
    {
      question: 'Is this calculator free to use?',
      answer:
        'Yes. The calculator on this page is free with no login, and it already handles every board and two NATA attempts. The full calculator in the aiArchitek app adds last year’s score, saves your results and lists matching colleges; you can try it twice free before signing in.',
    },
    {
      question: 'How accurate are the cutoff predictions?',
      answer:
        'Our predictions are based on historical cutoff data from 2020 to 2025 across 500+ colleges. Actual cutoffs vary each year based on difficulty level, number of applicants, and seat availability. Use our predictions as a strong reference point, not an exact guarantee.',
    },
  ],
  relatedToolSlugs: ['college-predictor', 'rank-predictor', 'eligibility-checker'],
  teaserComponent: CutoffTeaser,
  extraSections: CutoffDataSections,
};
