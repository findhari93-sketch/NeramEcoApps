import COACheckerTeaser from '@/components/tools/teasers/COACheckerTeaser';
import type { ToolConfig } from '../types';

export const coaCheckerConfig: ToolConfig = {
  slug: 'coa-checker',
  title: 'COA Approval Checker 2026',
  subtitle:
    'Verify whether your target architecture college holds valid Council of Architecture (COA) recognition before you apply. Admission to a non-COA-approved college means your B.Arch degree will not be recognised, putting your career and registration as an architect at risk.',
  category: 'counseling',
  appUrl: 'https://app.neramclasses.com/tools/counseling/coa-checker',
  metaTitle: 'COA Approved Colleges 2026: Check Approval Status',
  metaDescription:
    'Free COA approval checker for architecture colleges 2026. Search any B.Arch college to verify its Council of Architecture recognition status before applying for admission.',
  keywords: [
    'COA approved colleges 2026',
    'Council of Architecture approved colleges',
    'COA approval check',
    'is my college COA approved',
    'B.Arch COA recognition',
    'COA recognised architecture colleges',
    'COA affiliation check',
    'B.Arch approved colleges India',
    'architecture college recognition status',
    'COA approved colleges list 2026',
  ],
  ogImageTitle: 'COA Approval Checker 2026',
  ogImageSubtitle: 'Verify architecture college recognition',
  trustBadges: ['Free', 'No Login Required', 'Updated for 2026'],
  steps: [
    {
      title: 'Search Your College',
      desc: 'Enter the full or partial name of the architecture college you want to verify. The checker searches across all COA-recognised and listed institutions in India.',
    },
    {
      title: 'View Approval Status',
      desc: 'Get the current COA approval status: Fully Approved, Provisionally Approved, or Not Recognised. See the approval date and the number of seats sanctioned by COA.',
    },
    {
      title: 'Check Approval History',
      desc: 'Review the college\'s COA approval history. Some colleges have had approvals lapsed or renewed over the years. This history is important for understanding institutional stability.',
    },
    {
      title: 'Compare with Alternatives',
      desc: 'If your target college is not fully approved, find nearby COA-recognised colleges in the same state with similar fee structures and seat availability.',
    },
  ],
  features: [
    {
      title: 'Real-time COA Status',
      desc: 'Pulls from an updated list of COA-recognised architecture colleges across India. Status reflects the most recent COA inspection and approval cycle.',
    },
    {
      title: 'Approval History Timeline',
      desc: 'Shows when the college first received COA approval, any lapses, and renewal dates. A stable, long-standing approval record is a strong indicator of institutional quality.',
    },
    {
      title: 'Intake Seats Verification',
      desc: 'Displays the number of B.Arch seats sanctioned by COA for each college. If a college admits more students than the approved intake, the extra admissions may not be recognised.',
    },
    {
      title: 'State-wise College Listing',
      desc: 'Browse all COA-approved colleges in any state. Useful for students exploring options in multiple states during the counseling process.',
    },
    {
      title: 'University Affiliation Check',
      desc: 'Verifies which university the architecture college is affiliated to. Degree-granting authority and affiliation matter for degree recognition by professional bodies.',
    },
    {
      title: 'Alert for Lapsed Approvals',
      desc: 'Flags colleges with lapsed or expired COA approval. Some colleges operate in a legal grey area with expired approvals and students should be cautious about such institutions.',
    },
  ],
  screenshots: {
    desktop: '/images/tools/coa-checker-desktop.webp',
    mobile: '/images/tools/coa-checker-mobile.webp',
    caption:
      'COA Checker showing college search, approval status, intake seats, affiliation details, and approval history.',
    alt: 'COA Approval Checker tool showing architecture college recognition status, seats, and affiliation for 2026',
  },
  contextHeading: 'Why COA Approval Matters for Your B.Arch Degree',
  contextContent:
    '<p>The Council of Architecture (COA) is the statutory body under the Architects Act, 1972 that regulates architectural education in India. Every B.Arch program must receive COA approval to function legally. A degree from a non-COA-approved institution is not recognised for registration as an architect under Section 25 of the Architects Act, which means graduates from such colleges cannot practise architecture professionally.</p><p>COA approval is granted after a physical inspection of the institution, covering infrastructure, faculty qualifications, library facilities, studio space, and computer labs. Approvals are typically given for specific intake sizes, for example, 40 or 60 seats per year. Colleges that admit students beyond the approved intake may face penalties, and the additional admissions may not be officially recognised.</p><p>Colleges hold either full approval or provisional approval. Full approval means the institution has met all COA standards and has a stable record. Provisional approval is granted to newer institutions or those with pending compliance requirements. Students should prefer fully approved colleges for better institutional stability and cleaner degree recognition records.</p><p>Before confirming any architecture college admission, always verify the COA approval status directly. Some colleges may advertise COA affiliation that has since lapsed or is under dispute. Our COA Checker pulls from the most recent recognition lists to give you an accurate picture before you make this important decision.</p>',
  faqs: [
    {
      question: 'What is COA approval and why is it important?',
      answer:
        'COA approval means the Council of Architecture, the statutory body under the Architects Act 1972, has recognised the B.Arch program. Without COA recognition, graduates cannot register as architects under Section 25 of the Architects Act and cannot practise architecture professionally in India.',
    },
    {
      question: 'How do I check if a college is COA approved?',
      answer:
        'You can search for the college on our COA Checker tool, which checks against the official Council of Architecture list of recognised institutions. The official COA website (coa.gov.in) also publishes the complete list of approved colleges.',
    },
    {
      question: 'What is the difference between COA full approval and provisional approval?',
      answer:
        'Full approval means the college has fully met all COA requirements and has a stable recognition record. Provisional approval is granted to newer institutions or those with pending compliance requirements. Prefer fully approved colleges for cleaner degree recognition.',
    },
    {
      question: 'Can I get admission to a college with lapsed COA approval?',
      answer:
        'Taking admission in a college with lapsed COA approval is very risky. If the approval is not renewed before you graduate, your degree may not be recognised. Always verify that the college has a current, valid approval before accepting admission.',
    },
    {
      question: 'Does COA approval expire?',
      answer:
        'COA conducts periodic inspections and can revoke or suspend approval if a college fails to meet standards. Approvals are not permanent and require regular compliance. Our checker shows the most recent approval status from the latest COA records.',
    },
    {
      question: 'What if my college is not listed in the COA checker?',
      answer:
        'If a college does not appear in the COA checker, it may not have COA recognition or the name may be entered differently. Try searching with partial names or the city. You can also cross-verify on the official COA website. Not appearing on the list is a serious concern.',
    },
    {
      question: 'Is COA approval the same as university affiliation?',
      answer:
        'No. University affiliation and COA approval are separate. A college can be affiliated to a university for degree-granting purposes but still require COA approval for the B.Arch program specifically. Both are necessary. Our tool shows both the affiliated university and the COA recognition status.',
    },
    {
      question: 'How many COA-approved B.Arch colleges are there in India?',
      answer:
        'As of 2025, there are approximately 450 to 480 COA-recognised B.Arch programs across India, with a total intake of around 25,000 seats per year. The number changes each year as new colleges receive approval and some face cancellation.',
    },
  ],
  relatedToolSlugs: ['college-predictor', 'cost-calculator', 'counseling-insights'],
  teaserComponent: COACheckerTeaser,
};
