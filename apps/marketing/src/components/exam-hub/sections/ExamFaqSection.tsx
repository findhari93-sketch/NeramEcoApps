'use client';

import { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  ExpandMoreIcon,
  HelpOutlineIcon,
  m3Primary,
  m3Tertiary,
  m3Neutral,
} from '@neram/ui';

interface FaqItem {
  question: string;
  answer: string;
}

interface ExamFaqSectionProps {
  faqs: FaqItem[];
  heading?: string;
  subtitle?: string;
}

export default function ExamFaqSection({
  faqs,
  heading = 'Frequently Asked Questions',
  subtitle,
}: ExamFaqSectionProps) {
  const [expanded, setExpanded] = useState<string | false>(false);

  const handleChange =
    (panel: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
      setExpanded(isExpanded ? panel : false);
    };

  return (
    <Box
      component="section"
      id="faq"
      sx={{
        bgcolor: m3Neutral[99],
        py: { xs: 6, md: 8 },
      }}
    >
      <Container maxWidth="md">
        <Box
          sx={{
            position: 'relative',
            textAlign: 'center',
            mb: { xs: 4, md: 5 },
          }}
        >
          <HelpOutlineIcon
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: 72,
              color: m3Primary[90],
              opacity: 0.3,
              pointerEvents: 'none',
            }}
          />
          <Typography
            variant="h4"
            component="h2"
            sx={{
              fontWeight: 700,
              color: m3Neutral[10],
              position: 'relative',
              zIndex: 1,
            }}
          >
            {heading}
          </Typography>
          {subtitle ? (
            <Typography
              variant="body1"
              sx={{
                color: 'text.secondary',
                mt: 1.5,
                position: 'relative',
                zIndex: 1,
              }}
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>

        <Box>
          {faqs.map((faq, index) => {
            const panelId = `faq-panel-${index}`;
            const isExpanded = expanded === panelId;

            return (
              <Box key={index} sx={{ mb: 1.5 }}>
                <Box
                  sx={{
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: m3Neutral[90],
                    position: 'relative',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: '3px',
                      bgcolor: isExpanded ? m3Tertiary[40] : m3Primary[40],
                      transition: 'background-color 0.3s ease',
                      zIndex: 1,
                    },
                  }}
                >
                  <Accordion
                    expanded={isExpanded}
                    onChange={handleChange(panelId)}
                    disableGutters
                    elevation={0}
                    sx={{
                      bgcolor: 'transparent',
                      '&::before': { display: 'none' },
                      '&.Mui-expanded': { margin: 0 },
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon sx={{ color: m3Primary[40] }} />}
                      sx={{
                        pl: 3,
                        py: 1.5,
                        minHeight: 56,
                        '&:hover': { bgcolor: m3Neutral[96] },
                        '& .MuiAccordionSummary-content': { my: 0 },
                      }}
                    >
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight: 600,
                          color: m3Neutral[10],
                          pr: 2,
                        }}
                      >
                        {faq.question}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails
                      sx={{
                        pl: 3,
                        pr: 3,
                        pb: 2.5,
                        bgcolor: 'rgba(26, 115, 232, 0.02)',
                      }}
                    >
                      <Typography
                        variant="body1"
                        sx={{ lineHeight: 1.8, color: 'text.secondary' }}
                      >
                        {faq.answer}
                      </Typography>
                    </AccordionDetails>
                  </Accordion>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Container>
    </Box>
  );
}
