'use client';

import { Box, Button, Chip, Paper, Stack, Typography } from '@neram/ui';
import Link from 'next/link';

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
    <Paper
      elevation={0}
      sx={{
        p: { xs: 3, sm: 4 },
        border: '1px solid #E0E0E0',
        borderRadius: 2,
      }}
    >
      <Typography
        component="h2"
        sx={{ fontWeight: 700, fontSize: { xs: '1.25rem', sm: '1.5rem' }, mb: 1 }}
      >
        Ask Aintra, the Architecture Admissions AI
      </Typography>

      <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', mb: 2.5, lineHeight: 1.5 }}>
        Aintra is a free AI assistant trained on NATA syllabus, JEE Paper 2 patterns, B.Arch
        college data, and TNEA / KEAM cutoffs from the last five years. It cites every fact and
        knows current admission rules.
      </Typography>

      <Typography
        sx={{
          fontWeight: 600,
          fontSize: '0.85rem',
          color: 'text.secondary',
          mb: 1.5,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        Try a sample question
      </Typography>

      <Stack spacing={1} sx={{ mb: 2.5 }}>
        {SAMPLE_PROMPTS.map((prompt) => (
          <Chip
            key={prompt.text}
            component={Link}
            href={prompt.href}
            label={prompt.text}
            clickable
            variant="outlined"
            sx={{
              minHeight: 44,
              height: 'auto',
              py: 1,
              px: 1.5,
              fontSize: '0.85rem',
              borderRadius: 2,
              justifyContent: 'flex-start',
              '& .MuiChip-label': {
                whiteSpace: 'normal',
                lineHeight: 1.4,
                textAlign: 'left',
              },
            }}
          />
        ))}
      </Stack>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
        <Button
          component={Link}
          href="/counseling/tnea-barch"
          variant="contained"
          fullWidth
          sx={{ minHeight: 48, fontWeight: 700, fontSize: '1rem' }}
        >
          Open TNEA B.Arch Aintra
        </Button>
        <Button
          component={Link}
          href="/counseling/keam-arch"
          variant="outlined"
          fullWidth
          sx={{ minHeight: 48, fontWeight: 700, fontSize: '0.95rem' }}
        >
          Open KEAM Aintra
        </Button>
      </Box>

      <Typography
        sx={{ mt: 1.5, fontSize: '0.8rem', color: 'text.secondary', textAlign: 'center' }}
      >
        Free, no signup, answers cite data sources you can verify.
      </Typography>
    </Paper>
  );
}
