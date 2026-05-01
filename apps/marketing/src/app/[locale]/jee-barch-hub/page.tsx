import { Metadata } from 'next';
import { Container, Typography, Box, Grid, Paper, Stack, Chip, Button } from '@mui/material';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { getJoSAAColleges } from '@/lib/college-hub/queries';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'JEE Paper 2 B.Arch Colleges: NITs, SPAs, IITs | JoSAA 2026 | Neram',
    description:
      'Complete list of NIT, SPA, IIT architecture colleges admitting through JEE Main Paper 2 via JoSAA counseling. Compare cutoffs, fees, and placements.',
    keywords: [
      'JEE Paper 2 B.Arch',
      'JoSAA architecture',
      'NIT architecture',
      'SPA architecture',
      'IIT B.Arch',
    ],
  };
}

const FAQ_ITEMS = [
  {
    q: 'Which colleges accept JEE Main Paper 2 for B.Arch?',
    a: 'JEE Main Paper 2 is used for admission to NITs (National Institutes of Technology), SPAs (School of Planning and Architecture), IITs (with B.Arch programs), and other centrally funded institutions via JoSAA counseling.',
  },
  {
    q: 'What is the cutoff for NIT Trichy B.Arch?',
    a: 'NIT Trichy B.Arch general category cutoff typically ranges from rank 500-1500 depending on the year. Home state category (Tamil Nadu) cutoffs may be different. Check the JoSAA portal for round-wise cutoffs.',
  },
  {
    q: 'Is JEE Paper 2 harder than NATA?',
    a: 'JEE Paper 2 is more competitive due to limited NIT/SPA seats (around 2000 total nationally). NATA has a broader pool of colleges. Strong math is critical for JEE Paper 2. Both are valid pathways to B.Arch.',
  },
];

export default async function JEEBArchHubPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const colleges = await getJoSAAColleges();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      {/* Hero */}
      <Box sx={{ textAlign: 'center', mb: 5 }}>
        <Chip label="JoSAA 2026" color="secondary" sx={{ mb: 1.5, fontWeight: 700 }} />
        <Typography
          variant="h1"
          sx={{ fontSize: { xs: '1.75rem', sm: '2.5rem' }, fontWeight: 900, mb: 1.5 }}
        >
          JEE Paper 2: NITs, SPAs, IITs for B.Arch
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 640, mx: 'auto', lineHeight: 1.7 }}
        >
          JEE Main Paper 2 is the NTA-conducted gateway to top government architecture and planning colleges.
          Paper 2A admits to B.Arch, Paper 2B to B.Planning, both via JoSAA. NIT Trichy, MNNIT Allahabad, SPA Delhi, and more.
        </Typography>
        <Stack direction="row" justifyContent="center" gap={2} sx={{ mt: 3, flexWrap: 'wrap' }}>
          <Button variant="contained" component={Link} href="/colleges/josaa" size="large">
            All JoSAA Colleges
          </Button>
          <Button variant="outlined" component={Link} href="/jee-paper-2-preparation" size="large">
            JEE Paper 2 Guide
          </Button>
        </Stack>
      </Box>

      {/* Paper 2A vs Paper 2B comparison */}
      <Box sx={{ mb: 5 }}>
        <Typography variant="h5" component="h2" fontWeight={800} sx={{ mb: 1 }}>
          JEE Main Paper 2: which paper for which degree?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, maxWidth: 760 }}>
          NTA conducts JEE Main Paper 2 in two parts: Paper 2A for the 5-year B.Arch program, and Paper 2B for the 4-year B.Planning program. Both are 3 hours and run in the same session at the same centres, but the question paper differs.
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Paper id="paper-2a" variant="outlined" sx={{ p: 3, borderRadius: 2, height: '100%', borderTop: '4px solid', borderTopColor: 'secondary.main' }}>
              <Chip label="Paper 2A" size="small" color="secondary" sx={{ fontWeight: 700, mb: 1 }} />
              <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5 }}>B.Arch (Architecture)</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Five-year professional Bachelor of Architecture, COA-registered. Routes you into NITs, SPAs, IIITs, and a few centrally funded institutes through JoSAA.
              </Typography>
              <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.75, lineHeight: 1.7, fontSize: '0.95rem' } }}>
                <li>Eligibility: 12th pass with Physics, Chemistry, Mathematics; aggregate norms apply.</li>
                <li>Sections: Mathematics, Aptitude (MCQ), and Drawing (offline pen-and-paper).</li>
                <li>Total marks: 400. Drawing is 100, Math is 100, Aptitude is 200.</li>
                <li>Counselling: JoSAA, six rounds in June and July.</li>
              </Box>
              <Button component={Link} href="/jee-paper-2-preparation" size="small" sx={{ mt: 1.5, fontWeight: 600 }}>
                Paper 2A prep guide
              </Button>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper id="paper-2b" variant="outlined" sx={{ p: 3, borderRadius: 2, height: '100%', borderTop: '4px solid', borderTopColor: 'primary.main' }}>
              <Chip label="Paper 2B" size="small" color="primary" sx={{ fontWeight: 700, mb: 1 }} />
              <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5 }}>B.Planning</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Four-year Bachelor of Planning, focused on urban and regional planning, GIS, transportation, and policy. Smaller seat pool, but a strong path into urban-design careers.
              </Typography>
              <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.75, lineHeight: 1.7, fontSize: '0.95rem' } }}>
                <li>Eligibility: 12th pass with Mathematics; aggregate norms apply.</li>
                <li>Sections: Mathematics, Aptitude (MCQ), and Planning-Based Questions (MCQ).</li>
                <li>Total marks: 400. All MCQ, no drawing test.</li>
                <li>Counselling: JoSAA, alongside Paper 2A choices.</li>
              </Box>
              <Button component={Link} href="/colleges/josaa" size="small" sx={{ mt: 1.5, fontWeight: 600 }}>
                B.Planning colleges via JoSAA
              </Button>
            </Paper>
          </Grid>
        </Grid>
      </Box>

      {/* Key Stats */}
      <Grid container spacing={2} sx={{ mb: 5 }}>
        {[
          { label: 'JoSAA Architecture Colleges', value: `${colleges.length}+`, desc: 'NITs, SPAs, IITs' },
          { label: 'Total Seats', value: '~2,000', desc: 'across all JoSAA colleges' },
          { label: 'JEE Paper 2 Marks', value: '300', desc: 'Math 100, Aptitude 200' },
          { label: 'JoSAA Rounds', value: '6', desc: 'June-July counseling' },
        ].map((stat) => (
          <Grid item xs={6} sm={3} key={stat.label}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="h4" fontWeight={900} color="secondary.main">
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

      {/* JoSAA college list */}
      <Typography variant="h5" fontWeight={800} sx={{ mb: 2 }}>
        JoSAA B.Arch Colleges ({colleges.length} found)
      </Typography>
      <Grid container spacing={2} sx={{ mb: 5 }}>
        {colleges.map((college) => (
          <Grid item xs={12} sm={6} md={4} key={college.id}>
            <CollegeListingCard college={college} />
          </Grid>
        ))}
      </Grid>

      {colleges.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4, mb: 4 }}>
          <Typography color="text.secondary">
            JoSAA college data coming soon. Check back after data entry is complete.
          </Typography>
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
