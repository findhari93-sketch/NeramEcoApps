'use client';

import { Accordion, AccordionDetails, AccordionSummary, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { CollegeFaqItem } from '@/lib/college-hub/types';

/**
 * The page's FAQs. MUI keeps collapsed AccordionDetails mounted (no
 * unmountOnExit), so every answer is in the server HTML, and the list is the
 * exact array the FAQPage JSON-LD is built from.
 */
export default function CollegeFaqList({ faqs }: { faqs: CollegeFaqItem[] }) {
  return (
    <div>
      {faqs.map((f, i) => (
        <Accordion
          key={`${i}-${f.question}`}
          disableGutters
          elevation={0}
          defaultExpanded={i === 0}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            mb: 1,
            '&:before': { display: 'none' },
            '&.MuiAccordion-root:first-of-type, &.MuiAccordion-root:last-of-type': { borderRadius: 2 },
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls={`college-faq-${i}-answer`}
            id={`college-faq-${i}-question`}
            sx={{
              minHeight: 48,
              px: 2,
              '& .MuiAccordionSummary-content': { my: 1.25 },
              '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
            }}
          >
            <Typography component="h3" data-faq-question sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 }}>
              {f.question}
            </Typography>
          </AccordionSummary>
          <AccordionDetails id={`college-faq-${i}-answer`} sx={{ px: 2, pt: 0, pb: 2 }}>
            <Typography component="p" sx={{ fontSize: '1rem', lineHeight: 1.6, color: 'text.secondary' }}>
              {f.answer}
            </Typography>
          </AccordionDetails>
        </Accordion>
      ))}
    </div>
  );
}
