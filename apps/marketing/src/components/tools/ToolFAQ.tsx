'use client';

import type { ToolFAQ as ToolFAQType } from '@/lib/tools/types';
import {
  Box,
  Container,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  ExpandMoreIcon,
} from '@neram/ui';

export default function ToolFAQ({ faqs }: { faqs: ToolFAQType[] }) {
  return (
    <Box sx={{ py: { xs: 5, md: 8 }, bgcolor: '#FAFAFA' }}>
      <Container maxWidth="md">
        <Typography
          component="h2"
          sx={{
            fontSize: { xs: '1.5rem', md: '2rem' },
            fontWeight: 700,
            textAlign: 'center',
            mb: 4,
          }}
        >
          Frequently Asked Questions
        </Typography>

        {faqs.map((faq, index) => (
          <Accordion
            key={index}
            disableGutters
            elevation={0}
            sx={{
              border: '1px solid #E0E0E0',
              borderRadius: '8px !important',
              mb: 1,
              '&:before': { display: 'none' },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                minHeight: 48,
                '& .MuiAccordionSummary-content': { my: 1.5 },
              }}
            >
              <Typography
                component="h3"
                sx={{ fontWeight: 700, fontSize: '1rem' }}
              >
                {faq.question}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, pb: 2.5 }}>
              <Typography
                sx={{ color: 'text.secondary', lineHeight: 1.7 }}
              >
                {faq.answer}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Container>
    </Box>
  );
}
