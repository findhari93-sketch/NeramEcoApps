import { ToolConfig } from '../types';
import JosaaBarchPredictorTeaser from '@/components/tools/teasers/JosaaBarchPredictorTeaser';

export const josaaBarchPredictorConfig: ToolConfig = {
  slug: 'josaa-barch-predictor',
  title: 'JoSAA B.Arch College Predictor 2026',
  subtitle:
    'Enter your JEE Main Paper 2A rank to see which JoSAA-participating institutes accept you for B.Arch admission. We use 4,200+ real closing-rank rows from JoSAA 2023, 2024 and 2025, covering all 21 institutes that allocate seats through JoSAA: IITs (Kharagpur, Roorkee, BHU), NITs (Trichy, Calicut, MNIT Jaipur, MANIT Bhopal, VNIT Nagpur, Hamirpur, Patna, Raipur, Rourkela, Kurukshetra), Schools of Planning & Architecture (Delhi, Bhopal, Vijayawada), and GFTIs (IIEST Shibpur, BIT Mesra, SMVDU, Mizoram University). The predictor handles CRL vs category rank disambiguation, applies your home-state quota correctly to NIT seats, and groups NIT, SPA and GFTI results into Safe / Probable / Reach. The 3 IITs (Kharagpur, Roorkee, BHU) are shown in a separate section, because they admit through your JEE Advanced rank plus a Pass in the AAT, not your JEE Main Paper 2A rank.',
  category: 'counseling',
  appUrl: 'https://app.neramclasses.com/tools/counseling/josaa-predictor',
  metaTitle: 'JoSAA B.Arch Predictor 2026: IITs, NITs, SPAs & GFTIs',
  metaDescription:
    'Free JoSAA B.Arch college predictor. Enter your JEE Main Paper 2A rank to find IIT, NIT, SPA and GFTI architecture seats you qualify for. Built on real 2023-2025 closing ranks.',
  keywords: [
    'JoSAA B.Arch college predictor 2026',
    'JEE Main Paper 2A college predictor',
    'NIT B.Arch closing ranks',
    'IIT BHU architecture cutoff',
    'SPA Delhi closing rank',
    'JoSAA architecture seat predictor',
    'B.Arch admission predictor IIT NIT',
    'JoSAA round 5 closing ranks',
    'CRL vs category rank B.Arch',
  ],
  ogImageTitle: 'JoSAA B.Arch Predictor',
  ogImageSubtitle: 'IITs, NITs, SPAs, GFTIs · 2023-2025 data',
  trustBadges: ['21 Institutes', '4,200+ Cutoffs', '2023-2025', 'Free'],
  steps: [
    {
      title: 'Pick your category and PwD status',
      desc: 'Choose from General, OBC-NCL, SC, ST, or EWS. Check the PwD box if you have a benchmark disability. The predictor uses your category-specific PwD seats.',
    },
    {
      title: 'Choose CRL or category rank',
      desc: 'Reserved-category students see TWO ranks on their NTA scorecard: a CRL and a category rank. The predictor lets you toggle between them so you know exactly which one is being matched against closing ranks.',
    },
    {
      title: 'Select your home state',
      desc: 'NIT seats are split into HS (Home State) and OS (Other State) quotas. Pick your home state once and the predictor automatically applies HS at your home NIT and OS at NITs in other states.',
    },
    {
      title: 'Read the results',
      desc: 'Institutes are grouped Safe, Probable, Reach by how far your rank is from each closing rank. Compare across 2023, 2024, 2025 in one view. Click any institute to read its detailed Neram college profile.',
    },
  ],
  features: [
    {
      title: 'CRL vs category rank disambiguation',
      desc: 'An OBC-NCL student with CRL=1067 and OBC-NCL=322 sees a clear toggle so they enter the right rank. Other predictors silently mis-match these.',
    },
    {
      title: 'Smart home-state quota inference',
      desc: 'Pick your state once. The tool applies AI everywhere, HS only at home-state NITs, OS at other-state NITs. No more eyeballing the seat matrix.',
    },
    {
      title: 'Multi-year comparison mode',
      desc: 'See how your chances trend across 2023 / 2024 / 2025 at the same institute in a single side-by-side table. Helpful when closing ranks are volatile.',
    },
    {
      title: 'Card and Table views',
      desc: 'Cards for browsing on mobile, Table for power users who want to compare 20 institutes at once. One toggle, same data.',
    },
    {
      title: 'Built on official JoSAA data',
      desc: '4,210 closing-rank rows sourced from JoSAA Opening & Closing Rank archives 2023-2025, covering all 6 rounds where applicable. Updated after every JoSAA cycle.',
    },
    {
      title: 'Direct college deep-links',
      desc: 'Every result card links to the institute\'s detailed Neram profile with NIRF history, fees, COA approval, placements, and reviews (for the 14 of 21 institutes covered in our College Hub).',
    },
  ],
  screenshots: {
    desktop: '/placeholder-desktop.png',
    mobile: '/placeholder-mobile.png',
    caption: 'JoSAA B.Arch Predictor showing safe/probable/reach institutes',
    alt: 'JoSAA B.Arch Predictor tool interface',
  },
  contextHeading: 'JoSAA Counselling for B.Arch in 2026',
  contextContent: `<p>The Joint Seat Allocation Authority (JoSAA) conducts centralised counselling for B.Arch admissions across 21 institutes: 3 IITs that admit through JEE Advanced (Kharagpur, Roorkee, BHU), 10 NITs that admit through JEE Main Paper 2A, 3 Schools of Planning &amp; Architecture (Delhi, Bhopal, Vijayawada), and 5 GFTIs including IIEST Shibpur and BIT Mesra. Counselling typically runs from June to August across 6 rounds, with final allotment by mid-August.</p><p>Two ranks matter for reserved-category candidates. Your <strong>Common Rank List (CRL)</strong> is your position among all B.Arch test-takers. Your <strong>category rank</strong> is your position within your specific reservation category. NIT seats reserved for OBC-NCL, SC, ST, EWS or PwD candidates use the category rank as the closing rank, while OPEN seats use CRL. Mixing these up is the single most common reason students fill the wrong preference order.</p><p>NIT seats are further split into <strong>quotas</strong>: Home State (HS) for students whose JEE State of Eligibility matches the NIT\'s state, Other State (OS) for everyone else, and All India (AI) at IITs and SPAs. Roughly 50% of NIT B.Arch seats are HS-only, so your home state can be the difference between a Safe seat and a Reach.</p><p>Round-wise closing ranks shift sharply between Round 1 and the final round as students upgrade or withdraw. The Neram predictor defaults to the latest available round (most accurate for "what would I get today") but you can switch to earlier rounds via the Advanced panel.</p>`,
  faqs: [
    {
      question: 'Which rank should I enter, CRL or category rank?',
      answer:
        'Both work, but they predict different seats. CRL is matched against OPEN seats only (the unreserved pool). Category rank (OBC-NCL, SC, ST, EWS) is matched against your category\'s reserved seats. If you\'re reserved-category, try both: your category rank will usually open more options at NITs, while CRL might be needed for IITs where category seats are highly competitive.',
    },
    {
      question: 'Does Home State affect my chances at IITs?',
      answer:
        'No. IITs and Schools of Planning &amp; Architecture (SPAs) only have an All India (AI) quota. There is no Home State preference at IIT Kharagpur, IIT Roorkee, IIT BHU, SPA Delhi, SPA Bhopal, or SPA Vijayawada. Home State applies only at the 10 NITs and a few GFTIs.',
    },
    {
      question: 'How many institutes does the predictor cover?',
      answer:
        '21 JoSAA-participating B.Arch institutes: 3 IITs (Kharagpur, Roorkee, BHU), 10 NITs (Trichy, Calicut, Hamirpur, Patna, Raipur, Rourkela, Kurukshetra, MNIT Jaipur, MANIT Bhopal, VNIT Nagpur), 3 SPAs (Delhi, Bhopal, Vijayawada), and 5 GFTIs (IIEST Shibpur, BIT Mesra, SMVDU, Mizoram University, IUST Kashmir).',
    },
    {
      question: 'Why are some institutes labeled "No profile yet"?',
      answer:
        '14 of the 21 JoSAA institutes have detailed Neram college profiles with fees, NIRF history, placements, and reviews. The other 7 (mainly smaller GFTIs) are being added to our College Hub progressively. Until then their predictor row simply doesn\'t link out. The prediction itself works for all 21.',
    },
    {
      question: 'How are Safe, Probable, and Reach calculated?',
      answer:
        'Each NIT, SPA or GFTI seat is tagged based on how far your JEE Main Paper 2A rank is from its closing rank. Safe means your rank gives you at least 20% margin below the closing rank. Probable means you are within the closing rank but margin under 20%. Reach means your rank is above the closing rank by up to 30%, still worth filling as a stretch preference. The 3 IITs are not tagged this way: they admit on JEE Advanced rank plus an AAT Pass, so they appear in a separate IIT B.Arch section with their JEE Advanced closing ranks for reference.',
    },
    {
      question: 'How accurate is this predictor?',
      answer:
        'The closing-rank data is sourced directly from JoSAA\'s Opening &amp; Closing Rank archives, so it\'s exactly what determined admissions in 2023, 2024 and 2025. Predictions for 2026 assume cutoffs will move within ±15% of historical ranges, which is the typical year-over-year shift. We update after every JoSAA 2026 round.',
    },
    {
      question: 'Does this work for B.Plan as well?',
      answer:
        'Not yet. The predictor currently shows B.Arch (5-year Bachelor of Architecture) only. B.Plan data exists in our JoSAA dataset and a separate predictor view is on the roadmap.',
    },
    {
      question: 'When is JoSAA 2026 counselling expected?',
      answer:
        'Based on the 2023-2025 schedule, JoSAA 2026 registration typically opens in mid-June after JEE Main and JEE Advanced results. Round 1 allotment lands by end of June, with subsequent rounds every 7-10 days through to a final special round in early August. Always check the official josaa.nic.in for exact dates.',
    },
  ],
  relatedToolSlugs: ['college-predictor', 'cutoff-calculator', 'cost-calculator'],
  teaserComponent: JosaaBarchPredictorTeaser,
};
