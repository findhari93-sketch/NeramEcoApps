import { FaqList, Section, type FaqItem } from '@/design-system';

export const askSeniorsFaqItems: FaqItem[] = [
  {
    question: 'What is AskSeniors?',
    answer:
      'AskSeniors is a free annual online event by Neram Classes where current B.Arch students from 50+ top architecture colleges join a live session to answer questions from aspirants preparing for TNEA counselling or choosing their colleges.',
  },
  {
    question: 'Who can attend AskSeniors?',
    answer:
      'Any student who has appeared for NATA or JEE Paper 2 (B.Arch) and is preparing for college counselling. Parents are welcome too.',
  },
  {
    question: 'Is it really free?',
    answer:
      'Yes, completely free. Register with your name, phone, and email and you will receive the event link before the event day.',
  },
  {
    question: 'Which colleges participate?',
    answer:
      'We invite students from 50+ colleges including NIT Trichy, Anna University, PSG Coimbatore, SPA Delhi, CEPT Ahmedabad, VIT Vellore, SRM Chennai, and many more across Tamil Nadu and India.',
  },
  {
    question: 'How will I get the event link?',
    answer:
      'Once you register, you will receive a confirmation email. We will also send the event joining link to your email and phone before the event day.',
  },
  {
    question: 'When is the next AskSeniors event?',
    answer:
      'We conduct AskSeniors every year in June or July, before TNEA counselling begins. Register now to be notified when the exact date is confirmed.',
  },
];

/** The AskSeniors FAQ as a narrow light band with the shared ruled FaqList. */
export default function AskSeniorsFAQ() {
  return (
    <Section id="faq" width="narrow" header={{ eyebrow: 'Questions', title: 'Frequently Asked' }}>
      <FaqList items={askSeniorsFaqItems} defaultOpen={-1} />
    </Section>
  );
}
