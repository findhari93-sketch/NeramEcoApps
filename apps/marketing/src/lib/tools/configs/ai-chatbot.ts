import { ToolConfig } from '../types';
import AiChatbotTeaser from '@/components/tools/teasers/AiChatbotTeaser';

export const aiChatbotConfig: ToolConfig = {
  slug: 'ai-chatbot',
  title: 'Aintra: AI Chatbot for NATA and B.Arch Admissions',
  subtitle:
    'Aintra is a free AI assistant built specifically for architecture aspirants in India. Unlike a general purpose chatbot, Aintra is grounded in current NATA syllabus, JEE Paper 2 patterns, COA approved college lists, and TNEA / KEAM / JoSAA counselling cutoffs from the last five years. Every answer cites the underlying data source so you can verify what you read. Aintra knows the difference between NATA Phase 1 and Phase 2, can explain why a particular score maps to a specific college tier, and can plan a 90 day NATA preparation timetable for your skill level. It is free, requires no signup, and works on phones and laptops.',
  category: 'insights',
  appUrl: 'https://neramclasses.com/counseling/tnea-barch',
  metaTitle: 'Aintra: Free AI Chatbot for NATA, JEE Paper 2 and B.Arch (2026)',
  metaDescription:
    'Free AI chatbot for NATA, JEE Paper 2 and architecture admissions. Trained on syllabus, college data, TNEA and KEAM cutoffs. Cites sources. No signup.',
  keywords: [
    'NATA AI chatbot',
    'free AI assistant for NATA',
    'B.Arch admissions chatbot',
    'JEE Paper 2 AI',
    'TNEA chatbot',
    'KEAM B.Arch AI',
    'architecture admissions AI assistant',
    'NATA preparation AI',
    'aintra ai',
  ],
  ogImageTitle: 'Aintra AI Chatbot',
  ogImageSubtitle: 'NATA, JEE Paper 2, B.Arch admissions',
  trustBadges: ['Free Forever', 'Cites Sources', 'No Signup', 'Updated for 2026'],
  steps: [
    {
      title: 'Pick a Topic Page',
      desc: 'Aintra runs in topic mode, so each chat is grounded in a specific dataset. Open the TNEA B.Arch page for Tamil Nadu admissions or the KEAM page for Kerala admissions. More topic spaces are added each month.',
    },
    {
      title: 'Ask in Plain Language',
      desc: 'Type a question the way you would ask a senior. Tamil and English are both accepted. Examples: "Best B.Arch college under 2 lakhs in TN?" or "What is the cutoff trend for SPA Delhi between 2020 and 2025?"',
    },
    {
      title: 'Read the Cited Answer',
      desc: 'Aintra responds with a direct answer, the relevant numbers, and the data source it pulled from. If a question is outside its dataset, it says so honestly instead of guessing.',
    },
    {
      title: 'Follow Up or Switch Topic',
      desc: 'Continue the conversation to drill deeper, compare colleges, or shift to a related topic. Conversation history stays in your browser for the session and is not stored on a server.',
    },
  ],
  features: [
    {
      title: 'Domain Tuned, Not Generic',
      desc: 'Aintra is built on a Retrieval Augmented Generation pipeline indexed against NATA syllabus PDFs, COA approval lists, TNEA brochures, KEAM rank lists, and the JoSAA business rules document. It is not a wrapped ChatGPT.',
    },
    {
      title: 'Cites Every Fact',
      desc: 'Cutoffs, fee figures, and rule clauses come with a source link or a page reference, so a candidate can verify the claim before acting on it. Hallucinated numbers are the biggest risk in admissions advice, and citations are the fix.',
    },
    {
      title: 'Bilingual Answers',
      desc: 'Aintra accepts questions in English or Tamil and answers in the same language, with proper handling of college names, exam terms, and numbers. More Indian languages are on the roadmap.',
    },
    {
      title: 'Knows Current 2026 Rules',
      desc: 'The dataset is refreshed each admissions cycle. NATA 2026 dates, COA fee structure changes, and TNEA 2026 brochure updates are reflected within a week of publication.',
    },
    {
      title: 'Topic Spaces',
      desc: 'Separate spaces for TNEA B.Arch, KEAM Architecture, JEE Paper 2, NATA syllabus, and a general aspirant Q and A. Each space narrows the index so answers stay focused.',
    },
    {
      title: 'No Signup, No Tracking',
      desc: 'Open a topic page and chat. No email, no phone number, no account. Conversations live in the browser and are cleared at session end.',
    },
  ],
  screenshots: {
    desktop: '/placeholder-desktop.png',
    mobile: '/placeholder-mobile.png',
    caption: 'Aintra AI chatbot answering a TNEA B.Arch cutoff question with cited sources',
    alt: 'Aintra AI chatbot interface showing a B.Arch admissions answer with citations',
  },
  contextHeading: 'Why a Specialist AI Beats a General Chatbot for Admissions',
  contextContent: `<p>General purpose chatbots like ChatGPT and Gemini are excellent for many tasks, but architecture admissions in India is a domain where they hallucinate often. Cutoffs change each year, COA approves and de-approves colleges quarterly, and counselling rules differ between TNEA, KEAM, JoSAA, and CoA centralised counselling. A model that does not know which data is current will quote a 2019 cutoff as if it were 2026, and a candidate making decisions on that answer can lose a year.</p><p>Aintra solves this with two design choices. First, every answer is grounded in retrieval, meaning the model is forced to ground its response in indexed source documents instead of relying on its training memory. Second, the dataset is curated and refreshed by the Neram Classes content team, who have been tracking architecture admissions in India since 2009. The result is an assistant that admits when a question is out of scope, cites the document for every numeric claim, and stays current with each admissions cycle.</p><p>The chatbot is part of the wider Neram aiArchitek toolkit. It pairs naturally with the College Predictor (where Aintra explains why a particular college is a match for your score), the Cutoff Calculator (where Aintra breaks down the math), and the Eligibility Checker (where Aintra interprets the COA rule for borderline cases).</p>`,
  faqs: [
    {
      question: 'Is Aintra a wrapper around ChatGPT?',
      answer:
        'No. Aintra uses a Retrieval Augmented Generation pipeline that grounds every answer in indexed source documents (NATA syllabus, COA approval lists, TNEA brochures, KEAM rank lists, JoSAA rules). The language model is used to compose the answer; the facts come from the index.',
    },
    {
      question: 'Is Aintra free?',
      answer:
        'Yes. Aintra is free for every aspirant, with no signup, no message cap, and no premium tier. Neram Classes funds the service from coaching revenue.',
    },
    {
      question: 'How current is the data?',
      answer:
        'The index is refreshed each admissions cycle. NATA 2026 dates, COA fee changes, TNEA 2026 brochures, and KEAM 2026 schedule updates are reflected within a week of publication. The disclaimer line in each chat shows the last refresh date for that topic.',
    },
    {
      question: 'Does Aintra answer in Tamil?',
      answer:
        'Yes. Aintra accepts questions in English or Tamil and replies in the same language. Hindi, Malayalam, Kannada, and Telugu are on the roadmap for the 2026 to 2027 cycle.',
    },
    {
      question: 'Can Aintra predict my admission chance?',
      answer:
        'Aintra explains how cutoffs work and what your score means in context, but for a structured probability output use the College Predictor and Cutoff Calculator tools. Aintra can interpret those outputs and answer follow up questions about specific colleges.',
    },
    {
      question: 'What if Aintra does not know the answer?',
      answer:
        'Aintra is built to admit ignorance. If a question is outside its indexed dataset, it says so and suggests the official source (CoA portal, TNEA helpline, NATA brochure). It will not invent a cutoff or a fee figure to sound helpful.',
    },
    {
      question: 'Are my chat messages stored?',
      answer:
        'No. Chat history stays in your browser session and is cleared when you close the tab. We do not associate messages with an email or phone number, because we do not collect either.',
    },
    {
      question: 'How is this different from the general chatbot in the corner of the page?',
      answer:
        'The corner chatbot answers general queries about Neram Classes courses and admissions support. Aintra is the topic specific assistant on counselling pages, grounded in admissions data with citations. They share an interface but use different indexes.',
    },
  ],
  relatedToolSlugs: ['college-predictor', 'cutoff-calculator', 'counseling-insights'],
  teaserComponent: AiChatbotTeaser,
};
