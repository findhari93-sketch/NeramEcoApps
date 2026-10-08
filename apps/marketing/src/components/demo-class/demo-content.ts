/**
 * Copy for the /demo-class page. Kept in one place so the FAQ JSON-LD and the
 * visible FAQ never drift apart. No em dashes (house style).
 *
 * Screenshots: drop real images into apps/marketing/public/images/demo/ and set
 * `src` below (e.g. '/images/demo/ai-tutor.webp', 4:5 portrait, about 800px
 * wide). Until then each tile shows an icon card.
 */

export interface NexusShot {
  key: string;
  title: string;
  body: string;
  src: string | null;
  alt: string;
}

export const NEXUS_SHOTS: NexusShot[] = [
  {
    key: 'nexus',
    title: 'The Nexus classroom app',
    body: 'Every live class, its recording, your tests and your progress in one app on your phone or laptop.',
    src: null,
    alt: 'Nexus app home screen showing today’s class and recordings',
  },
  {
    key: 'tutor',
    title: 'AI tutor, any time',
    body: 'Stuck on a maths or aptitude question at night? The AI tutor walks you through it step by step.',
    src: null,
    alt: 'AI tutor explaining a NATA maths question step by step',
  },
  {
    key: 'assistant',
    title: 'Neram Assistant',
    body: 'Class timings, missed work, test dates: ask in plain words and get an answer straight away.',
    src: null,
    alt: 'Neram Assistant answering a student question in chat',
  },
  {
    key: 'drawing',
    title: 'Drawing reviews by architects',
    body: 'Upload a sketch and get a personal voice note on what works and what to try next.',
    src: null,
    alt: 'A student sketch with an architect’s voice-note feedback',
  },
];

export const DEMO_STEPS = [
  {
    title: 'A live class with an architect',
    body: 'Real NATA drawing and aptitude teaching, exactly how a regular Neram class runs.',
  },
  {
    title: 'A tour of Nexus',
    body: 'See the app you would study in: recordings, tests, drawing reviews and the AI tutor.',
  },
  {
    title: 'All your questions answered',
    body: 'Course, exams, fees, timings. Bring your parents and ask everything.',
  },
];

export const COMPARISON = [
  { topic: 'Travel', offline: '1 to 2 hours a day on the road', neram: 'None. Join from home' },
  { topic: 'Missed a class', offline: 'It is gone', neram: 'Recorded, with a catch-up in Nexus' },
  { topic: 'A doubt at 10 PM', offline: 'Wait for the next class', neram: 'Ask the AI tutor straight away' },
  { topic: 'Drawing feedback', offline: 'A quick look in class', neram: 'Personal voice-note feedback from architects' },
  { topic: 'Parents', offline: 'Rarely see what happens', neram: 'Welcome at the demo, can follow progress' },
  { topic: 'Designed by', offline: 'A coaching centre', neram: 'Architects and software engineers, together' },
];

export const PARENT_POINTS = [
  { title: 'No travel, no late nights on the road', body: 'Your child studies from home, on a schedule that fits school.' },
  { title: 'Every class recorded', body: 'Nothing is lost to a sick day or an exam at school.' },
  { title: 'Ask us anything', body: 'Fees, results, how the exams work. The demo is the best time to ask.' },
];

export const DEMO_FAQ = [
  {
    q: 'Is the demo class really free?',
    a: 'Yes. There is no payment and no card. You only sign in so we can send the class link to your WhatsApp and calendar.',
  },
  {
    q: 'How long is the demo and where does it happen?',
    a: 'About 45 minutes, live on Microsoft Teams. Join from a laptop, or a phone with the Teams app installed.',
  },
  {
    q: 'Can my parents join?',
    a: 'Please do. Parents can sit with the student, see how a real class runs and ask about the course, the exams and the fees.',
  },
  {
    q: 'How do I pick the time?',
    a: 'Choose a day and a time of day (morning, afternoon or evening), or tell us any time works. We call you to fix the exact time, and you get a confirmation on WhatsApp with the join link.',
  },
  {
    q: 'Why should I send a drawing?',
    a: 'It is optional. Send any drawing you have made, not exam work, and an architect will reply with personal feedback on what is good and what to try next.',
  },
  {
    q: 'Which students is it for?',
    a: 'Students in Class 10, 11, 12 or a drop year who are thinking about NATA or JEE Paper 2 (B.Arch). No preparation is needed.',
  },
  {
    q: 'Can I change or cancel my booking?',
    a: 'Yes. Open My demo on this site to change the day before we confirm, or to cancel. Once confirmed, call or WhatsApp us to move it.',
  },
];
