'use client';

import { Box, Typography, Accordion, AccordionSummary, AccordionDetails } from '@neram/ui';
import { neramTokens } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { FAQS } from '@/lib/landing-data';

export default function FAQSection() {
  return (
    <Box
      component="section"
      id="faq"
      sx={{
        bgcolor: neramTokens.navy[800],
        py: { xs: 8, md: 12 },
        px: { xs: 2, md: 4 },
      }}
    >
      <Box sx={{ maxWidth: 800, mx: 'auto' }}>
        {/* Section header */}
        <Box sx={{ textAlign: 'center', mb: { xs: 5, md: 7 } }}>
          <Typography
            sx={{
              fontFamily: 'var(--font-space-mono), "Space Mono", monospace',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: neramTokens.gold[500],
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              mb: 2,
            }}
          >
            FAQ
          </Typography>
          <Typography
            variant="h2"
            sx={{
              fontFamily: 'var(--font-cormorant), "Cormorant Garamond", serif',
              fontSize: { xs: '2rem', md: '3rem' },
              fontWeight: 700,
              color: neramTokens.cream[100],
            }}
          >
            Frequently Asked Questions
          </Typography>
        </Box>

        {/* FAQ Accordions */}
        {FAQS.map((faq, i) => (
          <Accordion
            key={i}
            disableGutters
            elevation={0}
            sx={{
              bgcolor: 'transparent',
              borderBottom: `1px solid ${neramTokens.navy[600]}40`,
              '&:before': { display: 'none' },
              '&.Mui-expanded': { margin: 0 },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ color: neramTokens.gold[500] }} />}
              sx={{
                px: 0,
                py: 1,
                minHeight: 56,
                '& .MuiAccordionSummary-content': { my: 1.5 },
              }}
            >
              <Typography
                component="h3"
                sx={{
                  fontWeight: 600,
                  fontSize: { xs: '0.95rem', md: '1.05rem' },
                  color: neramTokens.cream[100],
                  pr: 2,
                }}
              >
                {faq.question}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, pb: 3 }}>
              <Typography
                sx={{
                  color: neramTokens.cream[300],
                  lineHeight: 1.7,
                  fontSize: { xs: '0.85rem', md: '0.9rem' },
                }}
              >
                {faq.answer}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </Box>
  );
}
