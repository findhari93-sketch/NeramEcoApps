import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography, Paper, Button, Chip, Grid, Divider } from '@neram/ui';
import { buildAlternates } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import Link from 'next/link';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'TNEA B.Arch Counseling 2026 — Complete Guide, Cutoffs, Colleges & Free Tools | Neram Classes',
    description:
      'Complete guide to TNEA B.Arch counseling 2026. Merit formula, eligibility, 32 participating colleges, category-wise cutoffs, rank predictor, and college predictor tools.',
    keywords:
      'TNEA B.Arch 2026, TNEA counseling, Tamil Nadu architecture admission, TNEA cutoff, TNEA colleges, B.Arch Tamil Nadu, Anna University B.Arch, NATA counseling Tamil Nadu',
    alternates: buildAlternates(locale, '/counseling/tnea-barch'),
  };
}

interface PageProps {
  params: { locale: string };
}

const FAQS = [
  {
    question: 'What is TNEA B.Arch Counseling?',
    answer: 'TNEA (Tamil Nadu Engineering Admissions) B.Arch Counseling is conducted by Anna University for admission to B.Arch programs in Tamil Nadu. It uses a composite merit score combining 12th board marks and NATA/JEE Paper 2 scores.',
  },
  {
    question: 'How is the TNEA B.Arch merit score calculated?',
    answer: 'The merit score is calculated as: Board marks converted to 200 (percentage × 2) + Best NATA score (out of 200) = Total out of 400. If you have JEE Paper 2 score, the better of NATA and JEE is used.',
  },
  {
    question: 'How many colleges participate in TNEA B.Arch?',
    answer: 'Approximately 32 architecture colleges in Tamil Nadu participate in TNEA B.Arch counseling, including Anna University SAP, government-aided, and private institutions.',
  },
  {
    question: 'What are the reservation categories in TNEA?',
    answer: 'TNEA follows Tamil Nadu reservation: OC (Open Category), BC (Backward Class), BCM (Backward Class Muslim), MBC (Most Backward Class), SC (Scheduled Caste), SCA (Scheduled Caste Arunthathiyar), and ST (Scheduled Tribe).',
  },
  {
    question: 'Can I use JEE Paper 2 score for TNEA B.Arch?',
    answer: 'Yes, TNEA accepts both NATA and JEE Paper 2 scores. If you have both, the higher score is considered for merit calculation.',
  },
];

const CATEGORIES = [
  { code: 'OC', name: 'Open Category', description: 'No reservation — general merit' },
  { code: 'BC', name: 'Backward Class', description: '30% reservation' },
  { code: 'BCM', name: 'Backward Class Muslim', description: '3.5% reservation' },
  { code: 'MBC', name: 'Most Backward Class', description: '20% reservation' },
  { code: 'SC', name: 'Scheduled Caste', description: '18% reservation' },
  { code: 'SCA', name: 'Scheduled Caste Arunthathiyar', description: '3% reservation' },
  { code: 'ST', name: 'Scheduled Tribe', description: '1% reservation' },
];

function SectionTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <Typography
      variant="h5"
      component="h2"
      id={id}
      fontWeight={700}
      sx={{ mt: 5, mb: 2, scrollMarginTop: 80, fontSize: { xs: '1.3rem', md: '1.5rem' } }}
    >
      {children}
    </Typography>
  );
}

