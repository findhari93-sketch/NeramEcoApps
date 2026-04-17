import RankPredictorTeaser from '@/components/tools/teasers/RankPredictorTeaser';
import type { ToolConfig } from '../types';

export const rankPredictorConfig: ToolConfig = {
  slug: 'rank-predictor',
  title: 'NATA Rank Predictor 2026',
  subtitle:
    'Predict your NATA All India Rank based on your score and understand where you stand among thousands of B.Arch aspirants. Our rank predictor uses historical score distributions, state-wise data, and category-based analysis to give you a realistic rank range before the results are declared.',
  category: 'counseling',
  appUrl: 'https://app.neramclasses.com/tools/counseling/rank-predictor',
  metaTitle: 'NATA Rank Predictor 2026: Estimate Your AIR',
  metaDescription:
    'Free NATA rank predictor 2026. Enter your NATA score to estimate your All India Rank, understand your position among all test takers, and plan your college applications.',
  keywords: [
    'NATA rank predictor 2026',
    'JEE Paper 2 rank estimator',
    'B.Arch rank calculator',
    'NATA rank from score',
    'NATA All India Rank',
    'expected NATA rank',
    'NATA rank estimator',
    'NATA score to rank',
    'B.Arch AIR prediction',
    'NATA rank distribution',
  ],
  ogImageTitle: 'NATA Rank Predictor 2026',
  ogImageSubtitle: 'Estimate your All India Rank from score',
  trustBadges: ['Free', 'No Login Required', 'Updated for 2026'],
  steps: [
    {
      title: 'Enter Your NATA Score',
      desc: 'Input your NATA 2026 score out of 200 marks. The predictor works for scores from any session, including both Session 1 and Session 2.',
    },
    {
      title: 'Select Your Category',
      desc: 'Choose your reservation category: General, OBC, SC, ST, or EWS. Rank lists are published separately for each category, so your effective rank may differ.',
    },
    {
      title: 'View Your Estimated Rank Range',
      desc: 'Get a predicted rank range based on historical score-to-rank distributions from NATA 2022 to 2025. See how many candidates typically score above and below your marks.',
    },
    {
      title: 'Plan Your Applications',
      desc: 'Use your estimated rank to shortlist colleges and counseling rounds. See which government and private colleges fall within your rank range.',
    },
  ],
  features: [
    {
      title: 'Score-to-Rank Mapping',
      desc: 'Maps your raw score to an estimated All India Rank using data from five years of NATA results, giving you a realistic range rather than a single number.',
    },
    {
      title: 'Category-wise Rank Lists',
      desc: 'Predicts ranks separately for General, OBC, SC, ST, and EWS categories. Your category rank is often more relevant for counseling than the overall rank.',
    },
    {
      title: 'Historical Rank Distributions',
      desc: 'Shows how score distributions have shifted from 2022 to 2025. Understand whether the exam was easier or harder compared to previous years.',
    },
    {
      title: 'State Quota Rank Estimation',
      desc: 'Estimates your approximate rank within your home state for state quota seats, which often have higher cutoffs than All India quota.',
    },
    {
      title: 'College Mapping by Rank',
      desc: 'Cross-references your predicted rank against actual college cutoff ranks from previous years, so you can identify realistic college targets.',
    },
    {
      title: 'JEE Paper 2 Compatibility',
      desc: 'Also works for JEE Paper 2 B.Arch scores. Many NITs and IITs use JEE Paper 2 ranks, and our tool covers both exam systems.',
    },
  ],
  screenshots: {
    desktop: '/images/tools/rank-predictor-desktop.webp',
    mobile: '/images/tools/rank-predictor-mobile.webp',
    caption:
      'NATA Rank Predictor showing score input, estimated rank range, historical distribution chart, and category-wise ranks.',
    alt: 'NATA Rank Predictor tool showing score to rank conversion, category ranks, and college mapping',
  },
  contextHeading: 'Understanding NATA All India Rank',
  contextContent:
    '<p>The NATA All India Rank (AIR) is published by the Council of Architecture after each exam session. It determines your position among all registered candidates and is the primary basis for admission to B.Arch programs at architecture colleges across India. Unlike board exams where absolute marks matter, your rank in NATA tells colleges exactly how you performed relative to every other candidate.</p><p>NATA ranks are published for both sessions separately, and candidates can appear in both. Counseling bodies typically consider the better of the two ranks for seat allocation. Category-wise rank lists are also published, and for SC, ST, OBC, and EWS candidates, the category rank is the relevant one for reserved seat allocation.</p><p>Historically, a NATA score of 150 or above out of 200 places you in roughly the top 1,500 ranks nationally, which qualifies you for consideration at IITs and SPAs. Scores between 120 and 150 typically correspond to ranks between 1,500 and 8,000, which is the competitive zone for NITs and top state colleges. Private colleges admit candidates across a much broader rank range, often up to rank 50,000 and beyond.</p><p>Our rank predictor uses five years of historical NATA score distributions to estimate where your score falls in the rank list. Because exam difficulty varies each year, we provide a range rather than a single number. For the most accurate planning, use this predictor alongside our College Predictor and Cutoff Calculator tools.</p>',
  faqs: [
    {
      question: 'How is NATA rank calculated?',
      answer:
        'NATA rank is based on your total score out of 200 marks. Candidates are ranked from highest to lowest score. In case of a tie, the candidate with a higher score in the Drawing section is ranked higher. Category-wise rank lists are also prepared for reserved seat allocation.',
    },
    {
      question: 'Can I predict my rank before the official results?',
      answer:
        'Yes. Our predictor uses historical score-to-rank distributions from 2022 to 2025 to estimate your likely rank range. These are estimates, not official ranks. The actual rank depends on the total number of candidates and the score distribution in a specific year.',
    },
    {
      question: 'What rank do I need for top architecture colleges?',
      answer:
        'IITs and SPA Delhi typically require an overall rank in the top 500 to 1,000. NITs and top state architecture colleges generally admit candidates ranked between 1,000 and 8,000. Private colleges cover a much broader range, often admitting candidates up to rank 50,000 depending on the state.',
    },
    {
      question: 'Does rank differ by category?',
      answer:
        'Yes. Separate rank lists are published for General, OBC, SC, ST, and EWS categories. A candidate with an overall rank of 10,000 may have a much lower category rank if competing in the SC or ST list, making certain reserved seats accessible.',
    },
    {
      question: 'Is rank the same across all states for B.Arch admissions?',
      answer:
        'No. Most states have a 15% All India quota based on national rank and an 85% state quota where state-level rank or separate state exams apply. Your All India Rank is used for central counseling (JoSAA for NITs and IITs), while state counseling bodies use their own criteria.',
    },
    {
      question: 'How accurate is the rank prediction?',
      answer:
        'The predictor is based on five years of historical data and provides a reliable range for planning purposes. Actual ranks vary with yearly changes in exam difficulty and the number of candidates. Treat the predicted range as a planning guide, not a guaranteed outcome.',
    },
    {
      question: 'What if I appeared in both NATA sessions?',
      answer:
        'If you appeared in both sessions, counseling bodies consider your better score. Enter your higher score in the predictor to get the rank estimate that will be used for your admissions.',
    },
    {
      question: 'Is this tool free to use?',
      answer:
        'Yes. The quick rank estimate on this page is completely free with no login required. For the full predictor with category-wise analysis, state quota estimates, and college mapping, use the Neram Classes app for free.',
    },
  ],
  relatedToolSlugs: ['cutoff-calculator', 'college-predictor', 'cost-calculator'],
  teaserComponent: RankPredictorTeaser,
};
