'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@neram/ui';
import { ExpandMoreOutlined, HelpOutlineOutlined } from '@mui/icons-material';

interface FAQProps {
  t: (key: string) => string;
}

const FAQ_KEYS = [
  'faq1',
  'faq2',
  'faq3',
  'faq4',
  'faq5',
  'faq6',
  'faq7',
] as const;

export default function FAQ({ t }: FAQProps) {
  const [expanded, setExpanded] = useState<string | false>(false);

  const handleChange = (panel: string) => (_: unknown, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  return (
    <Box sx={{ mb: 8 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 1 }}>
        <HelpOutlineOutlined sx={{ fontSize: 32, color: 'primary.main' }} />
        <Typography
          variant="h4"
          fontWeight={700}
          textAlign="center"
          sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}
        >
          {t('faqTitle')}
        </Typography>
      </Box>
      <Typography
        variant="body1"
        color="text.secondary"
        textAlign="center"
        sx={{ maxWidth: 600, mx: 'auto', mb: 4 }}
      >
        {t('faqSubtitle')}
      </Typography>

      <Box sx={{ maxWidth: 800, mx: 'auto' }}>
        {FAQ_KEYS.map((key) => (
          <Accordion
            key={key}
            expanded={expanded === key}
            onChange={handleChange(key)}
            variant="outlined"
            sx={{
              mb: 1,
              borderRadius: '12px !important',
              '&:before': { display: 'none' },
              '&.Mui-expanded': {
                borderColor: 'primary.main',
                boxShadow: 2,
              },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreOutlined />}
              sx={{
                minHeight: 56,
                '& .MuiAccordionSummary-content': { my: 1.5 },
              }}
            >
              <Typography variant="subtitle1" fontWeight={600}>
                {t(`${key}Question`)}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, pb: 2.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                {t(`${key}Answer`)}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </Box>
  );
}