export default function TneaBarchPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const breadcrumbs = generateBreadcrumbSchema([
    { name: 'Home', url: `/${locale}` },
    { name: 'Counseling', url: `/${locale}/counseling` },
    { name: 'TNEA B.Arch', url: `/${locale}/counseling/tnea-barch` },
  ]);

  const faqSchema = generateFAQSchema(FAQS);

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', px: { xs: 2, md: 3 }, py: { xs: 3, md: 5 } }}>
      <JsonLd data={breadcrumbs} />
      <JsonLd data={faqSchema} />

      {/* Breadcrumb */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
        <Link href={`/${locale}`} style={{ textDecoration: 'none' }}>
          <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
            Home
          </Typography>
        </Link>
        <Typography variant="body2" color="text.secondary">/</Typography>
        <Link href={`/${locale}/counseling`} style={{ textDecoration: 'none' }}>
          <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { color: 'primary.main' } }}>
            Counseling
          </Typography>
        </Link>
        <Typography variant="body2" color="text.secondary">/</Typography>
        <Typography variant="body2" color="primary">TNEA B.Arch</Typography>
      </Box>

      {/* Hero */}
      <Typography
        variant="h3"
        component="h1"
        fontWeight={800}
        sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, mb: 1 }}
      >
        TNEA B.Arch Counseling 2026
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 1.5, maxWidth: 650 }}>
        Complete guide to Tamil Nadu Engineering Admissions for B.Arch programs.
        Everything from eligibility to college predictions.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 4, flexWrap: 'wrap' }}>
        <Chip label="Tamil Nadu" size="small" />
        <Chip label="Anna University" size="small" variant="outlined" />
        <Chip label="32 Colleges" size="small" variant="outlined" />
        <Chip label="NATA / JEE" size="small" variant="outlined" />
      </Box>

      {/* Quick Nav */}
      <Paper elevation={0} sx={{ p: 2, mb: 4, borderRadius: 2, border: '1px solid', borderColor: 'grey.200', bgcolor: 'grey.50' }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>On this page</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {['Overview', 'Eligibility', 'Merit Formula', 'Categories', 'Timeline', 'Documents', 'Colleges', 'FAQ'].map((item) => (
            <Chip
              key={item}
              label={item}
              size="small"
              variant="outlined"
              component="a"
              href={`#${item.toLowerCase().replace(/\s/g, '-')}`}
              clickable
            />
          ))}
        </Box>
      </Paper>

      {/* 1. Overview */}
      <SectionTitle id="overview">Overview</SectionTitle>
      <Typography variant="body1" paragraph>
        TNEA B.Arch Counseling is conducted by <strong>Anna University, Chennai</strong> for
        admission to Bachelor of Architecture (B.Arch) programs across Tamil Nadu.
        It is a state-level counseling process that accepts NATA and JEE Paper 2 scores.
      </Typography>
      <Paper elevation={0} sx={{ p: 2, borderRadius: 1.5, border: '1px solid', borderColor: 'grey.200', mb: 2 }}>
        <Grid container spacing={2}>
          {[
            ['Conducting Body', 'Anna University, Chennai'],
            ['Official Website', 'tneaonline.org'],
            ['Exams Accepted', 'NATA, JEE Paper 2'],
            ['Program', 'B.Arch (5 years)'],
            ['Max Merit Score', '400'],
            ['Participating Colleges', '32 (approx.)'],
            ['Typical Rounds', '3-4 rounds'],
            ['Counseling Period', 'July - September'],
          ].map(([label, value]) => (
            <Grid item xs={6} sm={3} key={label}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="body2" fontWeight={600}>{value}</Typography>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* 2. Eligibility */}
      <SectionTitle id="eligibility">Eligibility Criteria</SectionTitle>
      <Typography variant="body1" paragraph>
        To be eligible for TNEA B.Arch counseling, you must meet these criteria:
      </Typography>
      <Box component="ul" sx={{ pl: 3, '& li': { mb: 1 } }}>
        <li><Typography variant="body2">Passed 10+2 with <strong>Mathematics</strong> as a compulsory subject</Typography></li>
        <li><Typography variant="body2">Minimum <strong>45% aggregate</strong> in 10+2 (40% for reserved categories)</Typography></li>
        <li><Typography variant="body2">Valid <strong>NATA score</strong> (minimum 70/200) or <strong>JEE Paper 2</strong> qualified</Typography></li>
        <li><Typography variant="body2">NATA Part A minimum 20 marks, Part B minimum 30 marks</Typography></li>
        <li><Typography variant="body2">No upper age limit</Typography></li>
      </Box>

      {/* 3. Merit Formula */}
      <SectionTitle id="merit-formula">Merit Formula</SectionTitle>
      <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '2px solid', borderColor: 'primary.main', bgcolor: '#E3F2FD', mb: 2 }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 1, textAlign: 'center' }}>
          Composite Score = Board (200) + NATA/JEE (200) = 400
        </Typography>
        <Divider sx={{ my: 2 }} />
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" fontWeight={600}>Board Component (200)</Typography>
            <Typography variant="body2" color="text.secondary">
              (Marks Secured / Max Marks) × 200
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Example: 480/600 → (480/600) × 200 = <strong>160</strong>
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2" fontWeight={600}>NATA/JEE Component (200)</Typography>
            <Typography variant="body2" color="text.secondary">
              Best NATA score (out of 200) is used directly.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Example: Best NATA = <strong>145</strong> out of 200
            </Typography>
          </Grid>
        </Grid>
        <Typography variant="body2" sx={{ mt: 2, textAlign: 'center', fontWeight: 600 }}>
          Final: 160 + 145 = <strong>305 / 400</strong>
        </Typography>
      </Paper>
      <Button
        variant="contained"
        href="https://app.neramclasses.com/tools/nata/cutoff-calculator"
        target="_blank"
        sx={{ mb: 2 }}
      >
        Calculate Your Cutoff Score (Free Tool)
      </Button>

      {/* 4. Categories */}
      <SectionTitle id="categories">Reservation Categories</SectionTitle>
      <Typography variant="body1" paragraph>
        TNEA follows Tamil Nadu state reservation policy:
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
        {CATEGORIES.map((cat) => (
          <Paper key={cat.code} elevation={0} sx={{ p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'grey.200', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="body2" fontWeight={600}>{cat.code} — {cat.name}</Typography>
              <Typography variant="caption" color="text.secondary">{cat.description}</Typography>
            </Box>
          </Paper>
        ))}
      </Box>
      <Typography variant="body2" color="text.secondary">
        Special reservations also apply for: First Graduate, Government School students, Differently Abled (PwD).
      </Typography>

      {/* 5. Timeline */}
      <SectionTitle id="timeline">Counseling Timeline (Typical)</SectionTitle>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[
          ['May', 'NATA results released (all attempts)'],
          ['June', 'TNEA registration opens online'],
          ['July', 'Rank list published'],
          ['July-August', 'Round 1 counseling — choice filling + seat allotment'],
          ['August', 'Round 2 counseling'],
          ['August-September', 'Mop-up / Special rounds'],
          ['September', 'Classes begin'],
        ].map(([month, desc]) => (
          <Box key={month} sx={{ display: 'flex', gap: 2, alignItems: 'baseline' }}>
            <Typography variant="body2" fontWeight={600} sx={{ minWidth: 120 }}>{month}</Typography>
            <Typography variant="body2" color="text.secondary">{desc}</Typography>
          </Box>
        ))}
      </Box>

      {/* 6. Documents */}
      <SectionTitle id="documents">Documents Required</SectionTitle>
      <Box component="ul" sx={{ pl: 3, '& li': { mb: 0.5 } }}>
        {[
          '10th mark sheet and certificate',
          '12th / HSC mark sheet and certificate',
          'NATA score card (all attempts)',
          'Community certificate (for reserved categories)',
          'Transfer certificate',
          'Nativity / Domicile certificate',
          'Aadhaar card',
          'Passport-size photographs',
          'Income certificate (if applicable)',
          'First Graduate certificate (if applicable)',
        ].map((doc) => (
          <li key={doc}><Typography variant="body2">{doc}</Typography></li>
        ))}
      </Box>

      {/* 7. Colleges */}
      <SectionTitle id="colleges">Participating Colleges (2025)</SectionTitle>
      <Typography variant="body1" paragraph>
        32 architecture colleges in Tamil Nadu participate in TNEA B.Arch counseling.
        Use our College Predictor tool to find colleges that match your score.
      </Typography>
      <Button
        variant="outlined"
        href="https://app.neramclasses.com/tools/counseling/college-predictor?system=TNEA_BARCH"
        target="_blank"
        sx={{ mb: 2 }}
      >
        Find Colleges for Your Score
      </Button>

      {/* 8. FAQ */}
      <SectionTitle id="faq">Frequently Asked Questions</SectionTitle>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {FAQS.map((faq) => (
          <Paper key={faq.question} elevation={0} sx={{ p: 2, borderRadius: 1.5, border: '1px solid', borderColor: 'grey.200' }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
              {faq.question}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {faq.answer}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* Final CTA */}
      <Paper
        elevation={0}
        sx={{ p: { xs: 3, md: 4 }, mt: 5, borderRadius: 2, bgcolor: '#E8F5E9', border: '1px solid', borderColor: '#2E7D32', textAlign: 'center' }}
      >
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          Predict your TNEA B.Arch rank
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 500, mx: 'auto' }}>
          Enter your board marks and NATA score to see your predicted rank and colleges.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            size="large"
            href="https://app.neramclasses.com/tools/nata/cutoff-calculator"
            target="_blank"
            sx={{ bgcolor: '#2E7D32', '&:hover': { bgcolor: '#1B5E20' } }}
          >
            Calculate Cutoff Score
          </Button>
          <Button
            variant="outlined"
            size="large"
            href="https://app.neramclasses.com/tools/counseling/rank-predictor"
            target="_blank"
            color="success"
          >
            Predict Your Rank
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
