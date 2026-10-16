import { FaqList, Section, type FaqItem, type SurfaceTone } from '@/design-system';

interface ExamFaqSectionProps {
  /** The same array the page's FAQPage JSON-LD is built from. */
  faqs: FaqItem[];
  heading?: string;
  subtitle?: string;
  tone?: SurfaceTone;
}

/**
 * FAQ band for the exam overview hubs (AAT, PGETA): a narrow Section with the
 * design-system FaqList. The page keeps emitting the FAQPage JSON-LD from the
 * same `faqs` array, so what is shown and what is marked up stay identical.
 */
export default function ExamFaqSection({
  faqs,
  heading = 'Frequently Asked Questions',
  subtitle,
  tone = 'light',
}: ExamFaqSectionProps) {
  return (
    <Section id="faq" tone={tone} width="narrow" header={{ eyebrow: 'Questions', title: heading, lede: subtitle }}>
      <FaqList items={faqs} defaultOpen={-1} />
    </Section>
  );
}
