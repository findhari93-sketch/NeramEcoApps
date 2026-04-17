import CounselingInsightsTeaser from '@/components/tools/teasers/CounselingInsightsTeaser';
import type { ToolConfig } from '../types';

export const counselingInsightsConfig: ToolConfig = {
  slug: 'counseling-insights',
  title: 'NATA Counseling Insights 2026',
  subtitle:
    'Navigate B.Arch counseling with state-wise insights covering participating colleges, cutoff trends, seat availability, and counseling round schedules. Whether you are targeting TNEA, JoSAA, CAP, or KCET, our guide helps you understand the process and prepare your documents in advance.',
  category: 'insights',
  appUrl: 'https://app.neramclasses.com/tools/counseling/insights',
  metaTitle: 'NATA Counselling Guide 2026: State-wise Insights',
  metaDescription:
    'Free NATA counselling guide 2026. State-wise insights on B.Arch counselling process, participating colleges, cutoffs, seat availability, and round schedules for TNEA, JoSAA, and more.',
  keywords: [
    'NATA counselling guide 2026',
    'B.Arch counselling process',
    'TNEA counselling',
    'JoSAA B.Arch',
    'architecture admission counselling',
    'NATA counselling dates',
    'B.Arch seat allotment',
    'KCET B.Arch counselling',
    'Maharashtra CAP B.Arch',
    'state-wise NATA counselling',
  ],
  ogImageTitle: 'NATA Counselling Insights 2026',
  ogImageSubtitle: 'State-wise B.Arch admission guide',
  trustBadges: ['Free', 'No Login Required', 'Updated for 2026'],
  steps: [
    {
      title: 'Select Your State',
      desc: 'Choose your home state to get personalised counseling information. Insights cover participating colleges, typical cutoffs, seat matrix, and counseling body details specific to each state.',
    },
    {
      title: 'Review Counseling Process',
      desc: 'Understand the counseling rounds in your state: how many rounds are conducted, the sequence of online registration, document verification, and seat acceptance.',
    },
    {
      title: 'Check Seat Availability',
      desc: 'View approximate seat availability by category for each state, including government and private college seats in All India quota and state quota.',
    },
    {
      title: 'Prepare Your Documents',
      desc: 'Get a checklist of documents required for counseling in your state. Requirements vary by counseling body, so being prepared avoids last-minute rejections.',
    },
  ],
  features: [
    {
      title: 'State-wise Counseling Overview',
      desc: 'Covers counseling processes for 10 major states including Tamil Nadu (TNEA), Maharashtra (CAP), Karnataka (KCET/COMEDK), Delhi (JoSAA and state), Kerala (KEAM), and more.',
    },
    {
      title: 'Cutoff Trend Analysis',
      desc: 'Historical cutoff data for each state showing how rank cutoffs have changed from 2022 to 2025. Helps you understand whether competition is increasing or easing in your target state.',
    },
    {
      title: 'Seat Matrix by Category',
      desc: 'Shows the number of seats available under All India quota (15%), state quota (85%), and management quota for each major state. Category-wise breakdowns included.',
    },
    {
      title: 'Counseling Round Schedule',
      desc: 'Expected timeline for each counseling round including registration deadlines, choice filling windows, result dates, and seat acceptance periods.',
    },
    {
      title: 'Document Checklist Generator',
      desc: 'Generates a personalised document checklist based on your state, category, and college type. Includes category certificates, domicile proof, migration certificates, and more.',
    },
    {
      title: 'JoSAA B.Arch Guidance',
      desc: 'Dedicated section on JoSAA counseling for NIT and IIT B.Arch seats, including choice filling strategy, freezing and sliding options, and fee payment deadlines.',
    },
  ],
  screenshots: {
    desktop: '/images/tools/counseling-insights-desktop.webp',
    mobile: '/images/tools/counseling-insights-mobile.webp',
    caption:
      'Counseling Insights tool showing state selection, seat matrix, cutoff trends, round schedule, and document checklist.',
    alt: 'NATA Counseling Insights 2026 showing state-wise B.Arch admission guide, seat availability, and counseling timeline',
  },
  contextHeading: 'How B.Arch Counseling Works Across India',
  contextContent:
    '<p>B.Arch admissions in India happen through multiple parallel counseling processes. The central JoSAA counseling handles seats at NITs, IITs, and the three Schools of Planning and Architecture (Delhi, Bhopal, Vijaywada). JoSAA uses JEE Paper 2 ranks for seat allocation and typically runs from June to July after the JEE Advanced results.</p><p>State-level counseling handles the 85% state quota seats at government and private architecture colleges. Each state has its own counseling body: TNEA in Tamil Nadu, CAP in Maharashtra, KCET and COMEDK in Karnataka, KEAM in Kerala, TSEAMCET in Telangana, and UPSEE in Uttar Pradesh. The counseling process varies by state, with some using purely merit-based rank lists and others incorporating additional criteria like local residence requirements.</p><p>Most state counseling processes follow a similar pattern: online registration, uploading documents, paying a registration fee, filling college choices in order of preference, a computer-generated seat allotment based on rank and availability, and then document verification followed by fee payment to confirm the seat. Candidates typically participate in three to four rounds before vacant seats go to spot rounds or direct admissions.</p><p>Timing matters significantly in counseling. States typically open registration within two to four weeks of NATA result declaration. Missing the registration window means losing access to that state\'s government college seats. Having all documents verified and scanned in advance, including 12th mark sheet, category certificate, domicile proof, NATA scorecard, and passport photos, lets you register immediately when portals open.</p>',
  faqs: [
    {
      question: 'What is the B.Arch counseling process after NATA?',
      answer:
        'After NATA results, counseling happens through two parallel streams: JoSAA for NIT and IIT seats (using JEE Paper 2 rank), and state-level counseling bodies for state government and private college seats. You register, fill college choices, get a seat allotment based on rank, and then confirm by paying fees.',
    },
    {
      question: 'Which states use NATA scores for B.Arch admissions?',
      answer:
        'Most states accept NATA scores for B.Arch admissions to their respective state colleges, including Tamil Nadu (TNEA), Maharashtra, Karnataka, Kerala, Telangana, Andhra Pradesh, Rajasthan, Gujarat, West Bengal, and Uttar Pradesh. Some states also conduct their own entrance exams in addition to NATA.',
    },
    {
      question: 'What is the TNEA counseling process for B.Arch in Tamil Nadu?',
      answer:
        'TNEA (Tamil Nadu Engineering Admissions) handles B.Arch admissions in Tamil Nadu alongside engineering admissions. Candidates register on the TNEA portal, fill college choices, and receive seat allotment based on their NATA score and 12th board marks. TNEA typically opens in June after NATA results.',
    },
    {
      question: 'Can I participate in multiple state counseling processes?',
      answer:
        'Yes. You can register for counseling in multiple states simultaneously, though you may need to pay separate registration fees for each. Once you accept a seat in one state, you should withdraw from others. You can apply to All India quota seats through JoSAA and any state quota seats as well.',
    },
    {
      question: 'What documents are required for B.Arch counseling?',
      answer:
        'Common documents include your NATA scorecard, 12th mark sheet and certificate, 10th mark sheet, category certificate (SC/ST/OBC), domicile or residence certificate, income certificate (for certain scholarships), Aadhaar card, passport-size photos, and a migration certificate from your 12th school. Requirements vary by state.',
    },
    {
      question: 'How many rounds does B.Arch counseling typically have?',
      answer:
        'Most state counseling bodies conduct three to four main allotment rounds followed by a spot round for remaining vacant seats. JoSAA conducts six rounds. Candidates who miss earlier rounds can participate in later rounds, though preferred college options diminish as seats fill up.',
    },
    {
      question: 'What is the 15% All India quota in B.Arch admissions?',
      answer:
        'Government architecture colleges across India reserve 15% of seats for students from any state (All India quota), while the remaining 85% go to students from the home state (state quota). Central counseling handles the 15% All India quota for certain colleges. JoSAA handles NIT and IIT seats centrally.',
    },
    {
      question: 'When does B.Arch counseling start in 2026?',
      answer:
        'JoSAA counseling for NITs and IITs typically starts in June after JEE results. State counseling varies but most states begin registration in June or July after NATA results are declared. TNEA, KCET, and CAP counseling usually run from June to September, covering multiple rounds.',
    },
  ],
  relatedToolSlugs: ['college-predictor', 'rank-predictor', 'coa-checker'],
  teaserComponent: CounselingInsightsTeaser,
};
