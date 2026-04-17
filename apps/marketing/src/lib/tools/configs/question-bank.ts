import QuestionBankTeaser from '@/components/tools/teasers/QuestionBankTeaser';
import type { ToolConfig } from '../types';

export const questionBankConfig: ToolConfig = {
  slug: 'question-bank',
  title: 'NATA Question Bank 2026',
  subtitle:
    'Practice for NATA 2026 with our free question bank containing 1000+ questions across all three exam sections. Section-wise practice for Mathematics, General Aptitude, and Drawing. Every question is tagged by topic, difficulty level (Easy, Medium, Hard), and section, so you can focus your preparation exactly where you need it.',
  category: 'nata',
  appUrl: 'https://app.neramclasses.com/tools/nata/question-bank',
  metaTitle: 'NATA Question Bank 2026: Free Practice Questions',
  metaDescription:
    'Free NATA question bank with 1000+ practice questions. Section-wise practice for Mathematics, General Aptitude, and Drawing with difficulty ratings and solutions.',
  keywords: [
    'NATA question bank 2026',
    'NATA practice questions',
    'NATA mock test',
    'JEE Paper 2 B.Arch questions',
    'NATA previous year questions',
    'architecture entrance practice',
    'NATA drawing questions',
  ],
  ogImageTitle: 'NATA Question Bank 2026',
  ogImageSubtitle: 'Free practice questions',
  trustBadges: ['1000+ Questions', 'Free', 'Section-wise Practice'],
  steps: [
    {
      title: 'Choose a Section',
      desc: 'Select from Mathematics (PCM), General Aptitude (visual/spatial reasoning), or Drawing. Each section has dedicated question sets matching the NATA 2026 pattern.',
    },
    {
      title: 'Filter by Topic and Difficulty',
      desc: 'Narrow down to specific topics like trigonometry, colour theory, or 3D visualisation. Choose Easy, Medium, or Hard difficulty to match your current level.',
    },
    {
      title: 'Practice and Learn',
      desc: 'Attempt questions one at a time or in sets. View detailed solutions after each answer. Understand the reasoning, not just the correct option.',
    },
    {
      title: 'Track Your Progress',
      desc: 'See your accuracy by topic, time per question, and improvement over time. Identify weak areas and focus your remaining study time effectively.',
    },
  ],
  features: [
    {
      title: '1000+ Practice Questions',
      desc: 'A growing library of questions covering the entire NATA 2026 syllabus. New questions are added weekly by our faculty and student community.',
    },
    {
      title: 'Section-wise Practice',
      desc: 'Dedicated question sets for Mathematics (algebra, trig, calculus, geometry), General Aptitude (visual perception, spatial reasoning, colour theory), and Drawing (composition, perspective).',
    },
    {
      title: 'Difficulty Levels',
      desc: 'Every question is rated Easy, Medium, or Hard. Start with easy questions to build confidence, then progress to exam-level difficulty for realistic preparation.',
    },
    {
      title: 'Topic-wise Filters',
      desc: 'Filter questions by specific topics: coordinate geometry, logarithms, architectural awareness, texture recognition, 3D visualisation, and more.',
    },
    {
      title: 'Detailed Solutions',
      desc: 'Every question comes with a step-by-step solution explaining the approach, formulas used, and common mistakes to avoid. Learn from each question, not just answer it.',
    },
    {
      title: 'Community Contributions',
      desc: 'Students and teachers contribute questions, keeping the bank diverse and up-to-date. All community questions are moderated and verified before publishing.',
    },
  ],
  screenshots: {
    desktop: '/images/tools/question-bank-desktop.webp',
    mobile: '/images/tools/question-bank-mobile.webp',
    caption:
      'Question bank with section filters, difficulty selector, question view, and detailed step-by-step solutions.',
    alt: 'NATA Question Bank showing subject filter, difficulty level, practice question, and solution explanation',
  },
  contextHeading: 'NATA 2026 Exam Pattern and Question Types',
  contextContent:
    '<p>NATA 2026 consists of three sections with a total of 200 marks. Understanding the question types in each section is essential for effective preparation. The Mathematics section (Part A) has 20 multiple-choice questions worth 40 marks, covering topics from 10+2 level PCM: algebra, matrices, trigonometry, calculus, coordinate geometry, and 3D geometry. Questions are straightforward but require quick calculation.</p><p>The General Aptitude section (Part B) has 40 questions worth 80 marks. This is the most diverse section, covering visual perception, spatial ability, colour theory, architectural awareness, general knowledge related to architecture, logical reasoning, and numerical ability. Questions include image-based problems, pattern recognition, mental rotation, and visual analogy. This section rewards students who have strong observation skills and spatial thinking.</p><p>The Drawing section (Part C) has 2 questions worth 80 marks total. This is the highest-weighted section and is done on a digital drawing tablet at the exam center. Questions test 2D composition, 3D object visualisation, perspective drawing, and creative design thinking. Regular sketching practice is essential for this section. Our question bank includes drawing prompts similar to actual NATA papers so you can practise composition and perspective at home.</p><p>The exam duration is 3 hours (180 minutes). There is no negative marking in NATA, so attempting all questions is recommended. Our question bank mirrors the actual exam structure, so every practice session builds familiarity with the real test format.</p>',
  faqs: [
    {
      question: 'Where do the questions in the NATA Question Bank come from?',
      answer:
        'The NATA Question Bank includes community-contributed questions from students and teachers, questions modelled on previous year NATA papers, and original questions designed by our expert faculty. Each question is reviewed for accuracy and tagged by section, topic, and difficulty level before being published.',
    },
    {
      question: 'How many questions are available in the NATA Question Bank?',
      answer:
        'The question bank currently contains 1000+ questions across all three NATA sections: Mathematics, General Aptitude, and Drawing. New questions are added weekly by our community and faculty. You can filter by section, topic, and difficulty to focus your practice.',
    },
    {
      question: 'Does the Question Bank cover all NATA 2026 sections?',
      answer:
        'Yes. The Question Bank covers all three sections of NATA 2026: Mathematics (PCM topics: algebra, trigonometry, calculus, coordinate geometry, 3D geometry), General Aptitude (visual perception, spatial reasoning, colour theory, architecture awareness, logical reasoning), and Drawing (2D composition, 3D visualisation, perspective drawing, design sense).',
    },
    {
      question: 'Are the questions based on the latest NATA 2026 syllabus?',
      answer:
        'Yes. All questions are mapped to the official NATA 2026 syllabus published by the Council of Architecture. When the syllabus changes, questions are re-tagged and new questions are added for any new topics. The difficulty distribution mirrors the actual exam pattern.',
    },
    {
      question: 'Can I track my progress and performance?',
      answer:
        'Yes. When you practice in the Neram Classes app, your performance is tracked automatically. You can see section-wise accuracy, time per question, weak topics, improvement trends, and compare your performance with other students. Detailed analytics help you focus on areas that need the most work.',
    },
    {
      question: 'Is the NATA Question Bank free?',
      answer:
        'Yes, the core question bank is completely free. You can practice unlimited questions, view answers with explanations, and track basic progress, all without payment. Premium features like timed mock tests, detailed analytics, and AI-powered weak topic analysis are available with a Neram Classes subscription.',
    },
  ],
  relatedToolSlugs: ['cutoff-calculator', 'exam-planner', 'exam-centers'],
  teaserComponent: QuestionBankTeaser,
};
