'use client';

import { Box } from '@neram/ui';
import { FaqList, SectionHeader } from '@/design-system';

interface FAQProps {
  t: (key: string) => string;
  /** Which questions to show, in order. Defaults to all of them. */
  keys?: readonly string[];
}

const FAQ_KEYS = ['faq1', 'faq2', 'faq3', 'faq4', 'faq5', 'faq6', 'faq7'] as const;

/** Fee questions as the design-system FaqList (rules, one open at a time). */
export default function FAQ({ t, keys = FAQ_KEYS }: FAQProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <SectionHeader id="fee-faq-title" title={t('faqTitle')} lede={t('faqSubtitle')} size="article" />
      <FaqList
        defaultOpen={-1}
        items={keys.map((key) => ({ question: t(`${key}Question`), answer: t(`${key}Answer`) }))}
      />
    </Box>
  );
}
