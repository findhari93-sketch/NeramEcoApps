import { Metadata } from 'next';
import { Container, Typography, Box, Grid, Paper, Stack, Chip, Button } from '@mui/material';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { getTNEAColleges } from '@/lib/college-hub/queries';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'NATA 2026: B.Arch Colleges Accepting NATA Score | Neram',
    description:
      'Complete list of B.Arch colleges in India accepting NATA scores. Compare fees, cutoffs, placements. All COA-approved architecture colleges with NATA admission.',
    keywords: ['NATA colleges', 'B.Arch NATA', 'NATA score colleges', 'architecture colleges NATA'],
  };
}

const FAQ_ITEMS = [
  {
    q: 'Which colleges accept NATA score for B.Arch admission?',
    a: 'Most private and state-aided B.Arch colleges across India accept NATA scores. Central government institutions (NITs, SPAs) use JEE Paper 2 via JoSAA. State colleges under TNEA (Tamil Nadu), KCET (Karnataka), etc., accept NATA as per their respective counseling norms.',
  },
  {
    q: 'What is the minimum NATA score for admission to top B.Arch colleges?',
    a: 'Top colleges typically require 120-140+ out of 200 in NATA. For COA approval, you need a minimum 50% in 10+2 PCM/PCB and a qualifying NATA score. Management quota may have lower cutoffs.',
  },
  {
    q: 'Is NATA mandatory for all B.Arch colleges?',
    a: 'Yes. COA (Council of Architecture) mandates NATA or JEE Paper 2 score for all B.Arch admissions since 2019. No B.Arch college can admit students without a valid architecture entrance exam score.',
  },
];

export default async function NATAHubPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const colleges = await getTNEAColleges();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      {/* Hero */}
      <Box sx={{ textAlign: 'center', mb: 5 }}>
        <Chip label="NATA 2026" color="primary" sx={{ mb: 1.5, fontWeight: 700 }} />
        <Typography
          variant="h1"
          sx={{ fontSize: { xs: '1.75rem', sm: '2.5rem' }, fontWeight: 900, mb: 1.5 }}
        >
          NATA B.Arch Colleges in India
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 640, mx: 'auto', lineHeight: 1.7 }}
        >
          National Aptitude Test in Architecture (NATA) is conducted by the Council of
          Architecture. Browse all B.Arch colleges accepting NATA score, compare fees,
          cutoffs, and placements.
        </Typography>
        <Stack direction="row" justifyContent="center" gap={2} sx={{ mt: 3, flexWrap: 'wrap' }}>
          <Button variant="contained" component={Link} href="/colleges" size="large">
            Browse All Colleges
          </Button>
          <Button variant="outlined" component={Link} href="/nata-2026" size="large">
            NATA 2026 Guide
          </Button>
        </Stack>
      </Box>

      {/* Key Stats */}
      <Grid container spacing={2} sx={{ mb: 5 }}>
        {[
          { label: 'Colleges Accept NATA', value: '550+', desc: 'across India' },
          { label: 'COA Approved', value: '100%', desc: 'all listed colleges' },
          { label: 'NATA Score Range', value: '40-200', desc: 'exam out of 200' },
          { label: 'Exam Frequency', value: '2x/year', desc: 'Jan-Apr, Apr-Jun' },
        ].map((stat) => (
          <Grid item xs={6} sm={3} key={stat.label}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="h4" fontWeight={900} color="primary.main">
                {stat.value}
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {stat.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {stat.desc}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* How NATA Works */}
      <Box
        sx={{
          mb: 5,
          p: { xs: 2.5, sm: 4 },
          bgcolor: '#f0f9ff',
          borderRadius: 3,
          border: '1px solid #bae6fd',
        }}
      >
        <Typography variant="h5" fontWeight={800} gutterBottom>
          How NATA Admission Works
        </Typography>
        <Grid container spacing={3} sx={{ mt: 0.5 }}>
          {[
            {
              step: '1',
              title: 'Appear in NATA',
              body: 'Register on nata.in, appear in the online test. NATA 2026 is conducted twice. Best score is considered.',
            },
            {
              step: '2',
              title: 'Score Card',
              body: 'Download score card valid for current academic year. Minimum qualifying score is required for COA approval.',
            },
            {
              step: '3',
              title: 'Apply to Colleges',
              body: 'Apply directly to colleges (management quota) or through state counseling systems (TNEA, KCET, etc.).',
            },
            {
              step: '4',
              title: 'Counseling and Allotment',
              body: 'Get seat allotted based on NATA score and academics. Pay fees, submit documents, and confirm admission.',
            },
          ].map(({ step, title, body }) => (
            <Grid item xs={12} sm={6} key={step}>
              <Stack direction="row" gap={2}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {step}
                </Box>
                <Box>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {body}
                  </Typography>
                </Box>
              </Stack>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* TNEA Colleges list */}
      <Typography variant="h5" fontWeight={800} sx={{ mb: 2 }}>
        Tamil Nadu B.Arch Colleges (TNEA + NATA)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {colleges.length} colleges listed in Tamil Nadu. Admission through TNEA counseling and
        NATA score.
      </Typography>
      <Grid container spacing={2} sx={{ mb: 5 }}>
        {colleges.slice(0, 12).map((college) => (
          <Grid item xs={12} sm={6} md={4} key={college.id}>
            <CollegeListingCard college={college} />
          </Grid>
        ))}
      </Grid>
      {colleges.length > 12 && (
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Button variant="outlined" component={Link} href="/colleges/tamil-nadu">
            View All {colleges.length} Tamil Nadu Colleges
          </Button>
        </Box>
      )}

      {/* FAQ */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight={800} sx={{ mb: 2.5 }}>
          Frequently Asked Questions
        </Typography>
        <Stack gap={2}>
          {FAQ_ITEMS.map(({ q, a }) => (
            <Paper key={q} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                {q}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                {a}
              </Typography>
            </Paper>
          ))}
        </Stack>
      </Box>
    </Container>
  );
}
