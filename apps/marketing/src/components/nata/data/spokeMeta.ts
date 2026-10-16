/**
 * NATA 2026 spoke pages: slug, title and one-line description. No @neram/ui
 * import, so server components can read it. Icons: nataSpokeIcon() in
 * components/nata/guideNav.tsx.
 */
export const spokeMeta: ReadonlyArray<{ slug: string; title: string; desc: string }> = [
  { slug: 'how-to-apply', title: 'How to Apply', desc: 'Step-by-step NATA 2026 application guide' },
  { slug: 'eligibility', title: 'Eligibility', desc: 'Who can appear and who can get admission' },
  { slug: 'syllabus', title: 'Syllabus', desc: 'Complete NATA 2026 syllabus breakdown' },
  { slug: 'exam-centers', title: 'Exam Centers', desc: 'Find NATA test centers near you' },
  { slug: 'fee-structure', title: 'Fee Structure', desc: 'NATA 2026 registration and exam fees' },
  { slug: 'exam-pattern', title: 'Exam Pattern', desc: 'Paper structure, marking scheme & format' },
  { slug: 'photo-signature-requirements', title: 'Photo & Signature', desc: 'Specifications for uploads and ID' },
  { slug: 'important-dates', title: 'Important Dates', desc: 'Registration, exam, and result dates' },
  { slug: 'scoring-and-results', title: 'Scoring', desc: 'How NATA scores are calculated' },
  { slug: 'dos-and-donts', title: "Do's & Don'ts", desc: 'What to carry and avoid on exam day' },
  { slug: 'cutoff-calculator', title: 'Cutoff Calculator', desc: 'Estimate your chances at top colleges' },
  { slug: 'drawing-test', title: 'Drawing Test', desc: 'Complete guide to Part A (80 marks)' },
  { slug: 'preparation-tips', title: 'Preparation Tips', desc: 'Expert strategy & month-wise study plan' },
  { slug: 'previous-year-papers', title: 'Previous Year Papers', desc: 'PYQ analysis & question trends (2020-2025)' },
  { slug: 'best-books', title: 'Best Books', desc: 'Section-wise book recommendations' },
  { slug: 'admit-card', title: 'Admit Card', desc: 'Download steps & exam day documents' },
];
