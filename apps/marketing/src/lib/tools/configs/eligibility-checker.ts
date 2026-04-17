import EligibilityTeaser from '@/components/tools/teasers/EligibilityTeaser';
import type { ToolConfig } from '../types';

export const eligibilityCheckerConfig: ToolConfig = {
  slug: 'eligibility-checker',
  title: 'NATA Eligibility Checker 2026',
  subtitle:
    'Instantly verify whether you meet the NATA 2026 eligibility criteria for B.Arch admission. Check minimum percentage requirements, age limits, subject combinations, and category-specific rules all in one place, so you apply with confidence.',
  category: 'nata',
  appUrl: 'https://app.neramclasses.com/tools/nata/eligibility-checker',
  metaTitle: 'NATA Eligibility Checker 2026: Check Your Criteria',
  metaDescription:
    'Free NATA eligibility checker 2026. Verify if you meet B.Arch admission criteria including minimum PCM percentage, subject requirements, age limits, and category-specific rules.',
  keywords: [
    'NATA eligibility criteria 2026',
    'NATA eligibility checker',
    'am I eligible for NATA',
    'NATA minimum marks',
    'B.Arch eligibility',
    'NATA age limit',
    'NATA subject requirements',
    'NATA 2026 qualification',
    'B.Arch admission criteria',
    'NATA PCM percentage',
  ],
  ogImageTitle: 'NATA Eligibility Checker 2026',
  ogImageSubtitle: 'Verify your B.Arch admission criteria',
  trustBadges: ['Free', 'No Login Required', 'Updated for 2026'],
  steps: [
    {
      title: 'Select Your Board',
      desc: 'Choose your 12th standard board: CBSE, ICSE, or State Board. The eligibility criteria apply uniformly across all boards, but the percentage calculation method may differ.',
    },
    {
      title: 'Enter PCM Percentage',
      desc: 'Input your aggregate percentage in Physics, Chemistry, and Mathematics from your 12th board exam. This is the primary academic criteria for NATA eligibility.',
    },
    {
      title: 'Confirm Category and Age',
      desc: 'Select your reservation category (General, OBC, SC, ST, EWS) and confirm your date of birth. Different categories have different minimum percentage requirements.',
    },
    {
      title: 'Get Eligibility Result',
      desc: 'Receive an instant eligibility verdict with a detailed breakdown. If you are not eligible, see exactly which criteria you need to meet and what your options are.',
    },
  ],
  features: [
    {
      title: 'Board-wise Percentage Check',
      desc: 'Handles eligibility checks for CBSE, ICSE, and all major state boards. Understands percentage calculation differences across board systems.',
    },
    {
      title: 'Category-specific Rules',
      desc: 'Applies the correct percentage threshold for each category: 50% for General and OBC, 45% for SC and ST candidates. Also covers EWS and PwD provisions.',
    },
    {
      title: 'Subject Combination Check',
      desc: 'Verifies that you have studied Physics, Chemistry, and Mathematics at the 12th level, as mandated by the Council of Architecture for B.Arch eligibility.',
    },
    {
      title: 'Age Limit Verification',
      desc: 'Checks minimum and maximum age requirements. As of 2026, there is no upper age limit for NATA. Confirms you meet the 17-year minimum age requirement.',
    },
    {
      title: 'Appearing Candidate Support',
      desc: 'Students yet to appear for their 12th exam can check provisional eligibility. Colleges accept applications from appearing candidates with results to be submitted later.',
    },
    {
      title: 'Gap Year Guidance',
      desc: 'Clarifies eligibility for students with a gap year after 12th standard. NATA has no bar on gap years, and our checker explains what documentation may be required.',
    },
  ],
  screenshots: {
    desktop: '/images/tools/eligibility-checker-desktop.webp',
    mobile: '/images/tools/eligibility-checker-mobile.webp',
    caption:
      'NATA Eligibility Checker with board selection, category dropdown, percentage input, and detailed eligibility breakdown.',
    alt: 'NATA Eligibility Checker showing input form, eligibility result, and criteria breakdown for B.Arch 2026',
  },
  contextHeading: 'NATA 2026 Eligibility Criteria Explained',
  contextContent:
    '<p>To appear for NATA 2026 and seek admission to B.Arch programs, candidates must meet specific academic and age criteria set by the Council of Architecture (COA). The primary requirement is passing the 12th standard exam with Physics, Chemistry, and Mathematics as compulsory subjects, securing at least 50% aggregate marks for General category candidates.</p><p>For SC and ST category candidates, the minimum aggregate is reduced to 45%. OBC candidates must meet the General category threshold of 50% unless specific state-level relaxations apply. EWS candidates follow the General category criteria. PwD (Persons with Disability) candidates may receive relaxations as per the college and counseling body guidelines.</p><p>There is no upper age limit for appearing in NATA 2026, as per the current guidelines. Candidates must be at least 17 years of age as of December 31 of the admission year. Students who are appearing in their 12th exam in 2026 are also eligible to register for NATA and can submit their qualifying marks after the board results are declared.</p><p>Some states have additional eligibility requirements for state quota seats in government architecture colleges. For example, Tamil Nadu TNEA counseling has domicile requirements, and some states mandate a local residence certificate for state quota eligibility. Always check both the NATA eligibility criteria and the specific state counseling body requirements before applying.</p>',
  faqs: [
    {
      question: 'What is the minimum percentage required for NATA 2026?',
      answer:
        'General and OBC category candidates need a minimum of 50% aggregate marks in Physics, Chemistry, and Mathematics in their 12th board exam. SC and ST candidates need a minimum of 45%. These marks must be in the PCM subjects specifically, not the overall board aggregate.',
    },
    {
      question: 'Is there an age limit for NATA 2026?',
      answer:
        'Candidates must be at least 17 years of age as of December 31 of the year of admission. There is no upper age limit for NATA 2026, as the Council of Architecture removed the maximum age restriction in recent years.',
    },
    {
      question: 'Can I appear for NATA if I am still in 12th standard?',
      answer:
        'Yes. Students appearing in their 12th exam (Class 12 appearing candidates) are eligible to register for NATA. You can appear for the exam while awaiting board results. Final admission will require you to meet the percentage criteria with your actual marks.',
    },
    {
      question: 'Do I need Mathematics as a compulsory subject?',
      answer:
        'Yes. Mathematics is a mandatory subject for NATA eligibility. You must have studied Physics, Chemistry, and Mathematics in your 12th standard. Candidates from commerce or arts streams without Mathematics are not eligible for B.Arch through NATA.',
    },
    {
      question: 'Is eligibility criteria the same across all states?',
      answer:
        'NATA eligibility criteria are set by the Council of Architecture and apply nationally. However, individual states may have additional requirements for state quota seats. Tamil Nadu, Maharashtra, and Karnataka, for instance, have domicile conditions for state counseling.',
    },
    {
      question: 'What if I have a gap year after 12th standard?',
      answer:
        'A gap year does not affect NATA eligibility. The Council of Architecture has no bar on gap years between 12th standard and B.Arch admission. Some colleges may ask for a gap certificate during the admission process, which is a standard administrative requirement.',
    },
    {
      question: 'Can OBC candidates get percentage relaxation?',
      answer:
        'The central NATA eligibility criteria do not offer OBC relaxation on the 50% minimum percentage. However, some state counseling bodies provide OBC relaxations for state quota seats. Check the specific state counseling rules that apply to your target colleges.',
    },
  ],
  relatedToolSlugs: ['cutoff-calculator', 'exam-centers', 'exam-planner'],
  teaserComponent: EligibilityTeaser,
};
