import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography, Paper, Button, Grid, Chip } from '@neram/ui';
import { buildAlternates } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import Link from 'next/link';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'B.Arch Counseling Guide 2026 — TNEA, KEAM, JoSAA & More | Neram Classes',
    description:
      'Complete guide to B.Arch admission counseling across India. TNEA, KEAM, JoSAA — eligibility, cutoffs, seat matrix, college predictions, and free tools.',
    keywords:
      'B.Arch counseling 2026, TNEA B.Arch, architecture admission, B.Arch cutoff, college predictor, rank predictor, NATA counseling',
    alternates: buildAlternates(locale, '/counseling'),
  };
}

interface PageProps {
  params: { locale: string };
}

const COUNSELING_SYSTEMS = [
  {
    code: 'TNEA_BARCH',
    name: 'TNEA B.Arch Counseling',
    state: 'Tamil Nadu',
    body: 'Anna University',
    exams: ['NATA'],
    slug: 'tnea-barch',
    available: true,
    colleges: 32,
    description: 'Tamil Nadu Engineering Admissions for B.Arch programs. Uses HSC marks + NATA score.',
  },
  {
    code: 'KEAM_ARCH',
    name: 'KEAM Architecture',
    state: 'Kerala',
    body: 'CEE Kerala',
    exams: ['NATA'],
    slug: 'keam-arch',
    available: false,
    colleges: 0,
    description: 'Kerala Engineering/Architecture/Medical entrance for architecture admissions.',
  },
  {
    code: 'JOSAA_ARCH',
    name: 'JoSAA Architecture',
    state: 'National',
    body: 'JoSAA',
    exams: ['JEE Paper 2'],
    slug: 'josaa-arch',
    available: false,
    colleges: 0,
    description: 'Joint Seat Allocation Authority for NITs, IITs, and other centrally funded institutions.',
  },
];

export default function CounselingHubPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const breadcrumbs = generateBreadcrumbSchema([
    { name: 'Home', url: `/${locale}` },
    { name: 'Counseling', url: `/${locale}/counseling` },
  ]);

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', px: { xs: 2, md: 4 }, py: { xs: 3, md: 5 } }}>
      <JsonLd data={breadcrumbs} />

      {/* Hero */}
      <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
        <Typography
          variant="h3"
          component="h1"
          fontWeight={800}
          sx={{ fontSize: { xs: '1.75rem', md: '2.5rem' }, mb: 1.5 }}
        >
          Your Complete Guide to B.Arch Admissions
        </Typography>
        <Typography
          variant="h6"
          color="text.secondary"
          sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, maxWidth: 700, mx: 'auto' }}
        >
          Everything you need to know about architecture counseling — eligibility, cutoffs,
          seat matrix, and free prediction tools.
        </Typography>
      </Box>

      {/* System Cards */}
      <Grid container spacing={3} sx={{ mb: 6 }}>
        {COUNSELING_SYSTEMS.map((system) => (
          <Grid item xs={12} md={4} key={system.code}>
            <Paper
              elevation={0}
              sx={{
                p: 3,
                height: '100%',
                borderRadius: 2,
                border: '1px solid',
                borderColor: system.available ? 'primary.main' : 'grey.300',
                opacity: system.available ? 1 : 0.7,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.1rem' }}>
                  {system.name}
                </Typography>
                {system.available ? (
                  <Chip label="Live" size="small" color="success" />
                ) : (
                  <Chip label="Coming Soon" size="small" variant="outlined" />
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5, flexWrap: 'wrap' }}>
                <Chip label={system.state} size="small" variant="outlined" />
                <Chip label={system.body} size="small" variant="outlined" />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, flex: 1 }}>
                {system.description}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
                {system.exams.map((exam) => (
                  <Chip key={exam} label={exam} size="small" color="primary" variant="outlined" />
                ))}
              </Box>
              {system.available ? (
                <Button
                  variant="contained"
                  fullWidth
                  component={Link}
                  href={`/${locale}/counseling/${system.slug}`}
                >
                  View Full Guide
                </Button>
              ) : (
                <Button variant="outlined" fullWidth disabled>
                  Coming Soon
                </Button>
              )}
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Quick Comparison */}
      <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, borderRadius: 2, border: '1px solid', borderColor: 'grey.200', mb: 5 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
          Quick Comparison
        </Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 600 }}>Feature</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 600 }}>TNEA B.Arch</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 600 }}>KEAM Arch</th>
                <th style={{ textAlign: 'left', padding: '12px 8px', fontWeight: 600 }}>JoSAA Arch</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['State', 'Tamil Nadu', 'Kerala', 'National'],
                ['Exams', 'NATA', 'NATA', 'JEE Paper 2'],
                ['Merit Formula', 'HSC(200) + NATA(200)', 'NATA Score', 'JEE P2 Score'],
                ['Max Score', '400', '200', 'JEE Rank'],
                ['Colleges', '32', '~15', '~20 (NITs/IITs)'],
                ['Typical Rounds', '3-4', '3', '6'],
              ].map(([feature, tnea, keam, josaa]) => (
                <tr key={feature} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 8px', fontWeight: 500 }}>{feature}</td>
                  <td style={{ padding: '10px 8px' }}>{tnea}</td>
                  <td style={{ padding: '10px 8px', color: '#999' }}>{keam}</td>
                  <td style={{ padding: '10px 8px', color: '#999' }}>{josaa}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Paper>

      {/* CTA */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, md: 4 },
          borderRadius: 2,
          bgcolor: '#E3F2FD',
          border: '1px solid',
          borderColor: '#1565C0',
          textAlign: 'center',
        }}
      >
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          Ready to predict your chances?
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 500, mx: 'auto' }}>
          Use our free aiArchitek tools to calculate your cutoff score, predict your rank,
          and find colleges you can get into.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            size="large"
            href="https://app.neramclasses.com/tools/nata/cutoff-calculator"
            target="_blank"
            sx={{ bgcolor: '#1565C0', '&:hover': { bgcolor: '#0D47A1' } }}
          >
            Cutoff Calculator
          </Button>
          <Button
            variant="outlined"
            size="large"
            href="https://app.neramclasses.com/tools/counseling/rank-predictor"
            target="_blank"
          >
            Rank Predictor
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
