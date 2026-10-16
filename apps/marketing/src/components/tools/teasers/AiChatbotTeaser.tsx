'use client';

import { Box, Typography } from '@neram/ui';
import { Link } from '@/i18n/routing';
import { CtaButton, QuickCheck, tokens } from '@/design-system';

const SAMPLE_PROMPTS = [
  {
    text: 'Which B.Arch colleges can I get with NATA score 130?',
    href: '/counseling/tnea-barch',
  },
  {
    text: 'What is the TNEA cutoff for Anna University B.Arch?',
    href: '/counseling/tnea-barch',
  },
  {
    text: 'How many seats does KEAM allot for B.Arch in 2026?',
    href: '/counseling/keam-arch',
  },
  {
    text: 'Difference between NATA and JEE Paper 2 for IIT admissions?',
    href: '/counseling/tnea-barch',
  },
  {
    text: 'Show me COA approved colleges in Tamil Nadu under 1 lakh fees.',
    href: '/counseling/tnea-barch',
  },
];

export default function AiChatbotTeaser() {
  return (
    <QuickCheck title="Ask Aintra, the Architecture Admissions AI" headingId="ai-chatbot-quick-check">
      <Typography sx={{ fontSize: '1rem', color: tokens.inkMuted, lineHeight: 1.5 }}>
        Aintra is a free AI assistant trained on NATA syllabus, JEE Paper 2 patterns, B.Arch
        college data, and TNEA / KEAM cutoffs from the last five years. It cites every fact and
        knows current admission rules.
      </Typography>

      <Box component="nav" aria-labelledby="ai-chatbot-samples" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography
          id="ai-chatbot-samples"
          sx={{
            fontWeight: 600,
            fontSize: '0.8125rem',
            color: tokens.inkMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Try a sample question
        </Typography>
        {SAMPLE_PROMPTS.map((prompt) => (
          <Box
            key={prompt.text}
            component={Link}
            href={prompt.href}
            sx={{
              display: 'flex',
              alignItems: 'center',
              minHeight: 44,
              px: 1.75,
              py: 1.25,
              boxSizing: 'border-box',
              border: `1px solid ${tokens.line}`,
              borderRadius: `${tokens.radius}px`,
              bgcolor: tokens.surface,
              color: tokens.ink,
              fontSize: '0.9375rem',
              lineHeight: 1.4,
              textDecoration: 'none',
              transition: 'border-color 150ms ease',
              '&:hover': { borderColor: tokens.gold500, color: tokens.ink },
              '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: '2px' },
            }}
          >
            {prompt.text}
          </Box>
        ))}
      </Box>

      <Typography sx={{ fontSize: '0.8125rem', color: tokens.inkMuted, textAlign: 'center' }}>
        Free, no signup, answers cite data sources you can verify.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <CtaButton href="/counseling/keam-arch" variant="outline" fullWidth>
          Open KEAM Aintra
        </CtaButton>
        <CtaButton href="/counseling/tnea-barch" fullWidth>
          Open TNEA B.Arch Aintra
        </CtaButton>
      </Box>
    </QuickCheck>
  );
}
