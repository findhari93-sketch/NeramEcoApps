'use client';

import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  ExpandMoreIcon,
} from '@neram/ui';

interface FAQItem {
  question: string;
  answer: string;
}

const faqItems: FAQItem[] = [
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

export default function AskSeniorsFAQ() {
  return (
    <Box
      component="section"
      sx={{
        py: { xs: 6, md: 9 },
        px: { xs: 2, md: 4 },
        maxWidth: 760,
        mx: 'auto',
      }}
    >
      {/* Overline */}
      <Typography
        sx={{
          color: '#e8a020',
          letterSpacing: 3,
          fontWeight: 700,
          textAlign: 'center',
          textTransform: 'uppercase',
          fontSize: '0.875rem',
          mb: 2,
        }}
      >
        Questions
      </Typography>

      {/* Heading */}
      <Typography
        variant="h4"
        component="h2"
        sx={{
          fontWeight: 800,
          textAlign: 'center',
          color: '#fff',
          mb: 5,
        }}
      >
        Frequently Asked
      </Typography>

      {/* FAQ Items */}
      {faqItems.map((item, index) => (
        <Accordion
          key={index}
          sx={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px !important',
            mb: 1.5,
            '&:before': {
              display: 'none',
            },
            '&.Mui-expanded': {
              borderColor: 'rgba(232,160,32,0.3)',
            },
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon sx={{ color: '#e8a020' }} />}
            sx={{
              '& .MuiAccordionSummary-content': {
                my: 1.5,
              },
            }}
          >
            <Typography
              sx={{
                fontWeight: 600,
                color: '#e5e7eb',
              }}
            >
              {item.question}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography
              sx={{
                color: '#9ca3af',
                lineHeight: 1.7,
              }}
            >
              {item.answer}
            </Typography>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}
